import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import {
  createCustomVoice,
  deleteCustomVoice,
  type CustomVoice,
} from "@/lib/interview";

const ACCEPTED_EXT = ["mp3", "wav", "ogg", "webm", "m4a", "aac"];

function statusLabel(v: CustomVoice): string {
  if (!v.status) return "Ready";
  return v.status.charAt(0).toUpperCase() + v.status.slice(1);
}

export default function CustomVoices({
  voices,
  onChanged,
}: {
  voices: CustomVoice[];
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const fileRef = useRef<HTMLInputElement | null>(null);

  function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const list = e.target.files ? Array.from(e.target.files) : [];
    const invalid = list.some((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      return !ACCEPTED_EXT.includes(ext);
    });
    if (invalid) {
      setError("Unsupported file type — use mp3, wav, ogg, webm, m4a, or aac.");
      e.target.value = "";
      return;
    }
    setError("");
    setFiles(list);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!name.trim()) {
      setError("Please give the voice a name.");
      return;
    }
    if (files.length === 0) {
      setError("Please add at least one audio sample.");
      return;
    }
    if (!consent) {
      setError("Please confirm you have permission to clone this voice.");
      return;
    }
    setSubmitting(true);
    const form = new FormData();
    form.append("name", name.trim());
    form.append("consent", "true");
    for (const f of files) form.append("files", f);
    try {
      await createCustomVoice(form);
      setNotice("Voice created.");
      setName("");
      setFiles([]);
      setConsent(false);
      if (fileRef.current) fileRef.current.value = "";
      onChanged();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 400) {
          setError("Please confirm you have permission to clone this voice.");
        } else if (err.status === 415) {
          setError("Unsupported file type — use mp3, wav, ogg, webm, m4a, or aac.");
        } else if (err.status === 501) {
          setError("Voice cloning isn't enabled yet.");
        } else {
          setError(err.message);
        }
      } else {
        setError("Could not create the voice.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete(id: string | number) {
    setError("");
    setNotice("");
    setDeletingId(id);
    try {
      await deleteCustomVoice(id);
      setNotice("Voice deleted.");
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete the voice.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-background-200 bg-background-50 p-4">
      <div className="flex items-center gap-2">
        <i className="ri-voiceprint-line text-base text-foreground-700"></i>
        <h4 className="text-sm font-semibold text-foreground-900">Custom voices</h4>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-accent-100 text-accent-900 px-3 py-2 text-xs">
          <i className="ri-error-warning-line text-sm mt-0.5"></i>
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 text-green-800 px-3 py-2 text-xs">
          <i className="ri-checkbox-circle-line text-sm"></i>
          <span>{notice}</span>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <label
            className="text-xs font-semibold text-foreground-700"
            htmlFor="custom-voice-name"
          >
            Name
          </label>
          <input
            id="custom-voice-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. My interview voice"
            className="w-full px-3 py-2 rounded-md bg-background-100 border border-background-200 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300"
          />
        </div>

        <div className="space-y-1.5">
          <label
            className="text-xs font-semibold text-foreground-700"
            htmlFor="custom-voice-files"
          >
            Audio samples
          </label>
          <input
            ref={fileRef}
            id="custom-voice-files"
            type="file"
            multiple
            accept={ACCEPTED_EXT.map((e) => `.${e}`).join(",")}
            onChange={onFiles}
            className="w-full text-xs text-foreground-600 file:mr-3 file:rounded-md file:border-0 file:bg-secondary-100 file:text-secondary-900 file:text-xs file:font-semibold file:px-3 file:py-2 hover:file:bg-secondary-200 cursor-pointer"
          />
          {files.length > 0 && (
            <p className="text-[11px] text-foreground-500">
              {files.length} sample{files.length === 1 ? "" : "s"} selected
            </p>
          )}
        </div>

        <label className="flex items-start gap-2 text-xs text-foreground-700 cursor-pointer">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 accent-primary-500"
          />
          <span>I own this voice or have the person&rsquo;s permission to clone it.</span>
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
        >
          <i className={submitting ? "ri-loader-4-line animate-spin" : "ri-add-line"}></i>
          {submitting ? "Creating…" : "Create voice"}
        </button>
      </form>

      {voices.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-foreground-700">Your voices</p>
          <ul className="space-y-1.5">
            {voices.map((v) => (
              <li
                key={String(v.id)}
                className="flex items-center justify-between gap-2 rounded-md bg-background-100 px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <i className="ri-voiceprint-line text-foreground-500"></i>
                  <span className="text-sm text-foreground-900 truncate">{v.name}</span>
                  {v.status && v.status !== "ready" && (
                    <span className="text-[11px] text-foreground-500 whitespace-nowrap">
                      {statusLabel(v)}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => onDelete(v.id)}
                  disabled={deletingId === v.id}
                  className="inline-flex items-center justify-center w-8 h-8 flex-shrink-0 rounded-md text-foreground-500 hover:text-accent-700 hover:bg-accent-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                  aria-label={`Delete ${v.name}`}
                >
                  <i
                    className={
                      deletingId === v.id
                        ? "ri-loader-4-line animate-spin"
                        : "ri-delete-bin-6-line"
                    }
                  ></i>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}