"use client"

import type React from "react"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { AI_NAME, type Conversation, type Message } from "@/lib/types"
import { lockOperator } from "@/app/operator/actions"
import { hasRegisteredKey } from "@/app/operator/webauthn-actions"
import { SecurityKeySetup } from "@/components/security-key-setup"
import { Button } from "@/components/ui/button"
import { Send, Sparkles, MessageSquare, LogOut, Clock, Zap, Globe, X } from "lucide-react"

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

export function OperatorDashboard() {
  const supabase = createClient()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [reply, setReply] = useState("")
  const [autoDelay, setAutoDelay] = useState(true)
  const [sending, setSending] = useState(false)
  const [showKeySetup, setShowKeySetup] = useState(false)
  const [dismissedKeyBanner, setDismissedKeyBanner] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Prompt the operator to add a U2F/security key if none is registered yet
  useEffect(() => {
    let active = true
    hasRegisteredKey().then((has) => {
      if (active) setShowKeySetup(!has)
    })
    return () => {
      active = false
    }
  }, [])

  // Load conversations + subscribe to changes
  useEffect(() => {
    let active = true
    async function load() {
      const { data } = await supabase
        .from("conversations")
        .select("*")
        .order("last_message_at", { ascending: false })
      if (!active) return
      setConversations((data as Conversation[]) ?? [])
    }
    load()

    const channel = supabase
      .channel("operator:conversations")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        load()
      })
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [supabase])

  // Load messages for active conversation + subscribe
  useEffect(() => {
    if (!activeId) return
    let active = true
    async function load() {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", activeId)
        .order("created_at", { ascending: true })
      if (!active) return
      setMessages((data as Message[]) ?? [])
    }
    load()

    const channel = supabase
      .channel(`operator:messages:${activeId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${activeId}` },
        (payload) => {
          const msg = payload.new as Message
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
        },
      )
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [activeId, supabase])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages])

  const activeConvo = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  )

  // Broadcast typing state to the visitor as the operator types
  const broadcastTyping = useCallback(
    (typing: boolean) => {
      if (!activeId) return
      supabase.channel(`conversation:${activeId}`).send({
        type: "broadcast",
        event: "typing",
        payload: { typing },
      })
    },
    [activeId, supabase],
  )

  function onReplyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setReply(e.target.value)
    broadcastTyping(true)
    if (typingTimeout.current) clearTimeout(typingTimeout.current)
    typingTimeout.current = setTimeout(() => broadcastTyping(false), 2000)
  }

  const sendReply = useCallback(async () => {
    const text = reply.trim()
    if (!text || !activeId || sending) return
    setSending(true)
    setReply("")

    // Simulated "AI is generating" delay to sell the illusion
    if (autoDelay) {
      broadcastTyping(true)
      const delay = Math.min(2500, 600 + text.length * 18)
      await new Promise((r) => setTimeout(r, delay))
    }

    await supabase.from("messages").insert({
      conversation_id: activeId,
      role: "assistant",
      content: text,
    })
    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", activeId)

    broadcastTyping(false)
    setSending(false)
  }, [reply, activeId, sending, autoDelay, supabase, broadcastTyping])

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      if (e.nativeEvent.isComposing || e.keyCode === 229) return
      e.preventDefault()
      sendReply()
    }
  }

  function lastPreview(convoId: string) {
    return conversations.find((c) => c.id === convoId)?.last_message_at
  }

  return (
    <div className="flex h-dvh bg-background">
      {/* Sidebar: conversations */}
      <aside className="flex w-72 flex-none flex-col border-r border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="size-4 text-primary" aria-hidden="true" />
            <h2 className="text-sm font-semibold">Conversations</h2>
          </div>
          <form action={lockOperator}>
            <Button type="submit" variant="ghost" size="icon" className="size-8" aria-label="Lock console">
              <LogOut className="size-4" aria-hidden="true" />
            </Button>
          </form>
        </div>
        <div className="flex-1 overflow-y-auto">
          {showKeySetup && !dismissedKeyBanner && (
            <div className="relative p-3">
              <button
                type="button"
                onClick={() => setDismissedKeyBanner(true)}
                aria-label="Dismiss"
                className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
              <SecurityKeySetup onRegistered={() => setShowKeySetup(false)} />
            </div>
          )}
          {conversations.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No conversations yet.</p>
          )}
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              className={`flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors hover:bg-accent ${
                activeId === c.id ? "bg-accent" : ""
              }`}
            >
              <div className="flex size-9 flex-none items-center justify-center rounded-full bg-muted text-xs font-medium uppercase text-muted-foreground">
                {(c.visitor_name ?? "V").slice(0, 2)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {c.visitor_name ?? `Visitor ${c.session_id.slice(0, 6)}`}
                </p>
                <p className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                  <Globe className="size-3 flex-none" aria-hidden="true" />
                  <span className="truncate">{c.ip_address ?? "unknown IP"}</span>
                </p>
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Clock className="size-3 flex-none" aria-hidden="true" />
                  {formatTime(lastPreview(c.id) ?? c.created_at)}
                </p>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* Active conversation */}
      <section className="flex min-w-0 flex-1 flex-col">
        {!activeConvo ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <MessageSquare className="size-7" aria-hidden="true" />
            </div>
            <p className="text-sm text-muted-foreground text-pretty">
              Select a conversation to start replying as {AI_NAME}.
            </p>
          </div>
        ) : (
          <>
            <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 truncate text-sm font-semibold">
                  {activeConvo.visitor_name ?? `Visitor ${activeConvo.session_id.slice(0, 6)}`}
                  <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] font-normal text-muted-foreground">
                    <Globe className="size-3" aria-hidden="true" />
                    {activeConvo.ip_address ?? "unknown IP"}
                  </span>
                </h2>
                <p className="text-xs text-muted-foreground">
                  You are replying as <span className="font-medium text-primary">{AI_NAME}</span>
                </p>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <Zap className="size-3.5" aria-hidden="true" />
                <span>Auto delay</span>
                <input
                  type="checkbox"
                  checked={autoDelay}
                  onChange={(e) => setAutoDelay(e.target.checked)}
                  className="size-4 accent-primary"
                />
              </label>
            </header>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
              <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex items-end gap-2 ${m.role === "assistant" ? "justify-end" : "justify-start"}`}
                  >
                    {m.role === "user" && (
                      <div className="flex size-7 flex-none items-center justify-center rounded-full bg-muted text-[10px] font-medium uppercase text-muted-foreground">
                        V
                      </div>
                    )}
                    <div
                      className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                        m.role === "assistant"
                          ? "rounded-br-md bg-primary text-primary-foreground"
                          : "rounded-bl-md bg-muted text-foreground"
                      }`}
                    >
                      <p className="whitespace-pre-wrap text-pretty">{m.content}</p>
                      <p
                        className={`mt-1 text-[10px] ${
                          m.role === "assistant" ? "text-primary-foreground/70" : "text-muted-foreground"
                        }`}
                      >
                        {formatTime(m.created_at)}
                      </p>
                    </div>
                    {m.role === "assistant" && (
                      <div className="flex size-7 flex-none items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Sparkles className="size-3.5" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-border bg-card px-4 py-3">
              <div className="mx-auto flex w-full max-w-2xl items-end gap-2">
                <textarea
                  value={reply}
                  onChange={onReplyChange}
                  onKeyDown={onKeyDown}
                  rows={1}
                  placeholder={`Reply as ${AI_NAME}…`}
                  className="max-h-40 min-h-[44px] flex-1 resize-none rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none ring-ring focus-visible:ring-2"
                  aria-label="Reply input"
                />
                <Button
                  type="button"
                  size="icon"
                  onClick={sendReply}
                  disabled={!reply.trim() || sending}
                  className="size-11 flex-none rounded-full"
                  aria-label="Send reply"
                >
                  <Send className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
