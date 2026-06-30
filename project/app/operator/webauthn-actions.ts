"use server"

import { cookies } from "next/headers"
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
} from "@simplewebauthn/server"
import { getRpConfig } from "@/lib/webauthn-config"
import { createAdminClient } from "@/lib/supabase/server-admin"
import { isOperatorUnlocked, markUnlocked } from "./actions"

const CHALLENGE_COOKIE = "operator_webauthn_challenge"

async function setChallenge(challenge: string) {
  const store = await cookies()
  store.set(CHALLENGE_COOKIE, challenge, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 5, // 5 minutes to complete the ceremony
    path: "/",
  })
}

async function takeChallenge(): Promise<string | null> {
  const store = await cookies()
  const value = store.get(CHALLENGE_COOKIE)?.value ?? null
  store.delete(CHALLENGE_COOKIE)
  return value
}

/** Safe to call before authentication: only reveals whether ANY key exists. */
export async function hasRegisteredKey(): Promise<boolean> {
  const supabase = createAdminClient()
  const { count } = await supabase
    .from("operator_credentials")
    .select("*", { count: "exact", head: true })
  return Boolean(count && count > 0)
}

/** Step 1 of registering a new security key. Requires an already-unlocked session. */
export async function startKeyRegistration() {
  if (!(await isOperatorUnlocked())) {
    throw new Error("Not authorized: unlock the console with your passcode first.")
  }

  const { rpID, rpName } = await getRpConfig()
  const supabase = createAdminClient()
  const { data: existing } = await supabase.from("operator_credentials").select("credential_id")

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: "operator",
    userDisplayName: "Operator",
    attestationType: "none",
    excludeCredentials: (existing ?? []).map((c) => ({ id: c.credential_id })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  })

  await setChallenge(options.challenge)
  return options
}

export async function finishKeyRegistration(
  response: RegistrationResponseJSON,
  label: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await isOperatorUnlocked())) {
    return { ok: false, error: "Not authorized." }
  }

  const expectedChallenge = await takeChallenge()
  if (!expectedChallenge) {
    return { ok: false, error: "Registration expired, please try again." }
  }

  const { rpID, origin } = await getRpConfig()

  try {
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    })

    if (!verification.verified || !verification.registrationInfo) {
      return { ok: false, error: "Could not verify the security key." }
    }

    const { credential } = verification.registrationInfo
    const supabase = createAdminClient()
    const { error } = await supabase.from("operator_credentials").insert({
      credential_id: credential.id,
      public_key: Buffer.from(credential.publicKey).toString("base64url"),
      counter: credential.counter,
      transports: credential.transports ?? [],
      label: label.trim() || "Security key",
    })

    if (error) {
      console.error("Failed to store WebAuthn credential:", error)
      return { ok: false, error: "Could not save the security key." }
    }

    return { ok: true }
  } catch (err) {
    console.error("WebAuthn registration error:", err)
    return { ok: false, error: "Registration failed." }
  }
}

/** Step 1 of logging in with a security key (called BEFORE the console is unlocked). */
export async function startKeyAuthentication() {
  const { rpID } = await getRpConfig()
  const supabase = createAdminClient()
  const { data: creds } = await supabase.from("operator_credentials").select("credential_id, transports")

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
    allowCredentials: (creds ?? []).map((c) => ({
      id: c.credential_id,
      transports: c.transports ?? undefined,
    })),
  })

  await setChallenge(options.challenge)
  return options
}

export async function finishKeyAuthentication(
  response: AuthenticationResponseJSON,
): Promise<{ ok: boolean; error?: string }> {
  const expectedChallenge = await takeChallenge()
  if (!expectedChallenge) {
    return { ok: false, error: "Login expired, please try again." }
  }

  const { rpID, origin } = await getRpConfig()
  const supabase = createAdminClient()

  const { data: stored } = await supabase
    .from("operator_credentials")
    .select("*")
    .eq("credential_id", response.id)
    .maybeSingle()

  if (!stored) {
    return { ok: false, error: "Unknown security key." }
  }

  try {
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: stored.credential_id,
        publicKey: Buffer.from(stored.public_key, "base64url"),
        counter: Number(stored.counter),
        transports: stored.transports ?? undefined,
      },
    })

    if (!verification.verified) {
      return { ok: false, error: "Could not verify the security key." }
    }

    await supabase
      .from("operator_credentials")
      .update({
        counter: verification.authenticationInfo.newCounter,
        last_used_at: new Date().toISOString(),
      })
      .eq("credential_id", stored.credential_id)

    await markUnlocked()
    return { ok: true }
  } catch (err) {
    console.error("WebAuthn authentication error:", err)
    return { ok: false, error: "Login failed." }
  }
}
