import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  listMessages,
  listThreads,
  sendMessage,
  type Message,
  type Thread,
} from "@/lib/social";

function initials(name?: string): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatTime(v?: string): string {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function Messages() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [error, setError] = useState("");

  const [active, setActive] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  async function loadThreads() {
    setThreadsLoading(true);
    setError("");
    try {
      setThreads((await listThreads()) ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load conversations.");
    } finally {
      setThreadsLoading(false);
    }
  }

  useEffect(() => {
    loadThreads();
  }, []);

  async function openThread(t: Thread) {
    setActive(t);
    setMessages([]);
    setDraft("");
    setMessagesLoading(true);
    setError("");
    try {
      setMessages((await listMessages(t.other_id)) ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load messages.");
    } finally {
      setMessagesLoading(false);
    }
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, active]);

  async function handleSend() {
    const body = draft.trim();
    if (!body || !active) return;
    setSending(true);
    setError("");
    try {
      const msg = await sendMessage(active.other_id, body);
      setMessages((prev) => [...prev, msg]);
      setDraft("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="animate-fade-in-up">
        <h1 className="font-heading text-2xl md:text-3xl font-medium text-foreground-950">
          Messages
        </h1>
        <p className="text-sm text-foreground-600 mt-1">
          Chat with your connections and coordinate peer practice.
        </p>
      </section>

      {error && (
        <div className="flex items-start gap-2.5 rounded-lg bg-accent-100 text-accent-900 px-4 py-3 text-sm animate-fade-in-up">
          <i className="ri-error-warning-line text-base mt-0.5"></i>
          <div className="flex-1">{error}</div>
          <button
            onClick={loadThreads}
            className="inline-flex items-center gap-1 text-sm font-semibold hover:text-accent-900/80 cursor-pointer whitespace-nowrap"
          >
            Retry
          </button>
        </div>
      )}

      <div
        className="grid lg:grid-cols-[300px_1fr] gap-4 animate-fade-in-up h-[560px]"
        style={{ animationDelay: "0.06s" }}
      >
        <aside className="rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-background-200">
            <span className="text-sm font-semibold text-foreground-950">Conversations</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {threadsLoading ? (
              <div className="py-14 text-sm text-foreground-500 flex items-center justify-center gap-2">
                <i className="ri-loader-4-line animate-spin"></i>
                Loading…
              </div>
            ) : threads.length === 0 ? (
              <div className="px-4 py-14 text-center text-sm text-foreground-500">
                No conversations yet.
              </div>
            ) : (
              threads.map((t) => {
                const unread = !!t.unread;
                return (
                  <button
                    key={t.other_id}
                    onClick={() => openThread(t)}
                    className={`w-full flex items-start gap-3 px-4 py-3 text-left cursor-pointer ${
                      active?.other_id === t.other_id
                        ? "bg-primary-100/70"
                        : "hover:bg-background-100"
                    }`}
                  >
                    <div className="w-10 h-10 flex items-center justify-center rounded-full bg-secondary-500 text-background-50 text-sm font-semibold flex-shrink-0">
                      {initials(t.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-foreground-950 truncate">
                          {t.name}
                        </span>
                        <span className="text-[11px] text-foreground-400 whitespace-nowrap">
                          {formatTime(t.updated_at)}
                        </span>
                      </div>
                      <p className="text-xs text-foreground-500 truncate mt-0.5">
                        {t.last_message}
                      </p>
                    </div>
                    {unread && (
                      <span className="w-2 h-2 flex items-center justify-center rounded-full bg-accent-500 mt-1 flex-shrink-0"></span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className="rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden flex flex-col">
          {!active ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className="w-14 h-14 flex items-center justify-center rounded-full bg-background-200 text-foreground-500">
                <i className="ri-chat-3-line text-2xl"></i>
              </div>
              <p className="text-sm font-medium text-foreground-900 mt-4">Select a conversation</p>
              <p className="text-sm text-foreground-500 mt-1">
                Choose a thread to start chatting.
              </p>
            </div>
          ) : (
            <>
              <div className="px-5 py-3 border-b border-background-200 flex items-center gap-3">
                <div className="w-9 h-9 flex items-center justify-center rounded-full bg-secondary-500 text-background-50 text-sm font-semibold flex-shrink-0">
                  {initials(active.name)}
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground-950">{active.name}</div>
                  <div className="text-[11px] text-foreground-500">Peer</div>
                </div>
              </div>

              <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-3">
                {messagesLoading ? (
                  <div className="py-14 text-sm text-foreground-500 flex items-center justify-center gap-2">
                    <i className="ri-loader-4-line animate-spin"></i>
                    Loading messages…
                  </div>
                ) : messages.length === 0 ? (
                  <div className="py-14 text-center text-sm text-foreground-500">
                    No messages yet — say hi!
                  </div>
                ) : (
                  messages.map((m, i) => {
                    const mine = m.from_me !== false;
                    return (
                      <div
                        key={m.id ?? i}
                        className={`flex ${mine ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${
                            mine
                              ? "bg-primary-500 text-background-50 dark:text-foreground-950 rounded-br-md"
                              : "bg-background-200 text-foreground-900 rounded-bl-md"
                          }`}
                        >
                          <p>{m.body ?? m.content ?? m.text ?? ""}</p>
                          <div
                            className={`text-[10px] mt-1 ${
                              mine ? "text-background-50/70" : "text-foreground-500"
                            }`}
                          >
                            {formatTime(m.created_at)}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="p-3 border-t border-background-200">
                <div className="flex items-center gap-2">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                    placeholder="Type a message…"
                    className="flex-1 h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300"
                  />
                  <button
                    onClick={handleSend}
                    disabled={sending || !draft.trim()}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-primary-600 cursor-pointer whitespace-nowrap disabled:opacity-60"
                  >
                    {sending ? (
                      <i className="ri-loader-4-line animate-spin"></i>
                    ) : (
                      <i className="ri-send-plane-line"></i>
                    )}
                    Send
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}