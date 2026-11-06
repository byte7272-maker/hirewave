import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "@/lib/api";
import {
  approveAllApplications,
  approveApplication,
  approveDecisionNote,
  filterByProvider,
  interpretApproveResult,
  providerKeys,
  rejectApplication,
  sortApprovals,
  type ApprovalItem,
  type ApprovalSortKey,
} from "@/lib/approvals";
import { useApprovals } from "@/hooks/useApprovalsStore";
import { useApprovalDecisions } from "@/hooks/useApprovalDecisions";
import { refreshApplications } from "@/hooks/useApplicationsStore";
import PageHeader from "@/components/feature/PageHeader";
import EmptyState from "@/components/feature/EmptyState";
import ConfirmDialog from "@/components/base/ConfirmDialog";
import { useToast } from "@/components/base/ToastProvider";
import { Badge, Button, Card, ErrorState, LoadingState } from "@/components/base";
import { getMatchScoreMap } from "@/lib/matchScores";
import ApprovalCard, { type ApprovalNote } from "./components/ApprovalCard";
import ApprovalsPromise from "./components/ApprovalsPromise";
import ApprovalsToolbar from "./components/ApprovalsToolbar";
import ApprovalsHistory from "./components/ApprovalsHistory";
import ApprovalsLiveIndicator from "./components/ApprovalsLiveIndicator";
import ApproveAllDialog from "./components/ApproveAllDialog";

export default function Approvals() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { items, loading, error, unauthorized, refresh, remove } = useApprovals();
  const { record } = useApprovalDecisions();
  const [searchParams, setSearchParams] = useSearchParams();

  const [notes, setNotes] = useState<Record<string, ApprovalNote>>({});
  const [busyId, setBusyId] = useState<string | number | null>(null);
  const [busyAction, setBusyAction] = useState<"approve" | "reject" | null>(null);
  const [confirmItem, setConfirmItem] = useState<ApprovalItem | null>(null);
  const [approveAllOpen, setApproveAllOpen] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [sort, setSort] = useState<ApprovalSortKey>("newest");
  const [provider, setProvider] = useState("all");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [scoreMap, setScoreMap] = useState<Map<string, number>>(new Map());

  const focusParam = searchParams.get("focus");

  // Cross-reference the matches pool so a queued application that's also a
  // ranked match wears the same fit band (dot + spine) it shows everywhere else.
  useEffect(() => {
    let alive = true;
    getMatchScoreMap().then((map) => {
      if (alive) setScoreMap(map);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Load on entry and bounce to sign-in if the session has expired.
  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (unauthorized) navigate("/auth/login");
  }, [unauthorized, navigate]);

  const providers = useMemo(() => providerKeys(items), [items]);

  // When deep-linked from the dashboard banner, spotlight the target card, make
  // sure no filter is hiding it, then let the ring fade and drop the param.
  useEffect(() => {
    if (!focusParam) return;
    const exists = items.some((i) => String(i.application_id) === String(focusParam));
    if (!exists) return;
    setHighlightId(String(focusParam));
    setProvider("all");
    const t = window.setTimeout(() => {
      setHighlightId(null);
      setSearchParams({}, { replace: true });
    }, 3600);
    return () => window.clearTimeout(t);
  }, [focusParam, items, setSearchParams]);

  // If the active provider disappears from the queue (all its items approved or
  // rejected), fall back to showing everything.
  useEffect(() => {
    if (provider !== "all" && !providers.includes(provider)) setProvider("all");
  }, [providers, provider]);

  const visible = useMemo(
    () => sortApprovals(filterByProvider(items, provider), sort),
    [items, provider, sort],
  );

  function clearNote(id: string | number) {
    setNotes((prev) => {
      if (!(String(id) in prev)) return prev;
      const next = { ...prev };
      delete next[String(id)];
      return next;
    });
  }

  async function doApprove(item: ApprovalItem) {
    const id = item.application_id;
    setBusyId(id);
    setBusyAction("approve");
    try {
      const result = await approveApplication(id);
      const outcome = interpretApproveResult(item, result);

      if (outcome.decision) {
        record({
          application_id: id,
          title: item.title,
          company: item.company,
          provider: item.provider,
          decision: outcome.decision.kind,
          outcome: outcome.decision.outcome,
          note: approveDecisionNote(item, outcome),
          decided_at: new Date().toISOString(),
        });
      }

      if (outcome.removeCard) {
        remove(id);
        clearNote(id);
        // The submission now belongs in the Applications pipeline — refresh the
        // shared cache so the board shows it immediately, and offer a jump link.
        void refreshApplications().catch(() => {});
        showToast(outcome.toast.message, outcome.toast.tone, {
          label: "View pipeline",
          onUndo: () => navigate("/dashboard/applications"),
        });
      } else {
        showToast(outcome.toast.message, outcome.toast.tone);
        if (outcome.note) {
          setNotes((prev) => ({ ...prev, [String(id)]: outcome.note as ApprovalNote }));
        }
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        navigate("/auth/login");
        return;
      }
      showToast(
        err instanceof Error ? err.message : "Could not submit the application.",
        "error",
      );
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  }

  async function doReject(item: ApprovalItem) {
    const id = item.application_id;
    setBusyId(id);
    setBusyAction("reject");
    try {
      await rejectApplication(id);
      remove(id);
      clearNote(id);
      record({
        application_id: id,
        title: item.title,
        company: item.company,
        provider: item.provider,
        decision: "declined",
        note: "Declined by you — nothing was sent to the employer.",
        decided_at: new Date().toISOString(),
      });
      showToast("Application declined — it was never sent.", "info");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        navigate("/auth/login");
        return;
      }
      showToast(err instanceof Error ? err.message : "Could not decline the application.", "error");
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  }

  /**
   * Batch-approve every parked application. Always preceded by the explicit
   * confirmation dialog; on confirm it submits each one for real (bound by the
   * live-submit gate), removes the ones that went through, and keeps any that
   * still need attention with the same inline note a single approve would show.
   */
  async function doApproveAll() {
    const batch = items;
    const ids = batch.map((i) => i.application_id);
    setBatchBusy(true);
    try {
      const res = await approveAllApplications(ids);
      const byId = new Map((res.results ?? []).map((r) => [String(r.application_id), r]));
      let attention = 0;

      batch.forEach((item) => {
        const result = byId.get(String(item.application_id));
        // No result returned for this one → leave it parked, untouched.
        if (!result) return;

        const outcome = interpretApproveResult(item, {
          status: result.status,
          simulated: result.simulated,
          detail: result.detail,
        });

        if (outcome.decision) {
          record({
            application_id: item.application_id,
            title: item.title,
            company: item.company,
            provider: item.provider,
            decision: outcome.decision.kind,
            outcome: outcome.decision.outcome,
            note: approveDecisionNote(item, outcome),
            decided_at: new Date().toISOString(),
          });
        }

        if (outcome.removeCard) {
          remove(item.application_id);
          clearNote(item.application_id);
        } else {
          attention += 1;
          if (outcome.note) {
            setNotes((prev) => ({
              ...prev,
              [String(item.application_id)]: outcome.note as ApprovalNote,
            }));
          }
        }
      });

      const approved = res.approved ?? 0;
      const total = res.total ?? batch.length;
      // The submitted ones now belong in the Applications pipeline.
      void refreshApplications().catch(() => {});
      if (attention > 0) {
        showToast(
          `Submitted ${approved} of ${total}. ${attention} need your attention.`,
          "info",
        );
      } else {
        showToast(`Submitted ${approved} of ${total}.`, approved > 0 ? "success" : "info");
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        navigate("/auth/login");
        return;
      }
      showToast(err instanceof Error ? err.message : "Could not submit the batch.", "error");
    } finally {
      setBatchBusy(false);
      setApproveAllOpen(false);
    }
  }

  const waiting = items.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approvals"
        subtitle="Nothing is submitted until you approve it. Review each application below."
        icon="ri-shield-check-line"
        tone="primary"
        image="https://readdy.ai/api/search-image?query=Warm%20editorial%20photograph%20of%20a%20calm%20professional%20reviewing%20job%20applications%20on%20a%20laptop%20at%20a%20tidy%20sunlit%20desk%20with%20a%20cup%20of%20coffee%20and%20a%20small%20potted%20plant%2C%20reassuring%20in-control%20mood%2C%20warm%20neutral%20cream%20tones%20with%20muted%20emerald%20and%20coral%20colour%20accents%2C%20soft%20natural%20window%20light%2C%20shallow%20depth%20of%20field%2C%20premium%20editorial%20magazine%20aesthetic%2C%20darker%20left%20side%20for%20overlay%20text%2C%20high%20detail&width=1600&height=460&seq=header-approvals-01&orientation=landscape"
        imageAlt="A calm professional reviewing job applications on a laptop at a sunlit desk"
        actions={
          waiting > 0 ? (
            <div className="flex items-center gap-2">
              <Badge tone="accent" dot className="whitespace-nowrap">
                {waiting} waiting
              </Badge>
              {waiting > 1 && (
                <Button
                  variant="secondary"
                  icon="ri-check-double-line"
                  loading={batchBusy}
                  disabled={batchBusy}
                  onClick={() => setApproveAllOpen(true)}
                >
                  Approve all ({waiting})
                </Button>
              )}
            </div>
          ) : undefined
        }
      />

      <ApprovalsPromise />

      {error && (
        <Card surface="tinted" className="animate-fade-in-up">
          <ErrorState
            title="We couldn't load your approvals"
            message={error}
            onRetry={() => refresh()}
          />
        </Card>
      )}

      {waiting > 0 && (
        <ApprovalsToolbar
          providers={providers}
          provider={provider}
          onProviderChange={setProvider}
          sort={sort}
          onSortChange={setSort}
          visibleCount={visible.length}
          totalCount={waiting}
        />
      )}

      <ApprovalsLiveIndicator />

      <Card
        surface="tinted"
        className="animate-fade-in-up overflow-hidden"
        style={{ animationDelay: "0.08s" }}
      >
        {loading && items.length === 0 ? (
          <div className="p-4 md:p-5">
            <LoadingState label="Checking what's waiting for you…" rows={3} />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon="ri-shield-check-line"
            title="You're all caught up."
            description="When the assistant prepares an application, it'll wait here for your approval."
            tone="primary"
          />
        ) : visible.length === 0 ? (
          <div className="py-12 px-6 text-center">
            <div className="w-12 h-12 mx-auto flex items-center justify-center rounded-xl bg-background-50 text-foreground-500 mb-3">
              <i className="ri-filter-off-line text-xl"></i>
            </div>
            <p className="text-sm font-semibold text-foreground-900">No applications match this filter</p>
            <p className="text-xs text-foreground-500 mt-1">
              You still have {waiting} waiting — try a different provider.
            </p>
            <Button
              variant="outline"
              icon="ri-refresh-line"
              className="mt-4"
              onClick={() => setProvider("all")}
            >
              Show all
            </Button>
          </div>
        ) : (
          <div className="p-4 md:p-5 space-y-3">
            {visible.map((item, index) => (
              <ApprovalCard
                key={String(item.application_id)}
                item={item}
                rank={index + 1}
                score={
                  item.job_posting_id != null
                    ? scoreMap.get(String(item.job_posting_id)) ?? null
                    : null
                }
                note={notes[String(item.application_id)]}
                busy={busyId !== null && String(busyId) === String(item.application_id)}
                busyAction={
                  busyId !== null && String(busyId) === String(item.application_id)
                    ? busyAction
                    : null
                }
                highlight={
                  highlightId !== null && String(highlightId) === String(item.application_id)
                }
                disabled={batchBusy}
                onRequestApprove={setConfirmItem}
                onReject={doReject}
              />
            ))}
          </div>
        )}
      </Card>

      <ApprovalsHistory />

      {confirmItem && (
        <ConfirmDialog
          title="Approve this application?"
          message={`Submit your application to ${
            confirmItem.company?.trim() || "the employer"
          } for ${confirmItem.title?.trim() || `Job ${confirmItem.job_posting_id ?? "—"}`}? This sends it for real.`}
          confirmLabel="Submit application"
          onConfirm={async () => {
            const item = confirmItem;
            if (item) await doApprove(item);
            setConfirmItem(null);
          }}
          onCancel={() => setConfirmItem(null)}
        />
      )}

      {approveAllOpen && (
        <ApproveAllDialog
          items={items}
          busy={batchBusy}
          onConfirm={doApproveAll}
          onCancel={() => setApproveAllOpen(false)}
        />
      )}
    </div>
  );
}