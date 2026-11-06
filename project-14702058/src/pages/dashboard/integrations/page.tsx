import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { useToast } from "@/components/base/ToastProvider";
import { useBrandName } from "@/hooks/useBranding";
import {
  connectIntegration,
  disconnectIntegration,
  importLinkedIn,
  importLinkedInFile,
  listIntegrations,
  type ConnectResponse,
  type Integration,
} from "@/lib/integrations";

interface Provider {
  id: string;
  name: string;
  desc: string;
  icon: string;
  tone: string;
}

const PROVIDERS: Provider[] = [
  {
    id: "linkedin",
    name: "LinkedIn",
    desc: "Import your profile, network, and job searches",
    icon: "ri-linkedin-fill",
    tone: "bg-primary-500",
  },
  {
    id: "gmail",
    name: "Gmail",
    desc: "Sync forwarded job alerts into your inbox",
    icon: "ri-mail-line",
    tone: "bg-accent-500",
  },
  {
    id: "indeed",
    name: "Indeed",
    desc: "Sync job board searches into one queue",
    icon: "ri-search-line",
    tone: "bg-secondary-500",
  },
];

function oauthUrl(data: ConnectResponse | void): string {
  if (!data) return "";
  return data.url ?? data.redirect_url ?? data.authorization_url ?? data.auth_url ?? "";
}

export default function Integrations() {
  const brandName = useBrandName();
  const [connected, setConnected] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyProvider, setBusyProvider] = useState("");
  const [importing, setImporting] = useState("");
  const { showToast } = useToast();

  async function load() {
    setLoading(true);
    setError("");
    try {
      setConnected((await listIntegrations()) ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load integrations.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function isConnected(provider: string): boolean {
    return connected.some((c) => (c.provider ?? c.id ?? "").toLowerCase() === provider);
  }

  async function handleConnect(p: Provider) {
    setBusyProvider(p.id);
    setError("");
    setNotice("");
    try {
      const res = await connectIntegration(p.id);
      const url = oauthUrl(res);
      if (url) {
        setNotice(`Connecting to ${p.name} — complete authorization in the new window.`);
        window.location.assign(url);
      } else {
        setNotice(`${p.name} connected successfully.`);
        load();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Could not connect ${p.name}.`);
    } finally {
      setBusyProvider("");
    }
  }

  async function handleDisconnect(p: Provider) {
    setBusyProvider(p.id);
    setError("");
    setNotice("");
    try {
      await disconnectIntegration(p.id);
      showToast(`${p.name} disconnected.`, "info", {
        label: "Undo",
        onUndo: async () => {
          try {
            const res = await connectIntegration(p.id);
            const url = oauthUrl(res);
            if (url) {
              window.location.assign(url);
            } else {
              load();
            }
          } catch {
            // Reconnect failed.
          }
        },
      });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Could not disconnect ${p.name}.`);
    } finally {
      setBusyProvider("");
    }
  }

  async function handleImport(mode: "import" | "import-file") {
    setImporting(mode);
    setError("");
    setNotice("");
    try {
      if (mode === "import") {
        await importLinkedIn();
        setNotice("LinkedIn import started.");
      } else {
        await importLinkedInFile();
        setNotice("LinkedIn file import started.");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not run LinkedIn import.");
    } finally {
      setImporting("");
    }
  }

  return (
    <div className="space-y-6">
      <section className="animate-fade-in-up">
        <h1 className="font-heading text-2xl md:text-3xl font-medium text-foreground-950">
          Integrations
        </h1>
        <p className="text-sm text-foreground-600 mt-1">
          Connect the tools you use so {brandName} can find, verify, and apply for you.
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

      {notice && (
        <div className="flex items-start gap-2 text-sm text-primary-900 bg-primary-100 rounded-lg px-4 py-3 animate-fade-in-up">
          <i className="ri-information-line mt-0.5"></i>
          <span>{notice}</span>
        </div>
      )}

      <section
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 animate-fade-in-up"
        style={{ animationDelay: "0.06s" }}
      >
        {PROVIDERS.map((it) => {
          const isOn = isConnected(it.id);
          const busy = busyProvider === it.id;
          return (
            <div
              key={it.id}
              className="rounded-2xl bg-background-100/60 border border-background-200 p-5 flex flex-col"
            >
              <div className="flex items-start justify-between gap-3">
                <div
                  className={`w-11 h-11 flex items-center justify-center rounded-xl text-background-50 dark:text-foreground-950 text-xl ${it.tone}`}
                >
                  <i className={it.icon}></i>
                </div>
                <span
                  className={`text-[11px] font-semibold px-2 py-1 rounded-full whitespace-nowrap ${
                    isOn
                      ? "bg-primary-100 text-primary-900"
                      : "bg-background-200 text-foreground-500"
                  }`}
                >
                  {isOn ? "Connected" : "Not connected"}
                </span>
              </div>
              <h2 className="font-heading text-lg font-medium text-foreground-950 mt-4">
                {it.name}
              </h2>
              <p className="text-sm text-foreground-600 mt-1 flex-1">{it.desc}</p>
              <button
                onClick={() => (isOn ? handleDisconnect(it) : handleConnect(it))}
                disabled={busy || loading}
                className={`mt-4 inline-flex items-center justify-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-md transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60 ${
                  isOn
                    ? "text-foreground-700 bg-background-100 border border-background-300 hover:bg-background-200"
                    : "bg-primary-500 text-background-50 dark:text-foreground-950 hover:bg-primary-600"
                }`}
              >
                {busy ? (
                  <i className="ri-loader-4-line animate-spin"></i>
                ) : isOn ? (
                  <i className="ri-close-line"></i>
                ) : (
                  <i className="ri-link"></i>
                )}
                {isOn ? "Disconnect" : "Connect"}
              </button>
            </div>
          );
        })}
      </section>

      <section
        className="rounded-2xl bg-background-100/60 border border-background-200 p-5 animate-fade-in-up"
        style={{ animationDelay: "0.12s" }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-11 h-11 flex items-center justify-center rounded-xl bg-secondary-500 text-background-50 dark:text-foreground-950 text-xl flex-shrink-0">
            <i className="ri-file-upload-line"></i>
          </div>
          <div className="flex-1">
            <h2 className="font-heading text-base font-medium text-foreground-950">
              LinkedIn profile import
            </h2>
            <p className="text-sm text-foreground-600 mt-0.5">
              Bring in your experience, skills, and connections to enrich your profile.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => handleImport("import")}
              disabled={importing === "import"}
              className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-primary-600 cursor-pointer whitespace-nowrap disabled:opacity-60"
            >
              {importing === "import" ? (
                <i className="ri-loader-4-line animate-spin"></i>
              ) : (
                <i className="ri-linkedin-fill"></i>
              )}
              Import from LinkedIn
            </button>
            <button
              onClick={() => handleImport("import-file")}
              disabled={importing === "import-file"}
              className="inline-flex items-center gap-2 text-sm font-semibold text-foreground-700 bg-background-100 border border-background-300 px-4 py-2.5 rounded-md hover:bg-background-200 cursor-pointer whitespace-nowrap disabled:opacity-60"
            >
              {importing === "import-file" ? (
                <i className="ri-loader-4-line animate-spin"></i>
              ) : (
                <i className="ri-file-upload-line"></i>
              )}
              Import from file
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}