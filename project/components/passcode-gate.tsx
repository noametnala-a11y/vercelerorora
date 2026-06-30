"use client"

import type React from "react"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { startAuthentication } from "@simplewebauthn/browser"
import { verifyPasscode } from "@/app/operator/actions"
import { hasRegisteredKey, startKeyAuthentication, finishKeyAuthentication } from "@/app/operator/webauthn-actions"
import { Button } from "@/components/ui/button"
import { Lock, KeyRound } from "lucide-react"

export function PasscodeGate() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // null = still checking whether a security key exists
  const [keyAvailable, setKeyAvailable] = useState<boolean | null>(null)
  const [showPasscode, setShowPasscode] = useState(false)

  useEffect(() => {
    hasRegisteredKey()
      .then(setKeyAvailable)
      .catch(() => setKeyAvailable(false))
  }, [])

  function onPasscodeSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    setError(null)
    startTransition(async () => {
      const res = await verifyPasscode(formData)
      if (res.ok) {
        router.refresh()
      } else {
        setError(res.error ?? "Something went wrong.")
      }
    })
  }

  function onKeyLogin() {
    setError(null)
    startTransition(async () => {
      try {
        const options = await startKeyAuthentication()
        const response = await startAuthentication({ optionsJSON: options })
        const res = await finishKeyAuthentication(response)
        if (res.ok) {
          router.refresh()
        } else {
          setError(res.error ?? "Login failed.")
        }
      } catch (err) {
        console.error(err)
        setError("Security key login was cancelled or failed.")
      }
    })
  }

  const showKeyOption = keyAvailable === true
  const showPasscodeForm = keyAvailable === false || showPasscode

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-5 flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Lock className="size-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Operator Console</h1>
            <p className="text-sm text-muted-foreground text-pretty">
              {showKeyOption
                ? "Sign in with your security key."
                : "Enter the passcode to access the live conversations."}
            </p>
          </div>
        </div>

        {showKeyOption && (
          <>
            <Button type="button" className="w-full gap-2" disabled={pending} onClick={onKeyLogin}>
              <KeyRound className="size-4" aria-hidden="true" />
              {pending ? "Waiting for key…" : "Sign in with security key"}
            </Button>
            {!showPasscode && (
              <button
                type="button"
                onClick={() => setShowPasscode(true)}
                className="mt-3 w-full text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                Use passcode instead
              </button>
            )}
          </>
        )}

        {showPasscodeForm && (
          <form onSubmit={onPasscodeSubmit} className={showKeyOption ? "mt-4" : ""}>
            <label htmlFor="passcode" className="sr-only">
              Passcode
            </label>
            <input
              id="passcode"
              name="passcode"
              type="password"
              autoComplete="off"
              autoFocus={!showKeyOption}
              placeholder="Passcode"
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none ring-ring focus-visible:ring-2"
            />
            <Button
              type="submit"
              className="mt-3 w-full"
              disabled={pending}
              variant={showKeyOption ? "secondary" : "default"}
            >
              {pending ? "Checking…" : "Unlock"}
            </Button>
          </form>
        )}

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </div>
    </main>
  )
}
