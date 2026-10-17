/**
 * Signed session cookie `imp_session`: HMAC-SHA256 over a compact JSON payload
 * {sub, email, name, exp}. No DB table — the cookie is the whole session.
 */

import { createHmac, timingSafeEqual } from "crypto";
import type { Request, Response } from "express";

export const SESSION_COOKIE = "imp_session";
export const SESSION_TTL_S = 30 * 24 * 3600;

export interface Session {
  sub: string;
  email?: string;
  name?: string;
  exp: number; // unix seconds
}

const b64url = (b: Buffer) => b.toString("base64url");
const sign = (payload: string, secret: string) => b64url(createHmac("sha256", secret).update(payload).digest());

export function encodeSession(session: Session, secret: string): string {
  const payload = b64url(Buffer.from(JSON.stringify(session), "utf8"));
  return `${payload}.${sign(payload, secret)}`;
}

/** The session when the cookie is well-formed, untampered and unexpired; null otherwise. */
export function decodeSession(value: string | undefined, secret: string, now = Date.now() / 1000): Session | null {
  if (!value || !secret) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = value.slice(0, dot);
  const sig = Buffer.from(value.slice(dot + 1), "utf8");
  const expected = Buffer.from(sign(payload, secret), "utf8");
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<Session>;
    if (typeof s.sub !== "string" || typeof s.exp !== "number" || s.exp <= now) return null;
    return {
      sub: s.sub,
      email: typeof s.email === "string" ? s.email : undefined,
      name: typeof s.name === "string" ? s.name : undefined,
      exp: s.exp,
    };
  } catch {
    return null;
  }
}

/** Minimal cookie parser — the app has no cookie middleware and only reads this one cookie. */
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

export function setSessionCookie(res: Response, session: Session, secret: string, secure: boolean): void {
  res.cookie(SESSION_COOKIE, encodeSession(session, secret), {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_S * 1000,
  });
}

export function clearSessionCookie(res: Response, secure: boolean): void {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure, sameSite: "lax", path: "/" });
}

export function readSession(req: Request, secret: string): Session | null {
  return decodeSession(readCookie(req, SESSION_COOKIE), secret);
}
