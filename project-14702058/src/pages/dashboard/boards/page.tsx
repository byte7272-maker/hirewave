import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  createBoard,
  createPost,
  discoverBoards,
  joinBoard,
  listBoards,
  listMembers,
  listPosts,
  type Board,
  type BoardMember,
  type BoardPost,
} from "@/lib/boards";

function initials(name?: string): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

interface CreateModalProps {
  onClose: () => void;
  onCreated: () => void;
}

function CreateModal({ onClose, onCreated }: CreateModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!name.trim()) {
      setError("Give your board a name.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await createBoard({ name: name.trim(), description: description.trim() || undefined });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create board.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose}></div>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-background-50 border border-background-200 rounded-2xl overflow-hidden animate-fade-in-up">
          <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between">
            <h3 className="font-heading text-lg font-medium text-foreground-950">New board</h3>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-100 cursor-pointer"
              aria-label="Close"
            >
              <i className="ri-close-line text-lg"></i>
            </button>
          </div>
          <div className="p-5 space-y-4">
            <label className="block">
              <span className="block text-xs font-medium text-foreground-600 mb-1.5">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Product folks hiring"
                className="w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-foreground-600 mb-1.5">
                Description
              </span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="What is this community about?"
                className="w-full px-3 py-2 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300 resize-none"
              />
            </label>
            {error && (
              <div className="flex items-start gap-2 text-sm text-accent-900 bg-accent-100 rounded-lg px-3 py-2.5">
                <i className="ri-error-warning-line mt-0.5"></i>
                <span>{error}</span>
              </div>
            )}
          </div>
          <div className="px-5 py-4 border-t border-background-200 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="inline-flex items-center text-sm font-semibold text-foreground-600 px-4 py-2 rounded-md hover:bg-background-100 cursor-pointer whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={saving}
              className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-primary-600 cursor-pointer whitespace-nowrap disabled:opacity-60"
            >
              {saving ? (
                <>
                  <i className="ri-loader-4-line animate-spin"></i>
                  Creating…
                </>
              ) : (
                "Create board"
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

interface DetailModalProps {
  board: Board;
  onClose: () => void;
}

function DetailModal({ board, onClose }: DetailModalProps) {
  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [members, setMembers] = useState<BoardMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [p, m] = await Promise.all([listPosts(board.id), listMembers(board.id)]);
      setPosts(p ?? []);
      setMembers(m ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load board.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [board.id]);

  async function post() {
    const content = draft.trim();
    if (!content) return;
    setPosting(true);
    setError("");
    try {
      const p = await createPost(board.id, { content, body: content });
      setPosts((prev) => [p, ...prev]);
      setDraft("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not post.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose}></div>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl max-h-[85vh] bg-background-50 border border-background-200 rounded-2xl overflow-hidden animate-fade-in-up flex flex-col">
          <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between">
            <div>
              <h3 className="font-heading text-lg font-medium text-foreground-950">
                {board.name}
              </h3>
              <p className="text-xs text-foreground-500 mt-0.5">
                {members.length} members · {posts.length} posts
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-100 cursor-pointer"
              aria-label="Close"
            >
              <i className="ri-close-line text-lg"></i>
            </button>
          </div>

          {error && (
            <div className="px-5 py-3 text-sm text-accent-900 bg-accent-100">{error}</div>
          )}

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="flex items-center gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && post()}
                placeholder="Share an update or question…"
                className="flex-1 h-10 px-3 rounded-lg bg-background-100 border border-background-200 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300"
              />
              <button
                onClick={post}
                disabled={posting || !draft.trim()}
                className="inline-flex items-center gap-1.5 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-primary-600 cursor-pointer whitespace-nowrap disabled:opacity-60"
              >
                {posting ? (
                  <i className="ri-loader-4-line animate-spin"></i>
                ) : (
                  <i className="ri-send-plane-line"></i>
                )}
                Post
              </button>
            </div>

            {loading ? (
              <div className="py-10 text-sm text-foreground-500 flex items-center justify-center gap-2">
                <i className="ri-loader-4-line animate-spin"></i>
                Loading…
              </div>
            ) : posts.length === 0 ? (
              <div className="py-10 text-center text-sm text-foreground-500">
                No posts yet. Start the conversation.
              </div>
            ) : (
              <div className="space-y-3">
                {posts.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-xl bg-background-100/60 border border-background-200 p-4"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 flex items-center justify-center rounded-full bg-secondary-500 text-background-50 text-xs font-semibold">
                        {initials(p.author)}
                      </div>
                      <span className="text-sm font-semibold text-foreground-950">
                        {p.author ?? "Member"}
                      </span>
                    </div>
                    <p className="text-sm text-foreground-700 mt-2">
                      {p.body ?? p.content ?? ""}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default function Boards() {
  const [tab, setTab] = useState<"mine" | "discover">("mine");
  const [mine, setMine] = useState<Board[]>([]);
  const [discover, setDiscover] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState<Board | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [m, d] = await Promise.all([listBoards(), discoverBoards()]);
      setMine(m ?? []);
      setDiscover(d ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load boards.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleJoin(b: Board) {
    setDiscover((prev) => prev.map((x) => (x.id === b.id ? { ...x, joined: true } : x)));
    setMine((prev) => (prev.some((x) => x.id === b.id) ? prev : [...prev, { ...b, joined: true }]));
    try {
      await joinBoard(b.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not join board.");
    }
  }

  const list = tab === "mine" ? mine : discover;

  return (
    <div className="space-y-6">
      <section className="animate-fade-in-up flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-medium text-foreground-950">
            Boards &amp; communities
          </h1>
          <p className="text-sm text-foreground-600 mt-1">
            Join communities to share leads, get referrals, and network.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-primary-600 cursor-pointer whitespace-nowrap"
        >
          <i className="ri-add-line"></i>
          New board
        </button>
      </section>

      <div className="inline-flex items-center rounded-full bg-background-100 border border-background-200 p-1 animate-fade-in-up">
        {(
          [
            { id: "mine", label: "My boards", icon: "ri-user-star-line" },
            { id: "discover", label: "Discover", icon: "ri-compass-3-line" },
          ] as const
        ).map((t) => (
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

      {loading ? (
        <div className="py-14 text-sm text-foreground-500 flex items-center justify-center gap-2">
          <i className="ri-loader-4-line animate-spin"></i>
          Loading boards…
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl bg-background-100/60 border border-background-200 border-dashed py-16 text-center animate-fade-in-up">
          <div className="w-12 h-12 mx-auto flex items-center justify-center rounded-full bg-background-200 text-foreground-500">
            <i className="ri-group-line text-xl"></i>
          </div>
          <p className="text-sm font-medium text-foreground-900 mt-3">
            {tab === "mine" ? "No boards yet" : "Nothing to discover"}
          </p>
          <p className="text-sm text-foreground-500 mt-1">
            {tab === "mine" ? "Create a board or join one from Discover." : "Check back later."}
          </p>
        </div>
      ) : (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 animate-fade-in-up"
          style={{ animationDelay: "0.12s" }}
        >
          {list.map((b) => (
            <div
              key={b.id}
              className="rounded-2xl bg-background-100/60 border border-background-200 p-5 flex flex-col"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="w-11 h-11 flex items-center justify-center rounded-xl bg-accent-500 text-background-50 dark:text-foreground-950 text-xl">
                  <i className="ri-group-line"></i>
                </div>
                <span className="text-[11px] font-semibold text-foreground-600 bg-background-200 px-2 py-1 rounded-full whitespace-nowrap">
                  {b.member_count ?? 0} members
                </span>
              </div>
              <h2 className="font-heading text-lg font-medium text-foreground-950 mt-4">
                {b.name}
              </h2>
              <p className="text-sm text-foreground-600 mt-1 flex-1 line-clamp-2">
                {b.description}
              </p>
              <div className="flex items-center gap-2 mt-4">
                <button
                  onClick={() => setDetail(b)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-primary-700 bg-primary-100 px-4 py-2.5 rounded-md hover:bg-primary-200 cursor-pointer whitespace-nowrap"
                >
                  Open
                </button>
                {tab === "discover" && !b.joined && (
                  <button
                    onClick={() => handleJoin(b)}
                    className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-foreground-700 bg-background-100 border border-background-300 px-4 py-2.5 rounded-md hover:bg-background-200 cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-user-add-line"></i>
                    Join
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}
      {detail && <DetailModal board={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}