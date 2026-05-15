import { NextResponse } from "next/server";
import { signJWT, hashPassword, verifyPassword, verifyJWT, extractBearerToken } from "@/lib/jwt";
import { getAdmin, isSupabaseConfigured } from "@/lib/supabase";
import fs from "fs";
import path from "path";
import crypto from "crypto";

// ── Fallback file-based store (when Supabase is not configured) ────────────
const DATA_DIR = path.join(process.cwd(), "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "[]");
}

function fileGetUsers(): any[] {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8")); } catch { return []; }
}
function fileSaveUsers(u: any[]) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(u, null, 2));
}

// ── Helpers ────────────────────────────────────────────────────────────────
function sanitizeUser(u: any) {
  return { id: u.id, email: u.email, name: u.name, phone: u.phone ?? null, role: u.role ?? "tech" };
}

// ── POST /api/auth ─────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
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

      if (isSupabaseConfigured) {
        const db = getAdmin();
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

      // Fallback: file-based
      ensureDataDir();
      const users = fileGetUsers();
      if (users.find((u) => u.email === email)) {
        return NextResponse.json({ error: "Email already registered" }, { status: 409 });
      }
      const id = crypto.randomUUID();
      const newUser = { id, email, name, phone: phone || null, password_hash: pwHash, role };
      users.push(newUser);
      fileSaveUsers(users);
      const token = signJWT({ sub: id, email, name, role });
      return NextResponse.json({ success: true, user: sanitizeUser(newUser), token });
    }

    // ── LOGIN ──────────────────────────────────────────────────────────────
    if (action === "login") {
      const { email, password } = body;
      if (!email || !password) {
        return NextResponse.json({ error: "email and password are required" }, { status: 400 });
      }

      if (isSupabaseConfigured) {
        const db = getAdmin();
        const { data: user } = await db.from("users").select("*").eq("email", email).maybeSingle();
        if (!user || !verifyPassword(password, user.password_hash)) {
          return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
        }
        // Migrate old SHA256 hashes (from before this system) if needed
        await db.from("users").update({ last_login: new Date().toISOString() }).eq("id", user.id);
        const token = signJWT({ sub: user.id, email: user.email, name: user.name, role: user.role });
        return NextResponse.json({ success: true, user: sanitizeUser(user), token });
      }

      // Fallback
      ensureDataDir();
      const users = fileGetUsers();
      const user = users.find((u) => u.email === email);
      if (!user) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });

      // Support both old SHA256 and new PBKDF2 hashes during migration
      let valid = false;
      if (user.password_hash?.includes(":")) {
        valid = verifyPassword(password, user.password_hash);
      } else {
        // Old SHA256 — migrate on successful login
        const sha256 = crypto.createHash("sha256").update(password).digest("hex");
        if (sha256 === user.password_hash) {
          valid = true;
          user.password_hash = hashPassword(password);
          fileSaveUsers(users);
        }
      }
      if (!valid) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });

      const role = user.role || "tech";
      const token = signJWT({ sub: user.id, email: user.email, name: user.name, role });
      return NextResponse.json({ success: true, user: { ...sanitizeUser(user), role }, token });
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

      if (isSupabaseConfigured) {
        const db = getAdmin();
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

      // Fallback: file-based
      ensureDataDir();
      const users = fileGetUsers();
      const idx = users.findIndex((u) => u.id === payload.sub);
      if (idx === -1) return NextResponse.json({ error: "User not found" }, { status: 404 });
      if (newName?.trim())  users[idx].name  = newName.trim();
      if (newPhone !== undefined) users[idx].phone = newPhone?.trim() || null;
      if (currentPassword && newPassword) {
        if (!verifyPassword(currentPassword, users[idx].password_hash)) {
          return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
        }
        users[idx].password_hash = hashPassword(newPassword);
      }
      fileSaveUsers(users);
      const newToken = signJWT({ sub: users[idx].id, email: users[idx].email, name: users[idx].name, role: users[idx].role });
      return NextResponse.json({ success: true, user: sanitizeUser(users[idx]), token: newToken });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    console.error("[auth] Error:", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}
