import { isOperatorUnlocked } from "./actions"
import { PasscodeGate } from "@/components/passcode-gate"
import { OperatorDashboard } from "@/components/operator-dashboard"

export const metadata = {
  title: "Operator Console",
}

export default async function OperatorPage() {
  const unlocked = await isOperatorUnlocked()
  if (!unlocked) {
    return <PasscodeGate />
  }
  return <OperatorDashboard />
}
