"use client";

import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type PublicMessage = {
  id: string;
  role: "customer" | "ai" | "human" | "system";
  content: string;
  createdAt: string;
};

type Config = {
  businessName: string;
  greeting: string;
};

function visitorStorageKey(publicKey: string): string {
  return `asm-visitor:${publicKey}`;
}

function readVisitorId(publicKey: string): string {
  const existing = window.localStorage.getItem(visitorStorageKey(publicKey));
  if (existing && /^[A-Za-z0-9_-]{8,80}$/.test(existing)) return existing;
  const created = `v_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
  window.localStorage.setItem(visitorStorageKey(publicKey), created);
  return created;
}

export default function EmbedWidgetPage(): React.ReactElement {
  return (
    <React.Suspense fallback={<div className="h-dvh bg-background" />}>
      <EmbedWidget />
    </React.Suspense>
  );
}

function EmbedWidget(): React.ReactElement {
  const params = useSearchParams();
  const publicKey = params.get("key") ?? "";
  const [config, setConfig] = useState<Config | null>(null);
  const [messages, setMessages] = useState<PublicMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const visitorRef = useRef<string>("");
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!publicKey) return;
    visitorRef.current = readVisitorId(publicKey);
    let cancelled = false;
    fetch(`/api/v1/public/widget/${encodeURIComponent(publicKey)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Widget unavailable");
        return (await res.json()) as Config;
      })
      .then((data) => {
        if (!cancelled) setConfig(data);
      })
      .catch(() => {
        if (!cancelled) setError("This chat is unavailable.");
      });
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  useEffect(() => {
    if (!publicKey || !conversationId) return;
    const visitor = visitorRef.current;
    const timer = window.setInterval(() => {
      const url = `/api/v1/public/widget/${encodeURIComponent(publicKey)}/conversations/${conversationId}/messages?visitorId=${encodeURIComponent(visitor)}`;
      fetch(url)
        .then(async (res) => {
          if (!res.ok) return null;
          return (await res.json()) as PublicMessage[];
        })
        .then((rows) => {
          if (rows) setMessages(rows);
        })
        .catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [publicKey, conversationId]);

  useEffect(() => {
    const node = scrollerRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, sending]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending || !publicKey) return;
    setSending(true);
    setError(null);
    setDraft("");
    const optimistic: PublicMessage = {
      id: `local-${Date.now().toString()}`,
      role: "customer",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);
    try {
      const res = await fetch(`/api/v1/public/widget/${encodeURIComponent(publicKey)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorId: visitorRef.current, message: text }),
      });
      const payload = (await res.json()) as {
        conversationId?: string;
        messages?: PublicMessage[];
        error?: { message?: string };
      };
      if (!res.ok) {
        throw new Error(payload.error?.message || "Could not send");
      }
      if (payload.conversationId) setConversationId(payload.conversationId);
      if (payload.messages) setMessages(payload.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send");
    } finally {
      setSending(false);
    }
  }

  const greeting = config?.greeting;
  const title = config?.businessName || "Chat";

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
          AI
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="text-[11px] text-muted-foreground">Sales assistant</p>
        </div>
      </header>
      <div ref={scrollerRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {greeting && messages.length === 0 ? (
          <p className="max-w-[85%] rounded-2xl bg-muted px-3 py-2 text-sm">{greeting}</p>
        ) : null}
        {messages.map((message) => {
          const mine = message.role === "customer";
          return (
            <p
              key={message.id}
              className={
                mine
                  ? "ms-auto w-fit max-w-[85%] rounded-2xl bg-primary px-3 py-2 text-sm text-primary-foreground"
                  : "w-fit max-w-[85%] rounded-2xl bg-muted px-3 py-2 text-sm"
              }
            >
              {message.content}
            </p>
          );
        })}
        {sending ? <p className="text-xs text-muted-foreground">…</p> : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
      <form onSubmit={onSubmit} className="flex gap-2 border-t border-border p-3">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Message"
          maxLength={1000}
          className="min-w-0 flex-1 rounded-full border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          aria-label="Message"
        />
        <button
          type="submit"
          disabled={sending || draft.trim().length === 0}
          className="rounded-full bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
