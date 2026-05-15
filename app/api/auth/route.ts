import { NextResponse } from "next/server";
import { signJWT, hashPassword, verifyPassword, verifyJWT, extractBearerToken } from "@/lib/jwt";
import { getAdmin } from "@/lib/supabase";

// ── Helpers ────────────────────────────────────────────────────────────────
function sanitizeUser(u: any) {
  return { id: u.id, email: u.email, name: u.name, phone: u.phone ?? null, role: u.role ?? "tech" };
}

// ── POST /api/auth ─────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const db = getAdmin();
    const body = await req.json();
    const { action } = body;

    // ── REGISTER ───────────────────────────────────────────────────────────
    if (action === "register") {
      const { email, password, name, phone, role = "tech" } = body;
      if (!email || !password || !name) {
        return NextResponse.json({ error: "email, password, name are required" }, { status: 400 });
      }
      const allowedRoles = ["office", "tech", "admin", "owner"];
      if (!allowedRoles.includes(role)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }

      const pwHash = hashPassword(password);

      // Check duplicate
      const { data: existing } = await db.from("users").select("id").eq("email", email).maybeSingle();
      if (existing) return NextResponse.json({ error: "Email already registered" }, { status: 409 });

      const { data: newUser, error: insertErr } = await db
        .from("users")
        .insert({ email, name, phone: phone || null, password_hash: pwHash, role })
        .select("id, email, name, phone, role")
        .single();

      if (insertErr || !newUser) {
        return NextResponse.json({ error: insertErr?.message ?? "Registration failed" }, { status: 500 });
      }

      // If role is tech, create technician record
      if (role === "tech") {
        await db.from("technicians").insert({ user_id: newUser.id, status: "available" });
      }

      const token = signJWT({ sub: newUser.id, email: newUser.email, name: newUser.name, role: newUser.role });
      return NextResponse.json({ success: true, user: sanitizeUser(newUser), token });
    }

    // ── LOGIN ──────────────────────────────────────────────────────────────
    if (action === "login") {
      const { email, password } = body;
      if (!email || !password) {
        return NextResponse.json({ error: "email and password are required" }, { status: 400 });
      }

      const { data: user } = await db.from("users").select("*").eq("email", email).maybeSingle();
      if (!user || !verifyPassword(password, user.password_hash)) {
        return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
      }
      await db.from("users").update({ last_login: new Date().toISOString() }).eq("id", user.id);
      const token = signJWT({ sub: user.id, email: user.email, name: user.name, role: user.role });
      return NextResponse.json({ success: true, user: sanitizeUser(user), token });
    }

    // ── ME (verify token) ──────────────────────────────────────────────────
    if (action === "me") {
      const token = extractBearerToken(req.headers.get("authorization"));
      if (!token) return NextResponse.json({ error: "No token" }, { status: 401 });
      const payload = verifyJWT(token);
      return NextResponse.json({ user: { id: payload.sub, email: payload.email, name: payload.name, role: payload.role } });
    }

    // ── UPDATE PROFILE ─────────────────────────────────────────────────────
    if (action === "update") {
      const authToken = extractBearerToken(req.headers.get("authorization"));
      if (!authToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

      let payload: any;
      try { payload = verifyJWT(authToken); } catch {
        return NextResponse.json({ error: "Invalid token" }, { status: 401 });
      }

      const { name: newName, phone: newPhone, currentPassword, newPassword } = body;

      const { data: existing } = await db.from("users").select("*").eq("id", payload.sub).maybeSingle();
      if (!existing) return NextResponse.json({ error: "User not found" }, { status: 404 });

      const updates: Record<string, any> = {};
      if (newName?.trim())  updates.name  = newName.trim();
      if (newPhone !== undefined) updates.phone = newPhone?.trim() || null;

      if (currentPassword && newPassword) {
        if (!verifyPassword(currentPassword, existing.password_hash)) {
          return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
        }
        if (newPassword.length < 6) {
          return NextResponse.json({ error: "New password must be at least 6 characters" }, { status: 400 });
        }
        updates.password_hash = hashPassword(newPassword);
      }

      if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
      }

      const { data: updated, error: upErr } = await db
        .from("users")
        .update(updates)
        .eq("id", payload.sub)
        .select("id, email, name, phone, role")
        .single();

      if (upErr || !updated) return NextResponse.json({ error: upErr?.message ?? "Update failed" }, { status: 500 });

      const newToken = signJWT({ sub: updated.id, email: updated.email, name: updated.name, role: updated.role });
      return NextResponse.json({ success: true, user: sanitizeUser(updated), token: newToken });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    console.error("[auth] Error:", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}
