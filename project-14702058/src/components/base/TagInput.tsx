import { useState, type KeyboardEvent } from "react";

interface TagInputProps {
  label: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  hint?: string;
  /** Optional id for the text input — lets a keyboard shortcut focus it. */
  inputId?: string;
}

export default function TagInput({
  label,
  tags,
  onChange,
  placeholder,
  hint,
  inputId,
}: TagInputProps) {
  const [draft, setDraft] = useState("");

  function addTag() {
    const value = draft.trim();
    if (!value) return;
    if (!tags.includes(value)) onChange([...tags, value]);
    setDraft("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    } else if (e.key === "Backspace" && !draft && tags.length) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div>
      <span className="block text-xs font-medium text-foreground-600 mb-1.5">{label}</span>
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-background-50 border border-background-200 px-3 py-2 focus-within:ring-2 focus-within:ring-primary-400 focus-within:border-primary-300">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 bg-secondary-100 text-secondary-900 text-xs font-medium px-2 py-1 rounded-full"
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(tags.filter((t) => t !== tag))}
              className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-secondary-200 cursor-pointer"
              aria-label={`Remove ${tag}`}
            >
              <i className="ri-close-line text-xs"></i>
            </button>
          </span>
        ))}
        <input
          id={inputId}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={addTag}
          placeholder={tags.length ? "" : placeholder}
          className="flex-1 min-w-[140px] bg-transparent border-none outline-none text-sm text-foreground-900 placeholder:text-foreground-400"
        />
      </div>
      {hint && <span className="block text-xs text-foreground-400 mt-1">{hint}</span>}
    </div>
  );
}