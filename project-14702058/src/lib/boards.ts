import { api } from "./api";

// ---- Types ----

export interface Board {
  id: string | number;
  name?: string;
  description?: string;
  member_count?: number;
  post_count?: number;
  joined?: boolean;
  created_at?: string;
  [key: string]: unknown;
}

export interface BoardPost {
  id: string | number;
  author?: string;
  body?: string;
  content?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface BoardMember {
  id: string | number;
  name?: string;
  headline?: string;
  [key: string]: unknown;
}

// ---- Boards ----

export function listBoards() {
  return api<Board[]>("/api/v1/boards");
}

export function discoverBoards() {
  return api<Board[]>("/api/v1/boards/discover");
}

export function createBoard(body: { name?: string; description?: string; [k: string]: unknown }) {
  return api<Board>("/api/v1/boards", { method: "POST", body });
}

export function joinBoard(id: string | number) {
  return api<unknown>(`/api/v1/boards/${id}/join`, { method: "POST" });
}

export function listMembers(id: string | number) {
  return api<BoardMember[]>(`/api/v1/boards/${id}/members`);
}

export function listPosts(id: string | number) {
  return api<BoardPost[]>(`/api/v1/boards/${id}/posts`);
}

export function createPost(id: string | number, body: { content?: string; body?: string }) {
  return api<BoardPost>(`/api/v1/boards/${id}/posts`, { method: "POST", body });
}