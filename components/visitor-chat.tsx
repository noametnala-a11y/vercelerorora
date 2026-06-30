"use client"

import type React from "react"

import { useCallback, useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { getVisitorMeta } from "@/app/visitor-actions"
import { AI_NAME, AI_TAGLINE, type Message } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Sparkles, Send, ShieldCheck } from "lucide-react"

const SESSION_KEY = "aurora_session_id"

function getSessionId() {
  if (typeof window === "undefined") return ""
  let id = localStorage.getItem(SESSION_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(SESSION_KEY, id)
  }
  return id
}

export function VisitorChat() {
  const supabase = createClient()
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [aiTyping, setAiTyping] = useState(false)
  const [ready, setReady] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Find or create a conversation for this browser session
  useEffect(() => {
    let active = true
    async function init() {
      const sessionId = getSessionId()
      const { data: existing } = await supabase
        .from("conversations")
        .select("id")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      let convoId = existing?.id as string | undefined

      if (!convoId) {
        // Capture the visitor's IPv4 + a random display name server-side
        const { name, ip } = await getVisitorMeta()
        const { data: created } = await supabase
          .from("conversations")
          .insert({ session_id: sessionId, visitor_name: name, ip_address: ip })
          .select("id")
          .single()
        convoId = created?.id as string | undefined
      }

      if (!active || !convoId) return
      setConversationId(convoId)

      const { data: msgs } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", convoId)
        .order("created_at", { ascending: true })

      if (!active) return
      setMessages((msgs as Message[]) ?? [])
      setReady(true)
    }
    init()
    return () => {
      active = false
    }
  }, [supabase])

  // Realtime: new messages + operator typing broadcasts
  useEffect(() => {
    if (!conversationId) return

    const channel = supabase
      .channel(`conversation:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const msg = payload.new as Message
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev
            // Reconcile: drop any optimistic message with the same role + content
            const withoutOptimistic = prev.filter(
              (m) => !(m.pending && m.role === msg.role && m.content === msg.content),
            )
            return [...withoutOptimistic, msg]
          })
          if (msg.role === "assistant") setAiTyping(false)
        },
      )
      .on("broadcast", { event: "typing" }, (payload) => {
        setAiTyping(Boolean(payload.payload?.typing))
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId, supabase])

  // Auto-scroll to newest message / typing indicator
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, aiTyping])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || !conversationId) return
    setInput("")

    const optimistic: Message = {
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
      pending: true,
    }
    setMessages((prev) => [...prev, optimistic])
    setAiTyping(true)

    await supabase.from("messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: text,
    })
    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId)
  }, [input, conversationId, supabase])

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      if (e.nativeEvent.isComposing || e.keyCode === 229) return
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="flex h-dvh flex-col bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Sparkles className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold leading-tight">{AI_NAME}</h1>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
            {AI_TAGLINE} · Online
          </p>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
          <div className="mb-2 flex flex-col items-center gap-3 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <Sparkles className="size-7" aria-hidden="true" />
            </div>
            <div>
              <p className="text-base font-semibold text-pretty">{`Hi, I'm ${AI_NAME}`}</p>
              <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground text-pretty">
                Ask me anything. I&apos;m here to help you with questions, ideas, and more.
              </p>
            </div>
          </div>

          {ready &&
            messages.map((m) => (
              <div
                key={m.id}
                className={`flex items-end gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {m.role === "assistant" && (
                  <div className="flex size-7 flex-none items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Sparkles className="size-3.5" aria-hidden="true" />
                  </div>
                )}
                <div
                  className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "rounded-br-md bg-primary text-primary-foreground"
                      : "rounded-bl-md bg-muted text-foreground"
                  }`}
                >
                  <p className="whitespace-pre-wrap text-pretty">{m.content}</p>
                </div>
              </div>
            ))}

          {aiTyping && (
            <div className="flex items-end gap-2">
              <div className="flex size-7 flex-none items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Sparkles className="size-3.5" aria-hidden="true" />
              </div>
              <div className="rounded-2xl rounded-bl-md bg-muted px-4 py-3">
                <span className="flex gap-1" aria-label={`${AI_NAME} is typing`}>
                  <span className="size-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]" />
                  <span className="size-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]" />
                  <span className="size-2 animate-bounce rounded-full bg-muted-foreground/60" />
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-border bg-card px-4 py-3">
        <div className="mx-auto flex w-full max-w-2xl items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder={`Message ${AI_NAME}…`}
            className="max-h-40 min-h-[44px] flex-1 resize-none rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none ring-ring focus-visible:ring-2"
            aria-label="Message input"
          />
          <Button
            type="button"
            size="icon"
            onClick={send}
            disabled={!input.trim()}
            className="size-11 flex-none rounded-full"
            aria-label="Send message"
          >
            <Send className="size-4" aria-hidden="true" />
          </Button>
        </div>
        <p className="mx-auto mt-2 flex max-w-2xl items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
          <ShieldCheck className="size-3" aria-hidden="true" />
          {AI_NAME} can make mistakes. Responses are generated by AI.
        </p>
      </div>
    </div>
  )
}
