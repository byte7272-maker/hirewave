import type { RoleSort } from "@/lib/documentListMemory";

interface DocumentSortSelectProps {
  value: RoleSort;
  onChange: (sort: RoleSort) => void;
}

/**
 * A compact sort control for a document list. "Role" options group documents
 * that share a last-aimed-at role together (unlabeled documents last).
 */
export default function DocumentSortSelect({
  value,
  onChange,
}: DocumentSortSelectProps) {
  return (
    <label className="inline-flex items-center gap-2">
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-foreground-500">
        <i className="ri-sort-desc"></i>
        Sort
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as RoleSort)}
        className="h-9 px-3 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300 cursor-pointer"
      >
        <option value="default">Default order</option>
        <option value="role_asc">Role · A to Z</option>
        <option value="role_desc">Role · Z to A</option>
      </select>
    </label>
  );
}