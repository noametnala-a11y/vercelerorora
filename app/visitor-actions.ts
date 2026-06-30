"use server"

import { headers } from "next/headers"

const ADJECTIVES = [
  "Swift",
  "Calm",
  "Bright",
  "Clever",
  "Bold",
  "Gentle",
  "Lucky",
  "Brave",
  "Quiet",
  "Sunny",
  "Cosmic",
  "Witty",
]

const ANIMALS = [
  "Falcon",
  "Otter",
  "Fox",
  "Panda",
  "Heron",
  "Lynx",
  "Dolphin",
  "Sparrow",
  "Tiger",
  "Koala",
  "Raven",
  "Bison",
]

function randomName() {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const b = ANIMALS[Math.floor(Math.random() * ANIMALS.length)]
  return `${a} ${b}`
}

// Extracts the first IPv4 address from the request headers.
function extractIpv4(value: string | null): string | null {
  if (!value) return null
  // x-forwarded-for can be a comma-separated list: "client, proxy1, proxy2"
  for (const raw of value.split(",")) {
    let ip = raw.trim()
    // Treat loopback IPv6 as its IPv4 equivalent (useful in local dev)
    if (ip === "::1") ip = "127.0.0.1"
    // Normalize IPv4-mapped IPv6 addresses like "::ffff:1.2.3.4"
    if (ip.startsWith("::ffff:")) ip = ip.slice(7)
    // Match a plain IPv4 address
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return ip
  }
  return null
}

/**
 * Returns metadata for a new visitor: a randomly generated display name and
 * the visitor's IPv4 address (read from request headers, not available client-side).
 */
export async function getVisitorMeta(): Promise<{ name: string; ip: string | null }> {
  const h = await headers()
  const ip =
    extractIpv4(h.get("x-forwarded-for")) ??
    extractIpv4(h.get("x-real-ip")) ??
    extractIpv4(h.get("x-vercel-forwarded-for"))
  return { name: randomName(), ip }
}
