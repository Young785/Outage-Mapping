/**
 * Geocoding with DB cache
 *
 * Coordinates are rounded to 4 decimal places (~11m precision) for cache keys.
 * First checks DB cache, then calls Google Geocoding API, then stores result.
 */

import { getAdmin, isSupabaseConfigured } from "./supabase";

export type GeoResult = {
  formattedAddress: string;
  city: string | null;
  county: string | null;
  state: string | null;
  postalCode: string | null;
};

function latLngKey(lat: number, lng: number): [string, string] {
  return [lat.toFixed(4), lng.toFixed(4)];
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeoResult | null> {
  const [latKey, lngKey] = latLngKey(lat, lng);

  // 1. Check DB cache
  if (isSupabaseConfigured) {
    try {
      const db = getAdmin();
      const { data } = await db
        .from("geocode_cache")
        .select("*")
        .eq("lat_key", latKey)
        .eq("lng_key", lngKey)
        .maybeSingle();

      if (data) {
        return {
          formattedAddress: data.formatted_address,
          city: data.city,
          county: data.county,
          state: data.state,
          postalCode: data.postal_code,
        };
      }
    } catch (err) {
      console.warn("[geocache] Cache lookup error:", err);
    }
  }

  // 2. Call Google Geocoding API
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    const json = await res.json();

    if (json.status !== "OK" || !json.results?.length) return null;

    const result = json.results[0];
    const components = result.address_components;

    const get = (type: string) =>
      components.find((c: any) => c.types.includes(type))?.long_name ?? null;
    const getShort = (type: string) =>
      components.find((c: any) => c.types.includes(type))?.short_name ?? null;

    const geo: GeoResult = {
      formattedAddress: result.formatted_address,
      city: get("locality") || get("sublocality") || get("administrative_area_level_2"),
      county: get("administrative_area_level_2"),
      state: getShort("administrative_area_level_1"),
      postalCode: get("postal_code"),
    };

    // 3. Store in DB cache
    if (isSupabaseConfigured) {
      try {
        const db = getAdmin();
        await db.from("geocode_cache").upsert(
          {
            lat_key: latKey,
            lng_key: lngKey,
            formatted_address: geo.formattedAddress,
            city: geo.city,
            county: geo.county,
            state: geo.state,
            postal_code: geo.postalCode,
          },
          { onConflict: "lat_key,lng_key", ignoreDuplicates: true }
        );
      } catch (err) {
        console.warn("[geocache] Cache store error:", err);
      }
    }

    return geo;
  } catch (err) {
    console.warn("[geocache] Geocoding API error:", err);
    return null;
  }
}

export type ForwardResult = {
  lat: number;
  lng: number;
  formattedAddress: string;
};

/**
 * Forward geocode: address string → lat/lng.
 * No DB cache for forward geocoding (addresses are unique, not repeated like lat/lng pairs).
 */
export async function forwardGeocode(
  address: string,
  opts?: { bias?: { lat: number; lng: number }; region?: string }
): Promise<ForwardResult | null> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey || !address) return null;

  try {
    const params = new URLSearchParams({
      address: address,
      key: apiKey,
      region: opts?.region ?? "us",
      components: "country:US|administrative_area:MN",
    });
    // Prefer Twin Cities metro when the query is ambiguous (e.g. common street names).
    const bias = opts?.bias ?? { lat: 44.9778, lng: -93.265 };
    params.set("bounds", `${bias.lat - 0.6},${bias.lng - 0.8}|${bias.lat + 0.6},${bias.lng + 0.8}`);

    const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    const json = await res.json();

    if (json.status !== "OK" || !json.results?.length) return null;

    const loc = json.results[0].geometry.location;
    return {
      lat: loc.lat,
      lng: loc.lng,
      formattedAddress: json.results[0].formatted_address,
    };
  } catch (err) {
    console.warn("[geocache] Forward geocode error:", err);
    return null;
  }
}
