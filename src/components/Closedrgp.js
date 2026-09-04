import React, { useEffect, useMemo, useRef, useState } from "react";

import { GOOGLE_API_KEY, DEFAULT_RGP_SPREADSHEET_IDS } from "../config/apiConfig";

/* ──────────────────────────────────────────────────────────────────────────
   Config
────────────────────────────────────────────────────────────────────────── */
const HARDCODED_API_KEY = GOOGLE_API_KEY;
const DEFAULT_SPREADSHEET_IDS = DEFAULT_RGP_SPREADSHEET_IDS;
const DEFAULT_RANGE = "Fabric_RGP!A1:R"; // includes header row at A1

// ⛔️ Never display/export (case-insensitive; includes your VVEHICLE NO. typo)
const HIDDEN_COLUMNS = [
  "Created At",
  "Updated At",
  "Returned Quantity",
  "Returned Qty",
  "Vehicle No",
  "Vehicle No.",
  "Vehicle Number",
  "VVEHICLE NO."
];
const HIDDEN_COLUMNS_LC = HIDDEN_COLUMNS.map((s) =>
  String(s).toLowerCase().trim()
);
const isHidden = (key) =>
  HIDDEN_COLUMNS_LC.includes(String(key || "").toLowerCase().trim());

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
  return rows.map((r) => {
    const obj = {};
    header.forEach((h, i) => {
      obj[h] = r[i] ?? "";
    });
    return obj;
  });
}

function parseDateLoose(s) {
  if (!s) return null;
  const str = String(s).trim();

  // 1) Explicit YYYY-MM-DD -> parse in LOCAL time (avoid ISO UTC shift)
  const ymd = /^(\d{4})-(\d{1,2})-(\d{1,2})$/; // e.g., 2025-10-13
  let m = str.match(ymd);
  if (m) {
    const y = +m[1], mo = +m[2], d = +m[3];
    const dt = new Date(y, mo - 1, d);
    return isNaN(dt.getTime()) ? null : dt;
  }

  // 2) Slash formats: dd/mm/yyyy OR mm/dd/yyyy (disambiguate by >12 rule)
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/; // e.g., 10/13/2025 or 13/10/2025
  m = str.match(slash);
  if (m) {
    let a = +m[1], b = +m[2], y = +m[3];
    let d, mo;
    if (a > 12 && b <= 12) {         // 13/10/2025 -> dd/mm/yyyy
      d = a; mo = b;
    } else if (b > 12 && a <= 12) {  // 10/13/2025 -> mm/dd/yyyy
      mo = a; d = b;
    } else {
      // both <= 12: default to dd/mm/yyyy (common in your sheets)
      d = a; mo = b;
    }
    const dt = new Date(y, mo - 1, d);
    return isNaN(dt.getTime()) ? null : dt;
  }

  // 3) Dash formats: dd-mm-yyyy OR mm-dd-yyyy (use the same >12 rule)
  const dash = /^(\d{1,2})-(\d{1,2})-(\d{4})$/; // e.g., 13-10-2025 or 10-13-2025
  m = str.match(dash);
  if (m) {
    let a = +m[1], b = +m[2], y = +m[3];
    let d, mo;
    if (a > 12 && b <= 12) {
      d = a; mo = b;
    } else if (b > 12 && a <= 12) {
      mo = a; d = b;
    } else {
      d = a; mo = b; // default dd-mm-yyyy
    }
    const dt = new Date(y, mo - 1, d);
    return isNaN(dt.getTime()) ? null : dt;
  }

  // 4) Fallback: try native Date (last resort; may interpret as US)
  const dt = new Date(str);
  return isNaN(dt.getTime()) ? null : dt;
}


/** Parse RGP numbers like "RGP/2025/0002" (or "RGP-2025-2", "2025/2", etc.) into {year, seq}. */
function parseRgpNo(value) {
  if (!value) return { year: 0, seq: 0 };
  const s = String(value);
  const nums = s.match(/\d+/g) || [];
  if (nums.length >= 2) {
    const year = parseInt(nums[nums.length - 2], 10) || 0;
    const seq = parseInt(nums[nums.length - 1], 10) || 0;
    return { year, seq };
  }
  if (nums.length === 1) {
    return { year: 0, seq: parseInt(nums[0], 10) || 0 };
  }
  return { year: 0, seq: 0 };
}

/** Try to find the RGP number column name from sheet headers. */
function resolveRgpNoKey(keys = []) {
  const lc = (s) => String(s || "").toLowerCase().trim();
  const direct = keys.find((k) =>
    ["rgp no", "rgp no.", "rgp number", "rgp#", "rgp"].includes(lc(k))
  );
  if (direct) return direct;
  const fuzzy = keys.find(
    (k) =>
      lc(k).includes("rgp") &&
      (lc(k).includes("no") || lc(k).includes("number") || lc(k).includes("#"))
  );
  return fuzzy || "RGP No";
}

/** Find the Expected Return Date header with a few fallbacks (and common typo). */
function resolveExpectedReturnKey(keys = []) {
  const lc = (s) => String(s || "").toLowerCase().trim();
  const candidates = [
    "Expected Return Date",
    "Expected Return",
    "Expected Date",
    "Expect Return Date",
    "Expected Retun Date", // common typo
  ];
  const exact = keys.find((k) => candidates.map(lc).includes(lc(k)));
  if (exact) return exact;
  const fuzzy = keys.find((k) => lc(k).includes("expected") && lc(k).includes("return"));
  return fuzzy || "Expected Return Date";
}

/** Whole-day difference end - start (midnight-to-midnight), returns integer; empty if either missing. */
function daysDiff(start, end) {
  const s = parseDateLoose(start);
  const e = parseDateLoose(end);
  if (!s || !e) return "";
  const s0 = new Date(s.getFullYear(), s.getMonth(), s.getDate());
  const e0 = new Date(e.getFullYear(), e.getMonth(), e.getDate());
  const MS = 24 * 60 * 60 * 1000;
  return Math.round((e0 - s0) / MS); // can be negative if overdue/early
}

/** Strict status filter. Keeps only pending rows based on Status or missing return-like dates. */
function isRowPending({ row, statusField, pendingValues, returnDateField }) {
  if (statusField && Object.prototype.hasOwnProperty.call(row, statusField)) {
    const v = String(row[statusField] ?? "").trim().toLowerCase();
    const pending = pendingValues
      .map((x) => String(x).trim().toLowerCase())
      .includes(v);
    if (pending) return true;
    // If Status exists and isn't pending, treat as not pending:
    return false;
  }
  const fallbackFields = [
    returnDateField,
    "Return Date",
    "Receive Date",
    "Close Date",
    "Received"
  ].filter(Boolean);
  for (const f of fallbackFields) {
    if (f in row) {
      const val = String(row[f] ?? "").trim();
      if (!val) return true;
    }
  }
  return false;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatTodayStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(
    d.getHours()
  )}-${pad(d.getMinutes())}`;
}

function displayLabel(key, { dateField, EXPECTED_RETURN_KEY, RETURN_DATE_KEY }) {
  if (!key) return key;
  if (key === dateField) return "Material Out Date";
  if (key === EXPECTED_RETURN_KEY) return "Expected Material In Date";
  if (key === RETURN_DATE_KEY) return "Material IN Date";
  if (key === "Close Date") return "Closed On"; // UI/Excel: nicer name
  return key; // default: unchanged
}

/** Pretty, compact, single-line headers for PDF only */
function pdfHeaderLabel(key, ctx) {
  const label = displayLabel(key, ctx);
  const map = {
    "Expected Material In Date": "Expected IN Date",
    "Material IN Date": "Material IN Date",
    "Quantity Sent": "Qty Sent",
    "Item Description": "Item Description",
    "Vendor / Party": "Vendor / Party",
    "Authorized By": "Authorized By",
    "RGP No": "RGP No",
    "RGP Type": "RGP Type",
    "Est Days": "Est Days",
    "Actual Days": "Actual Days",
    "Closed On": "Closed On",
    "Close Date": "Closed On",
  };
  const chosen = map[label] || label;
  // Prevent ugly line breaks by using NBSP for spaces in headers
  return chosen.replace(/ /g, "\u00A0");
}


/* ──────────────────────────────────────────────────────────────────────────
   Component
────────────────────────────────────────────────────────────────────────── */
export default function ClosedRgp({
  spreadsheetId,
  apiKey = HARDCODED_API_KEY,
  range = DEFAULT_RANGE,
  statusField = "Status",
  pendingValues = ["Active", "Partial"],
  returnDateField = "Return Date",
  departmentField = "Department",
  dateField = "Date",
  pageSize = 10,
  onBack,
  homeHref
}) {
  const [rawRows, setRawRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // UI state
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // sort state
  const [sortKey, setSortKey] = useState(""); // will become actual RGP No key
  const [sortDir, setSortDir] = useState("desc");

  const [page, setPage] = useState(1);
  const abortRef = useRef(null);

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
            console.warn(`Failed to load sheet ${id}:`, e);
            return [];
          }
        })
      );
      const combined = results.flat();
      const seen = new Set();
      const uniqueRows = combined.filter((r) => {
        const rgpVal = r["RGP No"] || r["RGP NO"] || r["rgpNo"] || "";
        if (!rgpVal) return true;
        const key = String(rgpVal).trim().toUpperCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (uniqueRows.length > 0) {
        setRawRows(uniqueRows);
        try {
          localStorage.setItem("rgp_cache_Fabric_RGP", JSON.stringify(uniqueRows));
        } catch (_) {}
      } else {
        try {
          const cached = JSON.parse(localStorage.getItem("rgp_cache_Fabric_RGP") || "[]");
          if (cached.length > 0) setRawRows(cached);
        } catch (_) {}
      }
    } catch (err) {
      if (err?.name === "AbortError") return;
      try {
        const cached = JSON.parse(localStorage.getItem("rgp_cache_Fabric_RGP") || "[]");
        if (cached.length > 0) {
          setRawRows(cached);
          return;
        }
      } catch (_) {}
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
      window.history.back();
      return;
    }
    if (homeHref) {
      window.location.href = homeHref;
    }
  }

  // Resolve headers and keys after data loads
  const allKeys = useMemo(() => Object.keys(rawRows[0] || {}), [rawRows]);
  const RGP_NO_KEY = useMemo(() => resolveRgpNoKey(allKeys), [allKeys]);
  const EXPECTED_RETURN_KEY = useMemo(() => resolveExpectedReturnKey(allKeys), [allKeys]);
  const RETURN_DATE_KEY = returnDateField; // default "Return Date"

  // Set default sort key to actual RGP No header when known
  useEffect(() => {
    if (!sortKey && RGP_NO_KEY) setSortKey(RGP_NO_KEY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [RGP_NO_KEY]);

  // Distinct departments
  const departments = useMemo(() => {
    const set = new Set();
    rawRows.forEach((r) => {
      if (departmentField && r[departmentField]) set.add(r[departmentField]);
    });
    return ["", ...Array.from(set).sort()];
  }, [rawRows, departmentField]);

  // Only Closed rows; also augment with computed fields
  const closedRows = useMemo(() => {
    return rawRows
      .filter((row) => {
        const v = String(row[statusField] ?? "").trim().toLowerCase();
        return v === "closed";
      })
      .map((row) => {
        const est = daysDiff(row[dateField], row[EXPECTED_RETURN_KEY]);
        const actual = daysDiff(row[dateField], row[RETURN_DATE_KEY]);
        return {
          ...row,
          "Est Days": est === "" ? "" : String(est),
          "Actual Days": actual === "" ? "" : String(actual),
        };
      });
  }, [rawRows, statusField, dateField, EXPECTED_RETURN_KEY, RETURN_DATE_KEY]);

  // Filtered rows
  const filtered = useMemo(() => {
    let x = closedRows;

    if (search.trim()) {
      const q = search.toLowerCase();
      x = x.filter((r) =>
        Object.entries(r)
          .filter(([k]) => !isHidden(k))
          .some(([, v]) => String(v).toLowerCase().includes(q))
      );
    }

    if (dept && departmentField) {
      x = x.filter((r) => String(r[departmentField] || "") === dept);
    }

    // Date range (by "Date" field)
    if (dateField) {
      const from = dateFrom ? new Date(dateFrom) : null;
      const to = dateTo ? new Date(dateTo) : null;
      if (from || to) {
        x = x.filter((r) => {
          const d = parseDateLoose(r[dateField]);
          if (!d) return false;
          if (from && d < from) return false;
          if (to) {
            const endDay = new Date(to);
            endDay.setHours(23, 59, 59, 999);
            if (d > endDay) return false;
          }
          return true;
        });
      }
    }

    // Sort
    if (sortKey) {
      x = [...x].sort((a, b) => {
        const av = a[sortKey] ?? "";
        const bv = b[sortKey] ?? "";

        if (sortKey === RGP_NO_KEY) {
          const aN = parseRgpNo(av);
          const bN = parseRgpNo(bv);
          const cmpYear = aN.year - bN.year;
          const cmpSeq = aN.seq - bN.seq;
          const res = cmpYear !== 0 ? cmpYear : cmpSeq;
          return sortDir === "asc" ? res : -res;
        }

        if (sortKey === dateField) {
          const ad = parseDateLoose(av)?.getTime() ?? 0;
          const bd = parseDateLoose(bv)?.getTime() ?? 0;
          return sortDir === "asc" ? ad - bd : bd - ad;
        }

        if (sortKey === "Est Days" || sortKey === "Actual Days") {
          const an = parseInt(String(av || "").trim(), 10);
          const bn = parseInt(String(bv || "").trim(), 10);
          const aNum = isNaN(an) ? Number.NEGATIVE_INFINITY : an;
          const bNum = isNaN(bn) ? Number.NEGATIVE_INFINITY : bn;
          return sortDir === "asc" ? aNum - bNum : bNum - aNum;
        }

        return sortDir === "asc"
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av));
      });
    }

    return x;
  }, [
    closedRows,
    search,
    dept,
    departmentField,
    dateField,
    dateFrom,
    dateTo,
    sortKey,
    sortDir,
    RGP_NO_KEY
  ]);

  // Column order (excluding hidden; preserve your preferred order)
  const columns = useMemo(() => {
    const keys = Object.keys(filtered[0] || {}).filter((k) => !isHidden(k));
    if (keys.length === 0) return [];

    const preferred = [
      RGP_NO_KEY, // detected key
      "Date",
      "RGP Type",
      "Department",
      "Vendor / Party",
      "Purpose",
      "Item Description",
      "Quantity Sent",
      "UOM",
      EXPECTED_RETURN_KEY,   // resolved header
      "Est Days",            // computed
      "Authorized By",
      RETURN_DATE_KEY,       // resolved header
      "Actual Days",         // computed
      "Close Date",          // ⬅️ ensure Close Date is included if present
      "Remarks",
      "Status"
    ].filter((k) => k && keys.includes(k) && !isHidden(k));

    const extras = keys.filter((k) => !preferred.includes(k));
    return [...preferred, ...extras];
  }, [filtered, RGP_NO_KEY, EXPECTED_RETURN_KEY, RETURN_DATE_KEY]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  // Export helpers — they use filtered rows and **visible** columns only
  const visibleDataForExport = useMemo(() => {
    return filtered.map((row) => {
      const o = {};
      columns.forEach((c) => (o[c] = row[c] ?? ""));
      return o;
    });
  }, [filtered, columns]);

  async function exportExcel() {
    try {
      const XLSX = (await import("xlsx")).default || (await import("xlsx"));
      const wb = XLSX.utils.book_new();
      const headerRow = columns.map((c) =>
        displayLabel(c, { dateField, EXPECTED_RETURN_KEY, RETURN_DATE_KEY })
      );
      const dataRows = visibleDataForExport.map((r) => columns.map((c) => r[c] ?? ""));
      const aoa = [headerRow, ...dataRows];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      XLSX.utils.book_append_sheet(wb, ws, "Closed RGP");
      const filename = `Closed_RGP_${formatTodayStamp()}.xlsx`;
      XLSX.writeFile(wb, filename);
    } catch (err) {
      console.error(err);
      // graceful fallback: CSV
      const csv = [
        columns
          .map((c) =>
            displayLabel(c, { dateField, EXPECTED_RETURN_KEY, RETURN_DATE_KEY })
          )
          .join(","),
        ...visibleDataForExport.map((r) =>
          columns
            .map((c) => {
              const v = String(r[c] ?? "");
              const needsQuote = /[",\n]/.test(v);
              return needsQuote ? `"${v.replace(/"/g, '""')}"` : v;
            })
            .join(",")
        )
      ].join("\n");
      downloadBlob(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
        `Closed_RGP_${formatTodayStamp()}.csv`
      );
      alert("XLSX export library not found. Exported CSV instead (opens in Excel).");
    }
  }

  // Replace unsupported Unicode with safe ASCII (for PDF)
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
    s = s.replace(/[^\x00-\x7E]/g, "");
    s = s.replace(/\s+/g, " ").trim();
    return s;
  }

  async function exportPDF() {
  try {
    const jsPDFModule = await import("jspdf");
    const autoTableModule = await import("jspdf-autotable");
    const jsPDF = jsPDFModule.jsPDF || jsPDFModule.default || jsPDFModule;

    // Landscape A3 gives us the best shot at fitting many columns
    const orientation = "landscape";
    const doc = new jsPDF({ orientation, unit: "pt", format: "A3" });

    const margin = 40;
    const inner = 18;
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    // Colors
    const BORDER = [221, 226, 233];
    const TITLE_BG = [14, 165, 233];
    const SUBTITLE = [71, 85, 105];
    const HEAD_BG = [245, 248, 252];
    const ALT_ROW_BG = [252, 253, 255];
    const GRID = [230, 235, 241];
    const TEXT_MUTED = [100, 116, 139];

    doc.setProperties({
      title: "Closed RGP Report",
      subject: "Closed RGP export",
      keywords: "RGP, report, export, PDF",
      creator: "Closed RGP Dashboard",
    });

    // Header / Footer
    const drawPageChrome = (pageNumber, totalPages) => {
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(1);
      doc.roundedRect(margin / 2, margin / 2, pageW - margin, pageH - margin, 10, 10);

      const titleH = 56;
      doc.setFillColor(...TITLE_BG);
      doc.setTextColor(255, 255, 255);
      doc.rect(margin, margin, pageW - margin * 2, titleH, "F");

      doc.setFontSize(20);
      doc.setFont("helvetica", "bold");
      doc.text("Closed RGP", margin + inner, margin + 24 + inner / 2);

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      const exportedAt = pdfSafe(new Date().toLocaleString());
      doc.text(`Exported: ${exportedAt}`, pageW - margin - inner, margin + 24 + inner / 2, { align: "right" });

      doc.setFontSize(9);
      doc.setTextColor(...TEXT_MUTED);
      const footerY = pageH - margin + 18;
      doc.text(`Page ${pageNumber} / ${totalPages}`, pageW - margin, footerY, { align: "right" });
      doc.text("Generated by Closed RGP Dashboard", margin, footerY);
    };

    // Filter ribbon
    const filtersY = margin + 56 + 18;
    const filtersBits = [];
    if (typeof search === "string" && search.trim()) filtersBits.push(`Search: "${pdfSafe(search.trim())}"`);
    if (dept) filtersBits.push(`Department: ${pdfSafe(dept)}`);
    if (dateFrom || dateTo) filtersBits.push(`Date: ${pdfSafe(dateFrom || "...")} → ${pdfSafe(dateTo || "...")}`);
    if (sortKey)
      filtersBits.push(
        `Sort: ${pdfSafe(
          displayLabel(sortKey, { dateField, EXPECTED_RETURN_KEY, RETURN_DATE_KEY })
        )} (${sortDir === "asc" ? "A→Z" : "Z→A"})`
      );
    const filtersText = pdfSafe(filtersBits.join("  •  "));

    // HEAD & BODY (with safe labels)
    const ctx = { dateField, EXPECTED_RETURN_KEY, RETURN_DATE_KEY };
    const headerLabels = columns.map((c) => pdfHeaderLabel(c, ctx));
    const head = [headerLabels];

    const body = visibleDataForExport.map((r) =>
      columns.map((c) => pdfSafe(r[c]))
    );

    // ======= KEY CHANGE: Dynamic width allocation + wrapping =======

    // Available table width inside the chrome
    const availableWidth = pageW - (margin + inner) * 2;

    // Assign "weights" per column (wide fields get more width)
    const nameOf = (label) => pdfHeaderLabel(label, ctx);
    const labelSet = new Set(headerLabels);

    // Helper to check presence by friendly label or original key
    const hasCol = (label) => labelSet.has(nameOf(label)) || labelSet.has(label);

    // Weight defaults
    const weights = {};
    const setW = (label, w) => {
      const key = headerLabels.indexOf(nameOf(label)) >= 0 ? nameOf(label) : label;
      if (labelSet.has(key)) weights[key] = w;
    };

    // Narrow
    setW(RGP_NO_KEY, 1.2);
    setW("Date", 1);
    setW("RGP Type", 1);
    setW("Department", 1.1);
    setW("UOM", 0.8);
    setW("Est Days", 0.8);
    setW("Actual Days", 0.8);
    setW("Status", 1);
    setW("Authorized By", 1);
    setW("Qty Sent", 1); // after mapping, header becomes "Qty Sent"
    setW("Quantity Sent", 1);

    // Medium
    setW("Vendor / Party", 1.4);
    setW(EXPECTED_RETURN_KEY, 1.2);
    setW(RETURN_DATE_KEY, 1.2);
    setW("Close Date", 1.2);
    setW("Closed On", 1.2);
    setW("Purpose", 1.2);

    // Wide
    setW("Item Description", 1.4);
    setW("Remarks", 1.3);

    // Any column not listed above gets a reasonable default
    headerLabels.forEach((h) => {
      if (weights[h] == null) weights[h] = 1.2;
    });

    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    const minWidth = 50; // never shrink columns below this (pt)
    const columnStyles = {};
    headerLabels.forEach((h, idx) => {
      let w = (weights[h] / totalWeight) * availableWidth;
      if (w < minWidth) w = minWidth;
      columnStyles[idx] = {
        cellWidth: w,        // CONSTRAINED width per column
        overflow: "linebreak"
      };
    });

    // First page chrome
    drawPageChrome(1, 1);

    // Optional filters ribbon
    let afterFiltersY = filtersY;
    if (filtersText) {
      doc.setFontSize(10);
      doc.setTextColor(...SUBTITLE);
      doc.setFont("helvetica", "normal");
      const wrapped = doc.splitTextToSize(filtersText, pageW - (margin + inner) * 2);
      doc.text(wrapped, margin + inner, filtersY);

      const lastLineY = filtersY + wrapped.length * 12;
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.6);
      doc.line(margin + inner, lastLineY + 6, pageW - margin - inner, lastLineY + 6);
      afterFiltersY = lastLineY + 12;
    }

    // Build the table
    autoTableModule.default(doc, {
      head,
      body,
      startY: afterFiltersY + 16,
      theme: "grid",

      // >>> Global WRAP + tighter sizing so table never spills over <<<
      tableWidth: availableWidth,     // hard cap to printable area
      styles: {
        fontSize: 8.5,                // slightly smaller text
        cellPadding: 4,               // tighter padding = more content per line
        overflow: "linebreak",        // wrap body cells
        cellWidth: "wrap",            // allow wrapping
        lineColor: GRID,
        lineWidth: 0.6,
        valign: "top",
      },
      headStyles: {
        fillColor: HEAD_BG,
        textColor: 20,
        fontStyle: "bold",
        lineColor: GRID,
        lineWidth: 0.8,
        halign: "center",
        overflow: "linebreak",        // wrap header cells too
        cellWidth: "wrap",
      },
      alternateRowStyles: { fillColor: ALT_ROW_BG },
      columnStyles,                   // constrained per-column widths
      margin: { left: margin + inner, right: margin + inner },

      didDrawPage: () => {
        const currentPage = doc.internal.getNumberOfPages();
        drawPageChrome(currentPage, currentPage);
      },
    });

    const filename = `Closed_RGP_${formatTodayStamp()}.pdf`;
    doc.save(filename);
  } catch (err) {
    console.error(err);
    alert("PDF export libraries (jspdf, jspdf-autotable) not found. Please add them or use Excel/CSV export.");
  }
}

  /* ────────────────────────────────────────────────────────────────────────
     UI
  ──────────────────────────────────────────────────────────────────────── */
  return (
    <div className="rgp-shell">
      <style jsx>{`
        .rgp-shell {
          width: 100%;
          max-width: 2200px;
          margin: 0 auto;
          padding: 16px clamp(16px, 3vw, 24px);
          font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif;
          color: #0f172a;
          background: linear-gradient(135deg, #ffffffff 0%, #f1f5f9 100%);
          min-height: 100vh;
        }
        .rgp-header {
          position: sticky;
          top: 0;
          z-index: 10;
          display: grid;
          grid-template-columns: 1fr auto;
          align-items: center;
          gap: 16px;
          padding: 20px 24px;
          margin-bottom: 20px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: linear-gradient(135deg, #003f88 0%, #00296b 100%);
          color: #ffffff;
          border-radius: 16px;
          box-shadow: 0 10px 30px rgba(0, 41, 107, 0.15);
        }
        .rgp-title {
          margin: 0;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: #ffffff !important;
          -webkit-text-fill-color: #ffffff !important;
          font-size: clamp(20px, 2.5vw, 28px);
        }
        .rgp-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          height: 40px;
          padding: 0 18px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.25);
          background: rgba(255, 255, 255, 0.15);
          font-size: 13px;
          font-weight: 600;
          color: #ffffff;
          cursor: pointer;
          transition: all 0.2s ease;
          position: relative;
          overflow: hidden;
        }
        .btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.3);
          transform: translateY(-1px);
          color: #ffffff;
          border-color: rgba(255, 255, 255, 0.4);
        }
        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none !important;
        }
        .btn-primary {
          background: #ffffff !important;
          color: #003f88 !important;
          border-color: #ffffff !important;
          font-weight: 700 !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }
        .btn-primary:hover {
          background: #f8fafc !important;
          color: #00296b !important;
        }
        .controls {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
          margin-bottom: 20px;
          padding: 20px;
          background: rgba(255, 255, 255, 0.7);
          border-radius: 16px;
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.3);
          box-shadow: 0 4px 20px rgba(15, 23, 42, 0.06);
        }
        @media (min-width: 860px) {
          .controls {
            grid-template-columns: 2fr 1fr 1fr 1fr;
          }
        }
        .input, .select {
          width: 100%;
          height: 44px;
          padding: 0 16px;
          border-radius: 12px;
          border: 1.5px solid #e2e8f0;
          background: rgba(255, 255, 255, 0.8);
          outline: none;
          font-size: 14px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          font-family: inherit;
        }
        .input:focus, .select:focus {
          border-color: #60a5fa;
          box-shadow:
            0 0 0 4px rgba(59, 130, 246, 0.15),
            inset 0 1px 2px rgba(255, 255, 255, 0.8);
          background: rgba(255, 255, 255, 0.95);
          transform: translateY(-1px);
        }
        .input::placeholder {
          color: #94a3b8;
        }
        .chips {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 8px;
          font-size: 12px;
          color: #bfdbfe;
        }
        .chip {
          background: rgba(255, 255, 255, 0.15);
          border: 1px solid rgba(255, 255, 255, 0.25);
          color: #ffffff;
          padding: 4px 12px;
          border-radius: 20px;
          font-weight: 600;
          backdrop-filter: blur(8px);
        }
        .table-wrap {
          overflow-x: auto;
          overflow-y: auto;
          max-height: calc(100vh - 240px);
          min-height: 380px;
          -webkit-overflow-scrolling: touch;
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.7);
          box-shadow:
            0 8px 32px rgba(15, 23, 42, 0.08),
            inset 0 1px 0 rgba(255, 255, 255, 0.6);
          backdrop-filter: blur(12px);
          position: relative;
        }
        .table-wrap::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.8), transparent);
          z-index: 26;
        }
        table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          font-size: 13px;
          background: transparent;
        }
        thead th {
          position: sticky;
          top: 0;
          z-index: 25;
          background: linear-gradient(135deg, #0b4681 0%, #054688 100%);
          color: #ffffff;
          text-align: left;
          font-weight: 700;
          padding: 16px 14px;
          border: 1.5px solid #e2e8f0;
          white-space: nowrap;
          cursor: pointer;
          user-select: none;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          transition: all 0.2s ease;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
        }
        thead th:hover {
          background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
        }
        tbody td {
          padding: 14px;
          border: 1px solid #f1f5f9;
          white-space: nowrap;
          color: #000000ff;
          font-weight: 500;
          transition: all 0.2s ease;
          position: relative;
        }
        tbody tr {
          background: rgba(255, 255, 255, 0.5);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        tbody tr:nth-child(even) {
          background: rgba(248, 250, 252, 0.5);
        }
        tbody tr:hover {
          background: rgba(241, 245, 249, 0.8);
          transform: translateX(4px);
          box-shadow: 0 4px 12px rgba(15, 23, 42, 0.1);
        }
        tbody tr:hover td {
          color: #0f172a;
        }
        .status-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          backdrop-filter: blur(8px);
          border: 1px solid;
          transition: all 0.3s ease;
        }
        .status-active {
          background: linear-gradient(135deg, #ecfeff 0%, #cffafe 100%);
          color: #0e7490;
          border-color: rgba(6, 182, 212, 0.3);
          box-shadow: 0 2px 8px rgba(6, 182, 212, 0.15);
        }
        .status-partial {
          background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%);
          color: #9a3412;
          border-color: rgba(251, 146, 60, 0.3);
          box-shadow: 0 2px 8px rgba(251, 146, 60, 0.15);
        }
        .pagination {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-top: 20px;
          padding: 16px;
          background: rgba(255, 255, 255, 0.7);
          border-radius: 16px;
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.3);
          font-size: 13px;
          color: #475569;
          font-weight: 500;
        }
        .page-ctrls {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .page-btn {
          height: 36px;
          padding: 0 16px;
          border-radius: 10px;
          border: 1px solid #e2e8f0;
          background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
          cursor: pointer;
          font-weight: 600;
          color: #475569;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 2px 6px rgba(2, 6, 23, 0.04);
        }
        .page-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(2, 6, 23, 0.1);
          border-color: #cbd5e1;
          color: #0f172a;
        }
        .page-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
          transform: none !important;
        }
        .error {
          margin-bottom: 16px;
          padding: 16px 20px;
          border-radius: 14px;
          border: 1px solid rgba(254, 202, 202, 0.5);
          background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
          color: #991b1b;
          font-size: 13px;
          font-weight: 500;
          backdrop-filter: blur(8px);
          box-shadow: 0 4px 16px rgba(220, 38, 38, 0.1);
        }
        .muted {
          color: #64748b;
          opacity: 0.7;
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .loading-shimmer {
          position: relative;
          overflow: hidden;
        }
        .loading-shimmer::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
          animation: shimmer 1.5s infinite;
        }
        .icon-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* Mobile & Tablet Responsive Layout */
        @media (max-width: 768px) {
          .rgp-shell {
            padding: 10px 8px;
          }
          .rgp-header {
            display: flex;
            flex-direction: column;
            align-items: stretch;
            gap: 12px;
            padding: 14px;
            border-radius: 14px;
            position: relative;
          }
          .rgp-title {
            font-size: 1.35rem;
            text-align: left;
          }
          .chips {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-top: 6px;
          }
          .chip {
            font-size: 11px;
            padding: 3px 8px;
          }
          .rgp-actions {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;
            width: 100%;
          }
          .btn {
            justify-content: center;
            height: 38px;
            font-size: 12px;
            padding: 0 10px;
          }
          .controls {
            padding: 12px;
            gap: 8px;
            border-radius: 14px;
          }
          .input, .select {
            height: 40px;
            font-size: 13px;
          }
          .pagination {
            flex-direction: column;
            align-items: center;
            gap: 10px;
            padding: 12px;
          }
        }
      `}</style>

      {/* Header */}
      <div className="rgp-header">
        <div>
          <h2 className="rgp-title">📋 Closed RGP Dashboard</h2>
          <div className="chips">
            <span className="chip">🎯 Showing <b>Closed RGP</b> Only</span>
            <span className="chip">📊 {closedRows.length} Closed Records</span>
            <span className="chip">🔍 Real-time Search & Filters</span>
          </div>
        </div>
        <div className="rgp-actions">
          <button className="btn" type="button" onClick={handleBack} title="Go Back">
            <span>⬅️</span>
            Back
          </button>

          <button className="btn" onClick={fetchRows} disabled={loading} title="Refresh">
            {loading ? (
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" className="icon-spin">
                <path fill="currentColor" d="M12 6V3L8 7l4 4V8c2.76 0 5 2.24 5 5a5 5 0 0 1-9.9 1h-2.02A7 7 0 0 0 19 13c0-3.87-3.13-7-7-7z"/>
              </svg>
            ) : (
              <span>🔄</span>
            )}
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button className="btn" onClick={exportExcel} title="Download Excel">
            <span>📊</span>
            Excel
          </button>
          <button className="btn btn-primary" onClick={exportPDF} title="Download PDF">
            <span>📄</span>
            PDF Report
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="controls">
        <input
          className="input"
          type="text"
          placeholder="🔍 Search anything…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <select
          className="select"
          value={dept}
          onChange={(e) => {
            setDept(e.target.value);
            setPage(1);
          }}
        >
          {departments.map((d) => (
            <option key={d || "all"} value={d}>
              {d ? `🏢 ${d}` : "🏢 All Departments"}
            </option>
          ))}
        </select>
        <input
          className="input"
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            setPage(1);
          }}
          placeholder="📅 From"
        />
        <input
          className="input"
          type="date"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            setPage(1);
          }}
          placeholder="📅 To"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="error">
          <span style={{ marginRight: "8px" }}>⚠️</span>
          {error}
        </div>
      )}

      {/* Table */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((k) => (
                <th key={k} onClick={() => toggleSort(k)} title="Click to sort">
                  <span
                    style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    {displayLabel(k, { dateField, EXPECTED_RETURN_KEY, RETURN_DATE_KEY })}
                    {sortKey === k && (
                      <span className="muted" style={{ fontSize: "10px" }}>
                        {sortDir === "asc" ? "⬆️" : "⬇️"}
                      </span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={columns.length || 1}
                  className="muted loading-shimmer"
                  style={{ padding: 32, textAlign: "center" }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px"
                    }}
                  >
                    <span>⏳</span>
                    Loading RGP Data…
                  </div>
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length || 1}
                  className="muted"
                  style={{ padding: 32, textAlign: "center" }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      flexDirection: "column"
                    }}
                  >
                    <span style={{ fontSize: "24px" }}>📭</span>
                    <div>No matching records found.</div>
                    <div style={{ fontSize: "12px", marginTop: "4px" }}>
                      Try adjusting your search or filters
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => (
                <tr key={idx}>
                  {columns.map((k) => {
                    const val = row[k];
                    if (k === "Status") {
                      const v = String(val || "");
                      const isActive = v.toLowerCase() === "active";
                      const isPartial = v.toLowerCase() === "partial";
                      return (
                        <td key={k}>
                          <span
                            className={`status-pill ${
                              isActive
                                ? "status-active"
                                : isPartial
                                ? "status-partial"
                                : ""
                            }`}
                          >
                            {isActive ? "🟢" : isPartial ? "🟡" : "⚪️"}
                            {v || "-"}
                          </span>
                        </td>
                      );
                    }
                    return <td key={k}>{String(val ?? "")}</td>;
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="pagination">
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span>📊</span>
          <span>
            <b>{filtered.length}</b> item{filtered.length === 1 ? "" : "s"} (Closed)
          </span>
        </div>
        <div className="page-ctrls">
          <button
            className="page-btn"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            ◀️ Prev
          </button>
          <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            Page <b>{page}</b> of {totalPages}
          </span>
          <button
            className="page-btn"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Next ▶️
          </button>
        </div>
      </div>
    </div>
  );
}
