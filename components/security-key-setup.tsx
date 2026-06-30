"use client"

import { useState, useTransition } from "react"
import { startRegistration } from "@simplewebauthn/browser"
import { startKeyRegistration, finishKeyRegistration } from "@/app/operator/webauthn-actions"
import { Button } from "@/components/ui/button"
import { KeyRound, ShieldAlert } from "lucide-react"

export function SecurityKeySetup({ onRegistered }: { onRegistered?: () => void }) {
  const [label, setLabel] = useState("")
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  function register() {
    setError(null)
    startTransition(async () => {
      try {
        const options = await startKeyRegistration()
        const response = await startRegistration({ optionsJSON: options })
        const res = await finishKeyRegistration(response, label)
        if (res.ok) {
          setDone(true)
          onRegistered?.()
        } else {
          setError(res.error ?? "Registration failed.")
        }
      } catch (err) {
        console.error(err)
        setError("Registration was cancelled or failed.")
      }
    })
  }

  if (done) {
    return (
      <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600">
        Security key registered. You can now sign in with it instead of the passcode.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        <ShieldAlert className="size-4 text-amber-500" aria-hidden="true" />
        No security key registered yet
      </p>
      <p className="text-xs text-muted-foreground text-pretty">
        Add a hardware key (YubiKey, etc.) or your device&apos;s built-in authenticator (Touch ID,
        Windows Hello) so this console no longer relies on the passcode alone. Once registered,
        consider setting <code className="font-mono">ALLOW_PASSCODE_FALLBACK=false</code>.
      </p>
      <div className="flex gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (e.g. YubiKey 5)"
          className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus-visible:ring-2"
        />
        <Button type="button" onClick={register} disabled={pending} className="flex-none gap-2">
          <KeyRound className="size-4" aria-hidden="true" />
          {pending ? "Waiting…" : "Add key"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
