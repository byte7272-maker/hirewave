import { useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PipelineTab from "./components/PipelineTab";
import AuthenticatedAppsTab from "./components/AuthenticatedAppsTab";
import RulesTab from "./components/RulesTab";
import QueueTab from "./components/QueueTab";
import HarborExtensionStatus from "./components/HarborExtensionStatus";
import { useBrandName } from "@/hooks/useBranding";

type TabId = "pipeline" | "apps" | "rules" | "queue";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "pipeline", label: "Pipeline", icon: "ri-flow-chart" },
  { id: "apps", label: "Authenticated apps", icon: "ri-plug-line" },
  { id: "rules", label: "Auto-apply rules", icon: "ri-magic-line" },
  { id: "queue", label: "Apply queue", icon: "ri-inbox-line" },
];

export default function AutoApply() {
  const brandName = useBrandName();
  const [searchParams, setSearchParams] = useSearchParams();
  const connectProvider = searchParams.get("connect");
  const tabParam = searchParams.get("tab");
  const reconnectParam = searchParams.get("reconnect");
  // Landing on the hub should show the applied roles first — unless the visitor
  // arrived to connect a source (or manage sessions), in which case jump to apps.
  const [tab, setTab] = useState<TabId>(
    connectProvider || reconnectParam || tabParam === "apps" ? "apps" : "pipeline"
  );

  const consumeConnect = useCallback(() => {
    setSearchParams(
      (prev) => {
        if (!prev.has("connect")) return prev;
        const next = new URLSearchParams(prev);
        next.delete("connect");
        return next;
      },
      { replace: true }
    );
  }, [setSearchParams]);

  const consumeReconnect = useCallback(() => {
    setSearchParams(
      (prev) => {
        if (!prev.has("reconnect")) return prev;
        const next = new URLSearchParams(prev);
        next.delete("reconnect");
        return next;
      },
      { replace: true }
    );
  }, [setSearchParams]);

  return (
    <div className="space-y-6">
      <section className="animate-fade-in-up">
        <h1 className="font-heading text-2xl md:text-3xl font-medium text-foreground-950">
          Auto-apply
        </h1>
        <p className="text-sm text-foreground-600 mt-1">
          Track every role you&apos;ve applied to, and set standing rules so {brandName} applies to
          matching jobs while you focus on interviews.
        </p>
      </section>

      <div className="inline-flex items-center rounded-full bg-background-100 border border-background-200 p-1 animate-fade-in-up">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-full transition-colors cursor-pointer whitespace-nowrap ${
              tab === t.id
                ? "bg-background-50 text-foreground-950"
                : "text-foreground-600 hover:text-foreground-900"
            }`}
          >
            <i className={t.icon}></i>
            {t.label}
          </button>
        ))}
      </div>

      <section className="animate-fade-in-up" style={{ animationDelay: "0.03s" }}>
        <HarborExtensionStatus
          onShowReconnect={() => setTab("apps")}
          onConnectWithCode={() => setTab("apps")}
        />
      </section>

      <section className="animate-fade-in-up" style={{ animationDelay: "0.06s" }}>
        {tab === "pipeline" && <PipelineTab />}
        {tab === "apps" && (
          <AuthenticatedAppsTab
            connectProvider={connectProvider}
            onConnectConsumed={consumeConnect}
            bulkReconnect={reconnectParam === "expired"}
            onBulkReconnectConsumed={consumeReconnect}
          />
        )}
        {tab === "rules" && <RulesTab />}
        {tab === "queue" && <QueueTab />}
      </section>
    </div>
  );
}