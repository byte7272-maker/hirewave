import type { FitBand } from "@/pages/dashboard/components/FitBandBar";

const BAND_LABEL: Record<FitBand, string> = {
  strong: "Strong 90+",
  good: "Good 85–89",
  fair: "Fair under 85",
  unscored: "Unscored",
};

interface BandFilterNoticeProps {
  /** The band currently narrowing the list. */
  band: FitBand;
  /** How many rows survive the band filter. */
  shown: number;
  /** How many rows the band filter is drawn from. */
  total: number;
  /** One-click reset: clear the active band filter. */
  onClear: () => void;
  className?: string;
}

/**
 * The companion readout for an active fit-band filter: a quiet "showing N of M"
 * line plus a one-click reset chip. Shared by the Matches and Flagged lists so
 * that filtering a ranked list feels identical on both surfaces.
 */
export default function BandFilterNotice({
  band,
  shown,
  total,
  onClear,
  className = "",
}: BandFilterNoticeProps) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className="inline-flex items-center gap-1.5 text-xs text-foreground-600">
        <i className="ri-filter-3-line"></i>
        Showing
        <strong className="font-semibold text-foreground-900">{shown}</strong>
        of
        <strong className="font-semibold text-foreground-900">{total}</strong>
        in
        <span className="inline-flex items-center gap-1 font-semibold text-foreground-900">
          <i className="ri-focus-3-line"></i>
          {BAND_LABEL[band]}
        </span>
      </span>
      <button
        type="button"
        onClick={onClear}
        className="inline-flex items-center gap-1 text-xs font-semibold text-primary-800 bg-primary-100 hover:bg-primary-200 px-2.5 py-1 rounded-full cursor-pointer whitespace-nowrap transition-colors"
      >
        <i className="ri-close-line"></i>
        Reset band
      </button>
    </div>
  );
}