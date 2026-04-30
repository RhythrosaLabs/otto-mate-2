/**
 * Auth utilities — JWT sessions, password hashing, API key encryption
 *
 * Session: httpOnly cookie "ottomate_session" → signed JWT (HS256, 7-day exp)
 * Passwords: bcrypt (cost 12)
 * API keys: AES-256-GCM with server-side ENCRYPTION_KEY env var
 */

import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

const COOKIE_NAME = "ottomate_session";
const JWT_ALG = "HS256";
const BCRYPT_ROUNDS = 12;

// ─── JWT secret ──────────────────────────────────────────────────────────────

function getJwtSecret(): Uint8Array {
  const secret = process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET env var is not set");
  return new TextEncoder().encode(secret);
}

// ─── Session types ────────────────────────────────────────────────────────────

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: "admin" | "user";
}

// ─── Token creation / verification ───────────────────────────────────────────

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getJwtSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

// ─── Server component helpers (use next/headers) ─────────────────────────────

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await createSessionToken(payload);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

// ─── Request helper (use in API routes / middleware) ─────────────────────────

export async function getSessionFromRequest(req: NextRequest): Promise<SessionPayload | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

// ─── Password hashing ─────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ─── API key encryption (AES-256-GCM) ────────────────────────────────────────

function getEncryptionKey(): Buffer {
  const raw = process.env.NEXTAUTH_SECRET || process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("NEXTAUTH_SECRET env var required for encryption");
  // Derive a 32-byte key from the secret using a fixed salt
  const { createHash } = require("crypto");
  return createHash("sha256").update(raw).digest();
}

export function encryptApiKey(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Store as hex: iv(24) + tag(32) + ciphertext
  return iv.toString("hex") + tag.toString("hex") + encrypted.toString("hex");
}

export function decryptApiKey(ciphertext: string): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(ciphertext.slice(0, 24), "hex");
  const tag = Buffer.from(ciphertext.slice(24, 56), "hex");
  const encrypted = Buffer.from(ciphertext.slice(56), "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
}

export { COOKIE_NAME };
