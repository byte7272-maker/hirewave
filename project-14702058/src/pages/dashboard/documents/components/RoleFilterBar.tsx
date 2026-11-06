interface RoleFilterOption {
  role: string;
  count: number;
}

interface RoleFilterBarProps {
  /** The distinct roles present, each with how many documents use it. */
  options: RoleFilterOption[];
  /** Total number of documents (shown on the "All roles" chip). */
  total: number;
  /** Currently-selected role, or "__all__" for no narrowing. */
  value: string;
  onChange: (role: string) => void;
  /** Leading label text. */
  label?: string;
}

/**
 * A compact chip row that narrows a document list to one last-aimed-at role.
 * Renders nothing when there's a single role to choose between, so
 * single-purpose lists stay uncluttered.
 */
export default function RoleFilterBar({
  options,
  total,
  value,
  onChange,
  label = "Filter by role",
}: RoleFilterBarProps) {
  if (options.length < 2) return null;
  const active = value !== "__all__" && options.some((o) => o.role === value);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-foreground-500">
        <i className="ri-filter-3-line"></i>
        {label}
      </span>
      <button
        type="button"
        onClick={() => onChange("__all__")}
        className={`inline-flex items-center gap-1 text-xs font-medium px-3 py-1 rounded-full border transition-colors cursor-pointer whitespace-nowrap ${
          active
            ? "bg-background-50 text-foreground-700 border-background-200 hover:border-background-300"
            : "bg-primary-500 text-background-50 dark:text-foreground-950 border-primary-500"
        }`}
      >
        All roles
        <span className="opacity-70">· {total}</span>
      </button>
      {options.map((o) => {
        const selected = active && value === o.role;
        return (
          <button
            key={o.role}
            type="button"
            onClick={() => onChange(o.role)}
            title={o.role}
            className={`inline-flex items-center gap-1 text-xs font-medium px-3 py-1 rounded-full border transition-colors cursor-pointer whitespace-nowrap ${
              selected
                ? "bg-primary-500 text-background-50 dark:text-foreground-950 border-primary-500"
                : "bg-background-50 text-foreground-700 border-background-200 hover:border-background-300 hover:text-foreground-900"
            }`}
          >
            <span className="max-w-[180px] truncate">{o.role}</span>
            <span className="opacity-70">· {o.count}</span>
          </button>
        );
      })}
    </div>
  );
}