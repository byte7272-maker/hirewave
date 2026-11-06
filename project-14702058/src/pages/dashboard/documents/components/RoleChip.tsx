import { Link } from "react-router-dom";
import { asText } from "./versionMeta";

interface RoleChipProps {
  /** The role/job the document was last tailored to. Empty renders nothing. */
  role?: string | null;
  /** Optional verbose label prefix shown in the tooltip. */
  title?: string;
  /**
   * When set, the chip becomes a link (used to jump into this document's
   * Templates view with the same role pre-selected).
   */
  to?: string | null;
}

/**
 * A compact pill showing which role a document was last aimed at. Read-only by
 * default; when `to` is supplied it becomes a clickable shortcut into that
 * document's Templates view.
 */
export default function RoleChip({ role, title, to }: RoleChipProps) {
  const value = asText(role);
  if (!value) return null;

  const base =
    "inline-flex items-center gap-1 max-w-[220px] text-xs font-medium text-secondary-900 bg-secondary-100 px-2 py-0.5 rounded-full whitespace-nowrap";
  const content = (
    <>
      <i className="ri-focus-2-line flex-shrink-0"></i>
      <span className="truncate">{value}</span>
    </>
  );

  if (to) {
    return (
      <Link
        to={to}
        className={`${base} hover:bg-secondary-200 transition-colors cursor-pointer`}
        title={title ?? `Open Templates aimed at ${value}`}
      >
        {content}
      </Link>
    );
  }

  return (
    <span className={base} title={title ?? `Last tailored to ${value}`}>
      {content}
    </span>
  );
}