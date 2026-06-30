export type Message = {
  id: string
  conversation_id: string
  role: "user" | "assistant"
  content: string
  created_at: string
  // Client-only flag for optimistic messages awaiting realtime confirmation
  pending?: boolean
}

export type Conversation = {
  id: string
  session_id: string
  visitor_name: string | null
  ip_address: string | null
  created_at: string
  last_message_at: string
}

// The assistant's public-facing identity. Change these to rebrand the "AI".
export const AI_NAME = "Aurora"
export const AI_TAGLINE = "AI Assistant"
