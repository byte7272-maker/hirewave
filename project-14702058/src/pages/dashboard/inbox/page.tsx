import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  getInboxAddress,
  listInbox,
  markInboxRead,
  syncGmail,
  type InboxMessage,
} from "@/lib/inbox";
import { useBrandName } from "@/hooks/useBranding";

function formatDate(v?: string): string {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function Inbox() {
  const brandName = useBrandName();
  const [address, setAddress] = useState("");
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [addr, list] = await Promise.all([getInboxAddress(), listInbox()]);
      setAddress(addr.address ?? addr.email ?? "");
      setMessages(list ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load your inbox.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function copyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setNotice("");
    try {
      await syncGmail();
      setNotice("Gmail sync started — new job alerts will appear shortly.");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sync Gmail.");
    } finally {
      setSyncing(false);
    }
  }

  async function openMessage(m: InboxMessage) {
    if (m.read) return;
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, read: true } : x)));
    try {
      await markInboxRead(m.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not mark as read.");
    }
  }

  const unreadCount = messages.filter((m) => !m.read).length;

  return (
    <div className="space-y-6">
      <section className="animate-fade-in-up">
        <h1 className="font-heading text-2xl md:text-3xl font-medium text-foreground-950">
          Inbox
        </h1>
        <p className="text-sm text-foreground-600 mt-1">
          Job alerts forwarded to your dedicated {brandName} inbox.
        </p>
      </section>

      <section
        className="rounded-2xl bg-background-100/60 border border-background-200 p-5 animate-fade-in-up"
        style={{ animationDelay: "0.06s" }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-accent-500 text-background-50 dark:text-foreground-950 text-xl flex-shrink-0">
            <i className="ri-inbox-line"></i>
          </div>
          <div className="flex-1">
            <h2 className="font-heading text-base font-medium text-foreground-950">
              Forward job alerts here
            </h2>
            <p className="text-sm text-foreground-600 mt-0.5">
              Set up email forwarding from LinkedIn, Indeed, or Gmail to this address.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {address && (
              <div className="flex items-center gap-2 bg-background-50 border border-background-200 rounded-lg pl-3 pr-1 py-1">
                <code className="text-sm text-foreground-800">{address}</code>
                <button
                  onClick={copyAddress}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 px-2 py-1.5 rounded-md hover:bg-primary-100 cursor-pointer whitespace-nowrap"
                >
                  <i className={copied ? "ri-check-line" : "ri-file-copy-line"}></i>
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            )}
            <button
              onClick={handleSync}
              disabled={syncing}
              className="inline-flex items-center gap-2 text-sm font-semibold text-foreground-700 bg-background-100 border border-background-300 px-4 py-2 rounded-md hover:bg-background-200 cursor-pointer whitespace-nowrap disabled:opacity-60"
            >
              {syncing ? (
                <i className="ri-loader-4-line animate-spin"></i>
              ) : (
                <i className="ri-refresh-line"></i>
              )}
              Sync Gmail
            </button>
          </div>
        </div>
      </section>

      {notice && (
        <div className="flex items-start gap-2 text-sm text-primary-900 bg-primary-100 rounded-lg px-4 py-3 animate-fade-in-up">
          <i className="ri-information-line mt-0.5"></i>
          <span>{notice}</span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2.5 rounded-lg bg-accent-100 text-accent-900 px-4 py-3 text-sm animate-fade-in-up">
          <i className="ri-error-warning-line text-base mt-0.5"></i>
          <div className="flex-1">{error}</div>
          <button
            onClick={load}
            className="inline-flex items-center gap-1 text-sm font-semibold hover:text-accent-900/80 cursor-pointer whitespace-nowrap"
          >
            Retry
          </button>
        </div>
      )}

      <section
        className="rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden animate-fade-in-up"
        style={{ animationDelay: "0.12s" }}
      >
        <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between">
          <h2 className="font-heading text-base font-medium text-foreground-950">Messages</h2>
          <span className="text-xs text-foreground-500">{unreadCount} unread</span>
        </div>
        {loading ? (
          <div className="py-14 text-sm text-foreground-500 flex items-center justify-center gap-2">
            <i className="ri-loader-4-line animate-spin"></i>
            Loading…
          </div>
        ) : messages.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-12 h-12 mx-auto flex items-center justify-center rounded-full bg-background-200 text-foreground-500">
              <i className="ri-mail-line text-xl"></i>
            </div>
            <p className="text-sm font-medium text-foreground-900 mt-3">Inbox is empty</p>
            <p className="text-sm text-foreground-500 mt-1">
              Forward job alerts to your {brandName} address to see them here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-background-200">
            {messages.map((m) => (
              <button
                key={m.id}
                onClick={() => openMessage(m)}
                className="w-full flex items-start gap-3 px-5 py-4 text-left hover:bg-background-100 cursor-pointer"
              >
                <div
                  className={`w-10 h-10 flex items-center justify-center rounded-full flex-shrink-0 ${
                    m.read
                      ? "bg-background-200 text-foreground-500"
                      : "bg-secondary-500 text-background-50"
                  }`}
                >
                  <i className={m.read ? "ri-mail-open-line" : "ri-mail-line"}></i>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm truncate ${
                        m.read ? "text-foreground-700" : "font-semibold text-foreground-950"
                      }`}
                    >
                      {m.from ?? m.from_address ?? "Unknown sender"}
                    </span>
                    {m.job_match && (
                      <span className="text-[10px] font-semibold text-primary-900 bg-primary-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                        Match
                      </span>
                    )}
                  </div>
                  <div
                    className={`text-sm mt-0.5 ${
                      m.read ? "text-foreground-600" : "font-medium text-foreground-900"
                    }`}
                  >
                    {m.subject}
                  </div>
                  <div className="text-xs text-foreground-500 mt-0.5 truncate">
                    {m.snippet ?? m.body}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <span className="text-[11px] text-foreground-400 whitespace-nowrap">
                    {formatDate(m.received_at)}
                  </span>
                  {!m.read && <span className="w-2 h-2 rounded-full bg-accent-500"></span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}