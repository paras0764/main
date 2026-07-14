// PurchaseOrderForm.jsx
import { useEffect, useMemo, useState, useRef } from "react";
import { jsPDF } from "jspdf";
import "./PurchaseOrderForm.css";

/** =========================
 * CONFIG
 * ========================= */
const WEB_APP_BASE =
  "https://script.google.com/macros/s/AKfycbydY5UUXgbyseONnQvnrWldDpmxzRH_m9crbMMhyTapZZ4flbV6AztESNjmusoH1xAluA/exec";

const SHEET_ID = "1hy43mDxXtGVq4jeMV_NxX25Q7tnX55NnplN7eqpT74k";
const RANGE_A1 = "SHEET1!A1:C";
const API_KEY = "AIzaSyAomDFBkOySlIxKWSKGHe6ATv9gvaBr7uk";

// Add PO Data Range - Adjust this based on your sheet structure
const PO_DATA_RANGE = "PO_Items!A:I"; // Change this to your actual PO data sheet name and range

/** =========================
 * Local Storage Keys
 * ========================= */
const LOCAL_STORAGE_KEYS = {
  SHADE_ENABLED: "po_shade_enabled",
  DESCRIPTIONS: "po_descriptions",
  SHADES: "po_shades",
  GST_ENABLED: "po_gst_enabled",
  GST_PERCENTAGE: "po_gst_percentage",
  LAST_PO_NUMBER: "po_last_number", // Store last loaded PO number
  // New keys for approval dropdowns
  REQUISITION_NAMES: "po_requisition_names",
  PREPARED_NAMES: "po_prepared_names",
  APPROVED_NAMES: "po_approved_names",
};

// Default dropdown options
const DEFAULT_REQUISITION_NAMES = ["JAYBIR", "NITIN KHANNA", "SONU MASTER JI", "EA"];
const DEFAULT_PREPARED_NAMES = ["RASHMI"];
const DEFAULT_APPROVED_NAMES = [ "SAHIL SIR", "EA", "MOHIT GOYAL"];

/** =========================
 * utils
 * ========================= */
const fmtMoney = (n) =>
  (Number.isFinite(+n) ? +n : 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// Enhanced PO Number Generation with timestamp for guaranteed uniqueness
function makeUniquePoNumber() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `PO-${hours}${minutes}${seconds}`;
}

const blankRow = () => ({ 
  department: "", 
  description: "", 
  shade: "", 
  uom: "", 
  qty: 0, 
  rate: 0 
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

// NEW: Function to fetch PO data by PO number
async function fetchPODataByNumber(poNumber, sheetId, apiKey) {
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(
      PO_DATA_RANGE
    )}?key=${apiKey}`;
    
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Sheets API error: ${resp.status}`);
    
    const data = await resp.json();
    const values = data.values || [];
    
    if (values.length < 2) {
      throw new Error("No data found in PO sheet");
    }
    
    // Parse headers
    const headers = values[0];
    const poNumberColIndex = headers.findIndex(h => 
      h?.toLowerCase().includes("po") || 
      h?.toLowerCase().includes("po number") ||
      h === "PO #"
    );
    
    const lineColIndex = headers.findIndex(h => 
      h?.toLowerCase().includes("line") || 
      h?.toLowerCase().includes("line #")
    );
    
    const deptColIndex = headers.findIndex(h => 
      h?.toLowerCase().includes("department") || 
      h?.toLowerCase().includes("dept")
    );
    
    const descColIndex = headers.findIndex(h => 
      h?.toLowerCase().includes("description") || 
      h?.toLowerCase().includes("item")
    );
    
    const uomColIndex = headers.findIndex(h => 
      h?.toLowerCase().includes("uom") || 
      h?.toLowerCase().includes("unit")
    );
    
    const qtyColIndex = headers.findIndex(h => 
      h?.toLowerCase().includes("qty") || 
      h?.toLowerCase().includes("quantity")
    );
    
    const rateColIndex = headers.findIndex(h => 
      h?.toLowerCase().includes("rate") || 
      h?.toLowerCase().includes("price")
    );
    
    // Find all rows matching the PO number
    const matchingRows = [];
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      if (row[poNumberColIndex] === poNumber) {
        matchingRows.push({
          line: row[lineColIndex] || i,
          department: row[deptColIndex] || "",
          description: row[descColIndex] || "",
          uom: row[uomColIndex] || "",
          qty: parseFloat(row[qtyColIndex]) || 0,
          rate: parseFloat(row[rateColIndex]) || 0,
          amount: parseFloat(row[qtyColIndex] || 0) * parseFloat(row[rateColIndex] || 0),
        });
      }
    }
    
    if (matchingRows.length === 0) {
      throw new Error(`No data found for PO number: ${poNumber}`);
    }
    
    return matchingRows;
  } catch (error) {
    console.error("Error fetching PO data:", error);
    throw error;
  }
}

// NEW: Function to fetch all PO numbers for autocomplete
async function fetchAllPONumbers(sheetId, apiKey) {
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(
      PO_DATA_RANGE
    )}?key=${apiKey}`;
    
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Sheets API error: ${resp.status}`);
    
    const data = await resp.json();
    const values = data.values || [];
    
    if (values.length < 2) return [];
    
    const headers = values[0];
    const poNumberColIndex = headers.findIndex(h => 
      h?.toLowerCase().includes("po") || 
      h?.toLowerCase().includes("po number") ||
      h === "PO #"
    );
    
    if (poNumberColIndex === -1) return [];
    
    const poNumbers = new Set();
    for (let i = 1; i < values.length; i++) {
      const poNumber = values[i][poNumberColIndex];
      if (poNumber && poNumber.trim()) {
        poNumbers.add(poNumber.trim());
      }
    }
    
    return Array.from(poNumbers).sort().reverse();
  } catch (error) {
    console.error("Error fetching PO numbers:", error);
    return [];
  }
}

export function downloadPdfBlob(doc, fileName) {
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
export async function toDataURL_QR(qrText, size = 300) {
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
export function buildPoQrUrls({ base = WEB_APP_BASE, poNo, orderDate, expectedDate, supervisorName }) {
  const enc = encodeURIComponent;
  const who = supervisorName ? `&who=${enc(supervisorName)}` : "";
  const gateUrl = `${base}?action=gate&po=${enc(poNo)}&date=${enc(orderDate || "")}${who}`;
  const recvUrl = `${base}?action=receive&po=${enc(poNo)}&rdate=${enc(expectedDate || "")}${who}`;
  return { gateUrl, recvUrl };
}

/** =========================
 * Local Storage Utilities
 * ========================= */
function getLocalStorageItem(key, defaultValue) {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (e) {
    console.error(`Error reading ${key} from localStorage:`, e);
    return defaultValue;
  }
}

function setLocalStorageItem(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`Error saving ${key} to localStorage:`, e);
  }
}

let saveDescriptionTimeout = null;
let saveShadeTimeout = null;

function saveDescriptionWithDebounce(description) {
  if (!description || !description.trim()) return;
  if (saveDescriptionTimeout) clearTimeout(saveDescriptionTimeout);
  saveDescriptionTimeout = setTimeout(() => {
    const trimmedValue = description.trim();
    if (trimmedValue.length < 2) return;
    const savedItems = getLocalStorageItem(LOCAL_STORAGE_KEYS.DESCRIPTIONS, []);
    if (!savedItems.includes(trimmedValue)) {
      const updatedItems = [trimmedValue, ...savedItems.filter(item => item !== trimmedValue)];
      setLocalStorageItem(LOCAL_STORAGE_KEYS.DESCRIPTIONS, updatedItems.slice(0, 50));
    }
    saveDescriptionTimeout = null;
  }, 1500);
}

function saveShadeWithDebounce(shade) {
  if (!shade || !shade.trim()) return;
  if (saveShadeTimeout) clearTimeout(saveShadeTimeout);
  saveShadeTimeout = setTimeout(() => {
    const trimmedValue = shade.trim();
    if (trimmedValue.length < 2) return;
    const savedItems = getLocalStorageItem(LOCAL_STORAGE_KEYS.SHADES, []);
    if (!savedItems.includes(trimmedValue)) {
      const updatedItems = [trimmedValue, ...savedItems.filter(item => item !== trimmedValue)];
      setLocalStorageItem(LOCAL_STORAGE_KEYS.SHADES, updatedItems.slice(0, 50));
    }
    saveShadeTimeout = null;
  }, 1500);
}

function saveDescriptionOnBlur(description) {
  if (!description || !description.trim()) return;
  const trimmedValue = description.trim();
  if (trimmedValue.length < 2) return;
  const savedItems = getLocalStorageItem(LOCAL_STORAGE_KEYS.DESCRIPTIONS, []);
  if (!savedItems.includes(trimmedValue)) {
    const updatedItems = [trimmedValue, ...savedItems.filter(item => item !== trimmedValue)];
    setLocalStorageItem(LOCAL_STORAGE_KEYS.DESCRIPTIONS, updatedItems.slice(0, 50));
  }
}

function saveShadeOnBlur(shade) {
  if (!shade || !shade.trim()) return;
  const trimmedValue = shade.trim();
  if (trimmedValue.length < 2) return;
  const savedItems = getLocalStorageItem(LOCAL_STORAGE_KEYS.SHADES, []);
  if (!savedItems.includes(trimmedValue)) {
    const updatedItems = [trimmedValue, ...savedItems.filter(item => item !== trimmedValue)];
    setLocalStorageItem(LOCAL_STORAGE_KEYS.SHADES, updatedItems.slice(0, 50));
  }
}

// Save name to localStorage
function saveNameToLocalStorage(key, name) {
  if (!name || !name.trim()) return;
  const trimmedName = name.trim();
  if (trimmedName.length < 2) return;
  
  const savedNames = getLocalStorageItem(key, []);
  if (!savedNames.includes(trimmedName)) {
    const updatedNames = [trimmedName, ...savedNames.filter(n => n !== trimmedName)];
    setLocalStorageItem(key, updatedNames.slice(0, 50));
  }
}

/** =========================
 * PDF - UPDATED VERSION with GST support and new signature fields
 * ========================= */
/** =========================
 * PDF - UPDATED VERSION with Two Copies (Original + Supplier Copy with Zero Rates)
 * ========================= */
export function generatePurchaseOrderPDF({ payload, options = {} }) {
  const { 
    qrGateImage = null, 
    qrRecvImage = null, 
    qrSide = 96, 
    shadeEnabled = false,
    gstEnabled = false,
    gstPercentage = 0
  } = options;
  
  const doc = new jsPDF({ unit: "pt", format: "a3" });
  
  // Helper function to draw a single PO page
  const drawPODocument = (rowsWithValues, isSupplierCopy = false) => {
    doc.setFont("helvetica", "normal");
    doc.setLineWidth(0.8);

    const page = { 
      w: doc.internal.pageSize.getWidth(), 
      h: doc.internal.pageSize.getHeight(), 
      m: 40, 
      gap: 12 
    };

    const setSize = (s) => doc.setFontSize(s);
    const bold = () => doc.setFont(undefined, "bold");
    const normal = () => doc.setFont(undefined, "normal");
    const text = (t, x, y, opt = {}) => doc.text(String(t ?? ""), x, y, opt);
    const rtext = (t, x, y, opt = {}) => text(t, x, y, { align: "right", ...opt });
    const ctext = (t, x, y, opt = {}) => text(t, x, y, { align: "center", ...opt });
    const line = (x1, y1, x2, y2) => {
      doc.setDrawColor(0, 0, 0);
      doc.line(x1, y1, x2, y2);
    };
    const wrap = (str, w) => doc.splitTextToSize(String(str || ""), w);
    const money = (n) =>
      (Number.isFinite(+n) ? +n : 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const roundRect = (x, y, w, h, r = 7, style = "S") => {
      doc.setDrawColor(0, 0, 0);
      if (doc.roundedRect) {
        return doc.roundedRect(x, y, w, h, r, r, style);
      } else {
        return doc.rect(x, y, w, h, style);
      }
    };

    const drawRect = (x, y, w, h, style = "S") => {
      doc.setDrawColor(0, 0, 0);
      doc.rect(x, y, w, h, style);
    };

    const SIG_H = 92;
    const QR_TITLE_H = 18;
    const QR_SIDE = qrSide || 96;
    const BOTTOM_QR_H = QR_TITLE_H + 8 + QR_SIDE + 10;
    const FOOTER_HEIGHT = BOTTOM_QR_H + 12 + SIG_H + 8;
    const FOOTER_START_Y = page.h - page.m - FOOTER_HEIGHT;
    const CONTENT_MAX_Y = FOOTER_START_Y - 20;

    let y = page.m;

    const needSpaceForContent = (requiredHeight) => {
      if (y + requiredHeight > CONTENT_MAX_Y) {
        drawFooterOnPage();
        doc.addPage();
        doc.setDrawColor(0, 0, 0);
        roundRect(16, 16, page.w - 32, page.h - 32, 8, "S");
        y = page.m;
        drawPageHeader(isSupplierCopy);
        return true;
      }
      return false;
    };

    const drawPageHeader = (isSupplierCopyHeader = false) => {
      setSize(20);
      bold();
      const headerText = isSupplierCopyHeader ? "PURCHASE ORDER (SUPPLIER COPY)" : "PURCHASE ORDER (ORIGINAL)";
      text(headerText, page.w / 2, y, { align: "center" });
      normal();
      line(page.m, y + 6, page.w - page.m, y + 6);
      y += 26;
    };

    const drawFooterOnPage = () => {
      const innerW = page.w - 2 * page.m;
      const colW = (innerW - page.gap * 2) / 3;
      const x1 = page.m, x2 = x1 + colW + page.gap, x3 = x2 + colW + page.gap;

      const sigTop = page.h - page.m - SIG_H;
      const blockTop = sigTop - 12 - BOTTOM_QR_H;

      roundRect(x1, blockTop, colW, BOTTOM_QR_H, 7, "S");
      setSize(10);
      bold(); text("MATERIAL RECEIVED", x1 + 10, blockTop + 14); normal();
      line(x1 + 10, blockTop + 18, x1 + colW - 10, blockTop + 18);
      if (qrRecvImage) {
        const qx = x1 + 10 + (colW - 20 - QR_SIDE) / 2;
        const qy = blockTop + 18 + 10;
        try { doc.addImage(qrRecvImage, "PNG", qx, qy, QR_SIDE, QR_SIDE); } catch {}
      }

      const bigW = colW * 2 + page.gap;
      roundRect(x2, blockTop, bigW, BOTTOM_QR_H, 7, "S");
      setSize(10);
      bold(); ctext("REMARKS", x2 + bigW / 2, blockTop + 14); normal();
      line(x2 + 10, blockTop + 18, x2 + bigW - 10, blockTop + 18);
      
      if (payload.meta?.remarks && payload.meta.remarks.trim() !== "") {
        const remarksLines = doc.splitTextToSize(payload.meta.remarks, bigW - 60);
        const totalTextHeight = remarksLines.length * 12;
        const boxCenterY = blockTop + BOTTOM_QR_H / 2;
        const textStartY = boxCenterY - totalTextHeight / 2 + 6;
        const minStartY = blockTop + 28;
        const actualStartY = Math.max(textStartY, minStartY);
        
        let ry = actualStartY;
        remarksLines.forEach(lineText => {
          if (ry < blockTop + BOTTOM_QR_H - 10) {
            ctext(lineText.trim(), x2 + bigW / 2, ry);
            ry += 12;
          }
        });
      } else {
        const boxCenterY = blockTop + BOTTOM_QR_H / 2;
        ctext("No remarks provided", x2 + bigW / 2, boxCenterY, { fontStyle: "italic", opacity: 0.5 });
      }

      // Updated signature section with 4 columns
      const sigColWidth = (innerW - page.gap * 3) / 4;
      const xSig1 = page.m;
      const xSig2 = xSig1 + sigColWidth + page.gap;
      const xSig3 = xSig2 + sigColWidth + page.gap;
      const xSig4 = xSig3 + sigColWidth + page.gap;

      [xSig1, xSig2, xSig3, xSig4].forEach((x) => roundRect(x, sigTop, sigColWidth, SIG_H, 7, "S"));
      
      bold();
      text("REQUISITION RAISED BY", xSig1 + 10, sigTop + 16);
      text("PREPARED BY", xSig2 + 10, sigTop + 16);
      text("APPROVED BY", xSig3 + 10, sigTop + 16);
      text("SUPPLIER'S",  xSig4 + 10, sigTop + 16);
      normal();

      const writeSig = (x, showRequisitionName, showPreparedName, showApprovedName) => {
        const baseY = sigTop + SIG_H - 26;
        text("Signature", x + 10, baseY - 10);
        line(x + 10, baseY - 8, x + sigColWidth - 10, baseY - 8);
        text("Name:", x + 10, baseY + 2);
        
        if (x === xSig1 && showRequisitionName && payload.meta?.requisitionRaisedBy) {
          text(payload.meta.requisitionRaisedBy, x + 46, baseY + 2);
        } else if (x === xSig2 && showPreparedName && payload.meta?.preparedBy) {
          text(payload.meta.preparedBy, x + 46, baseY + 2);
        } else if (x === xSig3 && showApprovedName && payload.meta?.approvedBy) {
          text(payload.meta.approvedBy, x + 46, baseY + 2);
        }
        
        text("Date:", x + 10, baseY + 14);
      };
      
      writeSig(xSig1, true, false, false);
      writeSig(xSig2, false, true, false);
      writeSig(xSig3, false, false, true);
      writeSig(xSig4, false, false, false);
    };

    doc.setDrawColor(0, 0, 0);
    roundRect(16, 16, page.w - 32, page.h - 32, 8, "S");
    drawPageHeader(isSupplierCopy);

    (function drawTopSection() {
      const innerW = page.w - 2 * page.m;
      const rPO = 0.44, rSup = 0.26, rGate = 0.30;
      const wAvail = innerW - page.gap * 2;
      const wPO = Math.floor(wAvail * rPO);
      const wSup = Math.floor(wAvail * rSup);
      const wGate = wAvail - wPO - wSup;

      const x1 = page.m;
      const x2 = x1 + wPO + page.gap;
      const x3 = x2 + wSup + page.gap;

      const metaPad = 12;
      const labelValueGap = 20;
      
      const mRows = [
        ["PO #", (payload.meta?.poNumber || "").replace(/\s+/g, "")],
        ["Order", [payload.meta?.orderDate, payload.meta?.orderTime].filter(Boolean).join(" ")],
        ...(payload.meta?.expectedDate ? [["Expected", payload.meta.expectedDate]] : []),
        ...(payload.meta?.leadTimeHuman ? [["Lead Time", payload.meta.leadTimeHuman]] : []),
        ...(payload.meta?.requisitionRaisedBy ? [["Requisition Raised By", payload.meta.requisitionRaisedBy]] : []),
        ...(payload.meta?.preparedBy ? [["Prepared By", payload.meta.preparedBy]] : []),
        ...(payload.meta?.approvedBy ? [["Approved By", payload.meta.approvedBy]] : []),
      ];
      
      let totalMetaHeight = 22 + 16;
      mRows.forEach(([label, value]) => {
        const labelWidth = doc.getTextWidth(`${label}:`);
        const valueX = metaPad + labelWidth + labelValueGap;
        const maxValueWidth = wPO - valueX - metaPad;
        const valueLines = doc.splitTextToSize(value || "", maxValueWidth);
        totalMetaHeight += 16 + (Math.max(0, valueLines.length - 1) * 16);
      });
      const metaH = totalMetaHeight;

      const supPad = 12;
      const supBodyW = wSup - supPad * 2;
      const supLines = [
        payload.supplierName || "",
        ...wrap(payload.supplierAddress || "", supBodyW),
        ...(payload.supplierPhone ? [`Phone: ${payload.supplierPhone}`] : []),
        ...(payload.supplierEmail ? [`Email: ${payload.supplierEmail}`] : []),
      ];
      const supH = 22 + supLines.filter(Boolean).length * 12 + 16;

      const gateH = QR_TITLE_H + 8 + QR_SIDE + 10;
      const blockH = Math.max(metaH, supH, gateH);
      
      if (needSpaceForContent(blockH)) return;

      // PO DETAILS Box
      roundRect(x1, y, wPO, blockH, 7, "S");
      setSize(13);
      bold(); text("PO DETAILS", x1 + 12, y + 14); normal();
      line(x1 + 12, y + 18, x1 + wPO - 12, y + 18);
      
      let my = y + 30;
      mRows.forEach(([label, value]) => {
        const labelX = x1 + metaPad;
        const labelWidth = doc.getTextWidth(`${label}:`);
        const valueX = labelX + labelWidth + labelValueGap;
        const maxValueWidth = wPO - (valueX - x1) - metaPad;
        
        bold(); text(`${label}:`, labelX, my);
        normal();
        
        const valueLines = doc.splitTextToSize(value || "", maxValueWidth);
        
        valueLines.forEach((line, idx) => {
          text(line, valueX, my + (idx * 16));
        });
        
        my += 16 + (Math.max(0, valueLines.length - 1) * 16);
      });

      // SUPPLIER Box
      roundRect(x2, y, wSup, blockH, 7, "S");
      setSize(13);
      bold(); text("SUPPLIER", x2 + 12, y + 14); normal();
      line(x2 + 12, y + 18, x2 + wSup - 12, y + 18);
      let sy = y + 30;
      supLines.forEach((ln) => { if (ln) { text(ln, x2 + supPad, sy); sy += 12; } });

      // GATE IN Box
      roundRect(x3, y, wGate, blockH, 7, "S");
      setSize(12);
      bold(); text("GATE IN — SCAN (FORM)", x3 + 12, y + 14); normal();
      line(x3 + 12, y + 18, x3 + wGate - 12, y + 18);
      if (qrGateImage) {
        const qx = x3 + 12 + (wGate - 24 - QR_SIDE) / 2;
        const qy = y + 18 + 10;
        try { doc.addImage(qrGateImage, "PNG", qx, qy, QR_SIDE, QR_SIDE); } catch {}
      }

      y += blockH + 16;
    })();

   (function drawTable() {
  const x0 = page.m, innerW = page.w - 2 * page.m;
  setSize(13); normal();

  const rows = (rowsWithValues || []).map((r, i) => {
    const qStr = (+r.qty || 0).toLocaleString();
    // For supplier copy, set rate to 0 and amount to 0
    const rate = isSupplierCopy ? 0 : (+r.rate || 0);
    const amt = (+r.qty || 0) * rate;
    const rateStr = money(rate);
    const amtStr = money(amt);
    return { ...r, _i: i, _qtyStr: qStr, _rateStr: rateStr, _amtStr: amtStr, _rateValue: rate };
  });

  let totalSum = rows.reduce((sum, r) => sum + ((+r.qty || 0) * r._rateValue), 0);
  const gstAmount = gstEnabled && !isSupplierCopy ? (totalSum * gstPercentage) / 100 : 0;
  
  const BASE_WIDTHS = {
    line: 40, department: 120, description: 250, shade: 120,
    uom: 70, qty: 80, rate: 90, amount: 110
  };
  
  let cols;
  if (shadeEnabled) {
    cols = [
      { key: "line", title: "#", w: BASE_WIDTHS.line, align: "right" },
      { key: "department", title: "DEPARTMENT", w: BASE_WIDTHS.department },
      { key: "description", title: "DESCRIPTION", w: BASE_WIDTHS.description },
      { key: "shade", title: "SHADE", w: BASE_WIDTHS.shade },
      { key: "uom", title: "UOM", w: BASE_WIDTHS.uom, align: "center" },
      { key: "qty", title: "QTY", w: BASE_WIDTHS.qty, align: "right" },
      { key: "rate", title: "RATE", w: BASE_WIDTHS.rate, align: "right" },
      { key: "amount", title: "AMOUNT", w: BASE_WIDTHS.amount, align: "right" },
    ];
  } else {
    cols = [
      { key: "line", title: "#", w: BASE_WIDTHS.line, align: "right" },
      { key: "department", title: "DEPARTMENT", w: BASE_WIDTHS.department },
      { key: "description", title: "DESCRIPTION", w: BASE_WIDTHS.description },
      { key: "uom", title: "UOM", w: BASE_WIDTHS.uom, align: "center" },
      { key: "qty", title: "QTY", w: BASE_WIDTHS.qty, align: "right" },
      { key: "rate", title: "RATE", w: BASE_WIDTHS.rate, align: "right" },
      { key: "amount", title: "AMOUNT", w: BASE_WIDTHS.amount, align: "right" },
    ];
  }
  
  let totalFixedWidth = cols.reduce((sum, col) => sum + col.w, 0);
  const widthDiff = innerW - totalFixedWidth;
  const descColIndex = cols.findIndex(col => col.key === "description");
  if (descColIndex >= 0 && widthDiff !== 0) {
    cols[descColIndex].w = Math.max(150, cols[descColIndex].w + widthDiff);
    totalFixedWidth = cols.reduce((sum, col) => sum + col.w, 0);
  }
  
  if (totalFixedWidth > innerW) {
    const overflow = totalFixedWidth - innerW;
    if (descColIndex >= 0) {
      cols[descColIndex].w = Math.max(100, cols[descColIndex].w - overflow);
    }
  }
  
  const xs = [x0];
  let cumulativeX = x0;
  for (let i = 0; i < cols.length; i++) {
    cumulativeX += cols[i].w;
    xs.push(cumulativeX);
  }

  const headerH = 30, baseH = 24;

  const drawTableHeader = () => {
    if (needSpaceForContent(headerH)) {}
    doc.setDrawColor(0, 0, 0);
    drawRect(x0, y, innerW, headerH);
    setSize(12); bold();
    cols.forEach((c, i) => {
      const cx = c.align === "right" ? xs[i + 1] - 10 : 
                 c.align === "center" ? (xs[i] + xs[i + 1]) / 2 : 
                 xs[i] + 10;
      const opt = c.align === "right" ? { align: "right" } : 
                  c.align === "center" ? { align: "center" } : 
                  {};
      text(c.title, cx, y + 20, opt);
      if (i > 0) {
        doc.setDrawColor(0, 0, 0);
        line(xs[i], y, xs[i], y + headerH);
      }
    });
    normal(); 
    y += headerH;
  };

  const drawTableRow = (r, idx) => {
    const descColIndex = cols.findIndex(col => col.key === "description");
    const shadeColIndex = shadeEnabled ? cols.findIndex(col => col.key === "shade") : -1;
    
    const descWidth = descColIndex >= 0 ? cols[descColIndex].w - 20 : 0;
    const shadeWidth = shadeColIndex >= 0 ? cols[shadeColIndex].w - 20 : 0;
    
    const descLines = doc.splitTextToSize(r.description || "", descWidth);
    const shadeLines = shadeEnabled ? doc.splitTextToSize(r.shade || "", shadeWidth) : [];
    
    const rowH = Math.max(baseH, descLines.length * 14 + 10, shadeLines.length * 14 + 10);
    
    if (needSpaceForContent(rowH)) {
      drawTableHeader();
    }
    
    doc.setDrawColor(0, 0, 0);
    drawRect(x0, y, innerW, rowH);
    for (let i = 1; i < xs.length - 1; i++) {
      doc.setDrawColor(0, 0, 0);
      line(xs[i], y, xs[i], y + rowH);
    }
    const yy = y + 16;
    
    let colIndex = 0;
    rtext(r.line ?? idx + 1, xs[colIndex + 1] - 10, yy);
    colIndex++;
    text(r.department || "", xs[colIndex] + 10, yy);
    colIndex++;
    descLines.forEach((ln, j) => text(ln, xs[colIndex] + 10, yy + j * 14));
    colIndex++;
    
    if (shadeEnabled) {
      if (shadeLines.length > 0) {
        shadeLines.forEach((ln, j) => text(ln, xs[colIndex] + 10, yy + j * 14));
      } else {
        text(r.shade || "", xs[colIndex] + 10, yy);
      }
      colIndex++;
    }
    
    text(r.uom || "", (xs[colIndex] + xs[colIndex + 1]) / 2, yy, { align: "center" });
    colIndex++;
    rtext(r._qtyStr, xs[colIndex + 1] - 10, yy);
    colIndex++;
    rtext(r._rateStr, xs[colIndex + 1] - 10, yy);
    colIndex++;
    rtext(r._amtStr, xs[colIndex + 1] - 10, yy);
    
    y += rowH;
    return (+r.qty || 0) * r._rateValue;
  };

  drawTableHeader();
  totalSum = 0;
  rows.forEach((r, i) => {
    totalSum += drawTableRow(r, i);
  });
  
  const finalGstAmount = gstEnabled && !isSupplierCopy ? (totalSum * gstPercentage) / 100 : 0;
  const finalGrandTotal = totalSum + finalGstAmount;
  const rateColIndex = cols.findIndex(col => col.key === "rate");
  
  // Calculate total quantity
  const totalQty = rows.reduce((sum, r) => sum + (+r.qty || 0), 0);
  
  const subtotalH = 26;
  if (needSpaceForContent(subtotalH + (gstEnabled && !isSupplierCopy ? 26 : 0) + 30)) {
    drawTableHeader();
  }
  
  // Draw TOTAL QUANTITY row
  doc.setDrawColor(0, 0, 0);
  drawRect(x0, y, innerW, subtotalH);
  // Add vertical lines for the row
  for (let i = 1; i < xs.length - 1; i++) {
    doc.setDrawColor(0, 0, 0);
    line(xs[i], y, xs[i], y + subtotalH);
  }
  setSize(12); bold();
  text("TOTAL QTY", x0 + 10, y + 18);
  // Find the QTY column index
  const qtyColIndex = cols.findIndex(col => col.key === "qty");
  if (qtyColIndex >= 0) {
    rtext(totalQty.toLocaleString(), xs[qtyColIndex + 1] - 10, y + 18);
  }
  normal(); 
  y += subtotalH;
  
  // Draw SUBTOTAL row (for amounts)
  doc.setDrawColor(0, 0, 0);
  drawRect(x0, y, innerW, subtotalH);
  if (rateColIndex >= 0) {
    doc.setDrawColor(0, 0, 0);
    line(xs[rateColIndex], y, xs[rateColIndex], y + subtotalH);
  }
  setSize(12); bold();
  text("SUBTOTAL", x0 + 10, y + 18);
  rtext(money(totalSum), xs[xs.length - 1] - 10, y + 18);
  normal(); 
  y += subtotalH;
  
  if (gstEnabled && !isSupplierCopy) {
    doc.setDrawColor(0, 0, 0);
    drawRect(x0, y, innerW, subtotalH);
    if (rateColIndex >= 0) {
      doc.setDrawColor(0, 0, 0);
      line(xs[rateColIndex], y, xs[rateColIndex], y + subtotalH);
    }
    setSize(12); bold();
    text(`GST ${gstPercentage}%`, x0 + 10, y + 18);
    rtext(money(finalGstAmount), xs[xs.length - 1] - 10, y + 18);
    normal(); 
    y += subtotalH;
  }
  
  const totalH = 30;
  doc.setDrawColor(0, 0, 0);
  drawRect(x0, y, innerW, totalH);
  if (rateColIndex >= 0) {
    doc.setDrawColor(0, 0, 0);
    line(xs[rateColIndex], y, xs[rateColIndex], y + totalH);
  }
  setSize(14); bold();
  const totalLabel = (gstEnabled && !isSupplierCopy) ? "GRAND TOTAL" : "TOTAL";
  text(totalLabel, x0 + 10, y + 20);
  rtext(money(finalGrandTotal), xs[xs.length - 1] - 12, y + 20);
  normal(); 
  y += totalH;
})();

    drawFooterOnPage();
  };

  // Prepare rows for original and supplier copy
  const originalRows = payload.rows.map(r => ({
    ...r,
    line: r.line,
    department: r.department,
    description: r.description,
    shade: r.shade,
    uom: r.uom,
    qty: r.qty,
    rate: r.rate  // Original rate
  }));

  const supplierRows = payload.rows.map(r => ({
    ...r,
    line: r.line,
    department: r.department,
    description: r.description,
    shade: r.shade,
    uom: r.uom,
    qty: r.qty,
    rate: 0  // Zero rate for supplier copy
  }));

  // Draw first page (original with rates)
  drawPODocument(originalRows, false);
  
  // Add new page for supplier copy
  doc.addPage();
  
  // Draw second page (supplier copy with zero rates)
  drawPODocument(supplierRows, true);
  
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
 * Custom Dropdown Component with ability to add new values
 * ========================= */
// SmartDropdown Component - Fixed version
function SmartDropdown({ 
  value, 
  onChange, 
  options = [], 
  placeholder = "Select or type...",
  onSaveToLocalStorage,
  localStorageKey,
  required = false
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value || "");
  const [filteredOptions, setFilteredOptions] = useState(options);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    setInputValue(value || "");
  }, [value]);

  useEffect(() => {
    // Show all options when input is empty, otherwise filter
    if (!inputValue || inputValue.trim() === "") {
      setFilteredOptions(options);
    } else {
      const filtered = options.filter(opt => 
        opt.toLowerCase().includes(inputValue.toLowerCase())
      );
      setFilteredOptions(filtered);
    }
  }, [inputValue, options]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInputChange = (e) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange(newValue);
    setIsOpen(true);
  };

  const handleSelectOption = (option) => {
    setInputValue(option);
    onChange(option);
    setIsOpen(false);
    if (onSaveToLocalStorage && localStorageKey) {
      saveNameToLocalStorage(localStorageKey, option);
      onSaveToLocalStorage();
    }
  };

  const handleBlur = () => {
    // Small delay to allow click events on dropdown options to fire first
    setTimeout(() => {
      if (inputValue && inputValue.trim() && onSaveToLocalStorage && localStorageKey) {
        saveNameToLocalStorage(localStorageKey, inputValue);
        onSaveToLocalStorage();
      }
    }, 200);
  };

  const handleFocus = () => {
    setIsOpen(true);
    // Refresh filtered options to show all when focusing
    if (!inputValue || inputValue.trim() === "") {
      setFilteredOptions(options);
    }
  };

  return (
    <div className="smart-dropdown" ref={dropdownRef}>
      <input
        ref={inputRef}
        type="text"
        className={`form-input ${required && !value ? 'required-field' : ''}`}
        value={inputValue}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        autoComplete="off"
        required={required}
      />
      {required && !value && (
        <div className="field-required-message">This field is required</div>
      )}
      {isOpen && filteredOptions.length > 0 && (
        <div className="dropdown-options">
          {filteredOptions.map((option, index) => (
            <div
              key={index}
              className="dropdown-option"
              onClick={() => handleSelectOption(option)}
            >
              {option}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** =========================
 * COMPONENT
 * ========================= */
export default function PurchaseOrderForm({
  company = {
    name: "StitchPro Pvt. Ltd.",
    address: "Plot 42, Industrial Area, Jaipur, RJ",
    gstin: "08AABCS1234F1Z2",
    phone: "+91 98765 43210",
    email: "accounts@stitchpro.example",
  },
  poCountSoFar = 0,
  onSave = (po) => console.log("SAVE →", po),
  onSubmitForApproval = (po) => console.log("SUBMIT →", po),
}) {
  const [poNumber, setPoNumber] = useState(makeUniquePoNumber());
  const [orderDate, setOrderDate] = useState(todayISO());
  const [orderTime, setOrderTime] = useState(nowTime());
  const [expectedDate, setExpectedDate] = useState("");
  const [expectedTime, setExpectedTime] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [rows, setRows] = useState([blankRow()]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSupervisorDialog, setShowSupervisorDialog] = useState(false);
  
  // New state for Requisition Raised By and Authorized By
  const [requisitionRaisedBy, setRequisitionRaisedBy] = useState("");
  const [preparedBy, setPreparedBy] = useState("");
  const [approvedBy, setApprovedBy] = useState("");
  const [remarks, setRemarks] = useState("");
  
  // Saved names for dropdowns
  const [savedRequisitionNames, setSavedRequisitionNames] = useState(() => 
    getLocalStorageItem(LOCAL_STORAGE_KEYS.REQUISITION_NAMES, DEFAULT_REQUISITION_NAMES)
  );
  const [savedPreparedNames, setSavedPreparedNames] = useState(() => 
    getLocalStorageItem(LOCAL_STORAGE_KEYS.PREPARED_NAMES, DEFAULT_PREPARED_NAMES)
  );
  const [savedApprovedNames, setSavedApprovedNames] = useState(() => 
    getLocalStorageItem(LOCAL_STORAGE_KEYS.APPROVED_NAMES, DEFAULT_APPROVED_NAMES)
  );
  
  // New state for PO loading
  const [searchPoNumber, setSearchPoNumber] = useState("");
  const [isLoadingPO, setIsLoadingPO] = useState(false);
  const [availablePONumbers, setAvailablePONumbers] = useState([]);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [loadError, setLoadError] = useState("");
  
  // State for shade feature
  const [shadeEnabled, setShadeEnabled] = useState(() => 
    getLocalStorageItem(LOCAL_STORAGE_KEYS.SHADE_ENABLED, false)
  );
  const [savedDescriptions, setSavedDescriptions] = useState(() => 
    getLocalStorageItem(LOCAL_STORAGE_KEYS.DESCRIPTIONS, [])
  );
  const [savedShades, setSavedShades] = useState(() => 
    getLocalStorageItem(LOCAL_STORAGE_KEYS.SHADES, [])
  );
  
  // State for GST feature
  const [gstEnabled, setGstEnabled] = useState(() => 
    getLocalStorageItem(LOCAL_STORAGE_KEYS.GST_ENABLED, false)
  );
  const [gstPercentage, setGstPercentage] = useState(() => 
    getLocalStorageItem(LOCAL_STORAGE_KEYS.GST_PERCENTAGE, 18)
  );
  const [showGstDialog, setShowGstDialog] = useState(false);

  const [sheetRows, setSheetRows] = useState([]);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [sheetError, setSheetError] = useState("");

  const printableRef = useRef(null);

  const UOM_OPTIONS = [
    "PCS","SET","PAIR","DOZEN","GROSS","NOS","UNIT",
    "MG","GRAM","KG","QUINTAL","TON",
    "MM","CM","MTR","INCH","FEET","YARD","KM",
    "SQMM","SQCM","SQM","SQFT","SQYD","SFT",
    "ML","LTR","KL","CC","CUM",
    "ROLL","BUNDLE","BOX","PACK","BAG","SACK","CARTON","PALLET",
    "MTRS","KGS","CONES","HANK","BALE",
    "SEC","MIN","HOUR","DAY","WEEK","MONTH",
    "JOB","SHIFT","LOT","ORDER","LOAD"
  ];

  // Load available PO numbers on component mount
  useEffect(() => {
    loadAvailablePONumbers();
  }, []);

  // Load last used PO number from localStorage
  useEffect(() => {
    const lastPO = getLocalStorageItem(LOCAL_STORAGE_KEYS.LAST_PO_NUMBER, "");
    if (lastPO) {
      setSearchPoNumber(lastPO);
    }
  }, []);

  async function loadAvailablePONumbers() {
    try {
      const poNumbers = await fetchAllPONumbers(SHEET_ID, API_KEY);
      setAvailablePONumbers(poNumbers);
    } catch (error) {
      console.error("Error loading PO numbers:", error);
    }
  }

  // Function to load PO data
  async function handleLoadPO() {
    if (!searchPoNumber.trim()) {
      setLoadError("Please enter a PO number");
      return;
    }
    
    setIsLoadingPO(true);
    setLoadError("");
    
    try {
      const poData = await fetchPODataByNumber(searchPoNumber, SHEET_ID, API_KEY);
      
      if (poData && poData.length > 0) {
        const loadedRows = poData.map(item => ({
          department: item.department || "",
          description: item.description || "",
          shade: "",
          uom: item.uom || "",
          qty: item.qty || 0,
          rate: item.rate || 0
        }));
        
        setRows(loadedRows);
        setLocalStorageItem(LOCAL_STORAGE_KEYS.LAST_PO_NUMBER, searchPoNumber);
        alert(`Successfully loaded PO ${searchPoNumber} with ${poData.length} items`);
        setShowLoadDialog(false);
        setSearchPoNumber("");
      } else {
        setLoadError("No items found for this PO number");
      }
    } catch (error) {
      setLoadError(error.message || "Failed to load PO data");
    } finally {
      setIsLoadingPO(false);
    }
  }

  const openLoadDialog = () => {
    setShowLoadDialog(true);
    setSearchPoNumber("");
    setLoadError("");
  };

  // Refresh saved names from localStorage
  const refreshSavedNames = () => {
    setSavedRequisitionNames(getLocalStorageItem(LOCAL_STORAGE_KEYS.REQUISITION_NAMES, DEFAULT_REQUISITION_NAMES));
    setSavedPreparedNames(getLocalStorageItem(LOCAL_STORAGE_KEYS.PREPARED_NAMES, DEFAULT_PREPARED_NAMES));
    setSavedApprovedNames(getLocalStorageItem(LOCAL_STORAGE_KEYS.APPROVED_NAMES, DEFAULT_APPROVED_NAMES));
  };

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

  useEffect(() => {
    setLocalStorageItem(LOCAL_STORAGE_KEYS.SHADE_ENABLED, shadeEnabled);
  }, [shadeEnabled]);

  useEffect(() => {
    setLocalStorageItem(LOCAL_STORAGE_KEYS.GST_ENABLED, gstEnabled);
    setLocalStorageItem(LOCAL_STORAGE_KEYS.GST_PERCENTAGE, gstPercentage);
  }, [gstEnabled, gstPercentage]);

  useEffect(() => {
    setSavedDescriptions(getLocalStorageItem(LOCAL_STORAGE_KEYS.DESCRIPTIONS, []));
    setSavedShades(getLocalStorageItem(LOCAL_STORAGE_KEYS.SHADES, []));
  }, []);

  const departments = useMemo(() => {
    const set = new Set(sheetRows.map((r) => r.dept).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [sheetRows]);

  const itemsByDept = useMemo(() => {
    const map = new Map();
    sheetRows.forEach(({ dept, item }) => {
      if (!dept || !item) return;
      if (!map.has(dept)) map.set(dept, new Set());
      map.get(dept).add(item);
    });
    const obj = {};
    for (const [k, v] of map.entries()) obj[k] = Array.from(v).sort((a, b) => a.localeCompare(b));
    return obj;
  }, [sheetRows]);

  const rowAmount = (r) => (+r.qty || 0) * (+r.rate || 0);

  const totals = useMemo(() => {
    let sub = 0;
    rows.forEach((r) => (sub += rowAmount(r)));
    const gstAmount = gstEnabled ? (sub * gstPercentage) / 100 : 0;
    const grandTotal = sub + gstAmount;
    return { 
      sub, 
      discountTotal: 0, 
      taxTotal: 0, 
      gstAmount,
      gstPercentage: gstEnabled ? gstPercentage : 0,
      gross: sub,
      payable: grandTotal, 
      grandTotal,
      roundAdj: 0 
    };
  }, [rows, gstEnabled, gstPercentage]);

  const orderDT = toDate(orderDate, orderTime);
  const expectedDT = toDate(expectedDate, expectedTime);
  const leadMs = orderDT && expectedDT ? expectedDT - orderDT : null;
  const leadHuman = humanDuration(leadMs);

  const updateRow = (idx, patch) => {
    setRows((prev) => {
      const next = [...prev];
      const old = next[idx];
      let updated = { ...old, ...patch };
      next[idx] = updated;
      return next;
    });
  };

  const addRow = () => setRows((r) => [...r, blankRow()]);
  const removeRow = (idx) =>
    setRows((r) => (r.length === 1 ? [blankRow()] : r.filter((_, i) => i !== idx)));

  // Enhanced validation with required fields
  const validate = () => {
    const errs = [];
    
    // Required field validations
    if (!WEB_APP_BASE.includes("/exec")) errs.push("WEB_APP_BASE must be a deployed /exec URL.");
    if (!poNumber.trim()) errs.push("PO Number is required.");
    if (!supplierName.trim()) errs.push("Supplier Name is required.");
    if (!orderDate) errs.push("Order Date is required.");
    if (!orderTime) errs.push("Order Time is required.");
    
    // Validate at least one valid line item
    let hasValidLine = false;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const lineErrors = [];
      
      if (!r.department) lineErrors.push(`Line ${i + 1}: Department is required`);
      if (!r.description) lineErrors.push(`Line ${i + 1}: Description is required`);
      if (!r.uom) lineErrors.push(`Line ${i + 1}: UOM is required`);
      if (!r.qty || (+r.qty || 0) <= 0) lineErrors.push(`Line ${i + 1}: Quantity must be greater than 0`);
      // Rate validation removed - no longer required
      // if (!r.rate || (+r.rate || 0) <= 0) lineErrors.push(`Line ${i + 1}: Rate must be greater than 0`);
      
      if (lineErrors.length === 0) {
        hasValidLine = true;
      } else {
        errs.push(...lineErrors);
      }
    }
    
    if (!hasValidLine) errs.push("At least one complete line item with Department, Description, UOM, and Qty > 0 is required.");
    
    if (orderDT && expectedDT && expectedDT < orderDT)
      errs.push("Expected Material Date/Time cannot be before Order Date/Time.");
    
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
      requisitionRaisedBy: requisitionRaisedBy || null,
      preparedBy: preparedBy || null,
      approvedBy: approvedBy || null,
      remarks: remarks || "",
      createdAt: new Date().toISOString(),
      shadeEnabled,
      gstEnabled,
      gstPercentage: gstEnabled ? gstPercentage : 0,
    },
    company,
    supplierName,
    rows: rows.map((r, i) => ({
      line: i + 1,
      department: r.department,
      description: r.description,
      shade: r.shade || "",
      uom: r.uom,
      qty: +r.qty || 0,
      rate: +r.rate || 0,
      amount: rowAmount(r),
    })),
    totals,
    notes: "",
  });

  async function handleSave() {
    const errs = validate();
    if (errs.length) return alert("Please fix the following issues:\n\n" + errs.join("\n"));
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
    resetForm();
  }

  const handleOpenSubmitDialog = () => {
    const errs = validate();
    if (errs.length) return alert("Please fix the following issues:\n\n" + errs.join("\n"));
    setShowSupervisorDialog(true);
  };

  async function handleConfirmSubmit() {
    if (isSubmitting) return;
    
    // VALIDATION: Make all three approval fields mandatory
    if (!requisitionRaisedBy || !requisitionRaisedBy.trim()) {
      return alert("Requisition Raised By is required. Please enter the name of the person raising the requisition.");
    }
    if (!preparedBy || !preparedBy.trim()) {
      return alert("Prepared By is required. Please enter the name of the person preparing this PO.");
    }
    if (!approvedBy || !approvedBy.trim()) {
      return alert("Authorized By is required. Please enter the name of the authorizing person.");
    }

    setIsSubmitting(true);
    setShowSupervisorDialog(false);

    try {
      const payload = makePayload({});
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
        supervisorName: preparedBy || approvedBy || requisitionRaisedBy,
      });

      const [gateQR, recvQR] = await Promise.all([
        toDataURL_QR(gateUrl, 320),
        toDataURL_QR(recvUrl, 320),
      ]);

      const doc = generatePurchaseOrderPDF({
        payload,
        options: { 
          qrGateImage: gateQR, 
          qrRecvImage: recvQR, 
          qrSide: 96,
          shadeEnabled,
          gstEnabled,
          gstPercentage: gstEnabled ? gstPercentage : 0
        },
      });
      downloadPdfBlob(doc, `${payload.meta.poNumber}.pdf`);
      onSubmitForApproval(payload);
      resetForm();
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      setIsSubmitting(false);
    }
  }

  const resetForm = () => {
    setPoNumber(makeUniquePoNumber());
    setOrderDate(todayISO());
    setOrderTime(nowTime());
    setExpectedDate("");
    setExpectedTime("");
    setSupplierName("");
    setRows([blankRow()]);
    setRequisitionRaisedBy("");
    setPreparedBy("");
    setApprovedBy("");
    setRemarks("");
  };

  async function handleDownloadPdf() {
    const errs = validate();
    if (errs.length) return alert("Please fix the following issues before downloading:\n\n" + errs.join("\n"));
    
    const payload = makePayload();
    const poNo = payload.meta.poNumber;

    const { gateUrl, recvUrl } = buildPoQrUrls({
      base: WEB_APP_BASE,
      poNo,
      orderDate: payload.meta.orderDate,
      expectedDate: payload.meta.expectedDate,
      supervisorName: preparedBy || approvedBy || requisitionRaisedBy,
    });

    const [gateQR, recvQR] = await Promise.all([
      toDataURL_QR(gateUrl, 320),
      toDataURL_QR(recvUrl, 320),
    ]);

    const doc = generatePurchaseOrderPDF({ 
      payload, 
      options: { 
        qrGateImage: gateQR, 
        qrRecvImage: recvQR, 
        qrSide: 96,
        shadeEnabled,
        gstEnabled,
        gstPercentage: gstEnabled ? gstPercentage : 0
      } 
    });
    downloadPdfBlob(doc, `${poNumber}.pdf`);
  }

  const regeneratePoNumber = () => {
    setPoNumber(makeUniquePoNumber());
  };

  const toggleShadeEnabled = () => {
    const newState = !shadeEnabled;
    setShadeEnabled(newState);
    if (!newState) {
      setRows(rows.map(row => ({ ...row, shade: "" })));
    }
  };

  const handleGstToggle = () => {
    if (!gstEnabled) {
      setShowGstDialog(true);
    } else {
      setGstEnabled(false);
    }
  };

  const handleGstConfirm = () => {
    if (!gstPercentage || gstPercentage <= 0 || gstPercentage > 100) {
      alert("Please enter a valid GST percentage between 0.01 and 100");
      return;
    }
    setGstEnabled(true);
    setShowGstDialog(false);
  };

  const handleDescriptionChange = (idx, value) => {
    updateRow(idx, { description: value });
    saveDescriptionWithDebounce(value);
  };

  const handleShadeChange = (idx, value) => {
    updateRow(idx, { shade: value });
    saveShadeWithDebounce(value);
  };

  const handleBackNavigation = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = "/";
    }
  };

  function UomSelect({ value, onChange, disabled, required = true }) {
    const hasCustom = value && !UOM_OPTIONS.includes(String(value).toUpperCase());
    return (
      <select
        className={`uom-select ${required && !value ? 'required-field' : ''}`}
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
        required={required}
      >
        <option value="">Select UOM *</option>
        {UOM_OPTIONS.map((u) => (
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
      <div className="po-container" ref={printableRef}>
        <div className="po-header">
          <div className="header-content">
            <button 
              onClick={handleBackNavigation}
              className="back-button"
            >
              ← Back
            </button>
            
            <h1 className="po-title">Purchase Order</h1>
            <p className="po-subtitle">Create and manage supplier purchase orders with ease</p>
          </div>
        </div>
        <div className="po-content">
          <div className="content-grid">
            <div className="sidebar">
              <div className="nav-section">
                <div className="nav-title">Navigation</div>
                <div className="nav-item" onClick={handleBackNavigation}>
                  <div className="nav-icon">←</div>
                  <span>Go Back</span>
                </div>
                <div className="nav-item active">
                  <div className="nav-icon">📋</div>
                  <span>PO Details</span>
                </div>
                <div className="nav-item">
                  <div className="nav-icon">📦</div>
                  <span>Items & Pricing</span>
                </div>
                <div className="nav-item">
                  <div className="nav-icon">⚡</div>
                  <span>Quick Actions</span>
                </div>
              </div>

              <div className="nav-section">
                <div className="nav-title">Load Previous PO</div>
                <div className="nav-item" onClick={openLoadDialog}>
                  <div className="nav-icon">📂</div>
                  <span>Load PO by Number</span>
                </div>
                {availablePONumbers.length > 0 && (
                  <div className="suggestions-info" style={{ marginTop: '8px', padding: '0 16px' }}>
                    {availablePONumbers.length} previous POs available
                  </div>
                )}
              </div>

              <div className="nav-section">
                <div className="nav-title">Information</div>
                <div style={{ padding: '12px 16px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Total Items</div>
                  <div style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>{rows.length}</div>
                </div>
              </div>

              <div className="nav-section">
                <div className="nav-title">Features</div>
                <div 
                  className={`nav-item ${shadeEnabled ? 'active' : ''}`} 
                  onClick={toggleShadeEnabled}
                >
                  <div className="nav-icon">🎨</div>
                  <span>Shade Column</span>
                  <span style={{ 
                    marginLeft: 'auto', 
                    fontSize: '12px', 
                    background: shadeEnabled ? 'white' : '#e2e8f0',
                    color: shadeEnabled ? '#4f46e5' : '#64748b',
                    padding: '2px 8px',
                    borderRadius: '10px'
                  }}>
                    {shadeEnabled ? 'ON' : 'OFF'}
                  </span>
                </div>
                <div 
                  className={`nav-item ${gstEnabled ? 'active' : ''}`} 
                  onClick={handleGstToggle}
                >
                  <div className="nav-icon">💰</div>
                  <span>GST Included</span>
                  <span style={{ 
                    marginLeft: 'auto', 
                    fontSize: '12px', 
                    background: gstEnabled ? 'white' : '#e2e8f0',
                    color: gstEnabled ? '#4f46e5' : '#64748b',
                    padding: '2px 8px',
                    borderRadius: '10px'
                  }}>
                    {gstEnabled ? `${gstPercentage}%` : 'OFF'}
                  </span>
                </div>
                <div className="nav-item" onClick={() => {
                  const descCount = savedDescriptions.length;
                  const shadeCount = savedShades.length;
                  alert(`Saved Suggestions:\n\nDescriptions: ${descCount} items\nShades: ${shadeCount} items\n\nThese will appear in dropdowns when typing.`);
                }}>
                  <div className="nav-icon">💾</div>
                  <span>Saved Suggestions</span>
                  <span style={{ 
                    marginLeft: 'auto', 
                    fontSize: '12px', 
                    background: '#e0e7ff',
                    color: '#4f46e5',
                    padding: '2px 8px',
                    borderRadius: '10px'
                  }}>
                    {savedDescriptions.length + savedShades.length}
                  </span>
                </div>
              </div>

              <div className="nav-section">
                <div className="nav-title">Actions</div>
                <div className="nav-item" onClick={handleSave}>
                  <div className="nav-icon">💾</div>
                  <span>Save Draft</span>
                </div>
                <div className="nav-item" onClick={handleDownloadPdf}>
                  <div className="nav-icon">📄</div>
                  <span>Download PDF</span>
                </div>
                <div className="nav-item" onClick={handleOpenSubmitDialog}>
                  <div className="nav-icon">🚀</div>
                  <span>Submit PO</span>
                </div>
              </div>
            </div>

            <div className="main-content">
              <div className="section-card">
                <div className="section-header">
                  <div className="section-icon">📋</div>
                  <div>
                    <div className="section-title">Basic Information</div>
                    <div className="section-subtitle">Enter purchase order details and supplier information</div>
                  </div>
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">PO Number <span className="required-star">*</span></label>
                    <div className="po-number-group">
                      <input
                        type="text"
                        className="form-input"
                        value={poNumber}
                        onChange={(e) => setPoNumber(e.target.value)}
                        style={{ flex: 1 }}
                        required
                      />
                      <button 
                        className="regenerate-btn" 
                        onClick={regeneratePoNumber}
                        title="Generate new PO number"
                      >
                        🔄
                      </button>
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                        Format: PO-HHMMSS
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Supplier Name <span className="required-star">*</span></label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Enter supplier name"
                      value={supplierName}
                      onChange={(e) => setSupplierName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Order Date <span className="required-star">*</span></label>
                    <input
                      type="date"
                      className="form-input"
                      value={orderDate}
                      onChange={(e) => setOrderDate(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Order Time <span className="required-star">*</span></label>
                    <input
                      type="time"
                      className="form-input"
                      value={orderTime}
                      onChange={(e) => setOrderTime(e.target.value)}
                      required
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
                    <div className="form-input" style={{ background: "#f8fafc", color: "#64748b", display: 'flex', alignItems: 'center' }}>
                      {leadHuman || "—"}
                      {leadHuman && <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#4f46e5' }}>⏱️</span>}
                    </div>
                  </div>

                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label">Remarks</label>
                    <textarea
                      className="form-textarea"
                      placeholder="Enter any special instructions, notes, or remarks for this purchase order"
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      rows={3}
                    />
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                      These remarks will appear in the PDF under the "REMARKS" section
                    </div>
                  </div>
                </div>
              </div>

              <div className="section-card">
                <div className="section-header">
                  <div className="section-icon">📝</div>
                  <div>
                    <div className="section-title">Approval Information</div>
                    <div className="section-subtitle">Enter requisition and approval details <span className="required-star">* All fields are mandatory</span></div>
                  </div>
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Requisition Raised By <span className="required-star">*</span></label>
                    <SmartDropdown
                      value={requisitionRaisedBy}
                      onChange={setRequisitionRaisedBy}
                      options={savedRequisitionNames}
                      placeholder="Select or type name..."
                      onSaveToLocalStorage={refreshSavedNames}
                      localStorageKey={LOCAL_STORAGE_KEYS.REQUISITION_NAMES}
                      required={true}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Prepared By <span className="required-star">*</span></label>
                    <SmartDropdown
                      value={preparedBy}
                      onChange={setPreparedBy}
                      options={savedPreparedNames}
                      placeholder="Select or type name..."
                      onSaveToLocalStorage={refreshSavedNames}
                      localStorageKey={LOCAL_STORAGE_KEYS.PREPARED_NAMES}
                      required={true}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Authorized By <span className="required-star">*</span></label>
                    <SmartDropdown
                      value={approvedBy}
                      onChange={setApprovedBy}
                      options={savedApprovedNames}
                      placeholder="Select or type name..."
                      onSaveToLocalStorage={refreshSavedNames}
                      localStorageKey={LOCAL_STORAGE_KEYS.APPROVED_NAMES}
                      required={true}
                    />
                  </div>
                </div>
              </div>

              <div className="section-card">
                <div className="section-header">
                  <div className="section-icon">📦</div>
                  <div>
                    <div className="section-title">Items & Pricing</div>
                    <div className="section-subtitle">Add items, quantities, and pricing information <span className="required-star">*</span></div>
                  </div>
                </div>

                <div className="feature-toggles">
                  <div 
                    className={`shade-toggle ${shadeEnabled ? 'active' : ''}`}
                    onClick={toggleShadeEnabled}
                  >
                    <div className="shade-toggle-switch"></div>
                    <span className="shade-toggle-label">
                      {shadeEnabled ? 'Shade Column Enabled' : 'Enable Shade Column'}
                    </span>
                    <span className="saved-count">
                      {shadeEnabled ? `${savedShades.length} saved` : 'OFF'}
                    </span>
                  </div>

                  <div 
                    className={`gst-toggle ${gstEnabled ? 'active' : ''}`}
                    onClick={handleGstToggle}
                  >
                    <div className="gst-toggle-switch"></div>
                    <span className="gst-toggle-label">
                      {gstEnabled ? 'GST Included' : 'Add GST'}
                    </span>
                    <span className="gst-percentage">
                      {gstEnabled ? `${gstPercentage}%` : 'OFF'}
                    </span>
                  </div>
                </div>

                {savedDescriptions.length > 0 && (
                  <div className="suggestions-info">
                    📝 You have {savedDescriptions.length} saved descriptions. They will appear as suggestions when typing.
                  </div>
                )}
                {shadeEnabled && savedShades.length > 0 && (
                  <div className="suggestions-info">
                    🎨 You have {savedShades.length} saved shades. They will appear as suggestions when typing.
                  </div>
                )}

                <div className="total-card">
                  <div className="total-label">TOTAL AMOUNT</div>
                  <div className="total-amount">₹{fmtMoney(totals.grandTotal)}</div>
                  
                  {gstEnabled && (
                    <div className="gst-breakdown">
                      <div className="gst-line">
                        <span>Subtotal:</span>
                        <span>₹{fmtMoney(totals.gross)}</span>
                      </div>
                      <div className="gst-line">
                        <span>GST ({gstPercentage}%):</span>
                        <span>₹{fmtMoney(totals.gstAmount)}</span>
                      </div>
                      <div className="gst-line total">
                        <span>Grand Total:</span>
                        <span>₹{fmtMoney(totals.grandTotal)}</span>
                      </div>
                    </div>
                  )}
                </div>

                {loadingSheet && (
                  <div className="status-indicator" style={{ marginBottom: '16px' }}>
                    <span>🔄</span>
                    Loading price list...
                  </div>
                )}
                {sheetError && (
                  <div className="status-indicator" style={{ background: "#fef2f2", color: "#dc2626", borderColor: "#fecaca", marginBottom: '16px' }}>
                    <span>⚠️</span>
                    Error: {sheetError}
                  </div>
                )}

                <div className="table-container">
                  <table className="items-table">
                    <thead>
                      <tr>
                        <th style={{ width: "40px" }}>#</th>
                        <th style={{ width: "160px" }}>Department <span className="required-star">*</span></th>
                        <th>Description <span className="required-star">*</span></th>
                        {shadeEnabled && <th style={{ width: "120px" }}>Shade</th>}
                        <th style={{ width: "100px" }}>UOM <span className="required-star">*</span></th>
                        <th style={{ width: "100px" }}>Qty <span className="required-star">*</span></th>
                        <th style={{ width: "120px" }}>Rate (₹)</th>
                        <th style={{ width: "120px", textAlign: "right" }}>Amount (₹)</th>
                        <th style={{ width: "60px" }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, idx) => {
                        const amount = rowAmount(r);
                        const items = r.department ? itemsByDept[r.department] || [] : [];
                        return (
                          <tr key={idx}>
                            <td style={{ fontWeight: '600', color: '#64748b' }}>{idx + 1}</td>
                            <td>
                              <select
                                className={`form-select ${!r.department ? 'required-field' : ''}`}
                                value={r.department}
                                onChange={(e) => updateRow(idx, { department: e.target.value })}
                                required
                              >
                                <option value="">Select Department *</option>
                                {departments.map((d) => (
                                  <option key={d} value={d}>
                                    {d}
                                  </option>
                                ))}
                                <option value="Other">Other (Manual Entry)</option>
                              </select>
                            </td>
                            <td>
                              <input
                                type="text"
                                className={`form-input ${!r.description ? 'required-field' : ''}`}
                                placeholder="Enter item description *"
                                value={r.description}
                                onChange={(e) => handleDescriptionChange(idx, e.target.value)}
                                list={`desc-${idx}`}
                                onBlur={(e) => {
                                  saveDescriptionOnBlur(e.target.value);
                                  setSavedDescriptions(getLocalStorageItem(LOCAL_STORAGE_KEYS.DESCRIPTIONS, []));
                                }}
                                required
                              />
                              <datalist id={`desc-${idx}`}>
                                {savedDescriptions.map((desc, i) => (
                                  <option key={`desc-${i}`} value={desc} />
                                ))}
                                {items.map((it) => (
                                  <option key={it} value={it} />
                                ))}
                              </datalist>
                            </td>
                            {shadeEnabled && (
                              <td>
                                <input
                                  type="text"
                                  className="form-input"
                                  placeholder="Enter shade"
                                  value={r.shade}
                                  onChange={(e) => handleShadeChange(idx, e.target.value)}
                                  list={`shade-${idx}`}
                                  onBlur={(e) => {
                                    saveShadeOnBlur(e.target.value);
                                    setSavedShades(getLocalStorageItem(LOCAL_STORAGE_KEYS.SHADES, []));
                                  }}
                                />
                                <datalist id={`shade-${idx}`}>
                                  {savedShades.map((shade, i) => (
                                    <option key={`shade-${i}`} value={shade} />
                                  ))}
                                </datalist>
                              </td>
                            )}
                            <td>
                              <UomSelect value={r.uom} onChange={(val) => updateRow(idx, { uom: val })} required={true} />
                            </td>
                            <td>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                className={!r.qty || r.qty <= 0 ? 'required-field' : ''}
                                value={r.qty}
                                onChange={(e) => updateRow(idx, { qty: e.target.value })}
                                placeholder="0.00 *"
                                required
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={r.rate}
                                onChange={(e) => updateRow(idx, { rate: e.target.value })}
                                placeholder="0.00"
                              />
                            </td>
                            <td style={{ textAlign: "right", fontWeight: "700", color: amount > 0 ? "#059669" : "#64748b" }}>
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
                    <span>+</span>
                    Add New Line
                  </button>
                  <button className="btn btn-danger" onClick={() => setRows([blankRow()])}>
                    <span>🗑️</span>
                    Clear All
                  </button>
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => {
                      if (window.confirm('Clear all saved descriptions and shades?')) {
                        localStorage.removeItem(LOCAL_STORAGE_KEYS.DESCRIPTIONS);
                        localStorage.removeItem(LOCAL_STORAGE_KEYS.SHADES);
                        setSavedDescriptions([]);
                        setSavedShades([]);
                        alert('All saved suggestions cleared!');
                      }
                    }}
                  >
                    <span>🗑️</span>
                    Clear Saved Suggestions
                  </button>
                </div>
              </div>

              <div className="section-card">
                <div className="section-header">
                  <div className="section-icon">⚡</div>
                  <div>
                    <div className="section-title">Quick Actions</div>
                    <div className="section-subtitle">Save, download, or submit your purchase order</div>
                  </div>
                </div>

                <div className="actions-grid">
                  <button className="btn load-po-btn" onClick={openLoadDialog}>
                    <span>📂</span>
                    Load Previous PO
                  </button>
                  <button className="btn btn-secondary" onClick={regeneratePoNumber}>
                    <span>🔄</span>
                    New PO Number
                  </button>
                  <button className="btn btn-secondary" onClick={handleSave}>
                    <span>💾</span>
                    Save Draft
                  </button>
                  <button className="btn btn-success" onClick={handleDownloadPdf}>
                    <span>📄</span>
                    Preview
                  </button>
                  <button className="btn btn-primary" onClick={handleOpenSubmitDialog} disabled={isSubmitting}>
                    <span>{isSubmitting ? "⏳" : "🚀"}</span>
                    {isSubmitting ? "Submitting..." : "Submit for Approval"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <section className="print-only" style={{ padding: "20px", borderTop: "1px solid #e5e7eb" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              fontSize: "12px",
            }}
          >
            <div>
              <div style={{ fontWeight: 700, marginBottom: "4px" }}>{company.name}</div>
              <div style={{ color: "#64748b", marginBottom: "4px" }}>{company.address}</div>
              {company.gstin && <div style={{ marginBottom: "2px" }}>GSTIN: {company.gstin}</div>}
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 700, marginBottom: "4px" }}>PO #: {poNumber}</div>
              <div style={{ marginBottom: "2px" }}>
                Order: {orderDate}
                {orderTime ? ` ${orderTime}` : ""}
              </div>
              {expectedDate && (
                <div style={{ marginBottom: "2px" }}>
                  Expected: {expectedDate}
                  {expectedTime ? ` ${expectedTime}` : ""}
                </div>
              )}
              {leadHuman && <div style={{ marginBottom: "2px" }}>Lead Time: {leadHuman}</div>}
              {requisitionRaisedBy && <div style={{ marginBottom: "2px" }}>Requisition Raised By: {requisitionRaisedBy}</div>}
              {preparedBy && <div style={{ marginBottom: "2px" }}>Prepared By: {preparedBy}</div>}
              {approvedBy && <div style={{ marginBottom: "2px" }}>Authorized By: {approvedBy}</div>}
              {remarks && <div style={{ marginBottom: "2px", maxWidth: "200px" }}>Remarks: {remarks}</div>}
              <div style={{ marginBottom: "2px" }}>Supplier: {supplierName}</div>
              <div style={{ fontWeight: 700 }}>Total: ₹{fmtMoney(totals.grandTotal)}</div>
              {gstEnabled && (
                <div style={{ fontSize: "11px", color: "#64748b" }}>
                  (Includes GST {gstPercentage}%: ₹{fmtMoney(totals.gstAmount)})
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Load PO Dialog */}
      {showLoadDialog && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="modal-title">Load Previous Purchase Order</h3>
            <p className="modal-subtitle">
              Enter a PO number to load its items
            </p>
            
            <div className="form-group">
              <input
                type="text"
                className="form-input"
                placeholder="Enter PO Number (e.g., PO-102819-1234)"
                value={searchPoNumber}
                onChange={(e) => setSearchPoNumber(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleLoadPO()}
                autoFocus
              />
              
              {availablePONumbers.length > 0 && (
                <div className="po-number-list">
                  <div style={{ padding: '8px 12px', background: '#f8fafc', fontSize: '12px', fontWeight: '600', color: '#64748b' }}>
                    Recent PO Numbers
                  </div>
                  {availablePONumbers.slice(0, 10).map((poNum) => (
                    <div 
                      key={poNum}
                      className="po-number-item"
                      onClick={() => {
                        setSearchPoNumber(poNum);
                        handleLoadPO();
                      }}
                    >
                      {poNum}
                    </div>
                  ))}
                </div>
              )}
              
              {loadError && (
                <div className="load-error">
                  ⚠️ {loadError}
                </div>
              )}
            </div>
            
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowLoadDialog(false)}>
                Cancel
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleLoadPO}
                disabled={isLoadingPO || !searchPoNumber.trim()}
              >
                {isLoadingPO ? "Loading..." : "Load PO"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supervisor Modal (Now for Requisition & Approval) */}
      {showSupervisorDialog && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="modal-title">Requisition & Approval Details</h3>
            <p className="modal-subtitle">
              Enter requisition and approval information <span style={{color: '#ef4444'}}>* All fields are required</span>
            </p>
            
            <div className="form-group">
              <label className="form-label">Requisition Raised By <span className="required-star">*</span></label>
              <SmartDropdown
                value={requisitionRaisedBy}
                onChange={setRequisitionRaisedBy}
                options={savedRequisitionNames}
                placeholder="Select or type name..."
                onSaveToLocalStorage={refreshSavedNames}
                localStorageKey={LOCAL_STORAGE_KEYS.REQUISITION_NAMES}
                required={true}
              />
            </div>
            
            <div className="form-group">
              <label className="form-label">Prepared By <span className="required-star">*</span></label>
              <SmartDropdown
                value={preparedBy}
                onChange={setPreparedBy}
                options={savedPreparedNames}
                placeholder="Select or type name..."
                onSaveToLocalStorage={refreshSavedNames}
                localStorageKey={LOCAL_STORAGE_KEYS.PREPARED_NAMES}
                required={true}
              />
            </div>
            
            <div className="form-group">
              <label className="form-label">Authorized By <span className="required-star">*</span></label>
              <SmartDropdown
                value={approvedBy}
                onChange={setApprovedBy}
                options={savedApprovedNames}
                placeholder="Select or type name..."
                onSaveToLocalStorage={refreshSavedNames}
                localStorageKey={LOCAL_STORAGE_KEYS.APPROVED_NAMES}
                required={true}
              />
            </div>
            
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowSupervisorDialog(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleConfirmSubmit} disabled={isSubmitting}>
                {isSubmitting ? "Submitting..." : "Confirm & Download PDF"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GST Dialog */}
      {showGstDialog && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="modal-title">Add GST</h3>
            <p className="modal-subtitle">
              Enter GST percentage to be included in the total amount
            </p>
            
            <div className="gst-input-container">
              <div className="gst-input-group">
                <input
                  type="number"
                  className="gst-input"
                  value={gstPercentage}
                  onChange={(e) => setGstPercentage(parseFloat(e.target.value) || 0)}
                  min="0.01"
                  max="100"
                  step="0.01"
                  autoFocus
                />
                <span className="gst-percent-symbol">%</span>
              </div>
              
              <div className="gst-presets">
                <button 
                  className="gst-preset-btn" 
                  onClick={() => setGstPercentage(5)}
                >
                  5%
                </button>
                <button 
                  className="gst-preset-btn" 
                  onClick={() => setGstPercentage(12)}
                >
                  12%
                </button>
                <button 
                  className="gst-preset-btn" 
                  onClick={() => setGstPercentage(18)}
                >
                  18%
                </button>
                <button 
                  className="gst-preset-btn" 
                  onClick={() => setGstPercentage(28)}
                >
                  28%
                </button>
              </div>
            </div>
            
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowGstDialog(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleGstConfirm}>
                Add GST
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}