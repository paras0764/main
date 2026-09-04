// PurchaseOrderForm.jsx
import { useEffect, useMemo, useState, useRef } from "react";
import { jsPDF } from "jspdf";

import {
  WEB_APP_URL_PO_LOT,
  SHEET_ID_PURCHASE_ORDER,
  SHEET_ID_CUTTING,
  GOOGLE_API_KEY
} from "../config/apiConfig";

/** =========================
 * CONFIG
 * ========================= */
const WEB_APP_BASE = WEB_APP_URL_PO_LOT;

const SHEET_ID = SHEET_ID_PURCHASE_ORDER;
const RANGE_A1 = "SHEET1!A1:C";
const Sheet = SHEET_ID_CUTTING;
const INDEX_SHEET_RANGE = "Index!A1:D";
const API_KEY = GOOGLE_API_KEY;

/** =========================
 * utils
 * ========================= */
const fmtMoney = (n) =>
  (Number.isFinite(+n) ? +n : 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// Generate unique PO number based on timestamp
function makePoNumber() {
  const now = new Date();
  const timestamp = now.getTime(); // Unique timestamp
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const random = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
  return `PO-${y}${m}${d}-${timestamp.toString().slice(-6)}-${random}`;
}

const blankRow = () => ({ 
  department: "", 
  description: "", 
  uom: "", 
  qty: 0,
  qtyAsPerLot: 0,
  rate: 0,
  lotNo: "", 
  lotData: null 
});

const todayISO = () => new Date().toISOString().slice(0, 10);
const nowTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const toDate = (dateStr, timeStr) => {
  if (!dateStr) return null;
  const [h, m] = (timeStr || "00:00").split(":").map((x) => parseInt(x || "0", 10));
  const [Y, M, D] = dateStr.split("-").map((x) => parseInt(x, 10));
  return new Date(Y, (M || 1) - 1, D || 1, h || 0, m || 0, 0);
};

const humanDuration = (ms) => {
  if (ms == null) return "";
  const sign = ms < 0 ? -1 : 1;
  ms = Math.abs(ms);
  const hours = Math.floor(ms / 36e5);
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  const mins = Math.floor((ms % 36e5) / 60000);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (remH) parts.push(`${remH}h`);
  if (!days && !remH) parts.push(`${mins}m`);
  const txt = parts.join(" ");
  return sign < 0 ? `-${txt}` : txt;
};

async function fetchSheetRows(sheetId, rangeA1, apiKey) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(
    rangeA1
  )}?key=${apiKey}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Sheets API error: ${resp.status}`);
  const data = await resp.json();
  const values = data.values || [];
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const [dept = "", item = "", rate = ""] = values[i] || [];
    const numRate = Number(rate) || 0;
    if (dept || item) rows.push({ dept: String(dept).trim(), item: String(item).trim(), rate: numRate });
  }
  return rows;
}

// Fetch index data to quickly locate lot matrices
async function fetchLotIndex(sheetId, apiKey) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(
    INDEX_SHEET_RANGE
  )}?key=${apiKey}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Sheets API error: ${resp.status}`);
  const data = await resp.json();
  const values = data.values || [];
  
  const indexMap = new Map();
  for (let i = 1; i < values.length; i++) {
    const [lotNumber = "", startRow = "", numRows = "", headerCols = ""] = values[i] || [];
    if (lotNumber && startRow) {
      indexMap.set(lotNumber.trim(), {
        startRow: parseInt(startRow),
        numRows: parseInt(numRows) || 0,
        headerCols: parseInt(headerCols) || 0
      });
    }
  }
  return indexMap;
}

// Fetch specific lot data using index
async function fetchLotData(sheetId, lotNumber, apiKey) {
  try {
    const lotIndex = await fetchLotIndex(sheetId, apiKey);
    const lotInfo = lotIndex.get(lotNumber);
    
    if (!lotInfo) {
      throw new Error(`Lot number ${lotNumber} not found in index`);
    }

    const endRow = lotInfo.startRow + lotInfo.numRows - 1;
    const range = `Cutting!A${lotInfo.startRow}:Z${endRow}`;
    
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(
      range
    )}?key=${apiKey}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Sheets API error: ${resp.status}`);
    const data = await resp.json();
    const values = data.values || [];
    
    return {
      lotNumber,
      matrix: values,
      headerCols: lotInfo.headerCols
    };
  } catch (error) {
    console.error('Error fetching lot data:', error);
    throw error;
  }
}

// Simplified function to get only total quantity from lot
function getLotTotalQuantity(lotData) {
  if (!lotData || !lotData.matrix || lotData.matrix.length === 0) {
    return 0;
  }

  const matrix = lotData.matrix;
  const headerCols = lotData.headerCols || 7;

  // Find the total row (usually the last row or contains "Total")
  const totalRow = matrix.find(row => 
    row[0] && (row[0].toLowerCase().includes('total') || row[0] === 'Total')
  );

  if (totalRow && totalRow.length >= headerCols) {
    return parseFloat(totalRow[headerCols - 1]) || 0;
  }

  // If no total row found, return 0
  return 0;
}

function downloadPdfBlob(doc, fileName) {
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName || "PO.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** QR (QuickChart) → dataURL */
async function toDataURL_QR(qrText, size = 300) {
  const src = `https://quickchart.io/qr?text=${encodeURIComponent(qrText)}&size=${size}&margin=4&ecLevel=H`;
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("QR image load failed"));
    img.src = src;
  });
}

/** Build PO QR URLs that match Apps Script (action=gate/receive) */
function buildPoQrUrls({ base = WEB_APP_BASE, poNo, orderDate, expectedDate, supervisorName }) {
  const enc = encodeURIComponent;
  const who = supervisorName ? `&who=${enc(supervisorName)}` : "";
  const gateUrl = `${base}?action=gate&po=${enc(poNo)}&date=${enc(orderDate || "")}${who}`;
  const recvUrl = `${base}?action=receive&po=${enc(poNo)}&rdate=${enc(expectedDate || "")}${who}`;
  return { gateUrl, recvUrl };
}

/** =========================
 * Local Storage Management
 * ========================= */

// Load custom items from localStorage
function loadCustomItems() {
  try {
    const stored = localStorage.getItem('po_custom_items');
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Error loading custom items:', error);
  }
  return { departments: [], items: [] };
}

// Save custom items to localStorage
function saveCustomItems(customItems) {
  try {
    localStorage.setItem('po_custom_items', JSON.stringify(customItems));
  } catch (error) {
    console.error('Error saving custom items:', error);
  }
}

// Add custom department
function addCustomDepartment(customItems, department) {
  const dept = department.trim();
  if (!dept || customItems.departments.includes(dept)) return customItems;
  
  const updated = {
    ...customItems,
    departments: [...customItems.departments, dept].sort()
  };
  saveCustomItems(updated);
  return updated;
}

// Add custom item
function addCustomItem(customItems, department, item, rate = 0) {
  const dept = department.trim();
  const itm = item.trim();
  if (!dept || !itm) return customItems;
  
  const itemKey = `${dept}::${itm}`;
  const existingItem = customItems.items.find(i => i.key === itemKey);
  
  if (existingItem) {
    // Update rate if different
    if (existingItem.rate !== rate) {
      const updated = {
        ...customItems,
        items: customItems.items.map(i => 
          i.key === itemKey ? { ...i, rate } : i
        )
      };
      saveCustomItems(updated);
      return updated;
    }
    return customItems;
  }
  
  const updated = {
    ...customItems,
    items: [...customItems.items, { key: itemKey, department: dept, item: itm, rate }].sort((a, b) => 
      a.item.localeCompare(b.item)
    )
  };
  saveCustomItems(updated);
  return updated;
}

/** =========================
 * PDF Generation Function
 * ========================= */
function generatePurchaseOrderPDF({ payload, options = {} }) {
  const { qrGateImage = null, qrRecvImage = null, qrSide = 96 } = options;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.setFont("helvetica", "normal");
  doc.setLineWidth(0.6);

  // ---- helpers
  const page = { w: doc.internal.pageSize.getWidth(), h: doc.internal.pageSize.getHeight(), m: 40, gap: 12 };
  const setSize = (s) => doc.setFontSize(s);
  const bold = () => doc.setFont(undefined, "bold");
  const normal = () => doc.setFont(undefined, "normal");
  const text = (t, x, y, opt = {}) => doc.text(String(t ?? ""), x, y, opt);
  const rtext = (t, x, y, opt = {}) => text(t, x, y, { align: "right", ...opt });
  const line = (x1, y1, x2, y2) => doc.line(x1, y1, x2, y2);
  const wrap = (str, w) => doc.splitTextToSize(String(str || ""), w);
  const money = (n) =>
    (Number.isFinite(+n) ? +n : 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const roundRect = (x, y, w, h, r = 7, style = "S") =>
    doc.roundedRect ? doc.roundedRect(x, y, w, h, r, r, style) : doc.rect(x, y, w, h, style);

  // ---- frame & pagination
  const drawFrame = () => roundRect(16, 16, page.w - 32, page.h - 32, 8, "S");
  let y = page.m;

  const SIG_H = 92;
  const QR_TITLE_H = 18;
  const QR_SIDE = qrSide || 96;
  const BOTTOM_QR_H = QR_TITLE_H + 8 + QR_SIDE + 10; // height for the small left QR box
  const RESERVED_BOTTOM = 18 + 8 + BOTTOM_QR_H + 12 + SIG_H + 8;

  const needSpace = (h, withHeader = false) => {
    const usableBottom = page.h - page.m - RESERVED_BOTTOM;
    if (y + h > usableBottom) {
      doc.addPage();
      drawFrame();
      y = page.m;
      if (withHeader) {
        setSize(13);
        bold();
        text("PURCHASE ORDER", page.m, y);
        normal();
        line(page.m, y + 6, page.w - page.m, y + 6);
        y += 18;
      }
      return true;
    }
    return false;
  };

  // ---- Title
  drawFrame();
  setSize(20);
  bold();
  text("PURCHASE ORDER", page.w / 2, y, { align: "center" });
  normal();
  line(page.m, y + 6, page.w - page.m, y + 6);
  y += 26;

  // =========================
  // TOP ROW (NEW WIDTHS):
  // [ PO DETAILS (wide) ] [ SUPPLIER INFO (narrow) ] [ GATE IN — SCAN ]
  // =========================
  (function topRow() {
    const innerW = page.w - 2 * page.m;

    // assign custom ratios (sum ≈ 1.00)
    const rPO = 0.44, rSup = 0.26, rGate = 0.30;

    // convert to pixel widths (account for 2 gaps)
    const wAvail = innerW - page.gap * 2;
    const wPO = Math.floor(wAvail * rPO);
    const wSup = Math.floor(wAvail * rSup);
    const wGate = wAvail - wPO - wSup; // fill remainder to avoid rounding loss

    const x1 = page.m;
    const x2 = x1 + wPO + page.gap;
    const x3 = x2 + wSup + page.gap;

    // PO DETAILS (left / wider)
    const metaPad = 12, lblW = 84;
    const mRows = [
      ["PO #", (payload.meta?.poNumber || "").replace(/\s+/g, "")],
      ["Order", [payload.meta?.orderDate, payload.meta?.orderTime].filter(Boolean).join(" ")],
      ...(payload.meta?.expectedDate ? [["Expected", payload.meta.expectedDate]] : []),
      ...(payload.meta?.leadTimeHuman ? [["Lead Time", payload.meta.leadTimeHuman]] : []),
      ...(payload.meta?.supervisorName ? [["Supervisor", payload.meta.supervisorName]] : []),
    ];
    const metaH = 22 + mRows.length * 16 + 16;

    // SUPPLIER INFO (middle / narrower)
    const supPad = 12;
    const supBodyW = wSup - supPad * 2;
    const supLines = [
      ...wrap(payload.supplierName || "", supBodyW),
      ...wrap(payload.supplierAddress || "", supBodyW),
      ...(payload.supplierPhone ? [`Phone: ${payload.supplierPhone}`] : []),
      ...(payload.supplierEmail ? [`Email: ${payload.supplierEmail}`] : []),
    ];
    const supH = 22 + supLines.filter(Boolean).length * 12 + 16;

    // GATE IN (right) — QR
    const gateH = QR_TITLE_H + 8 + QR_SIDE + 10;

    const blockH = Math.max(metaH, supH, gateH);
    needSpace(blockH);

    // Draw PO DETAILS
    roundRect(x1, y, wPO, blockH, 7, "S");
    setSize(10);
    bold(); text("PO DETAILS", x1 + 12, y + 14); normal();
    line(x1 + 12, y + 18, x1 + wPO - 12, y + 18);
    let my = y + 30;
    mRows.forEach(([label, value]) => {
      bold(); text(`${label}:`, x1 + metaPad, my);
      normal(); text(value || "", x1 + metaPad + lblW, my, { maxWidth: wPO - metaPad * 2 - lblW });
      my += 16;
    });

    // Draw SUPPLIER INFO
    roundRect(x2, y, wSup, blockH, 7, "S");
    setSize(10);
    bold(); text("SUPPLIER", x2 + 12, y + 14); normal();
    line(x2 + 12, y + 18, x2 + wSup - 12, y + 18);
    let sy = y + 30;
    supLines.forEach((ln) => { if (ln) { text(ln, x2 + supPad, sy); sy += 12; } });

    // Draw GATE-IN SCANNER
    roundRect(x3, y, wGate, blockH, 7, "S");
    setSize(10);
    bold(); text("GATE IN — SCAN (FORM)", x3 + 12, y + 14); normal();
    line(x3 + 12, y + 18, x3 + wGate - 12, y + 18);
    if (qrGateImage) {
      const qx = x3 + 12 + (wGate - 24 - QR_SIDE) / 2;
      const qy = y + 18 + 10;
      try { doc.addImage(qrGateImage, "PNG", qx, qy, QR_SIDE, QR_SIDE); } catch {}
    }

    y += blockH + 16;
  })();

  // =========================
  // TABLE WITH LOT COLUMNS
  // =========================
  (function drawTable() {
    const x0 = page.m, innerW = page.w - 2 * page.m;
    setSize(10); normal();

    const rows = (payload.rows || []).map((r, i) => {
      const qStr = (+r.qty || 0).toLocaleString();
      const qtyAsPerLotStr = (+r.qtyAsPerLot || 0).toLocaleString();
      const rateStr = money(+r.rate || 0);
      const amt = (+r.qty || 0) * (+r.rate || 0);
      const amtStr = money(amt);
      return { 
        ...r, 
        _i: i, 
        _qtyStr: qStr, 
        _qtyAsPerLotStr: qtyAsPerLotStr,
        _rateStr: rateStr, 
        _amtStr: amtStr 
      };
    });

    const measureMax = (arr, key) => arr.reduce((m, r) => Math.max(m, doc.getTextWidth(String(r[key] || ""))), 0);
    
    // Updated minimum widths to accommodate new columns
    const MIN = { 
      line: 18, 
      department: 100, 
      uom: 35, 
      lotNo: 40,
      qtyAsPerLot: 45,
      qty: 45, 
      rate: 30, 
      amount: 60 
    };

    const qtyW = Math.max(MIN.qty, measureMax(rows, "_qtyStr") + 10);
    const qtyAsPerLotW = Math.max(MIN.qtyAsPerLot, measureMax(rows, "_qtyAsPerLotStr") + 10);
    const rateW = Math.max(MIN.rate, measureMax(rows, "_rateStr") + 10);
    const amountW = Math.max(MIN.amount, measureMax(rows, "_amtStr") + 12);

    const lineW = MIN.line, depW = MIN.department, uomW = MIN.uom, lotNoW = MIN.lotNo;
    
    // Calculate used width and adjust description width dynamically
    const used = lineW + depW + uomW + lotNoW + qtyAsPerLotW + qtyW + rateW + amountW;
    const descW = Math.max(100, innerW - used);
    const diff = innerW - (used + descW);
    const adjAmountW = amountW + diff;

    const cols = [
      { key: "line", title: "#", w: lineW, align: "right" },
      { key: "department", title: "DEPARTMENT", w: depW },
      { key: "description", title: "DESCRIPTION", w: descW },
      { key: "uom", title: "UOM", w: uomW, align: "center" },
      { key: "lotNo", title: "LOT NO.", w: lotNoW, align: "center" },
      { key: "qtyAsPerLot", title: "L.QTY", w: qtyAsPerLotW, align: "right" },
      { key: "qty", title: "M.QTY", w: qtyW, align: "right" },
      { key: "rate", title: "RATE", w: rateW, align: "right" },
      { key: "amount", title: "AMT", w: adjAmountW, align: "right" },
    ];
    
    const xs = [x0]; 
    cols.forEach((c, i) => xs.push(xs[i] + c.w));

    const headerH = 26, baseH = 20;

    const drawHeader = () => {
      needSpace(headerH, true);
      doc.rect(x0, y, innerW, headerH);
      setSize(9); bold(); // Smaller font for more columns
      cols.forEach((c, i) => {
        const cx = c.align === "right" ? xs[i + 1] - 4 : c.align === "center" ? (xs[i] + xs[i + 1]) / 2 : xs[i] + 4;
        const opt = c.align === "right" ? { align: "right" } : c.align === "center" ? { align: "center" } : {};
        text(c.title, cx, y + 16, opt);
        if (i > 0) line(xs[i], y, xs[i], y + headerH);
      });
      normal(); y += headerH;
    };

    const drawRow = (r, idx) => {
      const descLines = doc.splitTextToSize(r.description || "", cols[2].w - 6);
      const rowH = Math.max(baseH, descLines.length * 11 + 6);
      needSpace(rowH, true);
      doc.rect(x0, y, innerW, rowH);
      for (let i = 1; i < xs.length - 1; i++) line(xs[i], y, xs[i], y + rowH);
      const yy = y + 11;
      
      // Draw row data
      rtext(r.line ?? idx + 1, xs[1] - 4, yy);
      text(r.department || "", xs[1] + 4, yy);
      descLines.forEach((ln, j) => text(ln, xs[2] + 4, yy + j * 11));
      text(r.uom || "", (xs[3] + xs[4]) / 2, yy, { align: "center" });
      text(r.lotNo || "", (xs[4] + xs[5]) / 2, yy, { align: "center" });
      rtext(r._qtyAsPerLotStr, xs[6] - 4, yy);
      rtext(r._qtyStr, xs[7] - 4, yy);
      rtext(r._rateStr, xs[8] - 4, yy);
      rtext(r._amtStr, xs[9] - 4, yy);
      
      y += rowH;
      return (+r.qty || 0) * (+r.rate || 0);
    };

    drawHeader();
    let sum = 0; 
    rows.forEach((r, i) => (sum += drawRow(r, i)));
    
    const totalH = 26;
    needSpace(totalH, true);
    doc.rect(x0, y, innerW, totalH);
    line(xs[xs.length - 2], y, xs[xs.length - 2], y + totalH);
    setSize(10); bold();
    text("TOTAL", x0 + 6, y + 16);
    rtext(money(sum), xs[9] - 6, y + 16);
    normal(); y += totalH;
  })();

  // =========================
  // BOTTOM (UPDATED):
  // left = MATERIAL RECEIVED — SCAN (QR inside)
  // right (spans 2 cols) = REMARKS
  // =========================
  (function bottomBlocks() {
    const innerW = page.w - 2 * page.m;
    const colW = (innerW - page.gap * 2) / 3;
    const x1 = page.m, x2 = x1 + colW + page.gap, x3 = x2 + colW + page.gap;

    const sigTop = page.h - page.m - SIG_H;
    const blockTop = sigTop - 12 - BOTTOM_QR_H;

    // Left small box: MATERIAL RECEIVED SCAN + QR
    roundRect(x1, blockTop, colW, BOTTOM_QR_H, 7, "S");
    setSize(10);
    bold(); text("MATERIAL RECEIVED", x1 + 10, blockTop + 14); normal();
    line(x1 + 10, blockTop + 18, x1 + colW - 10, blockTop + 18);
    if (qrRecvImage) {
      const qx = x1 + 10 + (colW - 20 - QR_SIDE) / 2;
      const qy = blockTop + 18 + 10;
      try { doc.addImage(qrRecvImage, "PNG", qx, qy, QR_SIDE, QR_SIDE); } catch {}
    }

    // Wide right box (spans two columns): REMARKS
    const bigW = colW * 2 + page.gap;
    roundRect(x2, blockTop, bigW, BOTTOM_QR_H, 7, "S");
    setSize(10);
    bold(); text("REMARKS", x2 + 10, blockTop + 14); normal();
    line(x2 + 10, blockTop + 18, x2 + bigW - 10, blockTop + 18);
    // (intentionally left blank area for writing remarks)

    // Signatures (3 equal)
    [x1, x2, x3].forEach((x) => roundRect(x, sigTop, colW, SIG_H, 7, "S"));
    bold();
    text("PREPARED BY", x1 + 10, sigTop + 16);
    text("APPROVED BY", x2 + 10, sigTop + 16);
    text("SUPPLIER'S",  x3 + 10, sigTop + 16);
    normal();

    const writeSig = (x, showName) => {
      const baseY = sigTop + SIG_H - 26;
      text("Signature", x + 10, baseY - 10);
      line(x + 10, baseY - 8, x + colW - 10, baseY - 8);
      text("Name:", x + 10, baseY + 2);
      if (showName && payload.meta?.supervisorName) text(payload.meta.supervisorName, x + 46, baseY + 2);
      text("Date:", x + 10, baseY + 14);
    };
    writeSig(x1, true);
    writeSig(x2, false);
    writeSig(x3, false);
  })();

  return doc;
}

/** =========================
 * POST helper — strict ok/json.ok handling + 429 backoff
 * ========================= */
async function postPOToSheet(webAppUrl, payload, { maxRetries = 3 } = {}) {
  const body = "data=" + encodeURIComponent(JSON.stringify(payload));
  let attempt = 0,
    delay = 400;
  while (true) {
    attempt++;
    try {
      const res = await fetch(webAppUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        mode: "cors",
        body,
      });
      const json = await res.json().catch(() => null);

      if (res.status === 429 && attempt <= maxRetries) {
        await new Promise((r) => setTimeout(r, delay));
        delay *= 2;
        continue;
      }

      if (!res.ok) {
        return { ok: false, status: res.status, json };
      }
      if (!json?.ok) {
        return { ok: false, status: json?.code || res.status, json };
      }
      return { ok: true, json };
    } catch (err) {
      if (attempt <= maxRetries) {
        await new Promise((r) => setTimeout(r, delay));
        delay *= 2;
        continue;
      }
      return { ok: false, error: String(err) };
    }
  }
}

/** =========================
 * COMPONENT
 * ========================= */
export default function POLot({
  company = {
    name: "StitchPro Pvt. Ltd.",
    address: "Plot 42, Industrial Area, Jaipur, RJ",
    gstin: "08AABCS1234F1Z2",
    phone: "+91 98765 43210",
    email: "accounts@stitchpro.example",
  },
  onSave = (po) => console.log("SAVE →", po),
  onSubmitForApproval = (po) => console.log("SUBMIT →", po),
}) {
  const [poNumber, setPoNumber] = useState(makePoNumber());
  const [orderDate, setOrderDate] = useState(todayISO());
  const [orderTime, setOrderTime] = useState(nowTime());
  const [expectedDate, setExpectedDate] = useState("");
  const [expectedTime, setExpectedTime] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [rows, setRows] = useState([blankRow()]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSupervisorDialog, setShowSupervisorDialog] = useState(false);
  const [supervisorName, setSupervisorName] = useState("");

  const [sheetRows, setSheetRows] = useState([]);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [sheetError, setSheetError] = useState("");
  const [loadingLot, setLoadingLot] = useState(null);
  const [customItems, setCustomItems] = useState(loadCustomItems());
  const [showCustomDeptDialog, setShowCustomDeptDialog] = useState(false);
  const [showCustomItemDialog, setShowCustomItemDialog] = useState(false);
  const [customDeptInput, setCustomDeptInput] = useState("");
  const [customItemInput, setCustomItemInput] = useState("");
  const [customRateInput, setCustomRateInput] = useState("");
  const [selectedDeptForItem, setSelectedDeptForItem] = useState("");

  const printableRef = useRef(null);

  const UOM_OPTIONS = [
    "PCS","SET","PAIR","DOZEN","KG","GRAM","LTR","ML","MTR","CM","MM","ROLL","BUNDLE","BOX","PACK","SFT","SQM","SQFT","HOUR","DAY","JOB"
  ];

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoadingSheet(true);
        const data = await fetchSheetRows(SHEET_ID, RANGE_A1, API_KEY);
        if (mounted) setSheetRows(data);
      } catch (err) {
        if (mounted) setSheetError(err?.message || "Failed to load sheet.");
      } finally {
        if (mounted) setLoadingSheet(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Combine sheet departments with custom departments
  const departments = useMemo(() => {
    const sheetDepts = new Set(sheetRows.map((r) => r.dept).filter(Boolean));
    const customDepts = new Set(customItems.departments);
    const allDepts = new Set([...sheetDepts, ...customDepts]);
    return Array.from(allDepts).sort((a, b) => a.localeCompare(b));
  }, [sheetRows, customItems.departments]);

  // Combine sheet items with custom items
  const itemsByDept = useMemo(() => {
    const map = new Map();
    
    // Add sheet items
    sheetRows.forEach(({ dept, item }) => {
      if (!dept || !item) return;
      if (!map.has(dept)) map.set(dept, new Set());
      map.get(dept).add(item);
    });
    
    // Add custom items
    customItems.items.forEach(({ department, item }) => {
      if (!department || !item) return;
      if (!map.has(department)) map.set(department, new Set());
      map.get(department).add(item);
    });
    
    const obj = {};
    for (const [k, v] of map.entries()) obj[k] = Array.from(v).sort((a, b) => a.localeCompare(b));
    return obj;
  }, [sheetRows, customItems.items]);

  // Combine sheet rates with custom rates
  const rateByItem = useMemo(() => {
    const m = new Map();
    
    // Add sheet rates
    sheetRows.forEach(({ item, rate }) => {
      if (!item) return;
      m.set(item, Number(rate) || 0);
    });
    
    // Add custom rates
    customItems.items.forEach(({ item, rate }) => {
      if (!item) return;
      m.set(item, Number(rate) || 0);
    });
    
    return m;
  }, [sheetRows, customItems.items]);

  const rowAmount = (r) => (+r.qty || 0) * (+r.rate || 0);

  const totals = useMemo(() => {
    let sub = 0;
    rows.forEach((r) => (sub += rowAmount(r)));
    const gross = sub;
    return { sub, discountTotal: 0, taxTotal: 0, gross, payable: gross, roundAdj: 0 };
  }, [rows]);

  const orderDT = toDate(orderDate, orderTime);
  const expectedDT = toDate(expectedDate, expectedTime);
  const leadMs = orderDT && expectedDT ? expectedDT - orderDT : null;
  const leadHuman = humanDuration(leadMs);

  // Simplified lot number handler - only fetches total quantity
  const handleLotNumberChange = async (idx, lotNumber) => {
    setLoadingLot(idx);
    
    try {
      if (!lotNumber.trim()) {
        updateRow(idx, { 
          lotNo: "", 
          lotData: null, 
          qtyAsPerLot: 0 
        });
        return;
      }

      const lotData = await fetchLotData(Sheet, lotNumber.trim(), API_KEY);
      const totalQuantity = getLotTotalQuantity(lotData);
      
      updateRow(idx, { 
        lotNo: lotNumber.trim(), 
        lotData: { totalPcs: totalQuantity, lotNumber: lotNumber.trim() },
        qtyAsPerLot: totalQuantity
      });
      
    } catch (error) {
      alert(`Error loading lot ${lotNumber}: ${error.message}`);
      updateRow(idx, { 
        lotNo: lotNumber.trim(), 
        lotData: null,
        qtyAsPerLot: 0 
      });
    } finally {
      setLoadingLot(null);
    }
  };

  const updateRow = (idx, patch) => {
    setRows((prev) => {
      const next = [...prev];
      const old = next[idx];
      let updated = { ...old, ...patch };
      
      if (patch.department !== undefined) {
        const validItems = itemsByDept[patch.department] || [];
        if (!validItems.includes(updated.description)) {
          updated.description = "";
          updated.rate = 0;
        }
      }
      
      if (patch.description !== undefined) {
        const rate = rateByItem.get(updated.description) || 0;
        updated.rate = rate;
      }
      
      next[idx] = updated;
      return next;
    });
  };

  const addRow = () => setRows((r) => [...r, blankRow()]);
  const removeRow = (idx) =>
    setRows((r) => (r.length === 1 ? [blankRow()] : r.filter((_, i) => i !== idx)));

  const handleAddCustomDepartment = () => {
    if (!customDeptInput.trim()) {
      alert("Please enter a department name");
      return;
    }
    
    const updated = addCustomDepartment(customItems, customDeptInput);
    setCustomItems(updated);
    setCustomDeptInput("");
    setShowCustomDeptDialog(false);
    alert(`Department "${customDeptInput}" added successfully!`);
  };

  const handleAddCustomItem = () => {
    if (!selectedDeptForItem || !customItemInput.trim()) {
      alert("Please select a department and enter an item name");
      return;
    }
    
    const rate = parseFloat(customRateInput) || 0;
    const updated = addCustomItem(customItems, selectedDeptForItem, customItemInput, rate);
    setCustomItems(updated);
    setCustomItemInput("");
    setCustomRateInput("");
    setShowCustomItemDialog(false);
    alert(`Item "${customItemInput}" added to department "${selectedDeptForItem}" with rate ${rate}!`);
  };

const validate = () => {
  const errs = [];
  if (!WEB_APP_BASE.includes("/exec")) errs.push("WEB_APP_BASE must be a deployed /exec URL.");
  if (!poNumber.trim()) errs.push("PO Number is required.");
  if (!supplierName.trim()) errs.push("Supplier is required.");
  
  const hasValidLine = rows.some(
    (r) => r.department && r.description && (+r.qty || 0) > 0
  );
  
  if (!hasValidLine) {
    errs.push("At least one line with Department, Item, and Quantity is required.");
  }
  
  if (orderDT && expectedDT && expectedDT < orderDT) {
    errs.push("Expected Material Date/Time cannot be before Order Date/Time.");
  }
  
  return errs;
};

const makePayload = (extraMeta = {}) => ({
  meta: {
    poNumber,
    orderDate: orderDate || null,
    orderTime: orderTime || null,
    expectedDate: expectedDate || null,
    expectedTime: expectedTime || null,
    orderDateTimeISO: orderDT ? orderDT.toISOString() : null,
    expectedDateTimeISO: expectedDT ? expectedDT.toISOString() : null,
    leadTimeMs: leadMs,
    leadTimeHuman: leadHuman || null,
    supervisorName: extraMeta.supervisorName || null,
    createdAt: new Date().toISOString(),
  },
  company,
  supplierName,
  rows: rows.map((r, i) => ({
    line: i + 1,
    department: r.department || "",
    description: r.description || "",
    uom: r.uom || "",
    qty: Number(r.qty) || 0,
    qtyAsPerLot: Number(r.qtyAsPerLot) || 0,
    rate: Number(r.rate) || 0, // This can be 0 now
    amount: rowAmount(r), // This will be 0 if rate is 0
    lotNo: r.lotNo || "",
  })),
  totals,
  notes: "",
});
  async function handleSave() {
    const errs = validate();
    if (errs.length) return alert(errs.join("\n"));
    const payload = makePayload();
    const res = await postPOToSheet(WEB_APP_BASE, payload);
    if (!res.ok) {
      const msg =
        res.json?.error ||
        (res.status === 409 ? "Duplicate PO number. Please change PO Number." : "") ||
        res.error ||
        `HTTP ${res.status || "?"}`;
      return alert(`Could not save PO.\n${msg}`);
    }
    onSave(payload);
    alert(`Saved PO ${payload.meta.poNumber} to Google Sheet ✅`);
  }

  const handleOpenSubmitDialog = () => {
    const errs = validate();
    if (errs.length) return alert(errs.join("\n"));
    setShowSupervisorDialog(true);
  };

  async function handleConfirmSubmit() {
    if (isSubmitting) return;
    const name = (supervisorName || "").trim();
    if (!name) return alert("Please enter Supervisor Name.");

    setIsSubmitting(true);
    setShowSupervisorDialog(false);

    try {
      const payload = makePayload({ supervisorName: name });
      const res = await postPOToSheet(WEB_APP_BASE, payload);
      if (!res.ok) {
        const msg =
          res.json?.error ||
          (res.status === 409 ? "Duplicate PO number. Please change PO Number." : "") ||
          `HTTP ${res.status || "?"}`;
        throw new Error(msg);
      }

      const poNo = payload.meta.poNumber;
      const { gateUrl, recvUrl } = buildPoQrUrls({
        base: WEB_APP_BASE,
        poNo,
        orderDate: payload.meta.orderDate,
        expectedDate: payload.meta.expectedDate,
        supervisorName: name,
      });

      const [gateQR, recvQR] = await Promise.all([
        toDataURL_QR(gateUrl, 320),
        toDataURL_QR(recvUrl, 320),
      ]);

      const doc = generatePurchaseOrderPDF({
        payload,
        options: { qrGateImage: gateQR, qrRecvImage: recvQR, qrSide: 96 },
      });
      downloadPdfBlob(doc, `${payload.meta.poNumber}.pdf`);
      onSubmitForApproval(payload);
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDownloadPdf() {
    const payload = makePayload();
    const poNo = payload.meta.poNumber;
    const { gateUrl, recvUrl } = buildPoQrUrls({
      base: WEB_APP_BASE,
      poNo,
      orderDate: payload.meta.orderDate,
      expectedDate: payload.meta.expectedDate,
      supervisorName,
    });

    const [gateQR, recvQR] = await Promise.all([
      toDataURL_QR(gateUrl, 320),
      toDataURL_QR(recvUrl, 320),
    ]);

    const doc = generatePurchaseOrderPDF({ payload, options: { qrGateImage: gateQR, qrRecvImage: recvQR, qrSide: 96 } });
    downloadPdfBlob(doc, `${poNumber}.pdf`);
  }

  function UomSelect({ value, onChange, disabled }) {
    const UOMS = UOM_OPTIONS;
    const hasCustom = value && !UOMS.includes(String(value).toUpperCase());
    return (
      <select
        className="form-select"
        value={hasCustom ? "__custom__" : value || ""}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__custom__") {
            const entered = window.prompt("Enter custom UOM", value || "");
            if (entered && entered.trim()) onChange(entered.trim().toUpperCase());
            else onChange("");
          } else onChange(v);
        }}
        disabled={disabled}
      >
        <option value="">Select UOM</option>
        {UOMS.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
        <option value="__custom__">{hasCustom ? value : "Custom…"}</option>
      </select>
    );
  }

  return (
    <div className="modern-po">
      <style>{`
        .modern-po {
          min-height: 100vh;
          background: linear-gradient(135deg, #ffffffff 0%, #ffffffff 100%);
          padding: 24px;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        .po-container {
          max-width: 2300px;
          margin: 0 auto;
          background: white;
          border-radius: 20px;
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.15);
          overflow: hidden;
          backdrop-filter: blur(10px);
        }
        .po-header {
          background: linear-gradient(135deg, #000268ff 0%, #001a41ff 100%);
          color: white;
          padding: 32px 40px;
          position: relative;
          overflow: hidden;
        }
        .po-header::before {
          content: '';
          position: absolute;
          top: -50%;
          right: -50%;
          width: 100%;
          height: 200%;
          background: radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px);
          background-size: 20px 20px;
          transform: rotate(30deg);
        }
        .po-title {
          font-size: 32px;
          font-weight: 800;
          margin-bottom: 8px;
          letter-spacing: -0.5px;
        }
        .po-subtitle {
          font-size: 16px;
          opacity: 0.9;
          font-weight: 500;
        }
        .po-content {
          padding: 32px 40px;
          display: grid;
          gap: 24px;
        }
        .form-section {
          background: white;
          border: 1px solid #f1f5f9;
          border-radius: 16px;
          padding: 24px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
          transition: all 0.3s ease;
        }
        .form-section:hover {
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.08);
        }
        .section-title {
          font-size: 18px;
          font-weight: 700;
          color: #1e293b;
          margin-bottom: 20px;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .section-title::before {
          content: '';
          width: 4px;
          height: 20px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          border-radius: 4px;
        }
        .form-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 20px;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .form-label {
          font-size: 14px;
          font-weight: 600;
          color: #374151;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .form-label::before {
          content: '•';
          color: #6366f1;
          font-weight: bold;
        }
        .form-input, .form-select {
          padding: 12px 16px;
          border: 2px solid #e2e8f0;
          border-radius: 12px;
          font-size: 14px;
          transition: all 0.3s ease;
          background: white;
        }
        .form-input:focus, .form-select:focus {
          outline: none;
          border-color: #6366f1;
          box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1);
          transform: translateY(-1px);
        }
        .total-display {
          background: linear-gradient(135deg, #10b981, #059669);
          color: white;
          border-radius: 12px;
          padding: 16px 24px;
          display: inline-flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 16px;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
        }
        .total-label {
          font-size: 14px;
          font-weight: 600;
          opacity: 0.9;
        }
        .total-amount {
          font-size: 24px;
          font-weight: 800;
        }
        .table-container {
          overflow-x: auto;
          border-radius: 12px;
          border: 2px solid #f1f5f9;
          background: white;
        }
        .items-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 1200px;
        }
        .items-table th {
          background: linear-gradient(135deg, #002f5eff, #002244ff);
          padding: 16px 12px;
          text-align: left;
          font-size: 12px;
          font-weight: 700;
          color: #ffffffff;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 2px solid #e2e8f0;
        }
        .items-table td {
          padding: 12px;
          border-bottom: 1px solid #f1f5f9;
          background: white;
          transition: all 0.2s ease;
        }
        .items-table tr:hover td {
          background: #f8fafc;
          transform: scale(1.01);
        }
        .items-table tr:last-child td {
          border-bottom: none;
        }
        .items-table input, .items-table select {
          width: 100%;
          padding: 10px 12px;
          border: 2px solid #e2e8f0;
          border-radius: 8px;
          font-size: 14px;
          transition: all 0.2s ease;
        }
        .items-table input:focus, .items-table select:focus {
          outline: none;
          border-color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }
        .table-actions {
          display: flex;
          gap: 12px;
          margin-top: 20px;
        }
        .btn {
          padding: 12px 20px;
          border: none;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          text-decoration: none;
        }
        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none !important;
        }
        .btn-primary {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: white;
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
        }
        .btn-primary:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(99, 102, 241, 0.4);
        }
        .btn-secondary {
          background: white;
          color: #374151;
          border: 2px solid #e2e8f0;
        }
        .btn-secondary:hover:not(:disabled) {
          background: #f8fafc;
          transform: translateY(-1px);
          border-color: #6366f1;
        }
        .btn-success {
          background: linear-gradient(135deg, #10b981, #059669);
          color: white;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
        }
        .btn-success:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(16, 185, 129, 0.4);
        }
        .remove-btn {
          background: #fef2f2;
          color: #dc2626;
          border: 2px solid #fecaca;
          border-radius: 8px;
          padding: 8px 12px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
          transition: all 0.2s ease;
        }
        .remove-btn:hover {
          background: #fee2e2;
          transform: scale(1.05);
        }
        .actions-grid {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
        }
        .status-indicator {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          background: #dbeafe;
          color: #1e40af;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          border: 1px solid #bfdbfe;
        }
        .lot-loading {
          position: relative;
        }
        .lot-loading::after {
          content: '';
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          width: 16px;
          height: 16px;
          border: 2px solid #e2e8f0;
          border-top: 2px solid #6366f1;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        .custom-add-btn {
          background: #f0f9ff;
          color: #0369a1;
          border: 2px dashed #7dd3fc;
          border-radius: 8px;
          padding: 8px 12px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
          transition: all 0.2s ease;
          margin-top: 4px;
        }
        .custom-add-btn:hover {
          background: #e0f2fe;
          border-color: #0ea5e9;
          transform: scale(1.05);
        }
        @keyframes spin {
          0% { transform: translateY(-50%) rotate(0deg); }
          100% { transform: translateY(-50%) rotate(360deg); }
        }
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
          backdrop-filter: blur(4px);
        }
        .modal-content {
          background: white;
          border-radius: 16px;
          padding: 32px;
          max-width: 440px;
          width: 100%;
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.2);
          border: 1px solid #f1f5f9;
        }
        .modal-title {
          font-size: 20px;
          font-weight: 700;
          margin-bottom: 16px;
          color: #1e293b;
        }
        .modal-actions {
          display: flex;
          gap: 12px;
          margin-top: 24px;
          justify-content: flex-end;
        }
        .lot-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 8px;
          background: #f0f9ff;
          color: #0369a1;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          margin-left: 8px;
        }
        @media (max-width: 768px) {
          .modern-po { padding: 16px; }
          .po-content { padding: 24px; }
          .form-grid { grid-template-columns: 1fr; }
          .actions-grid { flex-direction: column; }
          .po-header { padding: 24px; }
        }
        .print-only { display: none; }
        @media print {
          .modern-po { background: white; padding: 0; }
          .btn, .table-actions, .status-indicator { display: none !important; }
          .print-only { display: block; }
          .po-container { box-shadow: none; border-radius: 0; }
        }
      `}</style>

      <div className="po-container" ref={printableRef}>
        <header className="po-header">
          <h1 className="po-title">Purchase Order (AS PER LOT)</h1>
          <p className="po-subtitle">Create and manage supplier purchase orders with lot integration</p>
        </header>

        <div className="po-content">
          <div className="form-section">
            <h2 className="section-title">Basic Information</h2>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">PO Number</label>
                <input
                  type="text"
                  className="form-input"
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  readOnly
                  style={{ background: "#f8fafc", color: "#64748b" }}
                  title="Auto-generated unique PO number"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Supplier Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Enter supplier name"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Order Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Order Time</label>
                <input
                  type="time"
                  className="form-input"
                  value={orderTime}
                  onChange={(e) => setOrderTime(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Expected Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Expected Time</label>
                <input
                  type="time"
                  className="form-input"
                  value={expectedTime}
                  onChange={(e) => setExpectedTime(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Lead Time</label>
                <div className="form-input" style={{ background: "#f8fafc", color: "#64748b", fontWeight: "600" }}>
                  {leadHuman || "—"}
                </div>
              </div>
            </div>
          </div>

          <div className="form-section">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 className="section-title">Order Items</h2>
              <div className="total-display">
                <span className="total-label">TOTAL AMOUNT:</span>
                <span className="total-amount">₹{fmtMoney(totals.gross)}</span>
              </div>
            </div>

            {loadingSheet && <div className="status-indicator">📋 Loading price list...</div>}
            {sheetError && (
              <div className="status-indicator" style={{ background: "#fef2f2", color: "#dc2626" }}>
                ⚠️ Error: {sheetError}
              </div>
            )}

            <div className="table-container">
              <table className="items-table">
                <thead>
                  <tr>
                    <th style={{ width: "40px" }}>#</th>
                    <th style={{ width: "140px" }}>Department</th>
                    <th style={{ width: "180px" }}>Description</th>
                    <th style={{ width: "100px" }}>UOM</th>
                    <th style={{ width: "120px" }}>Lot No.</th>
                    <th style={{ width: "100px" }}>Qty As Per Lot</th>
                    <th style={{ width: "100px" }}>Manual Qty</th>
                    <th style={{ width: "120px" }}>Rate (₹)</th>
                    <th style={{ width: "120px", textAlign: "right" }}>Amount (₹)</th>
                    <th style={{ width: "60px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => {
                    const amount = (+r.qty || 0) * (+r.rate || 0);
                    const items = r.department ? itemsByDept[r.department] || [] : [];
                    return (
                      <tr key={idx}>
                        <td style={{ fontWeight: "600", color: "#6366f1" }}>{idx + 1}</td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <select
                              className="form-select"
                              value={r.department}
                              onChange={(e) => updateRow(idx, { department: e.target.value })}
                            >
                              <option value="">Select Department</option>
                              {departments.map((d) => (
                                <option key={d} value={d}>{d}</option>
                              ))}
                            </select>
                            <button 
                              className="custom-add-btn"
                              onClick={() => {
                                setSelectedDeptForItem(r.department || "");
                                setShowCustomDeptDialog(true);
                              }}
                            >
                              + Add New Department
                            </button>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <select
                              className="form-select"
                              value={r.description}
                              onChange={(e) => updateRow(idx, { description: e.target.value })}
                              disabled={!r.department}
                            >
                              <option value="">Select Item</option>
                              {items.map((it) => (
                                <option key={it} value={it}>{it}</option>
                              ))}
                            </select>
                            {r.department && (
                              <button 
                                className="custom-add-btn"
                                onClick={() => {
                                  setSelectedDeptForItem(r.department);
                                  setShowCustomItemDialog(true);
                                }}
                              >
                                + Add New Item
                              </button>
                            )}
                          </div>
                        </td>
                        <td>
                          <UomSelect value={r.uom} onChange={(val) => updateRow(idx, { uom: val })} />
                        </td>
                       <td>
  <div style={{ position: 'relative' }}>
    <input
      type="text"
      className={`form-input ${loadingLot === idx ? 'lot-loading' : ''}`}
      placeholder="Enter Lot No."
      value={r.lotNo}
      onChange={(e) => updateRow(idx, { lotNo: e.target.value })}
      onBlur={(e) => handleLotNumberChange(idx, e.target.value)}
      disabled={loadingLot === idx}
    />
    {loadingLot === idx && (
      <div style={{
        position: 'absolute',
        right: '10px',
        top: '50%',
        transform: 'translateY(-50%)',
        fontSize: '12px',
        color: '#6366f1'
      }}>
        Loading...
      </div>
    )}
  </div>
</td>

                        <td>
                          <input
                            type="number"
                            step="0.01"
                            value={r.qtyAsPerLot}
                            readOnly
                            style={{ 
                              background: '#f0f9ff', 
                              color: '#0369a1', 
                              fontWeight: '600',
                              borderColor: '#bae6fd'
                            }}
                            title="Quantity from lot data (read-only)"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            value={r.qty}
                            onChange={(e) => updateRow(idx, { qty: e.target.value })}
                            placeholder="Enter Qty"
                            style={{ borderColor: r.qty > r.qtyAsPerLot ? '#f59e0b' : '#e2e8f0' }}
                          />
                        </td>
                       <td>
  <input
    type="number"
    step="0.01"
    value={r.rate}
    onChange={(e) => updateRow(idx, { rate: e.target.value })}
    placeholder="0.00 (Optional)"
    style={{ borderColor: '#e2e8f0' }} // Remove any warning color
  />
</td>
                        <td style={{ textAlign: "right", fontWeight: "700", color: "#059669", fontSize: "14px" }}>
                          ₹{fmtMoney(amount)}
                        </td>
                        <td>
                          <button className="remove-btn" onClick={() => removeRow(idx)} title="Remove line">
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="table-actions">
              <button className="btn btn-secondary" onClick={addRow}>
                ➕ Add Line
              </button>
              <button className="btn btn-secondary" onClick={() => setRows([blankRow()])}>
                🗑️ Clear All
              </button>
            </div>
          </div>

          <div className="form-section">
            <h2 className="section-title">Actions</h2>
            <div className="actions-grid">
              <button
                className="btn btn-secondary"
                onClick={() => setPoNumber(makePoNumber())}
              >
                🔄 Generate New PO
              </button>
              <button className="btn btn-secondary" onClick={handleSave}>
                💾 Save Draft
              </button>
              <button className="btn btn-success" onClick={handleDownloadPdf}>
                📄 Download PDF
              </button>
              <button className="btn btn-primary" onClick={handleOpenSubmitDialog} disabled={isSubmitting}>
                {isSubmitting ? "⏳ Submitting..." : "🚀 Submit for Approval"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Supervisor Dialog */}
      {showSupervisorDialog && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="modal-title">Supervisor Approval</h3>
            <p style={{ color: "#64748b", marginBottom: "20px", fontSize: "14px" }}>
              Enter supervisor name for approval and PDF generation:
            </p>
            <div className="form-group">
              <input
                type="text"
                className="form-input"
                placeholder="Enter supervisor name"
                value={supervisorName}
                onChange={(e) => setSupervisorName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowSupervisorDialog(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleConfirmSubmit} disabled={isSubmitting}>
                {isSubmitting ? "Submitting..." : "✅ Confirm & Download PDF"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Department Dialog */}
      {showCustomDeptDialog && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="modal-title">Add Custom Department</h3>
            <p style={{ color: "#64748b", marginBottom: "20px", fontSize: "14px" }}>
              Enter a new department name:
            </p>
            <div className="form-group">
              <input
                type="text"
                className="form-input"
                placeholder="Enter department name"
                value={customDeptInput}
                onChange={(e) => setCustomDeptInput(e.target.value)}
                autoFocus
              />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => {
                setShowCustomDeptDialog(false);
                setCustomDeptInput("");
              }}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleAddCustomDepartment}>
                ✅ Add Department
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Item Dialog */}
      {showCustomItemDialog && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="modal-title">Add Custom Item</h3>
            <p style={{ color: "#64748b", marginBottom: "20px", fontSize: "14px" }}>
              Add a new item to department: <strong>{selectedDeptForItem}</strong>
            </p>
            <div className="form-group">
              <label className="form-label">Item Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="Enter item name"
                value={customItemInput}
                onChange={(e) => setCustomItemInput(e.target.value)}
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">Rate (₹)</label>
              <input
                type="number"
                step="0.01"
                className="form-input"
                placeholder="Enter rate"
                value={customRateInput}
                onChange={(e) => setCustomRateInput(e.target.value)}
              />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => {
                setShowCustomItemDialog(false);
                setCustomItemInput("");
                setCustomRateInput("");
              }}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleAddCustomItem}>
                ✅ Add Item
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}