// Shared shapes for the mock-interview experience (backend `MockInterviewSession`).

export interface Feedback {
  overall: number;
  structure: number;
  specificity: number;
  conciseness: number;
  confidence: number;
  strengths: string[];
  improvements: string[];
}

export interface Turn {
  id: string;
  speaker: "interviewer" | "candidate";
  text: string;
  question: string;
  feedback: Feedback | null;
  response_seconds: number | null;
}

export interface Persona {
  id?: string;
  name: string;
  role: string;
  company: string;
  style: string;
  initials: string;
  bio?: string;
  gender?: string;
  voice?: string;
  voice_id?: string;
  avatar_url?: string;
  video_url?: string;
}

export interface Summary {
  overall: number;
  structure: number;
  specificity: number;
  conciseness: number;
  confidence: number;
  answers_rated: number;
  avg_response_seconds: number | null;
  top_improvements: string[];
}

export interface Session {
  id: string;
  persona: Persona;
  status: "active" | "completed";
  asked: number;
  max_questions: number;
  turns: Turn[];
  summary: Summary | null;
}

export function scoreColor(v: number): string {
  if (v >= 80) return "text-primary-700";
  if (v >= 60) return "text-accent-700";
  return "text-foreground-500";
}

/** The interviewer line currently "on screen" — the most recent one. */
export function currentInterviewerTurn(session: Session): Turn | undefined {
  for (let i = session.turns.length - 1; i >= 0; i--) {
    if (session.turns[i].speaker === "interviewer") return session.turns[i];
  }
  return undefined;
}
