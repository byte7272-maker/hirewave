import {
  APPROVAL_SORTS,
  providerLabel,
  type ApprovalSortKey,
} from "@/lib/approvals";
import { Button, Card, SectionHeader, SelectField } from "@/components/base";

interface ApprovalsToolbarProps {
  /** Distinct provider keys present in the full queue. */
  providers: string[];
  provider: string;
  onProviderChange: (value: string) => void;
  sort: ApprovalSortKey;
  onSortChange: (value: ApprovalSortKey) => void;
  visibleCount: number;
  totalCount: number;
}

/**
 * Sort + provider filter for the approval queue. It now opens with the shared
 * `SectionHeader` and lives on a `Card` surface, so the queue's supporting
 * controls read as the very same material as every other panel. Purely
 * client-side — it lets a long queue stay scannable without another round-trip,
 * and shows how many of the total are currently in view.
 */
export default function ApprovalsToolbar({
  providers,
  provider,
  onProviderChange,
  sort,
  onSortChange,
  visibleCount,
  totalCount,
}: ApprovalsToolbarProps) {
  const filtering = provider !== "all";
  const narrowed = visibleCount !== totalCount;

  return (
    <Card
      surface="tinted"
      className="animate-fade-in-up"
      style={{ animationDelay: "0.06s" }}
    >
      <SectionHeader
        icon="ri-equalizer-line"
        tone="foreground"
        title="Sort & filter"
        subtitle={narrowed ? `${visibleCount} of ${totalCount} waiting` : `${totalCount} waiting`}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <SelectField
              inline
              label="Provider"
              value={provider}
              onChange={onProviderChange}
              controlClassName="min-w-[9rem]"
            >
              <option value="all">All providers</option>
              {providers.map((key) => (
                <option key={key} value={key}>
                  {providerLabel(key)}
                </option>
              ))}
            </SelectField>

            <SelectField
              inline
              label="Sort by"
              value={sort}
              onChange={(v) => onSortChange(v as ApprovalSortKey)}
              controlClassName="min-w-[9rem]"
            >
              {APPROVAL_SORTS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </SelectField>

            {filtering && (
              <Button
                variant="outline"
                size="sm"
                icon="ri-close-line"
                onClick={() => onProviderChange("all")}
              >
                Clear filter
              </Button>
            )}
          </div>
        }
      />
    </Card>
  );
}