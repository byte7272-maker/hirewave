import { useState } from "react";
import { useToast } from "@/lib/toast";
import { downloadMatches, fetchExportRows } from "@/lib/exportMatches";
import { openPrintShortlist } from "@/lib/pdfShortlist";

/** Export the ranked recommendations as CSV/JSON, or a print-ready PDF shortlist.
 *  Pass `ids` to export just a subset (e.g. saved jobs); omit for all matches. */
export default function ExportMatches({ ids, disabled, label = "Export", scope }: { ids?: string[]; disabled?: boolean; label?: string; scope?: "saved" }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run(format: "csv" | "json") {
    setOpen(false);
    setBusy(true);
    try {
      await downloadMatches(format, ids);
      toast.push(`Exported your recommendations as ${format.toUpperCase()}.`, "success");
    } catch {
      toast.push("Export failed — try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function runPdf() {
    setOpen(false);
    setBusy(true);
    try {
      const rows = await fetchExportRows(ids);
      const generated = new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
      const ok = openPrintShortlist(rows, { generated, scope });
      if (!ok) toast.push("Allow pop-ups to open the printable shortlist.", "error");
    } catch {
      toast.push("Couldn't build the shortlist — try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || busy}
        className="inline-flex items-center gap-2 text-sm font-semibold bg-background-50 border border-background-300 text-foreground-800 px-4 py-2.5 rounded-md hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
      >
        <i className="ri-download-2-line"></i>
        {busy ? "Exporting…" : label}
        <i className={`ri-arrow-down-s-line transition-transform ${open ? "rotate-180" : ""}`}></i>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 z-20 w-40 rounded-lg bg-background-50 border border-background-200 shadow-lg overflow-hidden">
            <button onClick={() => run("csv")} className="w-full text-left px-3 py-2 text-sm text-foreground-800 hover:bg-background-100 cursor-pointer flex items-center gap-2">
              <i className="ri-file-excel-2-line text-primary-600"></i> CSV (spreadsheet)
            </button>
            <button onClick={() => run("json")} className="w-full text-left px-3 py-2 text-sm text-foreground-800 hover:bg-background-100 cursor-pointer flex items-center gap-2">
              <i className="ri-braces-line text-accent-600"></i> JSON
            </button>
            <button onClick={runPdf} className="w-full text-left px-3 py-2 text-sm text-foreground-800 hover:bg-background-100 cursor-pointer flex items-center gap-2 border-t border-background-200">
              <i className="ri-file-pdf-2-line text-red-500"></i> PDF shortlist
            </button>
          </div>
        </>
      )}
    </div>
  );
}
