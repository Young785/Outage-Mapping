/**
 * POST /api/parcels/classify-outages
 * Office: scan active outages against MetroGIS parcels.
 * Non-target land use (outside R1/R2/R3-style residential) → excluded_properties rows.
 *
 * Body: { limit?: number, dryRun?: boolean }
 */

import { NextResponse } from "next/server";
import { getAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { verifyJWT, extractBearerToken, jwtErrorMessage } from "@/lib/jwt";
import { normalizeAddressKey } from "@/lib/address-match";
import { lookupParcelAtLive, parcelCacheKey } from "@/lib/parcel-landuse";
import { findMatchingExcludedProperty, type ExcludedProperty } from "@/lib/excluded-properties";

export async function POST(req: Request) {
  try {
    const token = extractBearerToken(req.headers.get("authorization"));
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let payload;
    try {
      payload = verifyJWT(token);
    } catch (err) {
      return NextResponse.json({ error: jwtErrorMessage(err) }, { status: 401 });
    }
    if (!["office", "admin", "owner"].includes(payload.role)) {
      return NextResponse.json({ error: "Office role required" }, { status: 403 });
    }

    if (!isSupabaseConfigured) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit) || 40, 1), 120);
    const dryRun = body.dryRun === true;

    const db = getAdmin();

    const { data: setting } = await db
      .from("app_settings")
      .select("value")
      .eq("key", "parcel_auto_exclude")
      .maybeSingle();
    const autoExcludeEnabled = setting?.value !== false && setting?.value !== "false";

    const { data: existingExclusions } = await db
      .from("excluded_properties")
      .select("*")
      .eq("is_active", true);
    const exclusions = (existingExclusions ?? []) as ExcludedProperty[];

    const { data: outages, error } = await db
      .from("outages")
      .select("id, lat, lng, street_address, status, is_active, source")
      .eq("is_active", true)
      .not("lat", "is", null)
      .not("lng", "is", null)
      .neq("status", "no_opportunity")
      .neq("status", "completed")
      .order("customers", { ascending: false })
      .limit(limit * 3);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const summary = {
      scanned: 0,
      alreadyExcluded: 0,
      targetResidential: 0,
      autoExcluded: 0,
      notFound: 0,
      unavailable: 0,
      dryRun,
      autoExcludeEnabled,
      results: [] as Array<Record<string, unknown>>,
    };

    for (const o of outages ?? []) {
      if (summary.scanned >= limit) break;
      const lat = Number(o.lat);
      const lng = Number(o.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const already = findMatchingExcludedProperty(
        { lat, lng, streetAddress: o.street_address },
        exclusions
      );
      if (already) {
        summary.alreadyExcluded++;
        continue;
      }

      summary.scanned++;
      const live = await lookupParcelAtLive(lat, lng);

      if (live.source === "unavailable") {
        summary.unavailable++;
        if (summary.results.length < 80) {
          summary.results.push({
            outageId: o.id,
            lat,
            lng,
            address: o.street_address,
            status: "unavailable",
            duration: null,
            error: live.error,
          });
        }
        // Stop hammering if the service is down
        if (summary.unavailable >= 3 && summary.targetResidential + summary.autoExcluded === 0) {
          break;
        }
        continue;
      }

      if (!live.found || !live.classification) {
        summary.notFound++;
        if (summary.results.length < 80) {
          summary.results.push({
            outageId: o.id,
            lat,
            lng,
            address: o.street_address,
            status: "not_found",
            duration: null,
          });
        }
        continue;
      }

      const c = live.classification;
      const key = parcelCacheKey(lat, lng);
      await db.from("parcel_land_use_cache").upsert(
        {
          lat_round: key.lat_round,
          lng_round: key.lng_round,
          county_pin: c.countyPin,
          use_class1: c.attrs.USECLASS1 || c.useClassLabel,
          use_class2: c.attrs.USECLASS2 || null,
          use_class3: c.attrs.USECLASS3 || null,
          use_class4: c.attrs.USECLASS4 || null,
          num_units: c.numUnits,
          dwell_type: c.dwellType,
          street_address: c.streetAddress || o.street_address,
          is_target_residential: c.isTargetResidential,
          exclude_reason: c.excludeReason,
          raw_attrs: c.attrs,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "lat_round,lng_round" }
      );

      if (c.isTargetResidential) {
        summary.targetResidential++;
        if (summary.results.length < 80) {
          summary.results.push({
            outageId: o.id,
            lat,
            lng,
            address: c.streetAddress || o.street_address,
            status: "target",
            useClass: c.useClassLabel,
            gisClassification: c.useClassLabel,
            numUnits: c.numUnits,
            countyPin: c.countyPin,
            duration: null,
          });
        }
        continue;
      }

      if (!autoExcludeEnabled) {
        if (summary.results.length < 80) {
          summary.results.push({
            outageId: o.id,
            lat,
            lng,
            address: c.streetAddress || o.street_address,
            status: "would_exclude_disabled",
            useClass: c.useClassLabel,
            gisClassification: c.useClassLabel,
            reason: c.excludeReason,
            duration: "permanent",
          });
        }
        continue;
      }

      const address = c.streetAddress || o.street_address || null;
      if (!dryRun) {
        const row = {
          address,
          address_key: address ? normalizeAddressKey(address) : null,
          lat,
          lng,
          radius_meters: 35,
          county_pin: c.countyPin,
          use_class: c.useClassLabel,
          reason: c.excludeReason || "Non-target land use (MetroGIS)",
          source: "parcel_landuse",
          notes: `Auto from outage ${o.id}`,
          created_by: payload.email || payload.sub || null,
          is_active: true,
          duration: "permanent",
          updated_at: new Date().toISOString(),
        };
        let inserted = (
          await db.from("excluded_properties").insert(row).select("*").single()
        ).data;
        if (!inserted) {
          const { duration: _d, ...withoutDuration } = row;
          inserted = (
            await db.from("excluded_properties").insert(withoutDuration).select("*").single()
          ).data;
        }
        if (inserted) exclusions.push(inserted as ExcludedProperty);
      }

      summary.autoExcluded++;
      if (summary.results.length < 80) {
        summary.results.push({
          outageId: o.id,
          lat,
          lng,
          address,
          status: dryRun ? "would_exclude" : "excluded",
          useClass: c.useClassLabel,
          gisClassification: c.useClassLabel,
          reason: c.excludeReason,
          countyPin: c.countyPin,
          numUnits: c.numUnits,
          duration: "permanent",
          override: "Office can Restore to map to override this automatic exclusion",
        });
      }
    }

    return NextResponse.json({ success: true, summary: { ...summary, samples: summary.results.slice(0, 8) } });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
