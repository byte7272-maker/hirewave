import { useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api";
import { useToast } from "@/components/base/ToastProvider";
import useChangeFeedback from "@/hooks/useChangeFeedback";
import { getResumeStructured, type Resume } from "@/lib/documents";
import type { JsonResume } from "@/lib/jsonResume";
import RoleAddBullet from "@/pages/dashboard/documents/templates/RoleAddBullet";
import {
  appendBullet,
  getTargetBullets,
  moveBullet,
  persistResumeStructure,
  polishBulletInstruction,
  removeLastBullet,
  resumeStructureToMarkdown,
  setBullet,
  strengthenBulletInstruction,
  strengthenRoleInstruction,
  type BulletTarget,
} from "@/pages/dashboard/documents/templates/bulletActions";

type WorkEntry = NonNullable<JsonResume["work"]>[number];

interface DocumentBulletInserterProps {
  resumeId: string | number;
  /** Re-read the structured résumé whenever this changes (e.g. version / render refresh). */
  refreshKey?: string | number;
  /** Lock the controls (e.g. while an AI polish is in flight). */
  disabled?: boolean;
  /** Called with the updated résumé after a bullet is added or removed. */
  onChanged?: (resume: Resume) => void;
  /** Opt-in AI polish for a just-added bullet — runs improve-structured. */
  onPolish?: (instruction: string, content: string) => void;
  polishing?: boolean;
  /**
   * Drop the surrounding card chrome and the inserter's own title row. Used when
   * the inserter is nested inside the "Add my own content" card, so the card's
   * heading is the only heading — no card-in-card look.
   */
  embedded?: boolean;
}

function roleLabel(w: WorkEntry | undefined, index: number): string {
  if (!w) return `Role ${index + 1}`;
  return [w.position, w.name].filter(Boolean).join(" · ") || `Role ${index + 1}`;
}

interface TargetOption {
  key: string;
  label: string;
  group: string;
  target: BulletTarget;
}

const CERT_KEY = "certificates";

/**
 * The Document view's "+ Add bullet" affordance. The Document view renders the
 * résumé as a read-only page (no per-role anchors), so this is a single, focused
 * control: pick a target — a work role, a project, or the certification list —
 * type a bullet in your own words, and it is appended VERBATIM and persisted.
 * A "Polish with AI" / "Undo" row then appears, exactly like the per-role
 * affordance in the Templates view.
 */
export default function DocumentBulletInserter({
  resumeId,
  refreshKey,
  disabled = false,
  onChanged,
  onPolish,
  polishing = false,
  embedded = false,
}: DocumentBulletInserterProps) {
  const { showToast } = useToast();
  const { reportError } = useChangeFeedback();
  const [structured, setStructured] = useState<JsonResume | null>(null);
  const [targetKey, setTargetKey] = useState<string>("");
  const [lastMarkdown, setLastMarkdown] = useState("");
  const [busy, setBusy] = useState(false);
  /** Which reorder-list bullet is open for inline editing, and its draft. */
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    let alive = true;
    getResumeStructured(resumeId)
      .then((data) => {
        if (alive) setStructured(data);
      })
      .catch(() => {
        /* the inserter simply stays hidden when there's no structured résumé */
      });
    return () => {
      alive = false;
    };
  }, [resumeId, refreshKey]);

  // Every editable collection: each work role, each project, then certifications.
  const options = useMemo<TargetOption[]>(() => {
    const list: TargetOption[] = [];
    (structured?.work ?? []).forEach((w, i) => {
      list.push({
        key: `work:${i}`,
        label: roleLabel(w, i),
        group: "Experience",
        target: { kind: "work", index: i },
      });
    });
    (structured?.projects ?? []).forEach((p, i) => {
      list.push({
        key: `project:${i}`,
        label: p.name || `Project ${i + 1}`,
        group: "Projects",
        target: { kind: "project", index: i },
      });
    });
    list.push({
      key: CERT_KEY,
      label: "Certifications",
      group: "Certifications",
      target: { kind: "certificate" },
    });
    return list;
  }, [structured]);

  // Grouped form for the picker.
  const grouped = useMemo(() => {
    const map = new Map<string, TargetOption[]>();
    options.forEach((o) => {
      const arr = map.get(o.group) ?? [];
      arr.push(o);
      map.set(o.group, arr);
    });
    return Array.from(map.entries());
  }, [options]);

  // Keep the selected target valid when the résumé (or active version) changes.
  useEffect(() => {
    setTargetKey((prev) =>
      options.some((o) => o.key === prev) ? prev : options[0]?.key ?? ""
    );
  }, [options]);

  // Drop any open inline edit when the target switches (the row indexes change).
  useEffect(() => {
    setEditingIndex(null);
    setDraft("");
  }, [targetKey]);

  const selected = options.find((o) => o.key === targetKey) ?? options[0];
  /** The existing bullets of the selected target, in order (drives the reorder list). */
  const bullets =
    structured && selected ? getTargetBullets(structured, selected.target) : [];

  if (!structured) return null;

  async function handleAdd(text: string): Promise<boolean> {
    if (!structured || !selected) return false;
    const base = structured;
    const next = appendBullet(base, selected.target, text);
    setBusy(true);
    setStructured(next); // optimistic — the bullet appears immediately
    try {
      const updated = await persistResumeStructure(resumeId, next);
      setLastMarkdown(resumeStructureToMarkdown(next));
      onChanged?.(updated);
      showToast(
        selected.target.kind === "certificate"
          ? `Added a certification to ${selected.label}`
          : `Added a bullet to ${selected.label}`,
        "success"
      );
      return true;
    } catch (err) {
      setStructured(base); // revert the optimistic insert
      reportError(err, "résumé");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleUndo(text: string): Promise<void> {
    if (!structured || !selected) return;
    const base = structured;
    const next = removeLastBullet(base, selected.target, text);
    if (!next) return;
    setBusy(true);
    setStructured(next);
    try {
      const updated = await persistResumeStructure(resumeId, next);
      setLastMarkdown(resumeStructureToMarkdown(next));
      onChanged?.(updated);
      showToast(`Removed the last bullet from ${selected.label}`, "success");
    } catch (err) {
      setStructured(base);
      reportError(err, "résumé");
    } finally {
      setBusy(false);
    }
  }

  function runAi(instruction: string) {
    if (!structured) return;
    const content = lastMarkdown || resumeStructureToMarkdown(structured);
    onPolish?.(instruction, content);
  }

  function handlePolish(text: string) {
    runAi(polishBulletInstruction(text));
  }

  function handleStrengthen(text: string) {
    runAi(strengthenBulletInstruction(text));
  }

  /** Strengthen EVERY bullet in the selected target at once, via the same pipeline. */
  function handleStrengthenAll() {
    if (!structured || !selected) return;
    const bullets = getTargetBullets(structured, selected.target);
    if (bullets.length < 2) return;
    runAi(strengthenRoleInstruction(selected.label, bullets));
  }

  /** Open the inline editor for one bullet in the reorder list. */
  function startEdit(index: number, text: string) {
    if (disabled || busy) return;
    setEditingIndex(index);
    setDraft(text);
  }

  function cancelEdit() {
    setEditingIndex(null);
    setDraft("");
  }

  /**
   * Commit an inline edit to one bullet: optimistic swap, persist, and revert if
   * the write fails (keeping the editor open so the user can retry).
   */
  async function handleEditBullet(bulletIndex: number, text: string): Promise<void> {
    if (!structured || !selected) return;
    const base = structured;
    const next = setBullet(base, selected.target, bulletIndex, text);
    if (next === base) return;
    setBusy(true);
    setStructured(next); // optimistic — the new wording appears immediately
    try {
      const updated = await persistResumeStructure(resumeId, next);
      setLastMarkdown(resumeStructureToMarkdown(next));
      onChanged?.(updated);
      showToast(`Updated a bullet in ${selected.label}`, "success");
      setEditingIndex(null);
    } catch (err) {
      setStructured(base); // revert the optimistic edit
      reportError(err, "résumé");
      throw err; // keep the editor open so the user can retry
    } finally {
      setBusy(false);
    }
  }

  /** Save the open inline edit (no-op on empty or unchanged text). */
  async function saveEdit(bulletIndex: number): Promise<void> {
    const next = draft.trim();
    if (!next) return;
    if (next === bullets[bulletIndex]) {
      cancelEdit();
      return;
    }
    try {
      await handleEditBullet(bulletIndex, next);
    } catch {
      /* keep the editor open for a retry */
    }
  }

  /** Move a bullet one slot up/down within the selected target, then persist. */
  async function handleMove(bulletIndex: number, direction: -1 | 1): Promise<void> {
    if (!structured || !selected) return;
    const base = structured;
    const next = moveBullet(base, selected.target, bulletIndex, direction);
    if (!next) return;
    setBusy(true);
    setStructured(next); // optimistic — the reorder appears immediately
    try {
      const updated = await persistResumeStructure(resumeId, next);
      setLastMarkdown(resumeStructureToMarkdown(next));
      onChanged?.(updated);
      showToast(
        `Moved a bullet ${direction < 0 ? "up" : "down"} in ${selected.label}`,
        "success"
      );
    } catch (err) {
      setStructured(base); // revert the optimistic reorder
      reportError(err, "résumé");
    } finally {
      setBusy(false);
    }
  }

  const targetPicker = options.length > 1 ? (
    <select
      value={targetKey}
      onChange={(e) => setTargetKey(e.target.value)}
      disabled={disabled || busy}
      aria-label="Choose where to add the bullet"
      className="max-w-[260px] px-2.5 py-1.5 rounded-md bg-background-50 border border-background-200 text-xs text-foreground-900 font-medium focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {grouped.map(([group, items]) => (
        <optgroup key={group} label={group}>
          {items.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  ) : (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground-600 bg-background-200/70 px-2 py-0.5 rounded-full whitespace-nowrap">
      <i className="ri-award-line"></i>
      {selected?.label}
    </span>
  );

  return (
    <section
      className={
        embedded
          ? "hw-print-hide"
          : "rounded-xl border border-background-200 bg-background-50 px-4 py-3 hw-print-hide"
      }
    >
      {embedded ? (
        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground-500 inline-flex items-center gap-1.5">
            <i className="ri-folder-line"></i>
            Add to
          </span>
          {targetPicker}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-7 h-7 flex items-center justify-center rounded-md bg-secondary-100 text-secondary-700 flex-shrink-0">
              <i className="ri-add-circle-line"></i>
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground-900">Add a bullet to a role</p>
              <p className="text-[11px] text-foreground-500">
                Pick a role, project, or certification — inserted exactly as typed, then polish or undo.
              </p>
            </div>
          </div>
          {targetPicker}
        </div>
      )}

      <RoleAddBullet
        label={
          selected?.target.kind === "certificate" ? "Add certification" : "Add bullet"
        }
        busy={disabled || busy}
        polishing={polishing}
        strengthenAllCount={
          selected && selected.target.kind !== "certificate" ? bullets.length : 0
        }
        onStrengthenAll={handleStrengthenAll}
        onAdd={handleAdd}
        onUndo={handleUndo}
        onPolish={handlePolish}
        onStrengthen={handleStrengthen}
      />

      {bullets.length > 0 && (
        <div className="mt-3 pt-3 border-t border-background-200">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground-500 mb-1.5">
            <i className="ri-list-check-2"></i>
            {selected?.target.kind === "certificate"
              ? "Reorder certifications"
              : "Reorder or edit bullets"}
          </span>
          <ul className="space-y-1">
            {bullets.map((bullet, index) => (
              <li
                key={index}
                className="flex items-start gap-2 rounded-md border border-background-200 bg-background-50 px-2 py-1.5"
              >
                {editingIndex === index ? (
                  <>
                    <textarea
                      value={draft}
                      autoFocus
                      rows={2}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void saveEdit(index);
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          cancelEdit();
                        }
                      }}
                      className="flex-1 min-w-0 px-2 py-1 rounded-md bg-background-50 border border-background-200 text-xs text-foreground-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300 resize-y"
                    />
                    <span className="inline-flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => void saveEdit(index)}
                        disabled={busy || !draft.trim()}
                        title="Save this bullet"
                        aria-label="Save this bullet"
                        className="w-6 h-6 inline-flex items-center justify-center rounded-md bg-secondary-500 text-background-50 dark:text-foreground-950 hover:bg-secondary-600 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {busy ? (
                          <i className="ri-loader-4-line animate-spin text-[11px]"></i>
                        ) : (
                          <i className="ri-check-line text-[11px]"></i>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        disabled={busy}
                        title="Cancel editing"
                        aria-label="Cancel editing this bullet"
                        className="w-6 h-6 inline-flex items-center justify-center rounded-md bg-background-100 border border-background-200 text-foreground-600 hover:text-foreground-900 hover:bg-background-200 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <i className="ri-close-line text-[11px]"></i>
                      </button>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="flex-1 min-w-0 text-xs text-foreground-700 leading-relaxed">
                      {bullet}
                    </span>
                    <span className="inline-flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => startEdit(index, bullet)}
                        disabled={disabled || busy}
                        title="Edit this bullet's text"
                        aria-label="Edit this bullet's text"
                        className="w-6 h-6 inline-flex items-center justify-center rounded-md bg-background-100 border border-background-200 text-foreground-600 hover:text-foreground-900 hover:bg-background-200 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <i className="ri-pencil-line text-[11px]"></i>
                      </button>
                      {onPolish && (
                        <button
                          type="button"
                          onClick={() => handleStrengthen(bullet)}
                          disabled={disabled || busy || polishing}
                          title="Strengthen this bullet with AI — punchier verbs and clearer impact, no new facts"
                          aria-label="Strengthen this bullet with AI"
                          className="w-6 h-6 inline-flex items-center justify-center rounded-md bg-accent-500 text-background-50 dark:text-foreground-950 hover:bg-accent-600 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <i className="ri-rocket-2-line text-[11px]"></i>
                        </button>
                      )}
                      {index > 0 && (
                        <button
                          type="button"
                          onClick={() => void handleMove(index, -1)}
                          disabled={disabled || busy}
                          title="Move this bullet up"
                          aria-label="Move this bullet up"
                          className="w-6 h-6 inline-flex items-center justify-center rounded-md bg-background-100 border border-background-200 text-foreground-600 hover:text-foreground-900 hover:bg-background-200 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <i className="ri-arrow-up-line text-[11px]"></i>
                        </button>
                      )}
                      {index < bullets.length - 1 && (
                        <button
                          type="button"
                          onClick={() => void handleMove(index, 1)}
                          disabled={disabled || busy}
                          title="Move this bullet down"
                          aria-label="Move this bullet down"
                          className="w-6 h-6 inline-flex items-center justify-center rounded-md bg-background-100 border border-background-200 text-foreground-600 hover:text-foreground-900 hover:bg-background-200 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <i className="ri-arrow-down-line text-[11px]"></i>
                        </button>
                      )}
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}