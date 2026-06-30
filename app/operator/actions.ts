"use server"

import { cookies, headers } from "next/headers"

const COOKIE_NAME = "operator_unlocked"
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  // `secure` must be false on http preview origins, or the browser drops the cookie
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 12, // 12 hours
  path: "/",
}

// --- Naive in-memory rate limit for the passcode form -----------------
// NOTE: this resets on cold start and is NOT shared across serverless
// instances. It raises the bar against casual brute-forcing but is not a
// substitute for a real rate limiter (e.g. Upstash) in a multi-instance
// production deployment.
const attempts = new Map<string, { count: number; resetAt: number }>()
const MAX_ATTEMPTS = 5
const WINDOW_MS = 10 * 60 * 1000

async function clientIp() {
  const h = await headers()
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "unknown"
}

async function isRateLimited(): Promise<boolean> {
  const ip = await clientIp()
  const now = Date.now()
  const entry = attempts.get(ip)
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }
  entry.count += 1
  return entry.count > MAX_ATTEMPTS
}

function getPasscode() {
  // No insecure default anymore: if OPERATOR_PASSCODE isn't set, passcode
  // login is simply unavailable rather than falling back to "letmein".
  return process.env.OPERATOR_PASSCODE
}

// Once a security key is registered you should set ALLOW_PASSCODE_FALLBACK=false
// so a leaked passcode alone can no longer unlock the console.
function passcodeFallbackAllowed() {
  return process.env.ALLOW_PASSCODE_FALLBACK !== "false"
}

export async function markUnlocked(): Promise<void> {
  const store = await cookies()
  store.set(COOKIE_NAME, "1", COOKIE_OPTIONS)
}

export async function verifyPasscode(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  if (!passcodeFallbackAllowed()) {
    return { ok: false, error: "Passcode login is disabled. Use your security key." }
  }

  const expected = getPasscode()
  if (!expected) {
    return { ok: false, error: "Server misconfigured: OPERATOR_PASSCODE is not set." }
  }

  if (await isRateLimited()) {
    return { ok: false, error: "Too many attempts. Try again in a few minutes." }
  }

  const entered = String(formData.get("passcode") ?? "")
  if (entered.length === 0) {
    return { ok: false, error: "Enter the passcode." }
  }
  if (entered !== expected) {
    return { ok: false, error: "Incorrect passcode." }
  }

  await markUnlocked()
  return { ok: true }
}

export async function isOperatorUnlocked(): Promise<boolean> {
  const store = await cookies()
  return store.get(COOKIE_NAME)?.value === "1"
}

export async function lockOperator(): Promise<void> {
  const store = await cookies()
  store.delete(COOKIE_NAME)
}
