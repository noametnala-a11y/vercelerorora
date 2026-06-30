import { headers } from "next/headers"

/**
 * Resolves the WebAuthn Relying Party config for the current request.
 * rpID must be the domain only (no scheme/port). It must exactly match the
 * domain the operator console is served from, or browsers will reject
 * registration/authentication.
 *
 * In production, set RP_ID and NEXT_PUBLIC_APP_URL explicitly (e.g.
 * RP_ID=console.example.com, NEXT_PUBLIC_APP_URL=https://console.example.com)
 * rather than relying on header inference, which can be spoofed behind some
 * proxy setups.
 */
export async function getRpConfig() {
  const h = await headers()
  const host = h.get("host") ?? "localhost"
  const rpID = process.env.RP_ID ?? host.split(":")[0]
  const proto = h.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "production" ? "https" : "http")
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? `${proto}://${host}`
  return { rpID, rpName: "Operator Console", origin }
}
