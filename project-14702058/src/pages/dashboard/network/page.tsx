import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  acceptInvite,
  createInviteLink,
  inviteByEmail,
  listConnections,
  type Connection,
} from "@/lib/social";
import { useBrandName } from "@/hooks/useBranding";

function initials(name?: string): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const AVATAR_TONES = [
  "bg-primary-500",
  "bg-accent-500",
  "bg-secondary-500",
  "bg-foreground-800",
];

function avatarTone(id: string | number): string {
  const n = typeof id === "number" ? id : String(id).length;
  return AVATAR_TONES[n % AVATAR_TONES.length];
}

export default function Network() {
  const brandName = useBrandName();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteNotice, setInviteNotice] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setConnections((await listConnections()) ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load connections.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const pending = connections.filter((c) => (c.status ?? "").toLowerCase() === "pending");
  const accepted = connections.filter((c) => (c.status ?? "").toLowerCase() !== "pending");

  async function handleInvite() {
    const email = inviteEmail.trim();
    if (!email) return;
    setInviteBusy(true);
    setInviteNotice("");
    try {
      await inviteByEmail(email);
      setInviteEmail("");
      setInviteNotice(`Invite sent to ${email}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send invite.");
    } finally {
      setInviteBusy(false);
    }
  }

  async function handleInviteLink() {
    setLinkBusy(true);
    setError("");
    try {
      const res = await createInviteLink();
      const link = res.url ?? res.link ?? res.token ?? res.code ?? "";
      setInviteLink(link);
      if (!link) setInviteNotice("Invite link created.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create invite link.");
    } finally {
      setLinkBusy(false);
    }
  }

  async function copyLink() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function handleAccept(c: Connection) {
    setConnections((prev) =>
      prev.map((x) => (x.id === c.id ? { ...x, status: "accepted" } : x))
    );
    try {
      await acceptInvite(c.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not accept invite.");
    }
  }

  return (
    <div className="space-y-6">
      <section className="animate-fade-in-up">
        <h1 className="font-heading text-2xl md:text-3xl font-medium text-foreground-950">
          Network
        </h1>
        <p className="text-sm text-foreground-600 mt-1">
          Connect with peers, grow your circle, and practice together.
        </p>
      </section>

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
        className="rounded-2xl bg-background-100/60 border border-background-200 p-5 animate-fade-in-up"
        style={{ animationDelay: "0.06s" }}
      >
        <h2 className="font-heading text-lg font-medium text-foreground-950">Invite friends</h2>
        <p className="text-sm text-foreground-600 mt-1">
          Bring peers into {brandName} so you can trade feedback and practice interviews.
        </p>
        <div className="mt-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <i className="ri-mail-line absolute left-3 top-1/2 -translate-y-1/2 text-foreground-400 text-sm"></i>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleInvite()}
              placeholder="friend@example.com"
              className="w-full h-10 pl-9 pr-3 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300"
            />
          </div>
          <button
            onClick={handleInvite}
            disabled={inviteBusy || !inviteEmail.trim()}
            className="inline-flex items-center justify-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-primary-600 cursor-pointer whitespace-nowrap disabled:opacity-60"
          >
            {inviteBusy ? (
              <i className="ri-loader-4-line animate-spin"></i>
            ) : (
              <i className="ri-send-plane-line"></i>
            )}
            Send invite
          </button>
          <button
            onClick={handleInviteLink}
            disabled={linkBusy}
            className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-foreground-700 bg-background-100 border border-background-300 px-4 py-2.5 rounded-md hover:bg-background-200 cursor-pointer whitespace-nowrap disabled:opacity-60"
          >
            <i className={linkBusy ? "ri-loader-4-line animate-spin" : "ri-link"}></i>
            Get invite link
          </button>
        </div>
        {inviteNotice && (
          <p className="text-xs text-primary-900 bg-primary-100 rounded-lg px-3 py-2 mt-3">
            {inviteNotice}
          </p>
        )}
        {inviteLink && (
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 truncate text-xs text-foreground-700 bg-background-50 border border-background-200 rounded-lg px-3 py-2">
              {inviteLink}
            </code>
            <button
              onClick={copyLink}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:text-primary-900 px-3 py-2 rounded-md hover:bg-primary-100 cursor-pointer whitespace-nowrap"
            >
              <i className={copied ? "ri-check-line" : "ri-file-copy-line"}></i>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}
      </section>

      <div className="grid lg:grid-cols-3 gap-6">
        <div
          className="lg:col-span-2 animate-fade-in-up"
          style={{ animationDelay: "0.12s" }}
        >
          <section className="rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between">
              <h2 className="font-heading text-lg font-medium text-foreground-950">
                Your connections
              </h2>
              <span className="text-xs text-foreground-500">{accepted.length} connected</span>
            </div>
            {loading ? (
              <div className="py-14 text-sm text-foreground-500 flex items-center justify-center gap-2">
                <i className="ri-loader-4-line animate-spin"></i>
                Loading…
              </div>
            ) : accepted.length === 0 ? (
              <div className="py-14 text-center">
                <div className="w-12 h-12 mx-auto flex items-center justify-center rounded-full bg-background-200 text-foreground-500">
                  <i className="ri-user-add-line text-xl"></i>
                </div>
                <p className="text-sm font-medium text-foreground-900 mt-3">No connections yet</p>
                <p className="text-sm text-foreground-500 mt-1">
                  Invite a friend to get started.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-background-200">
                {accepted.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 px-5 py-4">
                    <div
                      className={`w-10 h-10 flex items-center justify-center rounded-full text-background-50 text-sm font-semibold flex-shrink-0 ${avatarTone(c.id)}`}
                    >
                      {initials(c.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-foreground-950">{c.name}</div>
                      <div className="text-xs text-foreground-500 truncate">
                        {c.headline || c.email}
                      </div>
                    </div>
                    <button className="w-9 h-9 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-200 hover:text-foreground-900 cursor-pointer">
                      <i className="ri-chat-3-line text-lg"></i>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="animate-fade-in-up" style={{ animationDelay: "0.18s" }}>
          <section className="rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-background-200">
              <h2 className="font-heading text-lg font-medium text-foreground-950">
                Pending invites
              </h2>
              <p className="text-xs text-foreground-500 mt-0.5">Waiting on your approval</p>
            </div>
            {!loading && pending.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-foreground-500">
                No pending invites.
              </div>
            ) : (
              <div className="divide-y divide-background-200">
                {pending.map((c) => (
                  <div key={c.id} className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 flex items-center justify-center rounded-full text-background-50 text-sm font-semibold flex-shrink-0 ${avatarTone(c.id)}`}
                      >
                        {initials(c.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-foreground-950">{c.name}</div>
                        <div className="text-xs text-foreground-500 truncate">
                          {c.headline || c.email}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => handleAccept(c)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-3 py-2 rounded-md hover:bg-primary-600 cursor-pointer whitespace-nowrap"
                      >
                        <i className="ri-check-line"></i>
                        Accept
                      </button>
                      <button className="inline-flex items-center justify-center text-sm font-semibold text-foreground-600 bg-background-100 border border-background-300 px-3 py-2 rounded-md hover:bg-background-200 cursor-pointer whitespace-nowrap">
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}