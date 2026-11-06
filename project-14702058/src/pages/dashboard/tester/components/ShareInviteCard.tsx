import { useState } from "react";

type Channel = "sms" | "slack" | "email";

const CHANNEL_META: Record<Channel, { label: string; icon: string; hint: string }> = {
  sms: {
    label: "SMS",
    icon: "ri-message-2-line",
    hint: "Short version for a text message",
  },
  slack: {
    label: "Slack",
    icon: "ri-slack-line",
    hint: "Formatted with Slack markdown",
  },
  email: {
    label: "Email",
    icon: "ri-mail-line",
    hint: "The full welcome email, ready to send",
  },
};

const MESSAGES: Record<Channel, string> = {
  sms: `🚀 You're in as a Project Harbor tester! Install the extension (Chrome/Edge, signed in with the Google email you gave us): https://chromewebstore.google.com/detail/project-harbor-connect/apojagpcjhjfplfjfpcmlplhmokoandj

Sign in to Project Harbor: https://hlrtlg.readdy.co (use the account/code we sent).

Log into a job site (e.g. Indeed) in the same browser. In Project Harbor → Connect a site → pick it → Connect → "Connected."

✅ Cookies only, never your password. Disconnect anytime; nothing's submitted without your OK.

Bugs & feedback → in the app: Tester program → Send us feedback.`,
  slack: `🚀 *You're in as a Project Harbor tester!*

1. Install the extension (Chrome/Edge, signed in with the Google email you gave us):
https://chromewebstore.google.com/detail/project-harbor-connect/apojagpcjhjfplfjfpcmlplhmokoandj
2. Sign in to Project Harbor: https://hlrtlg.readdy.co — use the account/code we sent.
3. Log into a job site (e.g. Indeed) in the same browser.
4. In Project Harbor → *Connect a site* → pick it → *Connect* → "Connected."

✅ Cookies only, never your password. Disconnect anytime; nothing's submitted without your OK.

Bugs & feedback → post in this channel, or use *Tester program → Send us feedback* in the app.`,
  email: `Subject: Welcome to the Project Harbor tester program

Hi there,

Thanks for helping test Project Harbor and the Project Harbor Connect browser extension. Here's the 2-minute setup:

1. Install the extension
Open this link in Chrome (or Edge) and click Add to Chrome:
https://chromewebstore.google.com/detail/project-harbor-connect/apojagpcjhjfplfjfpcmlplhmokoandj
You must be signed into Chrome with the Google account you gave us — that's how we granted tester access. If you see "item not available," reply with that Google email and we'll sort it.

2. Sign in to Project Harbor
Go to https://hlrtlg.readdy.co and sign in with the account (or access code) we sent you.

3. Sign in to a job site
In the same browser, log into a job site you use — e.g. Indeed or LinkedIn. Just get to your logged-in homepage there; nothing else to do.

4. Connect it
Back in Project Harbor, open Connect a site, pick the site, and click Connect. You'll see "Connected." That's it — no codes to copy.
(If it doesn't auto-connect, click the extension icon in your toolbar, pick the site, and paste the one-time code shown in the app.)

What it does / doesn't do
- Links a job site you're already logged into so the assistant can help you tailor your résumé and apply.
- Cookies only — never your password. You stay signed in on the site's own page.
- It acts only when you click Connect, and you can disconnect any site anytime under Connected sites.
- Every real application waits for your explicit approval — nothing is submitted on your behalf without it.

Reporting feedback
Inside the app, open Tester program → Send us feedback and tell us what worked, what broke, what you'd change. You can also just reply to this email — either way reaches our tester inbox.

Thanks for kicking the tires!
— The Project Harbor team`,
};

/**
 * Tester-invite copy, ready to paste into SMS, Slack, or a full email. SMS and
 * Slack mirror the welcome email in a condensed form; Email carries the whole
 * thing. Every variant points the "feedback" line at the real destination — the
 * in-app Tester program → Send us feedback form, where bug reports actually
 * land. Copy is the whole job here; one tap puts it on the clipboard.
 */
export default function ShareInviteCard() {
  const [channel, setChannel] = useState<Channel>("sms");
  const [copied, setCopied] = useState(false);

  const message = MESSAGES[channel];
  const meta = CHANNEL_META[channel];

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section
      className="rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden animate-fade-in-up"
      style={{ animationDelay: "0.1s" }}
    >
      <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-secondary-100 text-secondary-700 flex-shrink-0">
            <i className="ri-share-forward-line"></i>
          </span>
          <div className="min-w-0">
            <h2 className="font-heading text-base font-medium text-foreground-950">
              Invite another tester
            </h2>
            <p className="text-xs text-foreground-500 mt-0.5">
              The short version, ready to paste — {meta.hint.toLowerCase()}
            </p>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Message format"
          className="inline-flex items-center gap-1 p-1 rounded-full bg-background-200"
        >
          {(Object.keys(CHANNEL_META) as Channel[]).map((ch) => {
            const active = channel === ch;
            return (
              <button
                key={ch}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setChannel(ch);
                  setCopied(false);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? "bg-background-50 text-foreground-950"
                    : "text-foreground-600 hover:text-foreground-900"
                }`}
              >
                <i className={CHANNEL_META[ch].icon}></i>
                {CHANNEL_META[ch].label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-5">
        <div className="rounded-xl bg-background-50 border border-background-200 p-4">
          <pre className="whitespace-pre-wrap break-words font-sans text-sm text-foreground-700 leading-relaxed m-0">
            {message}
          </pre>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-foreground-500 flex items-center gap-1.5">
            <i className="ri-lightbulb-line text-accent-600"></i>
            Feedback line points at Tester program → Send us feedback
          </p>
          <button
            type="button"
            onClick={copy}
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              copied
                ? "bg-primary-100 text-primary-900"
                : "bg-primary-500 text-background-50 dark:text-foreground-950 hover:bg-primary-600"
            }`}
          >
            <i className={copied ? "ri-check-line" : "ri-file-copy-line"}></i>
            {copied ? "Copied" : `Copy ${meta.label} message`}
          </button>
        </div>
      </div>
    </section>
  );
}