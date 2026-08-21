// Message boards / groups — shared channels where members post and share jobs.
import { api } from "./api";
import type { SharedJob } from "./social";

export interface Board {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  is_public: boolean;
  member_count: number;
  created_at: string;
  joined: boolean;
  is_owner: boolean;
  join_code: string | null;
}

export interface BoardPost {
  id: string;
  user_id: string;
  author: string;
  body: string;
  shared_job: SharedJob | null;
  mine: boolean;
  created_at: string;
}

export const listMyBoards = () => api<Board[]>("/api/v1/boards");
export const discoverBoards = () => api<Board[]>("/api/v1/boards/discover");
export const createBoard = (body: { name: string; description?: string; is_public: boolean }) =>
  api<Board>("/api/v1/boards", { method: "POST", body });
export const joinBoard = (arg: { board_id?: string; code?: string }) =>
  api<Board>("/api/v1/boards/join", { method: "POST", body: arg });
export const getBoard = (id: string) => api<Board>(`/api/v1/boards/${id}`);
export const listMembers = (id: string) => api<{ user_id: string; name: string }[]>(`/api/v1/boards/${id}/members`);
export const listPosts = (id: string) => api<BoardPost[]>(`/api/v1/boards/${id}/posts`);
export const createPost = (id: string, body: string, sharedJobId?: string) =>
  api<BoardPost>(`/api/v1/boards/${id}/posts`, { method: "POST", body: { body, shared_job_id: sharedJobId } });
