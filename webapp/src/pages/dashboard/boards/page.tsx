import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import {
  listMyBoards, discoverBoards, createBoard, joinBoard, listMembers, listPosts, createPost,
  type Board, type BoardPost,
} from "@/lib/boards";

export default function Boards() {
  const toast = useToast();
  const [mine, setMine] = useState<Board[]>([]);
  const [discover, setDiscover] = useState<Board[]>([]);
  const [active, setActive] = useState<Board | null>(null);
  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [members, setMembers] = useState<{ user_id: string; name: string }[]>([]);
  const [body, setBody] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(() => {
    listMyBoards().then(setMine).catch(() => {});
    discoverBoards().then(setDiscover).catch(() => {});
  }, []);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { feedRef.current?.scrollTo(0, feedRef.current.scrollHeight); }, [posts]);

  const openBoard = useCallback(async (b: Board) => {
    setActive(b);
    try { setPosts(await listPosts(b.id)); setMembers(await listMembers(b.id)); } catch { /* */ }
  }, []);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const b = await createBoard({ name, description: desc, is_public: isPublic });
      setShowCreate(false); setName(""); setDesc(""); reload(); openBoard(b);
      toast.push("Board created.", "success");
    } catch (err) { toast.push(err instanceof ApiError ? err.message : "Couldn't create.", "error"); }
    finally { setBusy(false); }
  }
  async function join(arg: { board_id?: string; code?: string }) {
    setBusy(true);
    try {
      const b = await joinBoard(arg);
      setJoinCode(""); reload(); openBoard(b);
      toast.push(`Joined ${b.name}.`, "success");
    } catch (err) { toast.push(err instanceof ApiError ? err.message : "Couldn't join.", "error"); }
    finally { setBusy(false); }
  }
  async function post() {
    if (!active || !body.trim()) return;
    setBusy(true);
    try { const p = await createPost(active.id, body.trim()); setPosts((xs) => [...xs, p]); setBody(""); }
    catch (err) { toast.push(err instanceof ApiError ? err.message : "Couldn't post.", "error"); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <section className="animate-fade-in-up flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-medium text-foreground-950">Boards</h1>
          <p className="text-sm text-foreground-600 mt-1">Group channels to discuss and share roles with other job seekers.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="Join by code" className="h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
          <button onClick={() => join({ code: joinCode.trim() })} disabled={busy || !joinCode.trim()} className="text-sm font-medium bg-background-50 border border-background-200 text-foreground-700 px-3 py-2 rounded-md hover:bg-background-100 cursor-pointer disabled:opacity-60">Join</button>
          <button onClick={() => setShowCreate((v) => !v)} className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-primary-600 cursor-pointer"><i className="ri-add-line"></i>New board</button>
        </div>
      </section>

      {showCreate && (
        <div className="rounded-2xl bg-background-100/60 border border-background-200 p-4 animate-fade-in-up grid sm:grid-cols-2 gap-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Board name" className="h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
          <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description (optional)" className="h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
          <label className="inline-flex items-center gap-2 text-sm text-foreground-700 cursor-pointer">
            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="w-4 h-4 rounded border-background-300 accent-primary-500" /> Public (anyone can discover & join)
          </label>
          <button onClick={create} disabled={busy || !name.trim()} className="text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-primary-600 cursor-pointer justify-self-start disabled:opacity-60">Create board</button>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-4 animate-fade-in-up">
        {/* board list */}
        <div className="space-y-4">
          <div className="rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-background-200 text-xs font-semibold text-foreground-700">Your boards</div>
            {mine.length === 0 ? <p className="px-4 py-4 text-sm text-foreground-500">None yet — create or join one.</p> : (
              <ul className="divide-y divide-background-200">
                {mine.map((b) => (
                  <li key={b.id}><button onClick={() => openBoard(b)} className={`w-full text-left px-4 py-3 hover:bg-background-100 cursor-pointer ${active?.id === b.id ? "bg-background-100" : ""}`}>
                    <div className="flex items-center gap-2"><i className={b.is_public ? "ri-group-line text-foreground-400" : "ri-lock-line text-foreground-400"}></i><span className="text-sm font-medium text-foreground-950 truncate">{b.name}</span></div>
                    <p className="text-xs text-foreground-500 mt-0.5">{b.member_count} member{b.member_count === 1 ? "" : "s"}</p>
                  </button></li>
                ))}
              </ul>
            )}
          </div>
          {discover.length > 0 && (
            <div className="rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-background-200 text-xs font-semibold text-foreground-700">Discover</div>
              <ul className="divide-y divide-background-200">
                {discover.map((b) => (
                  <li key={b.id} className="px-4 py-3 flex items-center justify-between gap-2">
                    <div className="min-w-0"><span className="text-sm font-medium text-foreground-950 truncate block">{b.name}</span><span className="text-xs text-foreground-500">{b.member_count} members</span></div>
                    <button onClick={() => join({ board_id: b.id })} disabled={busy} className="text-xs font-semibold text-primary-700 hover:text-primary-900 cursor-pointer">Join</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* board feed */}
        <div className="md:col-span-2 rounded-2xl bg-background-100/60 border border-background-200 flex flex-col min-h-[60vh]">
          {!active ? (
            <div className="flex-1 flex items-center justify-center text-sm text-foreground-500">Select a board to see the conversation.</div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-background-200 flex items-center justify-between gap-3 flex-wrap">
                <div><div className="text-sm font-semibold text-foreground-950">{active.name}</div>{active.description && <div className="text-xs text-foreground-500">{active.description}</div>}</div>
                <div className="text-xs text-foreground-500">{members.map((m) => m.name).join(", ")}{active.join_code && active.is_owner ? ` · code ${active.join_code}` : ""}</div>
              </div>
              <div ref={feedRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                {posts.map((p) => (
                  <div key={p.id} className={`flex ${p.mine ? "justify-end" : "justify-start"}`}>
                    <div className="max-w-[80%]">
                      {!p.mine && <div className="text-[11px] text-foreground-500 mb-0.5">{p.author}</div>}
                      <div className={`rounded-2xl px-3 py-2 text-sm ${p.mine ? "bg-primary-500 text-background-50 dark:text-foreground-950" : "bg-background-200 text-foreground-900"}`}>
                        {p.body && <p>{p.body}</p>}
                        {p.shared_job && <div className={`mt-1 rounded-lg px-2 py-1.5 text-xs ${p.mine ? "bg-primary-600/60" : "bg-background-50 border border-background-300 text-foreground-800"}`}><i className="ri-briefcase-line"></i> {p.shared_job.title} · {p.shared_job.company}</div>}
                      </div>
                    </div>
                  </div>
                ))}
                {posts.length === 0 && <p className="text-sm text-foreground-400 text-center mt-6">No posts yet — start the conversation.</p>}
              </div>
              <div className="p-3 border-t border-background-200 flex items-center gap-2">
                <input value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => e.key === "Enter" && post()} placeholder="Post to the board…" className="flex-1 h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
                <button onClick={post} disabled={busy || !body.trim()} className="inline-flex items-center justify-center w-10 h-10 rounded-md bg-primary-500 text-background-50 dark:text-foreground-950 hover:bg-primary-600 cursor-pointer disabled:opacity-60"><i className="ri-send-plane-fill"></i></button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
