import { NextRequest, NextResponse } from "next/server";
import { createUser, getUserByEmail, getUserCount } from "@/lib/db";
import { hashPassword, setSessionCookie } from "@/lib/auth";
import { syncUserToSupabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, name } = body as { email?: string; password?: string; name?: string };

    if (!email || !password || !name) {
      return NextResponse.json({ error: "Email, password, and name are required" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    const existing = getUserByEmail(email);
    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }

    const password_hash = await hashPassword(password);
    // First registered user becomes admin
    const isFirstUser = getUserCount() === 0;
    const user = createUser({ email, password_hash, name, role: isFirstUser ? "admin" : "user" });

    // Fire-and-forget sync to Supabase (non-blocking, errors silenced in helper)
    void syncUserToSupabase({ id: user.id, email: user.email, name: user.name, created_at: user.created_at });

    const response = NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    }, { status: 201 });

    await setSessionCookie({ userId: user.id, email: user.email, name: user.name, role: user.role });
    return response;
  } catch (err) {
    console.error("Register error:", err);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
