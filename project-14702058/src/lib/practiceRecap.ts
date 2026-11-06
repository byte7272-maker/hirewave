/**
 * Practice-recap model + memory.
 *
 * A practice session's per-turn pacing (actual `response_seconds` vs the
 * coach's suggested `answer_seconds`) and coaching tips are captured here and
 * persisted in localStorage so a completed run can be reviewed (and reopened)
 * later. Storage is wrapped in try/catch so a hiccup never breaks the session.
 */

export interface RecapTurn {
  question: string;
  category?: string;
  /** The coach's suggested answer time for this turn (`answer_seconds`). */
  targetSeconds: number;
  /** How long the candidate actually took. */
  responseSeconds: number;
  wordCount: number;
  tips: string[];
  /** Tips the answer didn't appear to address. */
  missedTips: string[];
  /**
   * Vocabulary strength (0–100) from the answer's final read, when one was
   * taken. Optional so sessions recorded before this existed still load.
   */
  vocabScore?: number;
  /** Filler-word count from that same final vocabulary read. */
  fillerCount?: number;
  /**
   * A condensed, résumé-ready draft of the answer (its first line or two).
   * Kept short so reopening a recap can seed bullets without storing the whole
   * spoken answer. Optional so older records still load.
   */
  bulletDraft?: string;
  /**
   * The full spoken answer for this turn, so a recap can be reviewed turn by
   * turn. Optional so records saved before this existed still load.
   */
  answer?: string;
  /** Speaking pace from the answer's final vocabulary read (e.g. "steady"). */
  vocabPace?: string;
  /** Words per minute from that same read. */
  wordsPerMinute?: number;
  /** One-line coach summary from that read. */
  vocabSummary?: string;
  /** The top wording suggestions from that read, condensed for storage. */
  vocabSuggestions?: VocabSuggestionSnapshot[];
}

/** A compact snapshot of one vocabulary suggestion, for the recap detail view. */
export interface VocabSuggestionSnapshot {
  original: string;
  kind: string;
  count?: number;
  suggestions?: string[];
}

export interface PracticeRecapRecord {
  sessionId: string;
  personaId: string;
  personaName: string;
  personaRole?: string;
  startedAt: string;
  updatedAt: string;
  completed: boolean;
  turns: RecapTurn[];
}

const KEY = "hw_interview_practice_history";
const MAX_RECORDS = 40;

/**
 * Generic words that would otherwise create false "you mentioned this" matches
 * between a coaching tip and the answer. Kept small and focused on coaching
 * phrasing rather than true stop-words.
 */
const IGNORED = new Set([
  "the", "and", "for", "with", "that", "this", "your", "you", "are", "was",
  "were", "have", "has", "had", "will", "would", "should", "could", "about",
  "into", "from", "they", "them", "their", "when", "what", "which", "while",
  "more", "most", "also", "than", "then", "just", "like", "some", "such",
  "very", "make", "made", "using", "used", "give", "gave", "tell", "talk",
  "answer", "question", "example", "examples", "clear", "specific", "concise",
  "strong", "good", "better", "best", "keep", "avoid", "include", "mention",
  "explain", "show", "shows", "focus", "details", "detail", "thing", "things",
  "really", "actually", "because", "there", "here", "want", "need", "into",
  "over", "under", "yourself", "yourself", "answer.", "start", "end", "onto",
]);

/** Significant (lowercased) words from a piece of text, minus filler. */
export function significantWords(text: string): string[] {
  const words = (text ?? "").toLowerCase().match(/[a-z0-9']+/g) ?? [];
  return words.filter((w) => w.replace(/'/g, "").length > 3 && !IGNORED.has(w));
}

/**
 * Which coaching tips the answer didn't seem to touch on.
 * A tip counts as "missed" when few (or none) of its meaningful words show up
 * in the answer — a lightweight, transparent signal, not a judgment call.
 */
export function findMissedTips(tips: string[], answer: string): string[] {
  const cleanTips = (tips ?? []).map((t) => String(t).trim()).filter(Boolean);
  if (!cleanTips.length) return [];
  const answerWords = new Set(significantWords(answer));
  return cleanTips.filter((tip) => {
    const tipWords = significantWords(tip);
    if (!tipWords.length) return false;
    const hit = tipWords.filter((w) => answerWords.has(w)).length;
    const coverage = hit / tipWords.length;
    if (tipWords.length < 2) return hit === 0;
    return coverage < 0.34;
  });
}

export type PaceBand = "short" | "on" | "long";

/** How the actual time compares to the coach's suggested time. */
export function paceOf(turn: Pick<RecapTurn, "targetSeconds" | "responseSeconds">): PaceBand {
  const target = turn.targetSeconds > 0 ? turn.targetSeconds : 1;
  const ratio = turn.responseSeconds / target;
  if (ratio < 0.6) return "short";
  if (ratio > 1.4) return "long";
  return "on";
}

export interface RecapStats {
  total: number;
  on: number;
  short: number;
  long: number;
  avgResponse: number;
  avgTarget: number;
  missedTips: number;
  totalTips: number;
  /** Mean vocabulary strength across turns that got a read, or null. */
  avgVocab: number | null;
  /** How many turns carried a vocabulary score. */
  vocabTurns: number;
  /** Total filler words across every turn that got a read. */
  fillerTotal: number;
  /** How many turns carried a filler count. */
  fillerTurns: number;
}

/** Aggregate a recap's turns into headline numbers. */
export function recapSummary(turns: RecapTurn[]): RecapStats {
  const list = turns ?? [];
  const total = list.length;
  if (!total) {
    return {
      total: 0,
      on: 0,
      short: 0,
      long: 0,
      avgResponse: 0,
      avgTarget: 0,
      missedTips: 0,
      totalTips: 0,
      avgVocab: null,
      vocabTurns: 0,
      fillerTotal: 0,
      fillerTurns: 0,
    };
  }
  let on = 0;
  let short = 0;
  let long = 0;
  let responseSum = 0;
  let targetSum = 0;
  let missedTips = 0;
  let totalTips = 0;
  let vocabSum = 0;
  let vocabTurns = 0;
  let fillerTotal = 0;
  let fillerTurns = 0;
  for (const turn of list) {
    const band = paceOf(turn);
    if (band === "on") on += 1;
    else if (band === "short") short += 1;
    else long += 1;
    responseSum += turn.responseSeconds;
    targetSum += turn.targetSeconds;
    missedTips += turn.missedTips.length;
    totalTips += turn.tips.length;
    if (typeof turn.vocabScore === "number") {
      vocabSum += turn.vocabScore;
      vocabTurns += 1;
    }
    if (typeof turn.fillerCount === "number") {
      fillerTotal += turn.fillerCount;
      fillerTurns += 1;
    }
  }
  return {
    total,
    on,
    short,
    long,
    avgResponse: Math.round(responseSum / total),
    avgTarget: Math.round(targetSum / total),
    missedTips,
    totalTips,
    avgVocab: vocabTurns > 0 ? Math.round(vocabSum / vocabTurns) : null,
    vocabTurns,
    fillerTotal,
    fillerTurns,
  };
}

/** Vocabulary strength band (flagship thresholds: 80+ strong, 60+ fair). */
export function vocabBand(score: number): "strong" | "fair" | "weak" {
  if (score >= 80) return "strong";
  if (score >= 60) return "fair";
  return "weak";
}

/** The focus the next practice session should drill, derived from the recap. */
export interface FocusSuggestion {
  /** Which weak band this callout is about. */
  key: "short" | "long" | "vocab" | "filler" | "tips";
  icon: string;
  /** Short action headline, e.g. "Add more depth". */
  title: string;
  /** Why — the number that triggered it. */
  reason: string;
  /** A concrete drill for the next session. */
  drill: string;
  /** 1-based question numbers (turns) that matched this weak band. */
  turns: number[];
}

/**
 * Reads a recap and names the weakest band to focus the next session on.
 * Counts each weak signal (brief/long pacing, low vocabulary, filler spikes,
 * untouched coaching tips) and returns the most prevalent one with a drill.
 */
export function focusSuggestion(turns: RecapTurn[]): FocusSuggestion | null {
  const list = turns ?? [];
  if (list.length === 0) return null;

  const shortTurns: number[] = [];
  const longTurns: number[] = [];
  const fillerSpikeTurns: number[] = [];
  const weakVocabTurns: number[] = [];
  const missedTipTurns: number[] = [];
  let scored = 0;
  let fillerTotal = 0;
  let missed = 0;
  let totalTips = 0;

  list.forEach((turn, i) => {
    const q = i + 1;
    const band = paceOf(turn);
    if (band === "short") shortTurns.push(q);
    else if (band === "long") longTurns.push(q);
    if (typeof turn.fillerCount === "number") {
      if (turn.fillerCount >= 3) fillerSpikeTurns.push(q);
      fillerTotal += turn.fillerCount;
    }
    if (typeof turn.vocabScore === "number") {
      scored += 1;
      if (vocabBand(turn.vocabScore) === "weak") weakVocabTurns.push(q);
    }
    missed += turn.missedTips.length;
    totalTips += turn.tips.length;
    if (turn.missedTips.length > 0) missedTipTurns.push(q);
  });

  const half = Math.ceil(list.length / 2);
  const candidates: Array<FocusSuggestion & { score: number }> = [];

  if (scored > 0 && weakVocabTurns.length >= 1 && weakVocabTurns.length >= Math.ceil(scored / 2)) {
    candidates.push({
      key: "vocab",
      icon: "ri-sparkling-2-line",
      title: "Level up your wording",
      reason: `${weakVocabTurns.length} of ${scored} answers scored under 60/100 on vocabulary.`,
      drill:
        'Swap generic verbs ("did", "helped", "worked on") for specific, outcome-driven ones ("led", "cut", "shipped").',
      turns: weakVocabTurns,
      score: weakVocabTurns.length * 2,
    });
  }
  if (fillerSpikeTurns.length >= 1) {
    candidates.push({
      key: "filler",
      icon: "ri-chat-delete-line",
      title: "Cut the fillers",
      reason: `${fillerTotal} filler word${fillerTotal === 1 ? "" : "s"} this session${
        fillerSpikeTurns.length > 1 ? `, spiking on ${fillerSpikeTurns.length} answers` : ""
      }.`,
      drill:
        'Replace "um", "like", and "you know" with a half-second pause — silence reads as confidence.',
      turns: fillerSpikeTurns,
      score: fillerSpikeTurns.length * 2 + (fillerTotal >= 6 ? 1 : 0),
    });
  }
  if (missed >= 1) {
    candidates.push({
      key: "tips",
      icon: "ri-lightbulb-line",
      title: "Cover the coaching tips",
      reason: `${missed} of ${totalTips} coaching tips went untouched.`,
      drill:
        "Before you answer, run through the tips once — they map to exactly what interviewers listen for.",
      turns: missedTipTurns,
      score: missed,
    });
  }
  if (shortTurns.length >= half && shortTurns.length > 0) {
    candidates.push({
      key: "short",
      icon: "ri-timer-flash-line",
      title: "Add more depth",
      reason: `${shortTurns.length} of ${list.length} answers ran well under the suggested time.`,
      drill:
        "Reach for the full time budget: lead with the situation, then walk through one concrete example (STAR).",
      turns: shortTurns,
      score: shortTurns.length + 1,
    });
  }
  if (longTurns.length >= half && longTurns.length > 0) {
    candidates.push({
      key: "long",
      icon: "ri-timer-line",
      title: "Tighten it up",
      reason: `${longTurns.length} of ${list.length} answers ran long.`,
      drill:
        "Lead with the headline result in one line, then back it with two supporting beats — then stop.",
      turns: longTurns,
      score: longTurns.length + 1,
    });
  }

  if (candidates.length === 0) {
    return {
      key: "tips",
      icon: "ri-thumb-up-line",
      title: "Keep the momentum",
      reason: "Nothing stood out as weak this session — pacing, vocabulary, and coverage all held up.",
      drill: "Raise the interviewer difficulty, or add a new question category to stretch further.",
      turns: [],
    };
  }

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates[0];
  return {
    key: top.key,
    icon: top.icon,
    title: top.title,
    reason: top.reason,
    drill: top.drill,
    turns: top.turns,
  };
}

/**
 * Index (0-based) of the weakest turn in a recap — the answer worth reviewing
 * first. Prefers the lowest final vocabulary score when any turn carries one;
 * otherwise falls back to the turn that missed the most coaching tips, then
 * the one furthest off its suggested pace. Returns -1 when there are no turns.
 */
export function worstTurnIndex(turns: RecapTurn[]): number {
  const list = turns ?? [];
  if (list.length === 0) return -1;

  const scored = list
    .map((turn, i) => ({
      i,
      score: typeof turn.vocabScore === "number" ? turn.vocabScore : null,
    }))
    .filter((entry): entry is { i: number; score: number } => entry.score !== null);
  if (scored.length > 0) {
    return scored.reduce((worst, cur) => (cur.score < worst.score ? cur : worst)).i;
  }

  // No vocabulary reads — rank on missed tips, then how far off pace it ran.
  let worstIndex = 0;
  let worstScore = -Infinity;
  list.forEach((turn, i) => {
    let score = turn.missedTips.length * 10;
    const band = paceOf(turn);
    if (band === "short") score += 6;
    else if (band === "long") score += 4;
    if (typeof turn.fillerCount === "number" && turn.fillerCount >= 3) score += 5;
    if (score > worstScore) {
      worstScore = score;
      worstIndex = i;
    }
  });
  return worstIndex;
}

/**
 * A turn reads as a "strong" answer: substantive, not too brief, and it either
 * covered the coaching tips or came close. A transparent nudge, not a grade.
 */
export function isStrongAnswer(turn: RecapTurn): boolean {
  if (turn.wordCount < 20) return false;
  if (paceOf(turn) === "short") return false;
  return turn.missedTips.length <= 1;
}

/**
 * Condense a spoken answer into a single résumé-style bullet line — the first
 * sentence or two, clamped to stay tight. Deliberately mechanical (no AI) and
 * always editable before it's saved.
 */
export function condenseToBullet(answer: string): string {
  const clean = (answer ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const sentences = clean.match(/[^.!?]+[.!?]*/g) ?? [clean];
  let out = "";
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    const next = out ? `${out} ${sentence}` : sentence;
    if (out && next.length > 220) break;
    out = next;
    if (out.length >= 130) break;
  }
  if (out.length > 240) {
    const clipped = out.slice(0, 240);
    const lastSpace = clipped.lastIndexOf(" ");
    out = (lastSpace > 120 ? clipped.slice(0, lastSpace) : clipped).trim();
  }
  out = out.trim().replace(/[,;:\s]+$/, "");
  if (!out) return "";
  const withStop = /[.!?]$/.test(out) ? out : `${out}.`;
  return withStop.charAt(0).toUpperCase() + withStop.slice(1);
}

export interface ResumeBullet {
  question: string;
  category?: string;
  /** Editable starting draft for the bullet. */
  bullet: string;
  /** Whether the turn was judged a strong answer. */
  strong: boolean;
  targetSeconds: number;
  responseSeconds: number;
}

/**
 * Turn a recap's turns into editable résumé-bullet drafts, flagging the strong
 * answers so the UI can pre-select them.
 */
export function buildResumeBullets(turns: RecapTurn[]): ResumeBullet[] {
  return (turns ?? []).map((turn) => ({
    question: turn.question,
    category: turn.category,
    bullet:
      (turn.bulletDraft && turn.bulletDraft.trim()) ||
      (turn.answer && turn.answer.trim() ? condenseToBullet(turn.answer) : "") ||
      condenseToBullet(turn.question),
    strong: isStrongAnswer(turn),
    targetSeconds: turn.targetSeconds,
    responseSeconds: turn.responseSeconds,
  }));
}

// ---- localStorage store ----

export function readPracticeHistory(): PracticeRecapRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PracticeRecapRecord[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((r) => r && typeof r.sessionId === "string");
  } catch {
    return [];
  }
}

export function getPracticeRecord(sessionId: string): PracticeRecapRecord | null {
  return readPracticeHistory().find((r) => r.sessionId === sessionId) ?? null;
}

/** Insert or update a session's record (newest first, capped). */
export function savePracticeRecord(record: PracticeRecapRecord): void {
  try {
    const existing = readPracticeHistory().filter((r) => r.sessionId !== record.sessionId);
    const next = [record, ...existing]
      .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
      .slice(0, MAX_RECORDS);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Ignore storage failures — the recap simply won't persist.
  }
}

export function removePracticeRecord(sessionId: string): void {
  try {
    const next = readPracticeHistory().filter((r) => r.sessionId !== sessionId);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Ignore storage failures.
  }
}

/** Wipe every locally-remembered practice recap. */
export function clearPracticeHistory(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Ignore storage failures.
  }
}