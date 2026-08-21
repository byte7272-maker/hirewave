// Peer practice interviews over WebRTC — sessions + REST signalling.
import { api } from "./api";

export interface PracticeSession {
  id: string;
  host_id: string;
  guest_id: string;
  status: "waiting" | "active" | "ended";
  i_am_host: boolean;
  other_name: string;
  created_at: string;
}
export interface Signal {
  kind: string; // offer | answer | ice | bye | control
  payload: string;
  from_user: string;
}
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export const listPracticeSessions = () => api<PracticeSession[]>("/api/v1/practice");
export const invitePractice = (guestId: string) =>
  api<PracticeSession>("/api/v1/practice", { method: "POST", body: { guest_id: guestId } });
export const getPracticeSession = (id: string) => api<PracticeSession>(`/api/v1/practice/${id}`);
export const acceptPractice = (id: string) => api<PracticeSession>(`/api/v1/practice/${id}/accept`, { method: "POST", body: {} });
export const endPractice = (id: string) => api<void>(`/api/v1/practice/${id}/end`, { method: "POST", body: {} });
export const getPracticeQuestions = (id: string) => api<{ questions: string[] }>(`/api/v1/practice/${id}/questions`);
export const postSignal = (id: string, kind: string, payload: string) =>
  api<{ ok: boolean }>(`/api/v1/practice/${id}/signal`, { method: "POST", body: { kind, payload } });
export const getSignals = (id: string) => api<Signal[]>(`/api/v1/practice/${id}/signals`);
export const getIceServers = () => api<{ ice_servers: IceServer[] }>("/api/v1/webrtc/ice-servers");
