import React, { useMemo, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiSearch, FiRefreshCw, FiAlertTriangle, FiUser, FiCalendar, FiX, FiCheck,
  FiScissors, FiInfo, FiPackage, FiTag, FiGrid, FiArrowLeft, FiDownload, FiPrinter,
  FiPlus, FiTrash2, FiCheckSquare, FiSquare, FiTruck, FiLogIn, FiLock, FiDollarSign,
  FiTrendingUp, FiClock, FiHash, FiLayers, FiClipboard, FiEdit3, FiSave,
  FiEye, FiEyeOff, FiFilter, FiMoreVertical, FiSettings, FiStar, FiArchive,
  FiChevronDown, FiChevronRight, FiHome, FiBarChart2, FiUsers, FiShoppingBag,
  FiToggleLeft, FiToggleRight, FiPercent, FiCopy, FiDatabase
} from 'react-icons/fi';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ---------- Google Apps Script Configuration ----------
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyM5rwPfx5rpvhNCcIYT4JybUhHSb5fAClauku9W6YKnisJ-Z6Xg4H7bjKCmQiBiqVePA/exec"; // Your URL

// ---------- Caching Helpers ----------
const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

function getCached(key) {
  const item = cache.get(key);
  if (item && Date.now() - item.timestamp < CACHE_DURATION) {
    return item.data;
  }
  cache.delete(key);
  return null;
}

function setCached(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

// ---------- Optimized Helpers ----------
function uniqCaseInsensitive(arr) {
  const seen = new Set();
  const out = [];
  for (const s of arr ?? []) {
    const k = String(s ?? "").trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

function titleCase(str) {
  return String(str ?? "")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Generate unique PO Number
function generatePONumber() {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `PO-${year}${month}${day}-${random}`;
}

/** QR (QuickChart) -> dataURL */
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
function buildPoQrUrls({ base, poNo, orderDate, expectedDate, supervisorName }) {
  const enc = encodeURIComponent;
  const who = supervisorName ? `&who=${enc(supervisorName)}` : "";
  const gateUrl = `${base}?action=gate&po=${enc(poNo)}&date=${enc(orderDate || "")}${who}`;
  const recvUrl = `${base}?action=receive&po=${enc(poNo)}&rdate=${enc(expectedDate || "")}${who}`;
  return { gateUrl, recvUrl };
}

// ============================
// Config
// ============================
const GOOGLE_API_KEY = "AIzaSyAomDFBkOySlIxKWSKGHe6ATv9gvaBr7uk";
const SHEET_ID = "1Hj3JeJEKB43aYYWv8gk2UhdU6BWuEQfCg5pBlTdBMNA";

// Helpers
const norm = (v) => (v ?? '').toString().trim();
const eq = (a, b) => norm(a).toLowerCase() === norm(b).toLowerCase();
const includes = (hay, needle) => norm(hay).toLowerCase().includes(norm(needle).toLowerCase());

function todayLocalISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

// ============================
// LOT helpers
// ============================
function digitsOnly(s) {
  const m = String(s ?? '').match(/\d+/g);
  return m ? m.join('') : '';
}

function classifyLot(lotInput) {
  const d = digitsOnly(lotInput);
  const searchKey = d;
  return { searchKey };
}

// ============================
// Optimized Lot Matrix Fetching
// ============================
async function fetchLotMatrixViaSheetsApi(lotNo, signal) {
  if (!GOOGLE_API_KEY || !SHEET_ID) {
    throw new Error('Missing API key or Sheet ID.');
  }

  const { searchKey } = classifyLot(lotNo);
  console.log('Searching for lot:', { searchKey });

  // Try index-based approach first (fastest)
  try {
    const indexData = await fetchIndexSheet(signal);
    const lotInfo = findLotInIndex(indexData, searchKey);
    if (lotInfo) {
      const parsed = await fetchFromCuttingUsingIndex(lotInfo, signal);
      parsed.source = 'cutting';
      return parsed;
    }
  } catch (err) {
    console.warn('Index path failed:', err?.message);
  }

  // Fallback to search (slower)
  try {
    const parsedAlt = await searchInCuttingSheet(searchKey, signal);
    parsedAlt.source = 'cutting';
    return parsedAlt;
  } catch (err) {
    console.warn('Cutting fallback failed:', err?.message);
  }

  throw new Error(`Lot ${searchKey} not found in Cutting`);
}

// ============================
// Sheets access — Index & Cutting
// ============================
async function fetchIndexSheet(signal) {
  try {
    const range = encodeURIComponent('Index!A1:Z');
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?key=${GOOGLE_API_KEY}`;
    const res = await fetch(url, { signal });

    if (!res.ok) {
      throw new Error(`Failed to access Index sheet: ${res.status}`);
    }

    const data = await res.json();
    if (!data?.values?.length) {
      throw new Error('Index sheet is empty');
    }

    console.log('Fetched Index sheet with', data.values.length, 'rows');
    return data.values;
  } catch (err) {
    console.error('Error fetching Index sheet:', err.message);
    throw err;
  }
}

function findLotInIndex(indexData, lotNo) {
  if (!indexData || indexData.length < 2) return null;

  const headers = indexData[0].map(norm);
  const lotNumberCol = headers.findIndex(h => includes(h, 'lot number'));
  const startRowCol = headers.findIndex(h => includes(h, 'startrow'));
  const numRowsCol = headers.findIndex(h => includes(h, 'numrows'));
  const headerColsCol = headers.findIndex(h => includes(h, 'headercols'));

  // Find the brand column index
  const brandCol = headers.findIndex(h => includes(h, 'brand'));
  // Find the party name column index
  const partyNameCol = headers.findIndex(h => includes(h, 'party name'));

  if (lotNumberCol === -1) {
    console.log('Lot Number column not found in Index sheet');
    return null;
  }

  for (let i = 1; i < indexData.length; i++) {
    const row = indexData[i] || [];
    const rowLotNo = norm(row[lotNumberCol]);

    if (rowLotNo === norm(lotNo)) {
      return {
        lotNumber: rowLotNo,
        startRow: startRowCol !== -1 ? parseInt(row[startRowCol]) || 1 : 1,
        numRows: numRowsCol !== -1 ? parseInt(row[numRowsCol]) || 20 : 20,
        headerCols: headerColsCol !== -1 ? parseInt(row[headerColsCol]) || 7 : 7,
        fabric: headers.includes('fabric') && row[headers.indexOf('fabric')] || '',
        garmentType: headers.includes('garment type') && row[headers.indexOf('garment type')] || '',
        brand: brandCol !== -1 && row[brandCol] ? norm(row[brandCol]) : '',
        style: headers.includes('style') && row[headers.indexOf('style')] || '',
        sizes: headers.includes('sizes') && row[headers.indexOf('sizes')] || '',
        shades: headers.includes('shades') && row[headers.indexOf('shades')] || '',
        partyName: partyNameCol !== -1 && row[partyNameCol] ? norm(row[partyNameCol]) : '',
      };
    }
  }

  return null;
}

async function fetchFromCuttingUsingIndex(lotInfo, signal) {
  const { startRow, numRows, headerCols, lotNumber } = lotInfo;

  try {
    const endRow = startRow + numRows - 1;
    const range = encodeURIComponent(`Cutting!A${startRow}:Z${endRow}`);

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?key=${GOOGLE_API_KEY}`;
    const res = await fetch(url, { signal });

    if (!res.ok) {
      throw new Error(`Failed to access Cutting sheet: ${res.status}`);
    }

    const data = await res.json();
    if (!data?.values?.length) {
      throw new Error('No data found in the specified range');
    }

    console.log(`Fetched ${data.values.length} rows from Cutting sheet using index`);
    console.log('Raw data:', data.values);

    const parsed = parseMatrixWithIndexInfo(data.values, lotInfo);
    if (parsed && parsed.rows && parsed.rows.length > 0) {
      console.log('Successfully parsed using index information');
      return parsed;
    }

    console.log('Primary parsing failed, trying alternative approach');
    const parsedAlt = parseMatrix(data.values, lotNumber);
    if (parsedAlt && parsedAlt.rows && parsedAlt.rows.length > 0) {
      console.log('Successfully parsed with alternative method');
      return parsedAlt;
    }

    throw new Error('Failed to parse data using both methods');

  } catch (err) {
    console.error('Error fetching using index:', err.message);
    throw err;
  }
}

async function searchInCuttingSheet(lotNo, signal) {
  console.log('Searching in Cutting sheet (fallback)');

  const range = encodeURIComponent('Cutting!A1:Z');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?key=${GOOGLE_API_KEY}`;
  const res = await fetch(url, { signal });

  if (!res.ok) throw new Error(`Failed to access Cutting sheet: ${res.status}`);

  const data = await res.json();
  if (!data?.values?.length) throw new Error('Cutting sheet is empty');

  const values = data.values;
  const section = sliceSectionForLot(values, lotNo);

  if (section?.length) {
    const parsed = parseMatrix(section, lotNo);
    if (parsed && parsed.rows.length) {
      return parsed;
    }
  }

  throw new Error('Lot not found in Cutting sheet');
}

function sliceSectionForLot(values, lotNo) {
  const rows = values;
  let start = -1;

  for (let i = 0; i < Math.min(rows.length, 200); i++) {
    const line = (rows[i] || []).join(' ');
    if (includes(line, 'cutting matrix') && includes(line, `lot ${lotNo}`)) { start = i; break; }
  }
  if (start === -1) {
    for (let i = 0; i < Math.min(rows.length, 200); i++) {
      const r = rows[i] || [];
      if (includes(r[0], 'lot number') && norm(r[1]) === norm(lotNo)) { start = Math.max(0, i - 1); break; }
    }
  }
  if (start === -1) return null;
  return rows.slice(start, Math.min(start + 80, rows.length));
}

function toNumOrNull(v) {
  const t = norm(v);
  if (t === '') return null;
  const n = parseFloat(t.replace(/[, ]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function parseMatrixWithIndexInfo(rows, lotInfo) {
  console.log('Parsing with index info:', lotInfo);
  console.log('Rows to parse:', rows);

  let lotNumber = lotInfo.lotNumber;
  let style = lotInfo.style || '';
  let fabric = lotInfo.fabric || '';
  let garmentType = lotInfo.garmentType || '';
  let brand = lotInfo.brand || '';
  let partyName = lotInfo.partyName || '';
  const headerCols = lotInfo.headerCols || 7;

  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const r = rows[i] || [];

    if (includes(r[0], 'lot number') && r[1]) {
      lotNumber = norm(r[1]);
      const idxStyle = r.findIndex((c) => includes(c, 'style'));
      if (idxStyle !== -1 && r[idxStyle + 1]) style = norm(r[idxStyle + 1]);
    }
    if (includes(r[0], 'fabric') && r[1]) {
      fabric = norm(r[1]);
      const idxGT = r.findIndex((c) => includes(c, 'garment type'));
      if (idxGT !== -1 && r[idxGT + 1]) garmentType = norm(r[idxGT + 1]);
      const idxBrand = r.findIndex((c) => includes(c, 'brand'));
      if (idxBrand !== -1 && r[idxBrand + 1]) brand = norm(r[idxBrand + 1]);
      const idxPartyName = r.findIndex((c) => includes(c, 'party name'));
      if (idxPartyName !== -1 && r[idxPartyName + 1]) partyName = norm(r[idxPartyName + 1]);
    }

    const styleIdx = r.findIndex(c => includes(c, 'style'));
    if (styleIdx !== -1 && r[styleIdx + 1] && !style) style = norm(r[styleIdx + 1]);

    const fabricIdx = r.findIndex(c => includes(c, 'fabric'));
    if (fabricIdx !== -1 && r[fabricIdx + 1] && !fabric) fabric = norm(r[fabricIdx + 1]);

    const garmentTypeIdx = r.findIndex(c => includes(c, 'garment type'));
    if (garmentTypeIdx !== -1 && r[garmentTypeIdx + 1] && !garmentType) garmentType = norm(r[garmentTypeIdx + 1]);

    const brandIdx = r.findIndex(c => includes(c, 'brand'));
    if (brandIdx !== -1 && r[brandIdx + 1] && !brand) brand = norm(r[brandIdx + 1]);

    const partyNameIdx = r.findIndex(c => includes(c, 'party name'));
    if (partyNameIdx !== -1 && r[partyNameIdx + 1] && !partyName) partyName = norm(r[partyNameIdx + 1]);
  }

  let headerIdx = -1;

  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const r = rows[i] || [];

    const hasColor = r.some(c => includes(c, 'color'));
    const hasCT = r.some(c => includes(c, 'cutting table') || includes(c, 'table'));
    const hasSizes = r.some(c => !isNaN(parseFloat(c)) && isFinite(c));

    if ((hasColor && hasCT) || (hasColor && hasSizes) || (hasCT && hasSizes)) {
      headerIdx = i;
      console.log('Found header at row:', i);
      break;
    }
  }

  if (headerIdx === -1) {
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const r = rows[i] || [];
      const textCols = r.filter(c => typeof c === 'string' && c.trim().length > 2);
      const numberCols = r.filter(c => !isNaN(parseFloat(c)) && isFinite(c));
      if (textCols.length >= 2 && numberCols.length >= 2) { headerIdx = i; break; }
    }
    if (headerIdx === -1) {
      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const r = rows[i] || [];
        if (r.some(cell => norm(cell))) { headerIdx = i; break; }
      }
    }
  }

  if (headerIdx === -1) {
    console.error('Could not find header row in provided data');
    return null;
  }

  const header = rows[headerIdx].map(norm);

  let idxColor = header.findIndex(c => includes(c, 'color'));
  let idxCT = header.findIndex(c => includes(c, 'cutting table') || includes(c, 'table'));
  let idxTotal = header.findIndex(c => includes(c, 'total'));

  if (idxColor === -1) {
    for (let i = 0; i < header.length; i++) {
      if (header[i] && typeof header[i] === 'string' && header[i].length > 2) { idxColor = i; break; }
    }
  }
  if (idxCT === -1) {
    for (let i = (idxColor !== -1 ? idxColor + 1 : 0); i < header.length; i++) {
      if (header[i] && (includes(header[i], 'table') || includes(header[i], 'ct'))) { idxCT = i; break; }
    }
    if (idxCT === -1 && idxColor !== -1) idxCT = idxColor + 1;
  }

  const sizeCols = [];
  const startIdx = idxCT !== -1 ? idxCT + 1 : idxColor !== -1 ? idxColor + 1 : 0;
  const endIdx = idxTotal !== -1 ? idxTotal : Math.min(header.length, headerCols);

  for (let i = startIdx; i < endIdx; i++) {
    const colName = norm(header[i]);
    if (colName && !includes(colName, 'total') && !includes(colName, 'alter') && !includes(colName, 'pcs')) {
      sizeCols.push({ key: colName, index: i });
    } else if (!colName) {
      sizeCols.push({ key: `Size${i - startIdx + 1}`, index: i });
    }
  }

  if (sizeCols.length === 0) {
    for (let i = startIdx; i < endIdx; i++) {
      for (let j = headerIdx + 1; j < Math.min(headerIdx + 5, rows.length); j++) {
        const cellValue = rows[j]?.[i];
        if (cellValue && !isNaN(parseFloat(cellValue)) && isFinite(cellValue)) {
          const colName = norm(header[i]) || `Size${i - startIdx + 1}`;
          sizeCols.push({ key: colName, index: i });
          break;
        }
      }
    }
  }

  if (sizeCols.length === 0) {
    console.error('No size columns found');
    return null;
  }

  const sizeKeys = sizeCols.map(s => s.key);

  const allColors = new Set();
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const color = idxColor !== -1 && row[idxColor] !== undefined ? norm(row[idxColor]) : '';
    if (color && !includes(color, 'total')) allColors.add(color);
  }

  const body = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const color = idxColor !== -1 && row[idxColor] !== undefined ? norm(row[idxColor]) : '';
    if (!color) { if (body.length > 0) break; continue; }
    if (includes(color, 'total')) break;

    const cuttingTable = idxCT !== -1 && row[idxCT] !== undefined ? toNumOrNull(row[idxCT]) : null;

    const sizeMap = {};
    let rowTotal = 0;
    let hasData = false;

    for (const s of sizeCols) {
      const qty = row[s.index] !== undefined ? toNumOrNull(row[s.index]) : null;
      sizeMap[s.key] = qty;
      if (qty !== null) { rowTotal += qty; hasData = true; }
    }

    if (hasData) {
      const explicitTotal = idxTotal !== -1 && row[idxTotal] !== undefined ? toNumOrNull(row[idxTotal]) : null;
      const totalPcs = explicitTotal ?? rowTotal;
      body.push({ color, cuttingTable, sizes: sizeMap, totalPcs });
    }
  }

  if (allColors.size > body.length) {
    const existingColors = new Set(body.map(row => row.color));
    const missing = Array.from(allColors).filter(c => !existingColors.has(c));
    for (const color of missing) {
      const sizeMap = {};
      for (const s of sizeCols) sizeMap[s.key] = null;
      body.push({ color, cuttingTable: null, sizes: sizeMap, totalPcs: 0 });
    }
  }

  body.sort((a, b) => a.color.localeCompare(b.color));

  const totals = { perSize: {}, grand: 0 };
  for (const k of sizeKeys) totals.perSize[k] = 0;
  for (const row of body) {
    for (const k of sizeKeys) totals.perSize[k] += row.sizes[k] ?? 0;
    totals.grand += row.totalPcs ?? 0;
  }

  return {
    lotNumber,
    style,
    fabric,
    garmentType,
    brand,
    partyName,
    sizes: sizeKeys,
    rows: body,
    totals
  };
}

function parseMatrix(rows, lotNo) {
  let lotNumber = norm(lotNo);
  let style = '';
  let fabric = '';
  let garmentType = '';
  let brand = '';
  let partyName = '';
  let season = '';

  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const r = rows[i] || [];
    if (includes(r[0], 'lot number')) {
      if (r[1]) lotNumber = norm(r[1]);
      const idxStyle = r.findIndex((c) => includes(c, 'style'));
      if (idxStyle !== -1 && r[idxStyle + 1]) style = norm(r[idxStyle + 1]);
    }
    if (includes(r[0], 'fabric')) {
      if (r[1]) fabric = norm(r[1]);
      const idxGT = r.findIndex((c) => includes(c, 'garment type'));
      if (idxGT !== -1 && r[idxGT + 1]) garmentType = norm(r[idxGT + 1]);
      const idxBrand = r.findIndex((c) => includes(c, 'brand'));
      if (idxBrand !== -1 && r[idxBrand + 1]) brand = norm(r[idxBrand + 1]);
      const idxPartyName = r.findIndex((c) => includes(c, 'party name'));
      if (idxPartyName !== -1 && r[idxPartyName + 1]) partyName = norm(r[idxPartyName + 1]);
      const idxSeason = r.findIndex((c) => includes(c, 'season'));
      if (idxSeason !== -1 && r[idxSeason + 1]) season = norm(r[idxSeason + 1]);
    }

    const styleIdx = r.findIndex(c => includes(c, 'style'));
    if (styleIdx !== -1 && r[styleIdx + 1] && !style) style = norm(r[styleIdx + 1]);

    const fabricIdx = r.findIndex(c => includes(c, 'fabric'));
    if (fabricIdx !== -1 && r[fabricIdx + 1] && !fabric) fabric = norm(r[fabricIdx + 1]);

    const garmentTypeIdx = r.findIndex(c => includes(c, 'garment type'));
    if (garmentTypeIdx !== -1 && r[garmentTypeIdx + 1] && !garmentType) garmentType = norm(r[garmentTypeIdx + 1]);

    const brandIdx = r.findIndex(c => includes(c, 'brand'));
    if (brandIdx !== -1 && r[brandIdx + 1] && !brand) brand = norm(r[brandIdx + 1]);

    const partyNameIdx = r.findIndex(c => includes(c, 'party name'));
    if (partyNameIdx !== -1 && r[partyNameIdx + 1] && !partyName) partyName = norm(r[partyNameIdx + 1]);

    const seasonIdx = r.findIndex(c => includes(c, 'season'));
    if (seasonIdx !== -1 && r[seasonIdx + 1] && !season) season = norm(r[seasonIdx + 1]);
  }

  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || [];
    const hasColor = r.some((c) => includes(c, 'color'));
    const hasCT = r.some((c) => includes(c, 'cutting table'));
    if (hasColor && hasCT) { headerIdx = i; break; }
  }
  if (headerIdx === -1) {
    return {
      lotNumber,
      style,
      fabric,
      garmentType,
      brand,
      partyName,
      season,
      sizes: [],
      rows: [],
      totals: { perSize: {}, grand: 0 }
    };
  }

  const header = rows[headerIdx].map(norm);
  const idxColor = header.findIndex((c) => includes(c, 'color'));
  const idxCT = header.findIndex((c) => includes(c, 'cutting table'));
  const idxTotal = header.findIndex((c) => includes(c, 'total'));

  const sizeCols = [];
  for (let i = idxCT + 1; i < header.length; i++) {
    if (i === idxTotal) break;
    if (norm(header[i])) sizeCols.push({ key: header[i], index: i });
  }
  const sizeKeys = sizeCols.map((s) => s.key);

  const allColors = new Set();
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const color = norm(row[idxColor]);
    if (color && !includes(color, 'total')) allColors.add(color);
  }

  const body = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const first = norm(row[idxColor]);
    if (!first) { if (body.length) break; continue; }
    if (includes(first, 'total')) break;

    const color = first;
    const cuttingTable = toNumOrNull(row[idxCT]);
    const sizeMap = {};
    let rowTotal = 0;
    for (const s of sizeCols) {
      const qty = toNumOrNull(row[s.index]);
      sizeMap[s.key] = qty;
      rowTotal += (qty ?? 0);
    }
    const explicitTotal = idxTotal !== -1 ? toNumOrNull(row[idxTotal]) : null;
    const totalPcs = explicitTotal ?? rowTotal;
    body.push({ color, cuttingTable, sizes: sizeMap, totalPcs });
  }

  if (allColors.size > body.length) {
    const existingColors = new Set(body.map(row => row.color));
    const missingColors = Array.from(allColors).filter(color => !existingColors.has(color));
    for (const color of missingColors) {
      const sizeMap = {};
      for (const s of sizeCols) sizeMap[s.key] = null;
      body.push({ color, cuttingTable: null, sizes: sizeMap, totalPcs: 0 });
    }
  }

  body.sort((a, b) => a.color.localeCompare(b.color));

  const totals = { perSize: {}, grand: 0 };
  for (const k of sizeKeys) totals.perSize[k] = 0;
  for (const row of body) {
    for (const k of sizeKeys) totals.perSize[k] += row.sizes[k] ?? 0;
    totals.grand += row.totalPcs ?? 0;
  }

  return {
    lotNumber,
    style,
    fabric,
    garmentType,
    brand,
    partyName,
    season,
    sizes: sizeKeys,
    rows: body,
    totals
  };
}

// ============================
// POST helper — strict ok/json.ok handling + 429 backoff (from working POLot component)
// ============================
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

      // Try to parse JSON response
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }

      if (res.status === 429 && attempt <= maxRetries) {
        await new Promise((r) => setTimeout(r, delay));
        delay *= 2;
        continue;
      }

      if (!res.ok) {
        return { ok: false, status: res.status, json };
      }

      // Check for ok flag in response (Apps Script returns { ok: true, ... })
      if (json && json.ok === false) {
        return { ok: false, status: json.code || res.status, json };
      }

      return { ok: true, json };
    } catch (err) {
      console.error('Fetch error:', err);
      if (attempt <= maxRetries) {
        await new Promise((r) => setTimeout(r, delay));
        delay *= 2;
        continue;
      }
      return { ok: false, error: String(err) };
    }
  }
}

// ============================
// Google Sheets Storage Functions
// ============================

// Function to save PO data to Google Sheets via Apps Script
const savePODataToSheet = async (poData) => {
  try {
    console.log('Saving PO data to Google Sheets:', poData);

    // Use the working post helper from POLot component
    const res = await postPOToSheet(APPS_SCRIPT_URL, poData);

    if (!res.ok) {
      const msg =
        res.json?.error ||
        (res.status === 409 ? "Duplicate PO number. Please regenerate PO Number." : "") ||
        res.error ||
        `HTTP ${res.status || "?"}`;
      return { success: false, error: msg };
    }

    return { success: true, data: res.json };

  } catch (error) {
    console.error('Error saving PO data to Google Sheets:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Function to fetch saved POs (using JSONP)
const fetchSavedPOs = (limit = 50, offset = 0) => {
  return new Promise((resolve, reject) => {
    try {
      const callbackName = 'jsonp_callback_' + Date.now();

      const script = document.createElement('script');
      const url = `${APPS_SCRIPT_URL}?action=getPOs&limit=${limit}&offset=${offset}&callback=${callbackName}`;

      window[callbackName] = (data) => {
        delete window[callbackName];
        document.body.removeChild(script);
        resolve(data);
      };

      script.src = url;
      document.body.appendChild(script);

      setTimeout(() => {
        if (window[callbackName]) {
          delete window[callbackName];
          document.body.removeChild(script);
          reject(new Error('Timeout fetching POs'));
        }
      }, 10000);

    } catch (error) {
      console.error('Error fetching POs:', error);
      reject(error);
    }
  });
};

// Function to search POs (using JSONP)
const searchPOs = (query) => {
  return new Promise((resolve, reject) => {
    try {
      const callbackName = 'jsonp_callback_' + Date.now();

      const script = document.createElement('script');
      const url = `${APPS_SCRIPT_URL}?action=search&q=${encodeURIComponent(query)}&callback=${callbackName}`;

      window[callbackName] = (data) => {
        delete window[callbackName];
        document.body.removeChild(script);
        resolve(data);
      };

      script.src = url;
      document.body.appendChild(script);

      setTimeout(() => {
        if (window[callbackName]) {
          delete window[callbackName];
          document.body.removeChild(script);
          reject(new Error('Timeout searching POs'));
        }
      }, 10000);

    } catch (error) {
      console.error('Error searching POs:', error);
      reject(error);
    }
  });
};

// Function to get single PO (using JSONP)
const getPOByNumber = (poNumber) => {
  return new Promise((resolve, reject) => {
    try {
      const callbackName = 'jsonp_callback_' + Date.now();

      const script = document.createElement('script');
      const url = `${APPS_SCRIPT_URL}?action=getPO&poNumber=${encodeURIComponent(poNumber)}&callback=${callbackName}`;

      window[callbackName] = (data) => {
        delete window[callbackName];
        document.body.removeChild(script);
        resolve(data);
      };

      script.src = url;
      document.body.appendChild(script);

      setTimeout(() => {
        if (window[callbackName]) {
          delete window[callbackName];
          document.body.removeChild(script);
          reject(new Error('Timeout fetching PO'));
        }
      }, 10000);

    } catch (error) {
      console.error('Error fetching PO:', error);
      reject(error);
    }
  });
};

// ============================
// Professional Column Style Layout
// ============================
export default function POasperShade() {
  const [lotInput, setLotInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [matrix, setMatrix] = useState(null);
  const [error, setError] = useState('');
  const abortRef = useRef(null);
  const [priority, setPriority] = useState('Normal');

  // GST State
  const [gstEnabled, setGstEnabled] = useState(false);
  const [gstPercentage, setGstPercentage] = useState(18);

  // PO Number State
  const [poNumber, setPoNumber] = useState(() => generatePONumber());

  // Supplier Name State
  const [supplierName, setSupplierName] = useState('');

  const [showIssueDialog, setShowIssueDialog] = useState(false);
  const [issueDate, setIssueDate] = useState(() => todayLocalISO());
  const [supervisor, setSupervisor] = useState('');
  const [dialogError, setDialogError] = useState('');
  const [confirming, setConfirming] = useState(false);

  // State for manual quantities, rates, departments, and accessories
  const [manualQty, setManualQty] = useState({});
  const [rates, setRates] = useState({});
  const [departments, setDepartments] = useState({});
  const [accessories, setAccessories] = useState({});

  // State for removed shades
  const [removedShades, setRemovedShades] = useState({});

  // State for expanded/collapsed sections
  const [expandedSections, setExpandedSections] = useState({
    summary: true,
    details: true
  });

  // State for selected shades (bulk actions)
  const [selectedShades, setSelectedShades] = useState({});

  // State for saved POs list (for history feature)
  const [savedPOs, setSavedPOs] = useState([]);
  const [showPOHistory, setShowPOHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // ---- Supervisor suggestions (with persistence) ----
  const LS_KEY_SUPERVISORS = 'issueStitching.supervisors';
  const DEFAULT_SUPERVISORS = ['SONU', 'SANJAY', 'MONU', 'ROHIT', 'VINAY'];

  const [supervisorOptions, setSupervisorOptions] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY_SUPERVISORS) || '[]');
      return uniqCaseInsensitive([...DEFAULT_SUPERVISORS, ...saved]);
    } catch {
      return DEFAULT_SUPERVISORS.slice();
    }
  });

  function saveSupervisorOptions(next) {
    const onlyCustom = next.filter(
      s => !DEFAULT_SUPERVISORS.map(x => x.toLowerCase()).includes((s || '').toLowerCase())
    );
    localStorage.setItem(LS_KEY_SUPERVISORS, JSON.stringify(onlyCustom));
  }

  function addSupervisorToOptions(name) {
    const t = titleCase(name);
    if (!t) return;
    const next = uniqCaseInsensitive([...supervisorOptions, t]);
    setSupervisorOptions(next);
    saveSupervisorOptions(next);
  }

  const typedIsNewSupervisor = useMemo(() => {
    const t = (supervisor ?? '').trim().toLowerCase();
    if (!t) return false;
    return !supervisorOptions.some(opt => (opt || '').toLowerCase() === t);
  }, [supervisor, supervisorOptions]);

  // Initialize manualQty, rates, departments, and accessories when matrix loads
  useEffect(() => {
    if (matrix && matrix.rows) {
      const initialManualQty = {};
      const initialRates = {};
      const initialDepartments = {};
      const initialAccessories = {};
      const initialRemovedShades = {};
      const initialSelectedShades = {};

      matrix.rows.forEach((row, index) => {
        const key = `${row.color}-${index}`;
        initialManualQty[key] = '';
        initialRates[key] = '';
        initialDepartments[key] = '';
        initialAccessories[key] = '';
        initialRemovedShades[key] = false;
        initialSelectedShades[key] = false;
      });

      setManualQty(initialManualQty);
      setRates(initialRates);
      setDepartments(initialDepartments);
      setAccessories(initialAccessories);
      setRemovedShades(initialRemovedShades);
      setSelectedShades(initialSelectedShades);
    }
  }, [matrix]);

  // Handle manual quantity change
  const handleManualQtyChange = (key, value) => {
    setManualQty(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Handle rate change
  const handleRateChange = (key, value) => {
    setRates(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Handle department change
  const handleDepartmentChange = (key, value) => {
    setDepartments(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Handle accessory change
  const handleAccessoryChange = (key, value) => {
    setAccessories(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Handle remove shade
  const handleRemoveShade = (key) => {
    setRemovedShades(prev => ({
      ...prev,
      [key]: true
    }));
  };

  // Handle restore shade
  const handleRestoreShade = (key) => {
    setRemovedShades(prev => ({
      ...prev,
      [key]: false
    }));
  };

  // Handle select shade
  const handleSelectShade = (key) => {
    setSelectedShades(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Handle select all shades
  const handleSelectAll = () => {
    const allSelected = Object.values(selectedShades).every(v => v === true);
    const newSelected = {};
    matrix.rows.forEach((row, index) => {
      const key = `${row.color}-${index}`;
      newSelected[key] = !allSelected;
    });
    setSelectedShades(newSelected);
  };

  // Handle bulk remove selected shades
  const handleBulkRemove = () => {
    const newRemoved = { ...removedShades };
    Object.keys(selectedShades).forEach(key => {
      if (selectedShades[key]) {
        newRemoved[key] = true;
      }
    });
    setRemovedShades(newRemoved);
    // Clear selections
    const newSelected = {};
    Object.keys(selectedShades).forEach(key => {
      newSelected[key] = false;
    });
    setSelectedShades(newSelected);
  };

  // Handle bulk restore
  const handleBulkRestore = () => {
    const newRemoved = { ...removedShades };
    Object.keys(selectedShades).forEach(key => {
      if (selectedShades[key]) {
        newRemoved[key] = false;
      }
    });
    setRemovedShades(newRemoved);
  };

  // Handle bulk autofill
  const handleBulkAutofill = () => {
    const selectedKeys = Object.keys(selectedShades).filter(key => selectedShades[key]);

    if (selectedKeys.length === 0) {
      alert('Please select at least one shade to use as template');
      return;
    }

    const templateKey = selectedKeys[0];
    const templateDepartment = departments[templateKey] || '';
    const templateAccessory = accessories[templateKey] || '';

    const newDepartments = { ...departments };
    const newAccessories = { ...accessories };

    selectedKeys.forEach(key => {
      if (key !== templateKey) {
        newDepartments[key] = templateDepartment;
        newAccessories[key] = templateAccessory;
      }
    });

    setDepartments(newDepartments);
    setAccessories(newAccessories);
  };

  // Calculate total amount for a row
  const calculateTotalAmount = (key) => {
    const qty = parseFloat(manualQty[key]) || 0;
    const rate = parseFloat(rates[key]) || 0;
    return (qty * rate).toFixed(2);
  };

  // Calculate subtotal (without GST)
  const calculateSubtotal = useMemo(() => {
    if (!matrix || !matrix.rows) return 0;

    let total = 0;
    matrix.rows.forEach((row, index) => {
      const key = `${row.color}-${index}`;
      if (!removedShades[key]) {
        const qty = parseFloat(manualQty[key]) || 0;
        const rate = parseFloat(rates[key]) || 0;
        total += qty * rate;
      }
    });
    return total;
  }, [matrix, manualQty, rates, removedShades]);

  // Calculate GST amount
  const gstAmount = useMemo(() => {
    if (!gstEnabled) return 0;
    return (calculateSubtotal * gstPercentage) / 100;
  }, [calculateSubtotal, gstEnabled, gstPercentage]);

  // Calculate grand total (with GST if enabled)
  const calculateGrandTotal = useMemo(() => {
    return (calculateSubtotal + gstAmount).toFixed(2);
  }, [calculateSubtotal, gstAmount]);

  // Calculate totals (excluding removed shades)
  const totalManualQty = useMemo(() => {
    let total = 0;
    Object.entries(manualQty).forEach(([key, val]) => {
      if (!removedShades[key]) {
        total += parseFloat(val) || 0;
      }
    });
    return total;
  }, [manualQty, removedShades]);

  const totalSystemQty = useMemo(() => {
    if (!matrix?.rows) return 0;
    let total = 0;
    matrix.rows.forEach((row, index) => {
      const key = `${row.color}-${index}`;
      if (!removedShades[key]) {
        total += row.totalPcs || 0;
      }
    });
    return total;
  }, [matrix, removedShades]);

  const variance = useMemo(() => {
    return totalManualQty - totalSystemQty;
  }, [totalManualQty, totalSystemQty]);

  // Filtered rows (excluding removed)
  const visibleRows = useMemo(() => {
    if (!matrix?.rows) return [];
    return matrix.rows.filter((row, index) => {
      const key = `${row.color}-${index}`;
      return !removedShades[key];
    });
  }, [matrix, removedShades]);

  // Removed rows count
  const removedCount = useMemo(() => {
    return Object.values(removedShades).filter(v => v).length;
  }, [removedShades]);

  // Function to load PO history
  const loadPOHistory = async () => {
    setLoadingHistory(true);
    try {
      const result = await fetchSavedPOs(20, 0);
      if (result.success) {
        setSavedPOs(result.data);
        setShowPOHistory(true);
      } else {
        alert('Failed to load PO history: ' + result.error);
      }
    } catch (error) {
      console.error('Error loading PO history:', error);
      alert('Error loading PO history');
    } finally {
      setLoadingHistory(false);
    }
  };

  // Function to load a saved PO
  const loadSavedPO = async (poNumber) => {
    setLoadingHistory(true);
    try {
      const result = await getPOByNumber(poNumber);
      if (result.success) {
        alert(`PO ${poNumber} loaded successfully. Implement population logic as needed.`);
        setShowPOHistory(false);
      } else {
        alert('Failed to load PO: ' + result.error);
      }
    } catch (error) {
      console.error('Error loading PO:', error);
      alert('Error loading PO');
    } finally {
      setLoadingHistory(false);
    }
  };

  const generatePDF = async (poNumber, gstEnabled, gstPercentage, issueDate, supervisor, priority, supplierName) => {
    // Generate QR URLs
    const { gateUrl, recvUrl } = buildPoQrUrls({
      base: APPS_SCRIPT_URL,
      poNo: poNumber,
      orderDate: issueDate,
      expectedDate: issueDate,
      supervisorName: supervisor
    });

    let qrGateImage = null;
    let qrRecvImage = null;
    try {
      const [gQR, rQR] = await Promise.all([
        toDataURL_QR(gateUrl, 320),
        toDataURL_QR(recvUrl, 320)
      ]);
      qrGateImage = gQR;
      qrRecvImage = rQR;
    } catch (err) {
      console.error("Failed to load QR codes:", err);
    }

    // Use A3 paper size (landscape orientation for more width)
    const doc = new jsPDF({
      unit: "pt",
      format: "a3",
      orientation: "portrait"
    });

    doc.setFont("times", "normal");
    doc.setLineWidth(0.6);

    // ---- helpers
    const page = {
      w: doc.internal.pageSize.getWidth(),
      h: doc.internal.pageSize.getHeight(),
      m: 40, // margins
      gap: 12
    };

    const setSize = (s) => doc.setFontSize(s);
    const bold = () => doc.setFont(undefined, "bold");
    const normal = () => doc.setFont(undefined, "normal");
    const text = (t, x, y, opt = {}) => doc.text(String(t ?? ""), x, y, opt);
    const rtext = (t, x, y, opt = {}) => text(t, x, y, { align: "right", ...opt });
    const ctext = (t, x, y, opt = {}) => text(t, x, y, { align: "center", ...opt });
    const line = (x1, y1, x2, y2) => doc.line(x1, y1, x2, y2);
    const wrap = (str, w) => doc.splitTextToSize(String(str || ""), w);
    const money = (n) =>
      (Number.isFinite(+n) ? +n : 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const roundRect = (x, y, w, h, r = 7, style = "S") =>
      doc.roundedRect ? doc.roundedRect(x, y, w, h, r, r, style) : doc.rect(x, y, w, h, style);

    // ---- frame & pagination
    const drawFrame = () => roundRect(16, 16, page.w - 32, page.h - 32, 8, "S");
    let y = page.m;

    const SIG_H = 120;
    const BOTTOM_RESERVED = SIG_H + 30;

    const needSpace = (h, withHeader = false) => {
      const usableBottom = page.h - page.m - BOTTOM_RESERVED;
      if (y + h > usableBottom) {
        doc.addPage();
        drawFrame();
        y = page.m;
        if (withHeader) {
          setSize(13);
          bold();
          text("PURCHASE ORDER - AS PER SHADE (Continued)", page.m, y);
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
    setSize(24);
    bold();
    text("PURCHASE ORDER - AS PER SHADE", page.w / 2, y, { align: "center" });
    normal();
    line(page.m, y + 8, page.w - page.m, y + 8);
    y += 30;

    // =========================
    // TOP ROW: PO DETAILS | LOT INFO | SUPPLIER | PRIORITY | GATE IN SCAN
    // =========================
    (function topRow() {
      const innerW = page.w - 2 * page.m;
      const rPO = 0.22, rLot = 0.22, rSupplier = 0.18, rPriority = 0.16;
      const wAvail = innerW - page.gap * 4;
      const wPO = Math.floor(wAvail * rPO);
      const wLot = Math.floor(wAvail * rLot);
      const wSupplier = Math.floor(wAvail * rSupplier);
      const wPriority = Math.floor(wAvail * rPriority);
      const wGate = wAvail - wPO - wLot - wSupplier - wPriority;

      const x1 = page.m;
      const x2 = x1 + wPO + page.gap;
      const x3 = x2 + wLot + page.gap;
      const x4 = x3 + wSupplier + page.gap;
      const x5 = x4 + wPriority + page.gap;

      // PO DETAILS
      const metaPad = 12, lblW = 70;
      const mRows = [
        ["PO #", poNumber],
        ["Issue Date", issueDate],
        ["Supervisor", supervisor],
      ];
      const metaH = 22 + mRows.length * 16 + 16;

      // LOT INFO
      const lotPad = 12;
      const lotLines = [
        `Lot: ${matrix?.lotNumber || 'N/A'}`,
        `Style: ${matrix?.style || 'N/A'}`,
        `Fabric: ${matrix?.fabric || 'N/A'}`,
        `Garment: ${matrix?.garmentType || 'N/A'}`,
        `Brand: ${matrix?.brand || 'N/A'}`,
        `Party: ${matrix?.partyName || 'N/A'}`,
      ];
      const lotH = 22 + lotLines.length * 12 + 16;

      // SUPPLIER INFO
      const supplierLines = [
        `Name: ${supplierName || 'N/A'}`,
      ];
      const supplierH = 22 + supplierLines.length * 12 + 16;

      // PRIORITY
      const priorityH = 22 + 24 + 16;

      // GATE IN SCAN
      const QR_SIDE = 96;
      const gateH = 18 + 10 + QR_SIDE + 10;

      const blockH = Math.max(metaH, lotH, supplierH, priorityH, gateH);
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

      // Draw LOT INFO
      roundRect(x2, y, wLot, blockH, 7, "S");
      setSize(10);
      bold(); text("LOT INFORMATION", x2 + 12, y + 14); normal();
      line(x2 + 12, y + 18, x2 + wLot - 12, y + 18);
      let ly = y + 30;
      lotLines.forEach((ln) => {
        if (ln) {
          text(ln, x2 + lotPad, ly);
          ly += 12;
        }
      });

      // Draw SUPPLIER INFO
      roundRect(x3, y, wSupplier, blockH, 7, "S");
      setSize(10);
      bold(); text("SUPPLIER", x3 + 12, y + 14); normal();
      line(x3 + 12, y + 18, x3 + wSupplier - 12, y + 18);
      let sly = y + 30;
      supplierLines.forEach((ln) => {
        if (ln) {
          text(ln, x3 + lotPad, sly);
          sly += 12;
        }
      });

      // Draw PRIORITY
      roundRect(x4, y, wPriority, blockH, 7, "S");
      setSize(10);
      bold(); text("PRIORITY", x4 + 12, y + 14); normal();
      line(x4 + 12, y + 18, x4 + wPriority - 12, y + 18);

      // Priority badge
      const priorityColors = {
        'Low': [34, 197, 94],
        'Normal': [59, 130, 246],
        'High': [245, 158, 11],
        'Urgent': [239, 68, 68]
      };
      const color = priorityColors[priority] || [59, 130, 246];

      doc.setFillColor(color[0], color[1], color[2]);
      doc.setDrawColor(color[0], color[1], color[2]);
      doc.setTextColor(255, 255, 255);

      const priorityBox = {
        x: x4 + 12,
        y: y + 30 + (blockH - 30 - 24) / 2,
        w: wPriority - 24,
        h: 24
      };
      doc.roundedRect(priorityBox.x, priorityBox.y, priorityBox.w, priorityBox.h, 4, 4, 'FD');

      setSize(12);
      bold();
      ctext(priority, priorityBox.x + priorityBox.w / 2, priorityBox.y + 16);

      // Reset colors
      doc.setTextColor(0, 0, 0);
      normal();

      // Draw GATE-IN SCAN
      roundRect(x5, y, wGate, blockH, 7, "S");
      setSize(10);
      bold(); text("GATE IN - SCAN", x5 + 12, y + 14); normal();
      line(x5 + 12, y + 18, x5 + wGate - 12, y + 18);
      if (qrGateImage) {
        const qx = x5 + (wGate - QR_SIDE) / 2;
        const qy = y + 18 + (blockH - 18 - QR_SIDE) / 2;
        try { doc.addImage(qrGateImage, "PNG", qx, qy, QR_SIDE, QR_SIDE); } catch { }
      }

      y += blockH + 16;
    })();

    // =========================
    // MAIN TABLE - ALL COLUMNS
    // =========================
    (function drawTable() {
      const x0 = page.m, innerW = page.w - 2 * page.m;
      setSize(9);

      // Prepare rows data
      const rows = visibleRows.map((row, idx) => {
        const key = `${row.color}-${idx}`;
        const qty = parseFloat(manualQty[key]) || 0;
        const rate = parseFloat(rates[key]) || 0;
        const amt = qty * rate;

        return {
          line: idx + 1,
          department: departments[key] || '',
          lotNumber: matrix?.lotNumber || '',
          shade: row.color,
          brand: matrix?.brand || '',
          accessory: accessories[key] || '',
          lotQty: row.totalPcs || 0,
          manualQty: qty,
          rate: rate,
          amount: amt,
          _lotQtyStr: (row.totalPcs || 0).toLocaleString(),
          _manualQtyStr: qty.toLocaleString(),
          _rateStr: money(rate),
          _amountStr: money(amt)
        };
      });

      // Define column widths
      const MIN_WIDTHS = {
        line: 25,
        department: 80,
        lotNumber: 70,
        shade: 70,
        brand: 70,
        accessory: 80,
        lotQty: 55,
        manualQty: 55,
        rate: 55,
        amount: 70
      };

      const lineW = MIN_WIDTHS.line;
      const deptW = MIN_WIDTHS.department;
      const lotNoW = MIN_WIDTHS.lotNumber;
      const shadeW = MIN_WIDTHS.shade;
      const brandW = MIN_WIDTHS.brand;
      const accW = MIN_WIDTHS.accessory;
      const lotQW = MIN_WIDTHS.lotQty;
      const manQW = MIN_WIDTHS.manualQty;
      const rateW = MIN_WIDTHS.rate;
      const amountW = MIN_WIDTHS.amount;

      const totalColWidth = lineW + deptW + lotNoW + shadeW + brandW + accW + lotQW + manQW + rateW + amountW;
      const scaleFactor = innerW / totalColWidth;

      const scaled = (w) => Math.floor(w * scaleFactor);

      const cols = [
        { key: "line", title: "#", w: scaled(lineW), align: "center" },
        { key: "department", title: "DEPARTMENT", w: scaled(deptW), align: "center" },
        { key: "lotNumber", title: "LOT NUMBER", w: scaled(lotNoW), align: "center" },
        { key: "shade", title: "SHADE", w: scaled(shadeW), align: "center" },
        { key: "brand", title: "BRAND", w: scaled(brandW), align: "center" },
        { key: "accessory", title: "ACCESSORY", w: scaled(accW), align: "center" },
        { key: "lotQty", title: "LOT QTY", w: scaled(lotQW), align: "center" },
        { key: "manualQty", title: "MANUAL QTY", w: scaled(manQW), align: "center" },
        { key: "rate", title: "RATE", w: scaled(rateW), align: "center" },
        { key: "amount", title: "TOTAL", w: scaled(amountW), align: "center" },
      ];

      const xs = [x0];
      cols.forEach((c, i) => xs.push(xs[i] + c.w));

      const headerH = 35;
      const baseH = 22;

      const drawHeader = () => {
        needSpace(headerH, true);

        doc.setFillColor(41, 128, 185);
        doc.rect(x0, y, innerW, headerH, 'F');
        doc.setTextColor(255, 255, 255);
        setSize(9);
        bold();

        cols.forEach((c, i) => {
          let cx;
          if (c.align === "right") cx = xs[i + 1] - 6;
          else if (c.align === "center") cx = (xs[i] + xs[i + 1]) / 2;
          else cx = xs[i] + 6;

          const opt = {
            align: c.align === "right" ? "right" : c.align === "center" ? "center" : "left"
          };
          text(c.title, cx, y + 22, opt);
        });

        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.5);
        for (let i = 1; i < xs.length - 1; i++) {
          line(xs[i], y, xs[i], y + headerH);
        }

        doc.setTextColor(0, 0, 0);
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.6);
        normal();
        y += headerH;
      };

      const drawRow = (r, idx) => {
        const rowH = baseH;
        needSpace(rowH, true);

        if (idx % 2 === 0) {
          doc.setFillColor(249, 250, 251);
          doc.rect(x0, y, innerW, rowH, 'F');
        }

        doc.rect(x0, y, innerW, rowH, 'S');
        for (let i = 1; i < xs.length - 1; i++) {
          line(xs[i], y, xs[i], y + rowH);
        }

        const yy = y + 15;
        setSize(9);

        ctext(r.line, (xs[0] + xs[1]) / 2, yy);
        text(r.department || "", xs[1] + 6, yy);
        ctext(r.lotNumber || "", (xs[2] + xs[3]) / 2, yy);
        text(r.shade || "", xs[3] + 6, yy);
        text(r.brand || "", xs[4] + 6, yy);
        text(r.accessory || "", xs[5] + 6, yy);
        rtext(r._lotQtyStr, xs[7] - 6, yy);
        rtext(r._manualQtyStr, xs[8] - 6, yy);
        rtext(r._rateStr, xs[9] - 6, yy);
        rtext(r._amountStr, xs[10] - 6, yy);

        y += rowH;
        return r.amount;
      };

      const drawTotalRow = (label, value, colSpan = 9, showQty = false) => {
        const rowH = 26;
        needSpace(rowH, true);

        doc.setFillColor(241, 245, 249);
        doc.rect(x0, y, innerW, rowH, 'F');
        doc.rect(x0, y, innerW, rowH, 'S');
        for (let i = 1; i < xs.length - 1; i++) {
          line(xs[i], y, xs[i], y + rowH);
        }

        setSize(10);
        bold();

        if (colSpan === 9) {
          text(label, x0 + 12, y + 17);
          rtext(money(value), xs[10] - 6, y + 17);
        } else {
          text(label, xs[colSpan] + 12, y + 17);
          rtext(money(value), xs[10] - 6, y + 17);
        }

        if (showQty) {
          rtext((totalSystemQty || 0).toLocaleString(), xs[7] - 6, y + 17);
          rtext((totalManualQty || 0).toLocaleString(), xs[8] - 6, y + 17);
          ctext("-", (xs[8] + xs[9]) / 2, y + 17);
        }

        normal();
        y += rowH;
      };

      drawHeader();
      let sum = 0;
      rows.forEach((r, i) => (sum += drawRow(r, i)));

      drawTotalRow("SUBTOTAL", calculateSubtotal, 9, true);

      if (gstEnabled) {
        drawTotalRow(`GST (${gstPercentage}%)`, gstAmount, 9, false);
        drawTotalRow("GRAND TOTAL", calculateGrandTotal, 9, true);
      } else {
        drawTotalRow("GRAND TOTAL", calculateSubtotal, 9, true);
      }

      setSize(8);
      doc.setTextColor(100, 100, 100);
      text(`Total Items: ${rows.length} shades`, x0, y + 10);
      y += 20;
    })();

    // =========================
    // BOTTOM SECTION - SIGNATURES & MATERIAL RECEIVED
    // =========================
    (function bottomBlocks() {
      const innerW = page.w - 2 * page.m;
      const colW = (innerW - page.gap * 3) / 4;
      const x1 = page.m;
      const x2 = x1 + colW + page.gap;
      const x3 = x2 + colW + page.gap;
      const x4 = x3 + colW + page.gap;

      if (y > page.h - page.m - SIG_H - 10) {
        doc.addPage();
        drawFrame();
        y = page.m;
      } else {
        y = Math.max(y + 15, page.h - page.m - SIG_H - 20);
      }

      const sigTop = y;
      const QR_SIDE = 96;

      // 1. MATERIAL RECEIVED SCAN BOX
      roundRect(x1, sigTop, colW, SIG_H, 7, "S");
      setSize(10);
      bold(); text("MATERIAL RECEIVED", x1 + 10, sigTop + 14); normal();
      line(x1 + 10, sigTop + 18, x1 + colW - 10, sigTop + 18);
      if (qrRecvImage) {
        const qx = x1 + (colW - QR_SIDE) / 2;
        const qy = sigTop + 18 + (SIG_H - 18 - QR_SIDE) / 2;
        try { doc.addImage(qrRecvImage, "PNG", qx, qy, QR_SIDE, QR_SIDE); } catch { }
      }

      // 2. SIGNATURE BOXES
      [x2, x3, x4].forEach((x) => roundRect(x, sigTop, colW, SIG_H, 7, "S"));

      setSize(10); bold();
      text("PREPARED BY", x2 + 10, sigTop + 14);
      text("APPROVED BY", x3 + 10, sigTop + 14);
      text("SUPPLIER'S", x4 + 10, sigTop + 14);
      normal();

      const writeSig = (x, showSupervisor, supplier = '') => {
        const baseY = sigTop + SIG_H - 20;
        line(x + 10, baseY - 8, x + colW - 10, baseY - 8);
        text("(Signature)", x + 10, baseY - 14);

        if (showSupervisor && supervisor) {
          text(supervisor, x + 10, baseY + 2);
        } else if (supplier) {
          text(supplier, x + 10, baseY + 2);
        }
      };

      writeSig(x2, true, '');
      writeSig(x3, false, '');
      writeSig(x4, false, supplierName);

      setSize(8);
      doc.setTextColor(150, 150, 150);
      text(`Generated: ${new Date().toLocaleString()}`, page.m, page.h - 20);
      text(`PO Number: ${poNumber}`, page.w - page.m - 100, page.h - 20, { align: "right" });
    })();

    doc.save(`${poNumber}_${matrix?.lotNumber || 'lot'}.pdf`);
  };

  // Function to save PO data to Google Sheets
  const savePOToSheet = async () => {
    try {
      // Prepare items data from visible rows
      const items = visibleRows.map((row, idx) => {
        const key = `${row.color}-${idx}`;
        return {
          department: departments[key] || '',
          shade: row.color,
          brand: matrix?.brand || '',
          accessory: accessories[key] || '',
          lotQty: row.totalPcs || 0,
          manualQty: parseFloat(manualQty[key]) || 0,
          rate: parseFloat(rates[key]) || 0,
          amount: parseFloat(calculateTotalAmount(key)) || 0
        };
      });

      const poData = {
        poNumber,
        lotNumber: matrix?.lotNumber || '',
        issueDate,
        supervisor,
        supplierName,
        priority,
        gstEnabled,
        gstPercentage,
        subtotal: calculateSubtotal,
        gstAmount,
        grandTotal: parseFloat(calculateGrandTotal),
        items,
        timestamp: new Date().toISOString()
      };

      console.log('Saving PO data:', poData);

      // Use the working post helper
      const res = await postPOToSheet(APPS_SCRIPT_URL, poData);

      if (!res.ok) {
        const msg =
          res.json?.error ||
          (res.status === 409 ? "Duplicate PO number. Please regenerate PO Number." : "") ||
          res.error ||
          `HTTP ${res.status || "?"}`;
        alert(`Could not save PO.\n${msg}`);
        return { success: false, error: msg };
      }

      alert(`PO ${poNumber} saved successfully to Google Sheets ✅`);
      return { success: true, data: res.json };

    } catch (error) {
      console.error('Error in savePOToSheet:', error);
      alert('Error saving PO data to Google Sheets: ' + error.message);
      return { success: false, error: error.message };
    }
  };

  // Optimized search handler
  const handleSearch = async (e) => {
    e?.preventDefault?.();
    const normalizedLot = norm(lotInput);
    if (!normalizedLot || loading) return;

    setError('');
    setMatrix(null);
    setLoading(true);

    abortRef.current?.abort?.();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      // Check cache first
      const cacheKey = `lot_${normalizedLot}`;
      const cachedMatrix = getCached(cacheKey);

      if (cachedMatrix) {
        console.log('Using cached lot data');
        setMatrix(cachedMatrix);
      } else {
        const data = await fetchLotMatrixViaSheetsApi(normalizedLot, ctrl.signal);
        setCached(cacheKey, data);
        setMatrix(data);
      }

      // Generate new PO Number for each search
      setPoNumber(generatePONumber());
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err?.message || "Failed to fetch data.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setLotInput('');
    setMatrix(null);
    setError('');
    setManualQty({});
    setRates({});
    setDepartments({});
    setAccessories({});
    setRemovedShades({});
    setSelectedShades({});
    setGstEnabled(false);
    setGstPercentage(18);
    setSupplierName('');
    setPoNumber(generatePONumber());
    abortRef.current?.abort?.();
  };

  const handleBack = () => {
    if (window.history?.length > 1) window.history.back();
    else window.close?.();
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const openIssueDialog = () => {
    setDialogError('');
    setSupervisor('');
    setSupplierName('');
    setIssueDate(todayLocalISO());
    setShowIssueDialog(true);
  };

  const closeIssueDialog = () => {
    if (confirming) return;
    setShowIssueDialog(false);
  };

  const handleConfirmIssue = async () => {
    if (!norm(supervisor)) {
      setDialogError('Supervisor is required.');
      return;
    }
    if (!matrix) {
      setDialogError('Nothing to submit. Search a lot first.');
      return;
    }

    setDialogError('');
    setConfirming(true);

    try {
      addSupervisorToOptions(supervisor);

      // Save to Google Sheets first
      await savePOToSheet();

      // Generate PDF
      await generatePDF(
        poNumber,
        gstEnabled,
        gstPercentage,
        issueDate,
        supervisor,
        priority,
        supplierName
      );

      setShowIssueDialog(false);
    } catch (e) {
      setDialogError(e?.message || 'Failed to generate PDF or save data.');
    } finally {
      setConfirming(false);
    }
  };

  // Return the JSX (your existing JSX remains exactly the same)
  return (
    <div className="professional-layout">
      {/* Your existing JSX here - unchanged */}
      <style>{`
        .professional-layout {
          --primary: #2c3e50;
          --primary-light: #34495e;
          --primary-dark: #1a252f;
          --accent: #3498db;
          --accent-light: #5dade2;
          --accent-dark: #2980b9;
          --success: #27ae60;
          --warning: #f39c12;
          --danger: #e74c3c;
          --info: #3498db;
          
          --bg-color: #ffffff;
          --card-bg: #ffffff;
          --border-color: #e1e8ed;
          --text-primary: #2c3e50;
          --text-secondary: #7f8c8d;
          --text-muted: #95a5a6;
          
          --shadow-sm: 0 1px 3px rgba(0,0,0,0.05);
          --shadow-md: 0 4px 6px rgba(0,0,0,0.05);
          --shadow-lg: 0 10px 25px rgba(0,0,0,0.05);
          --shadow-xl: 0 20px 40px rgba(0,0,0,0.08);
          
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          background: var(--bg-color);
          min-height: 100vh;
          color: var(--text-primary);
        }

        /* Layout Structure */
        .app-container {
          display: flex;
          min-height: 100vh;
        }

        /* Sidebar */
        .sidebar {
          width: 260px;
          background: white;
          border-right: 1px solid var(--border-color);
          position: fixed;
          height: 100vh;
          overflow-y: auto;
          padding: 2rem 1rem;
        }

        .sidebar-header {
          padding: 0 1rem 2rem;
          border-bottom: 1px solid var(--border-color);
          margin-bottom: 2rem;
        }

        .sidebar-header h2 {
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--primary);
          margin: 0;
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .sidebar-header p {
          font-size: 0.75rem;
          color: var(--text-muted);
          margin: 0.5rem 0 0;
        }

        .nav-menu {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .nav-item {
          margin-bottom: 0.5rem;
        }

        .nav-link {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          border-radius: 0.5rem;
          color: var(--text-secondary);
          font-size: 0.875rem;
          font-weight: 500;
          transition: all 0.2s;
          cursor: default;
        }

        .nav-link:hover {
          background: #f8fafc;
          color: var(--primary);
        }

        .nav-link.active {
          background: var(--accent);
          color: white;
        }

        .nav-link svg {
          font-size: 1.25rem;
        }

        /* Main Content */
        .main-content {
          flex: 1;
          margin-left: 260px;
          padding: 2rem;
        }

        /* Top Bar */
        .top-bar {
          background: white;
          border-radius: 1rem;
          padding: 1.25rem 1.5rem;
          margin-bottom: 2rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          box-shadow: var(--shadow-sm);
          border: 1px solid var(--border-color);
        }

        .page-title {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .page-title h1 {
          font-size: 1.5rem;
          font-weight: 600;
          margin: 0;
          color: var(--primary);
        }

        .page-title span {
          font-size: 0.875rem;
          color: var(--text-muted);
          background: #f8fafc;
          padding: 0.25rem 0.75rem;
          border-radius: 2rem;
        }

        .top-bar-actions {
          display: flex;
          gap: 0.75rem;
        }

        /* PO Number Display */
        .po-number-badge {
          background: linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%);
          color: white;
          padding: 0.5rem 1.5rem;
          border-radius: 2rem;
          font-weight: 600;
          font-size: 1rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          box-shadow: var(--shadow-sm);
        }

        .po-number-badge svg {
          font-size: 1.25rem;
        }

        /* GST & Supplier Controls */
        .gst-supplier-row {
          background: white;
          border-radius: 1rem;
          padding: 1.25rem 1.5rem;
          margin-bottom: 1.5rem;
          border: 1px solid var(--border-color);
          box-shadow: var(--shadow-sm);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .gst-section {
          display: flex;
          align-items: center;
          gap: 2rem;
          flex: 1;
        }

        .gst-toggle {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .toggle-switch {
          width: 3rem;
          height: 1.5rem;
          background: ${gstEnabled ? 'var(--success)' : '#e1e8ed'};
          border-radius: 1rem;
          position: relative;
          cursor: pointer;
          transition: all 0.2s;
        }

        .toggle-switch::after {
          content: '';
          width: 1.25rem;
          height: 1.25rem;
          background: white;
          border-radius: 50%;
          position: absolute;
          top: 0.125rem;
          left: ${gstEnabled ? '1.625rem' : '0.125rem'};
          transition: left 0.2s;
          box-shadow: var(--shadow-sm);
        }

        .gst-percentage {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .gst-input {
          width: 80px;
          padding: 0.5rem;
          border: 1px solid var(--border-color);
          border-radius: 0.5rem;
          font-size: 0.875rem;
          text-align: center;
        }

        .gst-input:focus {
          outline: none;
          border-color: var(--accent);
        }

        .gst-summary {
          display: flex;
          align-items: center;
          gap: 1rem;
          background: #f8fafc;
          padding: 0.5rem 1rem;
          border-radius: 2rem;
        }

        .gst-amount {
          color: var(--success);
          font-weight: 600;
        }

        .supplier-section {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding-left: 2rem;
          border-left: 2px solid var(--border-color);
        }

        .supplier-input {
          width: 300px;
          padding: 0.625rem 1rem;
          border: 1px solid var(--border-color);
          border-radius: 0.5rem;
          font-size: 0.875rem;
          transition: all 0.2s;
        }

        .supplier-input:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.1);
        }

        /* Search Section */
        .search-section {
          background: white;
          border-radius: 1rem;
          padding: 1.5rem;
          margin-bottom: 2rem;
          box-shadow: var(--shadow-sm);
          border: 1px solid var(--border-color);
        }

        .search-form {
          display: flex;
          gap: 1rem;
          align-items: center;
        }

        .search-input-wrapper {
          flex: 1;
          position: relative;
        }

        .search-input-wrapper svg {
          position: absolute;
          left: 1rem;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
          font-size: 1.25rem;
        }

        .search-input {
          width: 100%;
          padding: 0.875rem 1rem 0.875rem 3rem;
          border: 1px solid var(--border-color);
          border-radius: 0.5rem;
          font-size: 0.875rem;
          transition: all 0.2s;
          background: #f8fafc;
        }

        .search-input:focus {
          outline: none;
          border-color: var(--accent);
          background: white;
          box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.1);
        }

        /* Button Styles */
        .btn {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.625rem 1.25rem;
          border-radius: 0.5rem;
          font-size: 0.875rem;
          font-weight: 500;
          transition: all 0.2s;
          cursor: pointer;
          border: 1px solid transparent;
        }

        .btn-primary {
          background: var(--accent);
          color: white;
        }

        .btn-primary:hover {
          background: var(--accent-dark);
        }

        .btn-secondary {
          background: white;
          border-color: var(--border-color);
          color: var(--text-secondary);
        }

        .btn-secondary:hover {
          background: #f8fafc;
          border-color: var(--text-muted);
        }

        .btn-danger {
          background: var(--danger);
          color: white;
        }

        .btn-danger:hover {
          background: #c0392b;
        }

        .btn-success {
          background: var(--success);
          color: white;
        }

        .btn-success:hover {
          background: #229954;
        }

        .btn-outline {
          background: transparent;
          border: 1px solid var(--border-color);
          color: var(--text-secondary);
        }

        .btn-outline:hover {
          background: #f8fafc;
        }

        .btn-sm {
          padding: 0.375rem 0.75rem;
          font-size: 0.75rem;
        }

        .btn-icon {
          padding: 0.5rem;
          border-radius: 0.5rem;
        }

        /* KPI Cards */
        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1.5rem;
          margin-bottom: 2rem;
        }

        .kpi-card {
          background: white;
          border-radius: 1rem;
          padding: 1.5rem;
          border: 1px solid var(--border-color);
          box-shadow: var(--shadow-sm);
        }

        .kpi-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1rem;
        }

        .kpi-icon {
          width: 2.5rem;
          height: 2.5rem;
          border-radius: 0.5rem;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.25rem;
        }

        .kpi-icon.primary {
          background: #e8f0fe;
          color: var(--accent);
        }

        .kpi-icon.success {
          background: #e8f8f0;
          color: var(--success);
        }

        .kpi-icon.warning {
          background: #fef5e7;
          color: var(--warning);
        }

        .kpi-icon.danger {
          background: #fdedec;
          color: var(--danger);
        }

        .kpi-value {
          font-size: 1.5rem;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0;
        }

        .kpi-label {
          font-size: 0.75rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .kpi-trend {
          font-size: 0.75rem;
          display: flex;
          align-items: center;
          gap: 0.25rem;
          margin-top: 0.5rem;
        }

        .trend-up {
          color: var(--success);
        }

        .trend-down {
          color: var(--danger);
        }

        /* Section Cards */
        .section-card {
          background: white;
          border-radius: 1rem;
          margin-bottom: 1.5rem;
          border: 1px solid var(--border-color);
          overflow: hidden;
          box-shadow: var(--shadow-sm);
        }

        .section-header {
          padding: 1rem 1.5rem;
          background: #f8fafc;
          border-bottom: 1px solid var(--border-color);
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: pointer;
        }

        .section-title {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          font-weight: 600;
          color: var(--primary);
        }

        .section-title svg {
          color: var(--accent);
        }

        .section-toggle svg {
          color: var(--text-muted);
          transition: transform 0.2s;
        }

        .section-toggle.expanded svg {
          transform: rotate(180deg);
        }

        .section-content {
          padding: 1.5rem;
        }

        /* Info Grid */
        .info-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
        }

        .info-item {
          padding: 0.75rem 1rem;
          background: #f8fafc;
          border-radius: 0.5rem;
          border: 1px solid var(--border-color);
        }

        .info-label {
          font-size: 0.75rem;
          color: var(--text-muted);
          margin-bottom: 0.5rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .info-value {
          font-size: 1.125rem;
          font-weight: 600;
          color: var(--text-primary);
        }

        /* Bulk Actions */
        .bulk-actions {
          background: #f8fafc;
          border: 1px solid var(--border-color);
          border-radius: 0.5rem;
          padding: 1rem;
          margin-bottom: 1.5rem;
          display: flex;
          align-items: center;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .selection-info {
          font-size: 0.875rem;
          color: var(--text-secondary);
          background: white;
          padding: 0.375rem 1rem;
          border-radius: 2rem;
          border: 1px solid var(--border-color);
        }

        /* TABLE STYLES */
        .table-responsive {
          overflow-x: auto;
          border-radius: 0.5rem;
          border: 2px solid var(--border-color);
          background: white;
          box-shadow: var(--shadow-sm);
        }

        .data-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.875rem;
          min-width: 1400px;
        }

        .data-table th {
          background: #f8fafc;
          color: var(--text-primary);
          font-weight: 600;
          padding: 1rem;
          text-align: center;
          border: 1px solid var(--border-color);
          border-bottom: 2px solid var(--border-color);
          white-space: nowrap;
          font-size: 0.85rem;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }

        .data-table td {
          padding: 1rem 0.75rem;
          border: 1px solid var(--border-color);
          color: var(--text-primary);
          vertical-align: middle;
          text-align: center;
        }

        .data-table td:nth-child(1),
        .data-table td:nth-child(2),
        .data-table td:nth-child(3),
        .data-table td:nth-child(4),
        .data-table td:nth-child(5),
        .data-table td:nth-child(6),
        .data-table td:nth-child(7),
        .data-table td:nth-child(8),
        .data-table td:nth-child(9),
        .data-table td:nth-child(10),
        .data-table td:nth-child(11) {
          text-align: center;
        }

        .data-table tbody tr:hover {
          background: #f8fafc;
        }

        .data-table tbody tr.removed {
          background: #fdedec;
          opacity: 0.7;
        }

        .data-table tbody tr.removed td {
          color: #7f8c8d;
          text-decoration: line-through;
        }

        .data-table tfoot td {
          background: #f8fafc;
          padding: 1rem;
          font-weight: 600;
          border: 1px solid var(--border-color);
          border-top: 2px solid var(--border-color);
          text-align: center;
        }

        .data-table input[type="checkbox"] {
          width: 1.2rem;
          height: 1.2rem;
          cursor: pointer;
          margin: 0 auto;
          vertical-align: middle;
          display: block;
        }

        .table-input {
          width: 90px;
          padding: 0.5rem 0.5rem;
          border: 1px solid var(--border-color);
          border-radius: 0.375rem;
          font-size: 0.875rem;
          transition: all 0.2s;
          background: white;
          text-align: center;
          margin: 0 auto;
          display: block;
        }

        .table-input:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.1);
        }

        .table-input.small {
          width: 80px;
        }

        .color-badge {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          justify-content: center;
        }

        .color-dot {
          width: 0.75rem;
          height: 0.75rem;
          border-radius: 50%;
          background: var(--accent);
          flex-shrink: 0;
        }

        .amount {
          font-family: 'JetBrains Mono', monospace;
          font-weight: 500;
          text-align: center;
        }

        .badge {
          display: inline-flex;
          align-items: center;
          padding: 0.25rem 0.5rem;
          border-radius: 2rem;
          font-size: 0.75rem;
          font-weight: 500;
        }

        .badge-success {
          background: #e8f8f0;
          color: var(--success);
        }

        .badge-warning {
          background: #fef5e7;
          color: var(--warning);
        }

        .badge-danger {
          background: #fdedec;
          color: var(--danger);
        }

        .badge-info {
          background: #e8f0fe;
          color: var(--accent);
        }

        .icon-btn {
          width: 2rem;
          height: 2rem;
          border-radius: 0.375rem;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: 1px solid var(--border-color);
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.2s;
          margin: 0 0.15rem;
        }

        .icon-btn:hover {
          background: #f8fafc;
          border-color: var(--text-muted);
        }

        .icon-btn.danger:hover {
          background: var(--danger);
          border-color: var(--danger);
          color: white;
        }

        .icon-btn.success:hover {
          background: var(--success);
          border-color: var(--success);
          color: white;
        }

        .error-alert {
          background: #fdedec;
          border: 1px solid #f5b7b1;
          border-radius: 0.5rem;
          padding: 1rem 1.5rem;
          margin-bottom: 1.5rem;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          color: var(--danger);
        }

        .welcome-card {
          background: white;
          border-radius: 1rem;
          padding: 2rem;
          border: 1px solid var(--border-color);
          display: flex;
          align-items: center;
          gap: 1.5rem;
          box-shadow: var(--shadow-sm);
        }

        .welcome-icon {
          width: 4rem;
          height: 4rem;
          border-radius: 1rem;
          background: #e8f0fe;
          color: var(--accent);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2rem;
        }

        .welcome-text h3 {
          font-size: 1.25rem;
          font-weight: 600;
          margin: 0 0 0.5rem;
          color: var(--primary);
        }

        .welcome-text p {
          margin: 0;
          color: var(--text-secondary);
          font-size: 0.875rem;
        }

        .dialog-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.3);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .dialog {
          background: white;
          border-radius: 1rem;
          padding: 2rem;
          max-width: 500px;
          width: 90%;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: var(--shadow-xl);
        }

        .dialog-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }

        .dialog-header h3 {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--primary);
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .close-btn {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 0.5rem;
          border-radius: 0.375rem;
          transition: all 0.2s;
        }

        .close-btn:hover {
          background: #f8fafc;
        }

        .form-group {
          margin-bottom: 1.5rem;
        }

        .form-label {
          display: block;
          margin-bottom: 0.5rem;
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--text-secondary);
        }

        .form-control {
          width: 100%;
          padding: 0.625rem 1rem;
          border: 1px solid var(--border-color);
          border-radius: 0.5rem;
          font-size: 0.875rem;
          transition: all 0.2s;
        }

        .form-control:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.1);
        }

        .dialog-actions {
          display: flex;
          justify-content: flex-end;
          gap: 1rem;
          margin-top: 2rem;
        }

        .spinner {
          width: 1.25rem;
          height: 1.25rem;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .skeleton {
          background: linear-gradient(90deg, #f0f0f0 25%, #f8f8f8 50%, #f0f0f0 75%);
          background-size: 1000px 100%;
          animation: shimmer 2s infinite;
          height: 200px;
          border-radius: 0.5rem;
        }

        @keyframes shimmer {
          0% { background-position: -1000px 0; }
          100% { background-position: 1000px 0; }
        }

        /* PO History Modal */
        .history-list {
          max-height: 400px;
          overflow-y: auto;
          border: 1px solid var(--border-color);
          border-radius: 0.5rem;
        }

        .history-item {
          padding: 1rem;
          border-bottom: 1px solid var(--border-color);
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
          transition: background 0.2s;
        }

        .history-item:hover {
          background: #f8fafc;
        }

        .history-item:last-child {
          border-bottom: none;
        }

        .history-item-info {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .history-item-title {
          font-weight: 600;
          color: var(--primary);
        }

        .history-item-subtitle {
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .history-item-amount {
          font-weight: 600;
          color: var(--success);
        }

        @media (max-width: 1024px) {
          .kpi-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 768px) {
          .sidebar {
            display: none;
          }
          
          .main-content {
            margin-left: 0;
            padding: 1rem;
          }
          
          .kpi-grid {
            grid-template-columns: 1fr;
          }
          
          .search-form {
            flex-direction: column;
          }
          
          .search-input-wrapper {
            width: 100%;
          }
          
          .gst-supplier-row {
            flex-direction: column;
            gap: 1.5rem;
          }
          
          .supplier-section {
            padding-left: 0;
            border-left: none;
            border-top: 2px solid var(--border-color);
            padding-top: 1.5rem;
            width: 100%;
          }
          
          .supplier-input {
            width: 100%;
          }
        }
      `}</style>

      <div className="app-container">
        {/* Sidebar */}
        <div className="sidebar">
          <div className="sidebar-header">
            <h2>
              <FiScissors />
              PO AS PER SHADE
            </h2>
            <p>Version 2.0 • Production</p>
          </div>

          <ul className="nav-menu">
            <li className="nav-item">
              <div className="nav-link active">
                <FiHome />
                Dashboard
              </div>
            </li>
            <li className="nav-item">
              <div className="nav-link">
                <FiShoppingBag />
                Lots
              </div>
            </li>
            <li className="nav-item">
              <div className="nav-link">
                <FiUsers />
                Supervisors
              </div>
            </li>
            <li className="nav-item">
              <div className="nav-link">
                <FiBarChart2 />
                Reports
              </div>
            </li>
            <li className="nav-item">
              <div className="nav-link">
                <FiDatabase />
                PO History
              </div>
            </li>
            <li className="nav-item">
              <div className="nav-link">
                <FiSettings />
                Settings
              </div>
            </li>
          </ul>
        </div>

        {/* Main Content */}
        <div className="main-content">
          {/* Top Bar */}
          <div className="top-bar">
            <div className="page-title">
              <h1>Lot Shade Management</h1>
              <span>Cutting Matrix</span>
            </div>
            <div className="top-bar-actions">
              {matrix && (
                <div className="po-number-badge">
                  <FiHash />
                  {poNumber}
                </div>
              )}
              <button className="btn btn-secondary btn-sm" onClick={handleBack}>
                <FiArrowLeft /> Back
              </button>
              <button className="btn btn-outline btn-sm" onClick={loadPOHistory}>
                <FiDatabase /> History
              </button>
            </div>
          </div>

          {/* Search Section */}
          <div className="search-section">
            <form className="search-form" onSubmit={handleSearch}>
              <div className="search-input-wrapper">
                <FiSearch />
                <input
                  type="text"
                  className="search-input"
                  placeholder="Enter Lot Number (e.g., 64003)"
                  value={lotInput}
                  onChange={(e) => setLotInput(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button type="submit" className="btn btn-primary" disabled={!norm(lotInput) || loading}>
                  {loading ? <div className="spinner" /> : <><FiSearch /> Search</>}
                </button>
                <button type="button" className="btn btn-secondary" onClick={handleClear}>
                  <FiRefreshCw /> Reset
                </button>
              </div>
            </form>
          </div>

          {/* GST and Supplier Row */}
          {matrix && (
            <div className="gst-supplier-row">
              {/* GST Section */}
              <div className="gst-section">
                <div className="gst-toggle">
                  <span style={{ fontWeight: 500 }}>GST</span>
                  <div
                    className="toggle-switch"
                    onClick={() => setGstEnabled(!gstEnabled)}
                    title={gstEnabled ? "Disable GST" : "Enable GST"}
                  />
                </div>

                {gstEnabled && (
                  <>
                    <div className="gst-percentage">
                      <FiPercent />
                      <input
                        type="number"
                        className="gst-input"
                        value={gstPercentage}
                        onChange={(e) => setGstPercentage(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                        min="0"
                        max="100"
                        step="0.1"
                      />
                      <span>%</span>
                    </div>

                    <div className="gst-summary">
                      <span>GST Amount:</span>
                      <span className="gst-amount">₹{gstAmount.toFixed(2)}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Supplier Section */}
              <div className="supplier-section">
                <FiTruck style={{ color: 'var(--accent)', fontSize: '1.25rem' }} />
                <span style={{ fontWeight: 500, minWidth: '100px' }}>Supplier:</span>
                <input
                  type="text"
                  className="supplier-input"
                  placeholder="Enter supplier name"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Error Display */}
          <AnimatePresence>
            {error && (
              <motion.div
                className="error-alert"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <FiAlertTriangle />
                <span>{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main Content Area */}
          {matrix ? (
            <>
              {/* KPI Cards */}
              <div className="kpi-grid">
                <div className="kpi-card">
                  <div className="kpi-header">
                    <div className="kpi-icon primary">
                      <FiPackage />
                    </div>
                  </div>
                  <div className="kpi-value">{totalSystemQty}</div>
                  <div className="kpi-label">System Quantity</div>
                  <div className="kpi-trend">
                    <FiGrid /> {matrix.rows.length} shades
                  </div>
                </div>

                <div className="kpi-card">
                  <div className="kpi-header">
                    <div className="kpi-icon success">
                      <FiEdit3 />
                    </div>
                  </div>
                  <div className="kpi-value">{totalManualQty}</div>
                  <div className="kpi-label">Manual Quantity</div>
                  <div className="kpi-trend">
                    <FiEye /> {visibleRows.length} active
                  </div>
                </div>

                <div className="kpi-card">
                  <div className="kpi-header">
                    <div className="kpi-icon warning">
                      <FiTrendingUp />
                    </div>
                  </div>
                  <div className="kpi-value">{variance > 0 ? '+' : ''}{variance}</div>
                  <div className="kpi-label">Variance</div>
                  <div className={`kpi-trend ${variance > 0 ? 'trend-up' : variance < 0 ? 'trend-down' : ''}`}>
                    {variance !== 0 ? (variance > 0 ? '↑ Above' : '↓ Below') : '—'} system
                  </div>
                </div>

                <div className="kpi-card">
                  <div className="kpi-header">
                    <div className="kpi-icon danger">
                      <FiDollarSign />
                    </div>
                  </div>
                  <div className="kpi-value">₹{calculateGrandTotal}</div>
                  <div className="kpi-label">Total Value</div>
                  <div className="kpi-trend">
                    {gstEnabled && `(incl. GST ${gstPercentage}%)`}
                    {removedCount > 0 && <><FiEyeOff /> {removedCount} hidden</>}
                  </div>
                </div>
              </div>

              {/* Lot Information Section */}
              <div className="section-card">
                <div className="section-header" onClick={() => toggleSection('summary')}>
                  <div className="section-title">
                    <FiInfo />
                    Lot Information
                  </div>
                  <div className={`section-toggle ${expandedSections.summary ? 'expanded' : ''}`}>
                    <FiChevronDown />
                  </div>
                </div>

                {expandedSections.summary && (
                  <div className="section-content">
                    <div className="info-grid">
                      <div className="info-item">
                        <div className="info-label"><FiHash /> Lot Number</div>
                        <div className="info-value">{matrix.lotNumber || '—'}</div>
                      </div>
                      <div className="info-item">
                        <div className="info-label"><FiTag /> Style</div>
                        <div className="info-value">{matrix.style || '—'}</div>
                      </div>
                      <div className="info-item">
                        <div className="info-label"><FiGrid /> Fabric</div>
                        <div className="info-value">{matrix.fabric || '—'}</div>
                      </div>
                      <div className="info-item">
                        <div className="info-label"><FiTag /> Garment Type</div>
                        <div className="info-value">{matrix.garmentType || '—'}</div>
                      </div>
                      <div className="info-item">
                        <div className="info-label"><FiUser /> Brand</div>
                        <div className="info-value">{matrix.brand || '—'}</div>
                      </div>
                      <div className="info-item">
                        <div className="info-label"><FiUser /> Party</div>
                        <div className="info-value">{matrix.partyName || '—'}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Shade Matrix Section */}
              <div className="section-card">
                <div className="section-header" onClick={() => toggleSection('details')}>
                  <div className="section-title">
                    <FiLayers />
                    Shade Matrix
                    <span className="badge badge-info" style={{ marginLeft: '0.5rem' }}>
                      {visibleRows.length} of {matrix.rows.length}
                    </span>
                  </div>
                  <div className={`section-toggle ${expandedSections.details ? 'expanded' : ''}`}>
                    <FiChevronDown />
                  </div>
                </div>

                {expandedSections.details && (
                  <div className="section-content">
                    {/* Bulk Actions */}
                    {Object.values(selectedShades).some(v => v) && (
                      <div className="bulk-actions">
                        <span className="selection-info">
                          {Object.values(selectedShades).filter(v => v).length} shades selected
                        </span>
                        <button className="btn btn-danger btn-sm" onClick={handleBulkRemove}>
                          <FiTrash2 /> Remove
                        </button>
                        <button className="btn btn-success btn-sm" onClick={handleBulkRestore}>
                          <FiEye /> Restore
                        </button>
                        <button className="btn btn-primary btn-sm" onClick={handleBulkAutofill}>
                          <FiCopy /> Autofill Dept & Accessory
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={handleSelectAll}>
                          {Object.values(selectedShades).every(v => v) ? (
                            <><FiCheckSquare /> Deselect All</>
                          ) : (
                            <><FiSquare /> Select All</>
                          )}
                        </button>
                      </div>
                    )}

                    {/* Data Table */}
                    <div className="table-responsive">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th style={{ width: '40px' }}>Select</th>
                            <th>Lot Number</th>
                            <th>Brand</th>
                            <th>Department</th>
                            <th>Accessory</th>
                            <th>Shade</th>
                            <th>System Qty</th>
                            <th>Manual Qty</th>
                            <th>Rate (₹)</th>
                            <th>Total Amount (₹)</th>
                            <th style={{ width: '100px' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {matrix.rows.map((row, idx) => {
                            const key = `${row.color}-${idx}`;
                            const isRemoved = removedShades[key];

                            return (
                              <tr key={idx} className={isRemoved ? 'removed' : ''}>
                                <td>
                                  <input
                                    type="checkbox"
                                    checked={selectedShades[key] || false}
                                    onChange={() => handleSelectShade(key)}
                                  />
                                </td>
                                <td>{matrix.lotNumber || '—'}</td>
                                <td>{matrix.brand || '—'}</td>
                                <td>
                                  <input
                                    type="text"
                                    className="table-input"
                                    value={departments[key] || ''}
                                    onChange={(e) => handleDepartmentChange(key, e.target.value)}
                                    placeholder="Department"
                                    disabled={isRemoved}
                                    style={{ textAlign: 'center' }}
                                  />
                                </td>
                                <td>
                                  <input
                                    type="text"
                                    className="table-input"
                                    value={accessories[key] || ''}
                                    onChange={(e) => handleAccessoryChange(key, e.target.value)}
                                    placeholder="Accessory"
                                    disabled={isRemoved}
                                    style={{ textAlign: 'center' }}
                                  />
                                </td>
                                <td>
                                  <div className="color-badge">
                                    <span className="color-dot" />
                                    {row.color}
                                  </div>
                                </td>
                                <td className="amount">{row.totalPcs || 0}</td>
                                <td>
                                  <input
                                    type="number"
                                    className="table-input small"
                                    value={manualQty[key] || ''}
                                    onChange={(e) => handleManualQtyChange(key, e.target.value)}
                                    placeholder="Qty"
                                    min="0"
                                    step="1"
                                    disabled={isRemoved}
                                  />
                                </td>
                                <td>
                                  <input
                                    type="number"
                                    className="table-input small"
                                    value={rates[key] || ''}
                                    onChange={(e) => handleRateChange(key, e.target.value)}
                                    placeholder="Rate"
                                    min="0"
                                    step="0.01"
                                    disabled={isRemoved}
                                  />
                                </td>
                                <td className="amount">₹{calculateTotalAmount(key)}</td>
                                <td>
                                  {isRemoved ? (
                                    <button
                                      className="icon-btn success"
                                      onClick={() => handleRestoreShade(key)}
                                      title="Restore"
                                    >
                                      <FiEye />
                                    </button>
                                  ) : (
                                    <button
                                      className="icon-btn danger"
                                      onClick={() => handleRemoveShade(key)}
                                      title="Hide"
                                    >
                                      <FiEyeOff />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colSpan="6"><strong>Totals</strong></td>
                            <td className="amount"><strong>{totalSystemQty}</strong></td>
                            <td className="amount"><strong>{totalManualQty}</strong></td>
                            <td>—</td>
                            <td className="amount"><strong>₹{calculateSubtotal.toFixed(2)}</strong></td>
                            <td></td>
                          </tr>
                          {gstEnabled && (
                            <>
                              <tr>
                                <td colSpan="9"><strong>GST ({gstPercentage}%)</strong></td>
                                <td className="amount"><strong>₹{gstAmount.toFixed(2)}</strong></td>
                                <td></td>
                              </tr>
                              <tr>
                                <td colSpan="9"><strong>Grand Total</strong></td>
                                <td className="amount"><strong>₹{calculateGrandTotal}</strong></td>
                                <td></td>
                              </tr>
                            </>
                          )}
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                <button className="btn btn-secondary" onClick={savePOToSheet}>
                  <FiSave /> Save to Sheet
                </button>
                <button className="btn btn-primary" onClick={openIssueDialog}>
                  <FiDownload /> Generate Report
                </button>
              </div>
            </>
          ) : (
            !loading && !error && (
              <div className="welcome-card">
                <div className="welcome-icon">
                  <FiInfo />
                </div>
                <div className="welcome-text">
                  <h3>Welcome to PO AS PER SHADE</h3>
                  <p>Enter a Lot Number above to view its cutting matrix and manage shades. You can customize quantities, rates, departments, accessories, and hide shades as needed. All data can be saved to Google Sheets for future reference.</p>
                </div>
              </div>
            )
          )}

          {/* Loading State */}
          {loading && !matrix && (
            <div className="skeleton" />
          )}

          {/* PDF Generation Dialog */}
          {showIssueDialog && (
            <div className="dialog-overlay" onClick={closeIssueDialog}>
              <div className="dialog" onClick={(e) => e.stopPropagation()}>
                <div className="dialog-header">
                  <h3>
                    <FiPrinter /> Generate Report
                  </h3>
                  <button className="close-btn" onClick={closeIssueDialog}>
                    <FiX />
                  </button>
                </div>

                <div className="form-group">
                  <label className="form-label">PO Number</label>
                  <input
                    type="text"
                    className="form-control"
                    value={poNumber}
                    readOnly
                    disabled
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Date</label>
                  <input
                    type="date"
                    className="form-control"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Supervisor</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      list="supervisorList"
                      className="form-control"
                      placeholder="Enter supervisor name"
                      value={supervisor}
                      onChange={(e) => setSupervisor(titleCase(e.target.value))}
                    />
                    {typedIsNewSupervisor && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => addSupervisorToOptions(supervisor)}
                      >
                        + Add
                      </button>
                    )}
                  </div>
                  <datalist id="supervisorList">
                    {supervisorOptions.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </div>

                <div className="form-group">
                  <label className="form-label">Supplier Name</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Enter supplier name"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Priority</label>
                  <select
                    className="form-control"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                  >
                    <option value="Low">Low</option>
                    <option value="Normal">Normal</option>
                    <option value="High">High</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </div>

                {gstEnabled && (
                  <div className="form-group">
                    <label className="form-label">GST Status</label>
                    <div className="form-control" style={{ background: '#f8fafc' }}>
                      GST {gstPercentage}% - Amount: ₹{gstAmount.toFixed(2)}
                    </div>
                  </div>
                )}

                {dialogError && (
                  <div className="error-alert" style={{ marginBottom: '1.5rem' }}>
                    <FiAlertTriangle />
                    <span>{dialogError}</span>
                  </div>
                )}

                <div className="dialog-actions">
                  <button className="btn btn-secondary" onClick={closeIssueDialog} disabled={confirming}>
                    Cancel
                  </button>
                  <button className="btn btn-primary" onClick={handleConfirmIssue} disabled={confirming}>
                    {confirming ? <div className="spinner" /> : <><FiDownload /> Generate & Save</>}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* PO History Dialog */}
          {showPOHistory && (
            <div className="dialog-overlay" onClick={() => setShowPOHistory(false)}>
              <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
                <div className="dialog-header">
                  <h3>
                    <FiDatabase /> PO History
                  </h3>
                  <button className="close-btn" onClick={() => setShowPOHistory(false)}>
                    <FiX />
                  </button>
                </div>

                {loadingHistory ? (
                  <div style={{ textAlign: 'center', padding: '2rem' }}>
                    <div className="spinner" style={{ borderTopColor: 'var(--accent)' }} />
                  </div>
                ) : (
                  <div className="history-list">
                    {savedPOs.length > 0 ? (
                      savedPOs.map((po, index) => (
                        <div key={index} className="history-item" onClick={() => loadSavedPO(po.poNumber)}>
                          <div className="history-item-info">
                            <span className="history-item-title">{po.poNumber}</span>
                            <span className="history-item-subtitle">
                              Lot: {po.lotNumber} | Supplier: {po.supplier}
                            </span>
                            <span className="history-item-subtitle">
                              {new Date(po.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <div className="history-item-amount">
                            ₹{po.grandTotal?.toLocaleString()}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                        No saved POs found
                      </div>
                    )}
                  </div>
                )}

                <div className="dialog-actions">
                  <button className="btn btn-secondary" onClick={() => setShowPOHistory(false)}>
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}