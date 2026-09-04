import React, { useEffect, useMemo, useRef, useState } from "react";

import { GOOGLE_API_KEY, DEFAULT_RGP_SPREADSHEET_IDS } from "../config/apiConfig";

/* ──────────────────────────────────────────────────────────────────────────
   Config
────────────────────────────────────────────────────────────────────────── */
const HARDCODED_API_KEY = GOOGLE_API_KEY;
const DEFAULT_SPREADSHEET_IDS = DEFAULT_RGP_SPREADSHEET_IDS;
const DEFAULT_RANGE = "Fabric_RGP_Logs!A1:J"; // includes header row at A1

// Only these columns are used/read
const ALLOWED_COLUMNS = [
  "Timestamp",
  "Type",
  "RGP No",
  "StatusAfter",
  "ReturnedQty",
  "Name",
  "Latitude",
  "Longitude",
  "Remarks",
];

/* Terms that indicate the RGP is fully received/closed (case-insensitive).
   Tweak/add terms to match your sheet vocabulary exactly. */
const CLOSED_TERMS = [
  "closed",
  "close",
  "complete received",
  "received complete",
  "return complete",
  "material received",
  "completed",
];

/* ──────────────────────────────────────────────────────────────────────────
   Utils
────────────────────────────────────────────────────────────────────────── */
function buildSheetsUrl({ spreadsheetId, range, apiKey }) {
  const keyToUse = apiKey || HARDCODED_API_KEY;
  const idToUse = spreadsheetId || DEFAULT_SPREADSHEET_IDS[0];
  const rangeToUse = range || DEFAULT_RANGE;
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${idToUse}/values/${encodeURIComponent(
    rangeToUse
  )}`;
  const params = new URLSearchParams({ key: keyToUse });
  return `${base}?${params.toString()}`;
}

function rowsToObjects(values) {
  if (!values || values.length === 0) return [];
  const [header, ...rows] = values;
  const indexByHeader = {};
  header.forEach((h, i) => (indexByHeader[String(h)] = i));
  return rows.map((r) => {
    const obj = {};
    ALLOWED_COLUMNS.forEach((col) => {
      const idx = indexByHeader[col];
      obj[col] = idx !== undefined ? (r[idx] ?? "") : "";
    });
    return obj;
  });
}

function parseDateLoose(s) {
  if (!s) return null;
  const ddmmyyyy = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/;
  const m = String(s).match(ddmmyyyy);
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) - 1;
    const y = parseInt(m[3].length === 2 ? `20${m[3]}` : m[3], 10);
    const dt = new Date(y, mo, d);
    return isNaN(dt.getTime()) ? null : dt;
  }
  const iso = new Date(s);
  return isNaN(iso.getTime()) ? null : iso;
}

function parseRgpNo(value) {
  if (!value) return { year: 0, seq: 0 };
  const s = String(value);
  const nums = s.match(/\d+/g) || [];
  if (nums.length >= 2) {
    const year = parseInt(nums[nums.length - 2], 10) || 0;
    const seq = parseInt(nums[nums.length - 1], 10) || 0;
    return { year, seq };
  }
  if (nums.length === 1) return { year: 0, seq: parseInt(nums[0], 10) || 0 };
  return { year: 0, seq: 0 };
}

function norm(v) {
  return String(v ?? "").toLowerCase().trim();
}

function isClosedStatus(status) {
  const s = norm(status);
  return CLOSED_TERMS.some((t) => s.includes(t));
}

function diffDays(start, end) {
  if (!start || !end) return 0;
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.round(ms / 86400000)); // add +1 if you want inclusive counting
}

function formatTodayStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(
    d.getHours()
  )}-${pad(d.getMinutes())}`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function pdfSafe(input) {
  if (input == null) return "";
  let s = String(input);
  const map = {
    "“": '"', "”": '"', "„": '"', "‟": '"',
    "‘": "'", "’": "'", "‚": "'", "‛": "'",
    "–": "-", "—": "-", "-": "-", "•": "-",
    "…": "...", "→": "->", "←": "<-", "↔": "<->", "⇒": "=>", "⇐": "<=",
    "▲": "^", "▼": "v", "▶": ">", "◀": "<",
  };
  s = s.replace(/["“”„‟‘’‚‛–—-•…→←↔⇒⇐▲▼▶◀]/g, (ch) => map[ch] || "");
  s = s.replace(/[^\x00-\x7E]/g, " "); // strip non-ASCII to avoid jsPDF font issues
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/* ──────────────────────────────────────────────────────────────────────────
   Component
────────────────────────────────────────────────────────────────────────── */
export default function RgpHistory({
  spreadsheetId,
  apiKey = HARDCODED_API_KEY,
  range = DEFAULT_RANGE,
  statusField = "StatusAfter",
  dateField = "Timestamp",
  pageSize = 10,
  onBack,
  homeHref,
}) {
  const [rawRows, setRawRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Shared sort/pagination
  const [sortKey, setSortKey] = useState("");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(1);
  const abortRef = useRef(null);

  // Logs filters
  const [filterType, setFilterType] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterName, setFilterName] = useState("ALL");
  const [globalQuery, setGlobalQuery] = useState("");

  // Views + exact RGP filter for “View History”
  const [view, setView] = useState("summary"); // "summary" | "logs"
  const [rgpExactFilter, setRgpExactFilter] = useState("");

  const url = useMemo(() => {
    try {
      return buildSheetsUrl({ spreadsheetId, range, apiKey });
    } catch {
      return "";
    }
  }, [spreadsheetId, range, apiKey]);

  useEffect(() => {
    fetchRows();
    return () => abortRef.current?.abort?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  async function fetchRows() {
    setLoading(true);
    setError("");
    setPage(1);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const ids = spreadsheetId ? [spreadsheetId] : DEFAULT_SPREADSHEET_IDS;
      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            const u = buildSheetsUrl({ spreadsheetId: id, range, apiKey });
            const res = await fetch(u, { signal: ctrl.signal });
            if (!res.ok) return [];
            const json = await res.json();
            return rowsToObjects(json.values || []);
          } catch (e) {
            console.warn(`Failed to load logs from sheet ${id}:`, e);
            return [];
          }
        })
      );
      const combined = results.flat();
      setRawRows(combined);
    } catch (err) {
      if (err?.name !== "AbortError") {
        setError(
          err?.message || "Failed to load data. Ensure your sheet is public and the API key is valid."
        );
      }
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    if (typeof onBack === "function") {
      try { onBack(); } catch {}
      return;
    }
    if (typeof window !== "undefined" && window.history && window.history.length > 1) {
      window.history.back(); return;
    }
    if (homeHref) window.location.href = homeHref;
  }

  // Dropdown options (Logs)
  const typeOptions = useMemo(() => {
    return ["ALL", ...Array.from(new Set(rawRows.map(r => r["Type"] || ""))).filter(Boolean).sort()];
  }, [rawRows]);
  const statusOptions = useMemo(() => {
    return ["ALL", ...Array.from(new Set(rawRows.map(r => r["StatusAfter"] || ""))).filter(Boolean).sort()];
  }, [rawRows]);
  const nameOptions = useMemo(() => {
    return ["ALL", ...Array.from(new Set(rawRows.map(r => r["Name"] || ""))).filter(Boolean).sort()];
  }, [rawRows]);

  // Logs search
  const matchesGlobal = (row) => {
    const q = norm(globalQuery);
    if (!q) return true;
    return ALLOWED_COLUMNS.some((c) => norm(row[c]).includes(q));
  };

  // Logs filtering (inc. exact RGP filter)
  const filteredLogs = useMemo(() => {
    return rawRows.filter((r) => {
      if (rgpExactFilter && String(r["RGP No"] || "").trim() !== rgpExactFilter.trim()) return false;
      const okType = filterType === "ALL" || norm(r["Type"]) === norm(filterType);
      const okStatus = filterStatus === "ALL" || norm(r["StatusAfter"]) === norm(filterStatus);
      const okName = filterName === "ALL" || norm(r["Name"]) === norm(filterName);
      const okGlobal = matchesGlobal(r);
      return okType && okStatus && okName && okGlobal;
    });
  }, [rawRows, filterType, filterStatus, filterName, globalQuery, rgpExactFilter]);

  // SUMMARY: group per RGP, compute metrics, keep ONLY fully closed
  const summaryRows = useMemo(() => {
    const groups = new Map();
    for (const r of rawRows) {
      const key = r["RGP No"] || "";
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }

    const today = new Date();
    const out = [];
    for (const [rgpNo, rows] of groups.entries()) {
      const withTs = rows
        .map((r) => ({ r, ts: parseDateLoose(r[dateField]) }))
        .filter((x) => !!x.ts)
        .sort((a, b) => a.ts - b.ts);

      if (!withTs.length) continue;

      const first = withTs[0].ts;
      const last = withTs[withTs.length - 1].ts;

      // last closed timestamp (if any) + final status should be closed
      let closedAt = null;
      for (let i = withTs.length - 1; i >= 0; i--) {
        if (isClosedStatus(withTs[i].r[statusField])) {
          closedAt = withTs[i].ts;
          break;
        }
      }
      const lastStatus = withTs[withTs.length - 1].r[statusField] || "";
      const isClosedNow = !!closedAt && isClosedStatus(lastStatus);
      if (!isClosedNow) continue; // only closed ones

      const entries = rows.length;
      const days = diffDays(first, closedAt || today);

      out.push({
        "RGP No": rgpNo,
        "First Entry": first.toLocaleDateString(),
        "Closed Date": closedAt ? closedAt.toLocaleDateString() : "",
        "Days": days,
        "Last Update": last ? last.toLocaleDateString() : "",
        "Last Status": lastStatus || "",
        "Entries": entries,
        _first: first,
        _closedAt: closedAt,
        _last: last,
      });
    }
    return out;
  }, [rawRows, dateField, statusField]);

  // Columns per view (Actions in summary)
  const columns = useMemo(() => {
    return view === "summary"
      ? ["RGP No", "First Entry", "Closed Date", "Days", "Last Update", "Last Status", "Entries", "Actions"]
      : ALLOWED_COLUMNS;
  }, [view]);

  // Default sorting per view
  useEffect(() => {
    if (view === "summary") {
      setSortKey("Closed Date");
      setSortDir("desc");
    } else {
      setSortKey("Timestamp");
      setSortDir("desc");
    }
    setPage(1);
  }, [view]);

  // Pick list by view & sort
  const currentList = view === "summary" ? summaryRows : filteredLogs;

  const sorted = useMemo(() => {
    let x = [...currentList];
    if (!sortKey) return x;

    return x.sort((a, b) => {
      if (view === "summary") {
        if (sortKey === "Days" || sortKey === "Entries") {
          const res = (Number(a[sortKey]) || 0) - (Number(b[sortKey]) || 0);
          return sortDir === "asc" ? res : -res;
        }
        if (sortKey === "Closed Date" || sortKey === "First Entry" || sortKey === "Last Update") {
          const aDate = sortKey === "Closed Date" ? a._closedAt : sortKey === "First Entry" ? a._first : a._last;
          const bDate = sortKey === "Closed Date" ? b._closedAt : sortKey === "First Entry" ? b._first : b._last;
          const res = (aDate?.getTime() || 0) - (bDate?.getTime() || 0);
          return sortDir === "asc" ? res : -res;
        }
      } else {
        if (sortKey === "RGP No") {
          const aN = parseRgpNo(a["RGP No"]);
          const bN = parseRgpNo(b["RGP No"]);
          const cmpYear = aN.year - bN.year;
          const cmpSeq = aN.seq - bN.seq;
          const res = cmpYear !== 0 ? cmpYear : cmpSeq;
          return sortDir === "asc" ? res : -res;
        }
        if (sortKey === "Timestamp") {
          const ad = parseDateLoose(a["Timestamp"])?.getTime() ?? 0;
          const bd = parseDateLoose(b["Timestamp"])?.getTime() ?? 0;
          return sortDir === "asc" ? ad - bd : bd - ad;
        }
      }
      // default string compare
      return sortDir === "asc"
        ? String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? ""))
        : String(b[sortKey] ?? "").localeCompare(String(a[sortKey] ?? ""));
    });
  }, [currentList, sortKey, sortDir, view]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, page, pageSize]);

  // Sort toggle
  function toggleSort(key) {
    if (key === "Actions") return;
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  // View history for a given RGP
  function viewHistoryFor(rgpNo) {
    setView("logs");
    setRgpExactFilter(rgpNo);
    setFilterType("ALL");
    setFilterStatus("ALL");
    setFilterName("ALL");
    setGlobalQuery("");
    setSortKey("Timestamp");
    setSortDir("asc");
    setPage(1);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Export data (omit Actions col)
  const exportColumns = useMemo(() => columns.filter((c) => c !== "Actions"), [columns]);
  const visibleDataForExport = useMemo(() => {
    return pageRows.map((row) => {
      const o = {};
      exportColumns.forEach((c) => (o[c] = row[c] ?? ""));
      return o;
    });
  }, [pageRows, exportColumns]);

  async function exportExcel() {
    try {
      const XLSX = (await import("xlsx")).default || (await import("xlsx"));
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(visibleDataForExport);
      XLSX.utils.book_append_sheet(wb, ws, view === "summary" ? "RGP Closed Summary" : "RGP Logs (Filtered)");
      const filename = `${view === "summary" ? "RGP_Closed_Summary" : "RGP_Logs_Filtered"}_${formatTodayStamp()}.xlsx`;
      XLSX.writeFile(wb, filename);
    } catch (err) {
      const csv = [
        exportColumns.join(","),
        ...visibleDataForExport.map((r) =>
          exportColumns
            .map((c) => {
              const v = String(r[c] ?? "");
              const needsQuote = /[",\n]/.test(v);
              return needsQuote ? `"${v.replace(/"/g, '""')}"` : v;
            })
            .join(",")
        ),
      ].join("\n");
      downloadBlob(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
        `${view === "summary" ? "RGP_Closed_Summary" : "RGP_Logs_Filtered"}_${formatTodayStamp()}.csv`
      );
      alert("XLSX export library not found. Exported CSV instead.");
    }
  }

  async function exportPDF() {
    try {
      const jsPDFModule = await import("jspdf");
      const autoTableModule = await import("jspdf-autotable");
      const jsPDF = jsPDFModule.jsPDF || jsPDFModule.default || jsPDFModule;

      const cols = exportColumns;
      const doc = new jsPDF({ orientation: cols.length > 8 ? "landscape" : "portrait", unit: "pt", format: "A3" });

      const margin = 40, inner = 18;
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();

      const BORDER = [221, 226, 233];
      const TITLE_BG = [14, 165, 233];
      const HEAD_BG = [241, 245, 249];
      const ALT_ROW_BG = [250, 250, 250];
      const GRID = [226, 232, 240];
      const TEXT_MUTED = [100, 116, 139];

      doc.setProperties({
        title: view === "summary" ? "RGP Closed Summary" : "RGP Logs (Filtered)",
        subject: "RGP export",
        keywords: "RGP, report, export, PDF",
        creator: "RGP Dashboard",
      });

      const drawChrome = (pn, total) => {
        doc.setDrawColor(...BORDER); doc.setLineWidth(1);
        doc.roundedRect(margin / 2, margin / 2, pageW - margin, pageH - margin, 8, 8);

        doc.setFillColor(...TITLE_BG); doc.setTextColor(255, 255, 255);
        doc.rect(margin, margin, pageW - margin * 2, 56, "F");

        doc.setFontSize(18); doc.setFont("helvetica", "bold");
        doc.text(
          view === "summary" ? "RGP Closed Summary — One Row per RGP" : "RGP Logs — Filtered View",
          margin + inner, margin + 22 + inner / 2
        );

        doc.setFontSize(9); doc.setTextColor(...TEXT_MUTED);
        const footerY = pageH - margin + 18;
        doc.text(`Page ${pn} / ${total}`, pageW - margin, footerY, { align: "right" });
      };

      const head = [cols.map(pdfSafe)];
      const body = pageRows.map((r) => cols.map((c) => pdfSafe(r[c])));
      drawChrome(1, 1);

      autoTableModule.default(doc, {
        head,
        body,
        startY: margin + 56 + 18,
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 6, lineColor: GRID, lineWidth: 0.6, valign: "top" },
        headStyles: { fillColor: HEAD_BG, textColor: 0, fontStyle: "bold", lineColor: GRID, lineWidth: 0.8 },
        alternateRowStyles: { fillColor: ALT_ROW_BG },
        margin: { left: margin + inner, right: margin + inner },
        didAddPage: () => {
          const p = doc.internal.getNumberOfPages();
          drawChrome(p, p);
        },
      });

      const totalPages = doc.internal.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) { doc.setPage(p); drawChrome(p, totalPages); }

      const filename = `${view === "summary" ? "RGP_Closed_Summary" : "RGP_Logs_Filtered"}_${formatTodayStamp()}.pdf`;
      doc.save(filename);
    } catch (err) {
      alert("PDF export libraries (jspdf, jspdf-autotable) not found. Please add them or use Excel/CSV export.");
    }
  }

  function resetFilters() {
    setFilterType("ALL");
    setFilterStatus("ALL");
    setFilterName("ALL");
    setGlobalQuery("");
    setRgpExactFilter("");
    setPage(1);
  }

  /* ────────────────────────────────────────────────────────────────────────
     UI
  ──────────────────────────────────────────────────────────────────────── */
  return (
    <div className="rgp-shell">
      <style jsx>{`
        .rgp-shell { width: 100%; max-width: 2200px; margin: 0 auto; padding: 16px clamp(16px, 3vw, 24px); font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif; color: #0f172a; background: linear-gradient(135deg, #ffffff 0%, #f1f5f9 100%); min-height: 100vh; }
        .rgp-header { position: sticky; top: 0; z-index: 10; display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 16px; padding: 20px 24px; margin-bottom: 20px; border: 1px solid rgba(255, 255, 255, 0.1); background: linear-gradient(135deg, #003f88 0%, #00296b 100%); color: #ffffff; border-radius: 16px; box-shadow: 0 10px 30px rgba(0, 41, 107, 0.15); }
        .rgp-title { margin: 0; font-weight: 800; letter-spacing: -0.02em; color: #ffffff !important; -webkit-text-fill-color: #ffffff !important; font-size: clamp(20px, 2.5vw, 28px); }
        .rgp-actions { display: flex; gap: 10px; flex-wrap: wrap; }
        .btn { display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 18px; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.25); background: rgba(255, 255, 255, 0.15); font-size: 13px; font-weight: 600; color: #ffffff; cursor: pointer; transition: all 0.2s ease; position: relative; overflow: hidden; }
        .btn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.3); transform: translateY(-1px); color: #ffffff; border-color: rgba(255, 255, 255, 0.4); }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-primary { background: #ffffff !important; color: #003f88 !important; border-color: #ffffff !important; font-weight: 700 !important; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); }
        .btn-primary:hover { background: #f8fafc !important; color: #00296b !important; }
        .view-toggle { background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25); border-radius: 10px; padding: 4px; display: inline-flex; gap: 4px; }
        .view-toggle button { height: 32px; padding: 0 12px; border-radius: 8px; border: 1px solid transparent; font-weight: 700; color: #ffffff; background: transparent; cursor: pointer; }
        .view-toggle .active { background: #ffffff; color: #003f88; }
        .table-wrap { overflow: auto; border: 1px solid rgba(255, 255, 255, 0.3); border-radius: 18px; background: rgba(255, 255, 255, 0.7); box-shadow: 0 8px 32px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.6); backdrop-filter: blur(12px); position: relative; }
        table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13px; background: transparent; }
        thead th { position: sticky; top: 0; z-index: 5; background: linear-gradient(135deg, #0b4681 0%, #054688 100%); color: #ffffff; text-align: left; font-weight: 700; padding: 16px 14px; border: 1.5px solid #e2e8f0; white-space: nowrap; cursor: pointer; user-select: none; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
        tbody td { padding: 14px; border: 1px solid #f1f5f9; white-space: nowrap; color: #000000; font-weight: 500; }
        .status-pill { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; border: 1px solid; }
        .status-active { background: linear-gradient(135deg, #ecfeff 0%, #cffafe 100%); color: #0e7490; border-color: rgba(6, 182, 212, 0.3); }
        .status-partial { background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%); color: #9a3412; border-color: rgba(251, 146, 60, 0.3); }
        .pagination { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 20px; padding: 16px; background: rgba(255, 255, 255, 0.7); border-radius: 16px; }
        .filters { display: grid; grid-template-columns: 1fr 1fr 1fr 2fr auto; gap: 10px; padding: 12px 14px; background: rgba(255,255,255,0.8); border: 1px solid #e2e8f0; border-radius: 14px; margin-bottom: 16px; }
        .filter-field { display:flex; flex-direction:column; gap:6px; }
        .filter-label { font-size: 12px; font-weight: 700; color:#334155; letter-spacing: .02em; }
        .select, .search { height: 40px; border-radius: 10px; border: 1px solid #e2e8f0; background: #ffffff; padding: 0 12px; font-weight: 600; color: #334155; }
        .search { width: 100%; }
        .chip { display:inline-flex; align-items:center; gap:6px; padding:4px 12px; background:rgba(255,255,255,0.15); color:#ffffff; border:1px solid rgba(255,255,255,0.25); border-radius:20px; font-weight:600; font-size:12px; }
        .chips { display:flex; gap:8px; flex-wrap:wrap; margin-top:6px; }
        .page-btn { height: 36px; padding: 0 16px; border-radius: 10px; border: 1px solid #e2e8f0; background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%); cursor: pointer; font-weight: 600; color: #475569; }
        @media (max-width: 768px) {
          .rgp-shell { padding: 10px 8px; }
          .rgp-header { display: flex; flex-direction: column; align-items: stretch; gap: 12px; padding: 14px; border-radius: 14px; }
          .rgp-title { font-size: 1.35rem; }
          .rgp-actions { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; width: 100%; }
          .view-toggle { grid-column: 1 / -1; width: 100%; display: flex; }
          .view-toggle button { flex: 1; }
          .btn { justify-content: center; height: 38px; font-size: 12px; padding: 0 10px; }
          .filters { grid-template-columns: 1fr; gap: 8px; padding: 12px; }
          .pagination { flex-direction: column; align-items: center; gap: 10px; padding: 12px; }
        }
      `}</style>

      {/* Header */}
      <div className="rgp-header">
        <div>
          <h2 className="rgp-title">
            {view === "summary" ? "📋 RGP Closed Summary — One Row per RGP" : "📋 RGP History — All Records"}
          </h2>
          <div className="chips">
            {view === "logs" ? (
              <>
                {rgpExactFilter && <span className="chip">📌 RGP: {rgpExactFilter}</span>}
                <span className="chip">🎯 Filters: Type {filterType}, Status {filterStatus}, Name {filterName}</span>
                {globalQuery ? <span className="chip">🔎 “{globalQuery}”</span> : <span className="chip">🔎 No global search</span>}
              </>
            ) : (
              <span className="chip">✅ Showing only Fully Closed / Complete Received RGPs</span>
            )}
          </div>
        </div>
        <div className="rgp-actions">
          <div className="view-toggle">
            <button
              className={view === "summary" ? "active" : ""}
              onClick={() => { setView("summary"); setSortKey("Closed Date"); setSortDir("desc"); setPage(1); }}
              title="Show closed RGP summary"
            >
              Summary
            </button>
            <button
              className={view === "logs" ? "active" : ""}
              onClick={() => { setView("logs"); setSortKey("Timestamp"); setSortDir("desc"); setPage(1); }}
              title="Show detailed logs"
            >
              Logs
            </button>
          </div>

          <button className="btn" type="button" onClick={handleBack} title="Go Back">
            <span>⬅️</span> Back
          </button>
          <button className="btn" onClick={fetchRows} disabled={loading} title="Refresh">
            <span>{loading ? "⏳" : "🔄"}</span> {loading ? "Refreshing…" : "Refresh"}
          </button>
          {view === "logs" && (
            <button className="btn" onClick={resetFilters} title="Clear filters">♻️ Reset Filters</button>
          )}
          <button className="btn" onClick={exportExcel} title="Download Excel"><span>📊</span> Excel</button>
          <button className="btn btn-primary" onClick={exportPDF} title="Download PDF"><span>📄</span> PDF Report</button>
        </div>
      </div>

      {/* Filters (Logs view only) */}
      {view === "logs" && (
        <div className="filters" role="region" aria-label="RGP table filters">
          <div className="filter-field">
            <label className="filter-label">Type</label>
            <select className="select" value={filterType} onChange={(e) => { setFilterType(e.target.value); setPage(1); }}>
              {typeOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>

          <div className="filter-field">
            <label className="filter-label">StatusAfter</label>
            <select className="select" value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}>
              {statusOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>

          <div className="filter-field">
            <label className="filter-label">Name</label>
            <select className="select" value={filterName} onChange={(e) => { setFilterName(e.target.value); setPage(1); }}>
              {nameOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>

          <div className="filter-field">
            <label className="filter-label">Global Search</label>
            <input className="search" type="search" placeholder="Search all columns…" value={globalQuery}
                   onChange={(e) => { setGlobalQuery(e.target.value); setPage(1); }} />
          </div>

          <div className="filter-field" style={{ alignSelf: "end" }}>
            <button className="btn" onClick={resetFilters} title="Clear all filters">Clear</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((k) => (
                <th key={k} onClick={() => toggleSort(k)} title={k === "Actions" ? "" : "Click to sort"}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {k}
                    {sortKey === k && k !== "Actions" && (
                      <span style={{ fontSize: 10, opacity: 0.7 }}>{sortDir === "asc" ? "⬆️" : "⬇️"}</span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length || 1} style={{ padding: 32, textAlign: "center", opacity: 0.7 }}>
                  ⏳ Loading RGP Data…
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length || 1} style={{ padding: 32, textAlign: "center", opacity: 0.7 }}>
                  {view === "summary" ? "📭 No closed RGPs found." : "📭 No records match current filters."}
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => (
                <tr key={idx}>
                  {columns.map((k) => {
                    if (view === "summary" && k === "Actions") {
                      return (
                        <td key={k}>
                          <button className="btn" onClick={() => viewHistoryFor(row["RGP No"])} title="View complete history for this RGP">
                            View History
                          </button>
                        </td>
                      );
                    }
                    if (view === "logs" && k === "StatusAfter") {
                      const v = String(row[k] || "");
                      const isActive = v.toLowerCase() === "active";
                      const isPartial = v.toLowerCase() === "partial";
                      return (
                        <td key={k}>
                          <span className={`status-pill ${isActive ? "status-active" : isPartial ? "status-partial" : ""}`}>
                            {isActive ? "🟢" : isPartial ? "🟡" : "⚪️"} {v || "-"}
                          </span>
                        </td>
                      );
                    }
                    return <td key={k}>{String(row[k] ?? "")}</td>;
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="pagination">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span>📊</span>
          <span>
            <b>{sorted.length}</b> {view === "summary" ? "closed RGP" : "item"}
            {sorted.length === 1 ? "" : "s"} {view === "summary" ? "" : "after filters"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="page-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>◀️ Prev</button>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            Page <b>{page}</b> of {totalPages}
          </span>
          <button className="page-btn" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next ▶️</button>
        </div>
      </div>
    </div>
  );
}
