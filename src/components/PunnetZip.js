import React, { useMemo, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiSearch, FiRefreshCw, FiAlertTriangle, FiUser, FiCalendar, FiX, FiCheck,
  FiScissors, FiInfo, FiPackage, FiTag, FiGrid, FiArrowLeft, FiDownload, FiPrinter,
  FiPlus, FiTrash2, FiCheckSquare, FiSquare, FiTruck, FiLogIn, FiLock
} from 'react-icons/fi';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';

import {
  GOOGLE_API_KEY as CONFIG_API_KEY,
  SHEET_ID_CUTTING,
  SHEET_ID_ZIP_RGP,
  WEB_APP_URL_ZIP
} from "../config/apiConfig";

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

// ============================
// Config
// ============================
const GOOGLE_API_KEY = CONFIG_API_KEY;
const SHEET_ID = SHEET_ID_CUTTING;
const SHEET_IDD = SHEET_ID_ZIP_RGP;
const SHEET_IDDD = SHEET_ID_ZIP_RGP;

// Simple QR System URL - YOUR APPSCRIPT URL
const QR_SYSTEM_URL = WEB_APP_URL_ZIP;

// QR Code Helper Function
const toDataURL = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("QR image load failed"));
    img.src = src;
  });

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

function printableDate(d) {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const yy = String(dt.getFullYear()).slice(-2);
    return `${dd}.${mm}.${yy}`;
  } catch { return d; }
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
// Optimized Data Fetching
// ============================
async function fetchWithCache(url, cacheKey, signal) {
  const cached = getCached(cacheKey);
  if (cached) {
    console.log('Using cached:', cacheKey);
    return cached;
  }

  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Failed to fetch: ${res.status}`);
  }

  const data = await res.json();
  setCached(cacheKey, data);
  return data;
}

// Fetch all required data in parallel
async function fetchAllRequiredData(signal) {
  const cacheKey = 'all_config_data';
  const cached = getCached(cacheKey);
  if (cached) {
    console.log('Using cached config data');
    return cached;
  }

  try {
    const [garmentConfig, zipData] = await Promise.all([
      fetchGarmentZipConfig(signal),
      fetchZipQualityData(signal)
    ]);

    const result = { garmentConfig, zipData };
    setCached(cacheKey, result);
    return result;
  } catch (error) {
    console.error('Failed to fetch required data:', error);
    throw error;
  }
}

async function fetchGarmentZipConfig(signal) {
  const range = encodeURIComponent('ZipCategory!A1:B100');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_IDD}/values/${range}?key=${GOOGLE_API_KEY}`;
  
  const data = await fetchWithCache(url, 'garment_zip_config', signal);
  
  if (!data?.values?.length) {
    throw new Error('Garment-Zip config sheet is empty');
  }

  const headers = data.values[0].map(norm);
  const garmentTypeIndex = headers.findIndex(h => 
    includes(h, 'garment type') || includes(h, 'garment') || includes(h, 'type')
  );
  const zipOptionsIndex = headers.findIndex(h => 
    includes(h, 'zip options') || includes(h, 'zip placement') || includes(h, 'options')
  );

  if (garmentTypeIndex === -1 || zipOptionsIndex === -1) {
    throw new Error('Required columns not found in Garment-Zip config sheet');
  }

  const config = {};
  for (let i = 1; i < data.values.length; i++) {
    const row = data.values[i] || [];
    const garmentType = norm(row[garmentTypeIndex]);
    const zipOptions = norm(row[zipOptionsIndex]);
    
    if (garmentType && zipOptions) {
      const options = zipOptions.split(/[,;]/).map(opt => norm(opt)).filter(opt => opt);
      config[garmentType.toLowerCase()] = options;
    }
  }

  return config;
}

async function fetchZipQualityData(signal) {
  const range = encodeURIComponent('ZipData!A1:C100');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_IDD}/values/${range}?key=${GOOGLE_API_KEY}`;
  
  const data = await fetchWithCache(url, 'zip_quality_data', signal);
  
  if (!data?.values?.length) {
    throw new Error('Zip Quality sheet is empty');
  }

  const headers = data.values[0].map(norm);
  const zipTypeIndex = headers.findIndex(h => 
    includes(h, 'zip type') || includes(h, 'ziptype') || includes(h, 'type') || includes(h, 'zip')
  );
  const colorIndex = headers.findIndex(h => 
    includes(h, 'color') || includes(h, 'colour')
  );
  const priceIndex = headers.findIndex(h => 
    includes(h, 'price') || includes(h, 'approx') || includes(h, 'rate') || includes(h, 'cost')
  );

  if (zipTypeIndex === -1 || colorIndex === -1 || priceIndex === -1) {
    throw new Error('Required columns not found in Zip Quality sheet');
  }

  const zipData = [];
  for (let i = 1; i < data.values.length; i++) {
    const row = data.values[i] || [];
    const zipType = row[zipTypeIndex];
    const color = row[colorIndex];
    const price = row[priceIndex];
    
    if (zipType && color && price) {
      const priceNum = parseFloat(norm(price).replace(/[₹,]/g, '')) || 0;
      zipData.push({
        type: norm(zipType),
        color: norm(color),
        price: priceNum
      });
    }
  }

  return zipData;
}

// ============================
// Analyze Existing Orders for Pending Quantities
// ============================
async function analyzeExistingOrders(lotNumber, signal) {
  try {
    console.log('🔍 Analyzing existing orders for lot:', lotNumber);
    const range = encodeURIComponent('ZipPurchaseOrders!A1:Z');
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_IDDD}/values/${range}?key=${GOOGLE_API_KEY}`;
    
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`Failed to fetch purchase orders: ${response.status}`);
    }

    const data = await response.json();
    if (!data?.values?.length) {
      return new Map();
    }

    const headers = data.values[0].map(norm);
    
    // Find column indices
    const lotNumberIndex = headers.findIndex(h => includes(h, 'lot number'));
    const zipSelectionsIndex = headers.findIndex(h => includes(h, 'zip selections'));
    const totalPiecesIndex = headers.findIndex(h => includes(h, 'total pieces'));
    const colorBreakdownIndex = headers.findIndex(h => includes(h, 'color breakdown'));
    
    if (lotNumberIndex === -1) {
      console.warn('Lot Number column not found');
      return new Map();
    }

    // Map to store ordered quantities per color
    const orderedQuantities = new Map();

    for (let i = 1; i < data.values.length; i++) {
      const row = data.values[i] || [];
      const rowLotNumber = norm(row[lotNumberIndex]);
      
      if (rowLotNumber === norm(lotNumber)) {
        const totalPieces = totalPiecesIndex !== -1 ? parseInt(norm(row[totalPiecesIndex])) || 0 : 0;
        const zipSelections = row[zipSelectionsIndex];
        const colorBreakdown = row[colorBreakdownIndex];
        
        // Parse color breakdown if available (format: "15%: 150pcs; BLACK(50): 250pcs; CREAM: 150pcs")
        if (colorBreakdown && typeof colorBreakdown === 'string') {
          const colorEntries = colorBreakdown.split(';');
          colorEntries.forEach(entry => {
            const match = entry.match(/([^:]+):\s*(\d+)\s*pcs/);
            if (match) {
              const color = match[1].trim();
              const pieces = parseInt(match[2]);
              
              const existing = orderedQuantities.get(color) || { orderedPieces: 0, zipColor: null };
              existing.orderedPieces += pieces;
              orderedQuantities.set(color, existing);
            }
          });
        } 
        // Fallback: Try to get from zip selections
        else if (zipSelections && typeof zipSelections === 'string') {
          try {
            const selections = JSON.parse(zipSelections);
            const selectedColors = Object.keys(selections).filter(color => 
              selections[color] && selections[color] !== ''
            );
            
            if (selectedColors.length > 0) {
              const piecesPerColor = Math.floor(totalPieces / selectedColors.length);
              selectedColors.forEach(color => {
                const existing = orderedQuantities.get(color) || { orderedPieces: 0, zipColor: selections[color] };
                existing.orderedPieces += piecesPerColor;
                existing.zipColor = selections[color];
                orderedQuantities.set(color, existing);
              });
            }
          } catch (e) {
            console.warn('Failed to parse zip selections:', zipSelections);
          }
        }
      }
    }

    console.log('📊 Existing ordered quantities:', Array.from(orderedQuantities.entries()));
    return orderedQuantities;
  } catch (error) {
    console.error('Error analyzing existing orders:', error);
    return new Map();
  }
}

// ============================
// Fetch Existing Purchase Orders Function
// ============================
async function fetchExistingPurchaseOrders(lotNumber, signal) {
  try {
    console.log('🔍 Checking existing purchase orders for lot:', lotNumber);
    const range = encodeURIComponent('ZipPurchaseOrders!A1:Z');
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_IDDD}/values/${range}?key=${GOOGLE_API_KEY}`;
    
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`Failed to fetch purchase orders: ${response.status}`);
    }

    const data = await response.json();
    if (!data?.values?.length) {
      console.log('No purchase orders found');
      return null;
    }

    const headers = data.values[0].map(norm);
    console.log('Purchase order headers:', headers);
    
    const lotNumberIndex = headers.findIndex(h => includes(h, 'lot number'));
    const zipSelectionsIndex = headers.findIndex(h => includes(h, 'zip selections'));

    if (lotNumberIndex === -1 || zipSelectionsIndex === -1) {
      console.warn('Required columns not found in purchase orders');
      return null;
    }

    const existingOrders = [];
    for (let i = 1; i < data.values.length; i++) {
      const row = data.values[i] || [];
      const rowLotNumber = norm(row[lotNumberIndex]);
      const zipSelections = row[zipSelectionsIndex];
      
      if (rowLotNumber === norm(lotNumber) && zipSelections) {
        try {
          const selections = JSON.parse(zipSelections);
          existingOrders.push(selections);
          console.log(`Found existing order for lot ${lotNumber}:`, selections);
        } catch (parseError) {
          console.warn('Failed to parse zip selections:', zipSelections);
        }
      }
    }

    return existingOrders.length > 0 ? existingOrders : null;
  } catch (error) {
    console.error('Error fetching purchase orders:', error);
    return null;
  }
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

  try {
    const parsedAlt = await searchInCuttingSheet(searchKey, signal);
    parsedAlt.source = 'cutting';
    return parsedAlt;
  } catch (err) {
    console.warn('Cutting fallback failed:', err?.message);
  }

  throw new Error(`Lot ${searchKey} not found in Cutting`);
}

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
  const brandCol = headers.findIndex(h => includes(h, 'brand'));
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
    const parsed = parseMatrixWithIndexInfo(data.values, lotInfo);
    if (parsed && parsed.rows && parsed.rows.length > 0) {
      console.log('Successfully parsed using index information');
      return parsed;
    }

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

function parseMatrixWithIndexInfo(rows, lotInfo) {
  console.log('Parsing with index info:', lotInfo);

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

  if (body.length === 0) return null;

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

function parseMatrix(rows, lotNo) {
  let lotNumber = norm(lotNo);
  let style = '';
  let fabric = '';
  let garmentType = '';
  let brand = '';
  let partyName = '';

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
    }
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
    sizes: sizeKeys, 
    rows: body, 
    totals 
  };
}

// ============================
// Pending Zip Count Functions
// ============================
async function fetchPendingZipCount(signal) {
  try {
    const range = encodeURIComponent('ZipPurchaseOrders!A1:Z');
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_IDDD}/values/${range}?key=${GOOGLE_API_KEY}`;
    
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`Failed to fetch pending zip data: ${response.status}`);
    }

    const data = await response.json();
    if (!data?.values?.length) {
      console.log('No data found in the sheet');
      return { pendingLots: 0, totalPendingZipPcs: 0 };
    }

    const headers = data.values[0].map(norm);
    
    const materialEntryDateIndex = headers.findIndex(h => 
      includes(h, 'material entry date') || includes(h, 'material entry')
    );
    const lotNumberIndex = headers.findIndex(h => 
      includes(h, 'lot number') || includes(h, 'lot')
    );
    const totalPiecesIndex = headers.findIndex(h => 
      includes(h, 'total pieces') || includes(h, 'total pcs') || includes(h, 'total')
    );
    const placementQuantitiesIndex = headers.findIndex(h => 
      includes(h, 'placement quantities') || includes(h, 'quantities')
    );

    let pendingLots = 0;
    let totalPendingZipPcs = 0;
    
    for (let i = 1; i < data.values.length; i++) {
      const row = data.values[i] || [];
      
      const materialEntryDate = norm(row[materialEntryDateIndex]);
      const lotNumber = norm(row[lotNumberIndex]);
      const totalPieces = totalPiecesIndex !== -1 ? parseInt(norm(row[totalPiecesIndex])) || 0 : 0;
      
      let totalZipQuantity = 1;
      if (placementQuantitiesIndex !== -1 && row[placementQuantitiesIndex]) {
        try {
          const placementQuantities = JSON.parse(row[placementQuantitiesIndex]);
          if (typeof placementQuantities === 'object' && placementQuantities !== null) {
            totalZipQuantity = Object.values(placementQuantities).reduce((sum, qty) => sum + (parseInt(qty) || 0), 0);
          }
        } catch (e) {
          console.warn('Failed to parse placement quantities for lot:', lotNumber);
          totalZipQuantity = 1;
        }
      }
      
      if (lotNumber && !materialEntryDate) {
        pendingLots++;
        const zipPcs = totalPieces * totalZipQuantity;
        totalPendingZipPcs += zipPcs;
        console.log(`Pending lot: ${lotNumber}, Pieces: ${totalPieces}, Zip Qty: ${totalZipQuantity}, Zip PCs: ${zipPcs}`);
      }
    }

    console.log(`Pending lots: ${pendingLots}, Total pending zip PCs: ${totalPendingZipPcs}`);
    
    return { pendingLots, totalPendingZipPcs };
  } catch (error) {
    console.error('Error fetching pending zip count:', error);
    return { pendingLots: 0, totalPendingZipPcs: 0 };
  }
}

// ============================
// Simple QR Code Functions
// ============================
const generateSimpleQR = async (lotNumber) => {
  try {
    const gateEntryQRUrl = `${QR_SYSTEM_URL}?action=gateForm&lot=${encodeURIComponent(lotNumber)}`;
    const materialInQRUrl = `${QR_SYSTEM_URL}?action=materialForm&lot=${encodeURIComponent(lotNumber)}`;
    const supplierQRUrl = `${QR_SYSTEM_URL}?action=supplierForm&lot=${encodeURIComponent(lotNumber)}`;

    const gateQRImage = await QRCode.toDataURL(gateEntryQRUrl, {
      width: 120,
      margin: 1,
      color: { dark: '#000000', light: '#FFFFFF' }
    });

    const materialQRImage = await QRCode.toDataURL(materialInQRUrl, {
      width: 120,
      margin: 1,
      color: { dark: '#000000', light: '#FFFFFF' }
    });

    const supplierQRImage = await QRCode.toDataURL(supplierQRUrl, {
      width: 120,
      margin: 1,
      color: { dark: '#000000', light: '#FFFFFF' }
    });

    return {
      gateEntry: { url: gateEntryQRUrl, image: gateQRImage },
      materialIn: { url: materialInQRUrl, image: materialQRImage },
      supplierEntry: { url: supplierQRUrl, image: supplierQRImage }
    };
  } catch (error) {
    console.error('Error generating QR codes:', error);
    return null;
  }
};

// ============================
// Save Order to Sheet Function with Pending Support
// ============================
// ============================
// FIXED Save Order to Sheet Function (Matching Working Version)
// ============================
const saveOrderToSheet = async (matrix, formData, totalCost) => {
  try {
    // Extract blockedShades from formData or use empty Set as fallback
    const blockedShades = formData.blockedShades || new Set();
    
    // Filter out blocked shades from the submission
    const filteredZipSelections = { ...formData.zipSelections };
    blockedShades.forEach(color => {
      delete filteredZipSelections[color];
    });

    // Calculate selected shades total pieces (excluding blocked ones)
    let selectedShadesTotalPieces = 0;
    if (filteredZipSelections && matrix.rows) {
      const filteredRows = matrix.rows.filter(row => {
        const color = row.color || '';
        const zipColor = filteredZipSelections[color] || '';
        return zipColor && zipColor.trim() !== '' && !blockedShades.has(color);
      });
      
      selectedShadesTotalPieces = filteredRows.reduce((sum, row) => sum + (row.totalPcs || 0), 0);
      
      console.log(`📊 Selected ${filteredRows.length} out of ${matrix.rows.length} colors (excluding ${blockedShades.size} blocked shades)`);
    }

    const orderData = {
      matrix: {
        lotNumber: matrix.lotNumber || '',
        garmentType: matrix.garmentType || '',
        style: matrix.style || '',
        fabric: matrix.fabric || '',
        totals: {
          grand: selectedShadesTotalPieces
        },
        rows: (matrix.rows || []).map(row => ({
          color: row.color || '',
          totalPcs: row.totalPcs || 0,
          sizes: row.sizes || {}
        }))
      },
      issueDate: formData.issueDate || '',
      supervisor: formData.supervisor || '',
      priority: formData.priority || 'Normal',
      zipSelections: filteredZipSelections, // Use filtered selections
      selectedPlacements: formData.selectedPlacements || [],
      placementQuantities: formData.placementQuantities || {},
      placementZipTypes: formData.placementZipTypes || {},
      zipQualityData: formData.zipQualityData || [],
      totalCost: totalCost || 0,
      selectedShadesTotalPieces: selectedShadesTotalPieces,
      blockedShadesCount: blockedShades.size // Send count for tracking
    };

    console.log('📤 Sending zip order data to Google Sheets:', orderData);

    const response = await fetch(QR_SYSTEM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: JSON.stringify(orderData),
    });

    const result = await response.text();
    
    if (result.includes('SUCCESS')) {
      console.log('✅ Zip order data stored successfully');
      console.log(`📦 Stored ${selectedShadesTotalPieces} pieces (excluding ${blockedShades.size} blocked shades)`);
      return { 
        success: true, 
        message: result,
        selectedShadesTotalPieces: selectedShadesTotalPieces,
        blockedShadesCount: blockedShades.size
      };
    } else {
      console.error('❌ Failed to store zip order data:', result);
      return { success: false, message: result };
    }
    
  } catch (error) {
    console.error('❌ Network error storing zip order data:', error);
    return { success: false, message: error.message };
  }
};

// ============================
// PDF GENERATION WITH PENDING SUPPORT
// ============================
const generateIssuePdf = async (matrix, { 
  issueDate, 
  supervisor, 
  priority,
  zipSelections,
  selectedPlacements,
  placementQuantities,
  placementZipTypes,
  zipQualityData,
  blockedShades,
  pendingInfo,
  isPendingOrder = false,
  consignee = ''
}, skipSave = false) => {
  if (!matrix) return;

  const line = 0.9;

  function cleanString(v) {
    return typeof norm === 'function' ? norm(v) : (v || '');
  }

  function parsePrice(v) {
    if (typeof v === 'number') return v;
    if (typeof v !== 'string') return 0;
    
    let cleaned = v.replace(/[^\d.]/g, '');
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      cleaned = parts[0] + '.' + parts[1];
    } else if (parts.length === 1) {
      cleaned = parts[0];
    }
    
    const result = parseFloat(cleaned);
    return isNaN(result) ? 0 : result;
  }

  function formatPlainNumber(n) {
    const num = Number(n || 0);
    return num.toFixed(2);
  }

  const getZipPricePdf = (zipType, color) => {
    if (!zipType || !color || !zipQualityData) return 0;
    
    try {
      const normalizedType = cleanString(zipType).toLowerCase();
      const normalizedColor = cleanString(color).toLowerCase();
      
      const item = zipQualityData.find(item => 
        cleanString(item.type).toLowerCase() === normalizedType && 
        cleanString(item.color).toLowerCase() === normalizedColor
      );
      
      return item ? parsePrice(item.price) : 0;
    } catch (error) {
      console.error('Error getting zip price:', error);
      return 0;
    }
  };

  const getActualQuantity = (color, originalQty) => {
    if (!isPendingOrder) return originalQty;
    const pending = pendingInfo?.get(color);
    if (pending && pending.status === 'partial' && pending.remaining > 0) {
      return pending.remaining;
    }
    return originalQty;
  };

  const qrCodes = await generateSimpleQR(matrix.lotNumber);
  
  let pendingData = { pendingLots: 0, totalPendingZipPcs: 0 };
  try {
    pendingData = await fetchPendingZipCount();
  } catch (error) {
    console.error('Failed to fetch pending data:', error);
  }

  const selectedRows = matrix.rows.filter(row => {
    const color = row.color || '';
    const zipColor = zipSelections[color] || '';
    if (isPendingOrder) {
      const pending = pendingInfo?.get(color);
      return zipColor && zipColor.trim() !== '' && 
             !blockedShades.has(color) && 
             pending?.remaining > 0;
    }
    return zipColor && zipColor.trim() !== '' && !blockedShades.has(color);
  });

  const selectedTotalPieces = selectedRows.reduce((sum, row) => {
    const color = row.color;
    const qty = getActualQuantity(color, row.totalPcs);
    return sum + (qty || 0);
  }, 0);
  
  console.log(`📊 PDF: Showing ${selectedTotalPieces} ${isPendingOrder ? 'pending' : 'selected'} pieces`);

  const doc = new jsPDF({ unit: 'pt', format: 'A4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 18;
  const borderPad = 6;
  doc.setDrawColor(0); doc.setTextColor(0); doc.setLineWidth(line);
  const borderX = 8, borderY = 8, borderW = W - 16, borderH = H - 16;

  const drawHeader = () => {
    doc.rect(borderX, borderY, borderW, borderH);

    const CM = M + borderPad;
    const contentWidth = W - (CM * 2);
    const boxY = borderY + 20;
    const boxSize = 100;
    const centerPoint = borderX + borderW / 2;

    // Box 1 - GATE ENTRY QR (LEFT)
    const box1X = CM;
    doc.rect(box1X, boxY, boxSize, boxSize);
    doc.setFont('times', 'bold'); doc.setFontSize(9);
    doc.text('SCAN FOR', box1X + boxSize/2, boxY + 12, { align: 'center' });
    doc.text('GATE ENTRY', box1X + boxSize/2, boxY + 24, { align: 'center' });
    
    if (qrCodes && qrCodes.gateEntry.image) {
      doc.addImage(qrCodes.gateEntry.image, 'PNG', box1X + 12, boxY + 32, boxSize - 24, boxSize - 44);
    } else {
      doc.rect(box1X + 12, boxY + 32, boxSize - 24, boxSize - 44);
      doc.setFontSize(7);
      doc.text('QR CODE', box1X + boxSize/2, boxY + boxSize/2 + 5, { align: 'center' });
      doc.text('GATE ENTRY', box1X + boxSize/2, boxY + boxSize/2 + 18, { align: 'center' });
    }

    // Box 2 - MATERIAL IN QR (RIGHT)
    const box2X = CM + contentWidth - boxSize;
    doc.rect(box2X, boxY, boxSize, boxSize);
    doc.setFont('times', 'bold'); doc.setFontSize(9);
    doc.text('SCAN FOR', box2X + boxSize/2, boxY + 12, { align: 'center' });
    doc.text('MATERIAL IN', box2X + boxSize/2, boxY + 24, { align: 'center' });
    
    if (qrCodes && qrCodes.materialIn.image) {
      doc.addImage(qrCodes.materialIn.image, 'PNG', box2X + 12, boxY + 32, boxSize - 24, boxSize - 44);
    } else {
      doc.rect(box2X + 12, boxY + 32, boxSize - 24, boxSize - 44);
      doc.setFontSize(7);
      doc.text('QR CODE', box2X + boxSize/2, boxY + boxSize/2 + 5, { align: 'center' });
      doc.text('MATERIAL IN', box2X + boxSize/2, boxY + boxSize/2 + 18, { align: 'center' });
    }

    // HEADING BETWEEN QR CODES
    const headerTitleY = boxY + boxSize/2 - 15;
    
    if (isPendingOrder) {
      doc.setFont('times', 'italic');
      doc.setFontSize(13);
      doc.setTextColor(0, 0, 0);
      doc.text('PENDING QUANTITY ORDER', centerPoint, headerTitleY - 22, { align: 'center' });
      doc.setTextColor(0, 0, 0);
    }
    
    doc.setFont('times', 'bold'); 
    doc.setFontSize(18);
    doc.text('PURCHASE ORDER', centerPoint, headerTitleY, { align: 'center' });
    
    doc.setFontSize(12);
    doc.text('ZIP MATERIAL REQUIREMENT', centerPoint, headerTitleY + 18, { align: 'center' });

    const lotNumberText = cleanString(matrix.lotNumber || 'lot no. unknown');
    doc.setFont('times', 'bold');
    doc.setFontSize(16);
    doc.text(`LOT NO: ${lotNumberText}`, centerPoint, headerTitleY + 40, { align: 'center' });

    // FIELDS SECTION (below QR codes)
    const fieldsY = boxY + boxSize + 12;
    const fieldH = 20;
    
    const dateItemW = (contentWidth / 2) - 1;
    const dateItemX = CM;
    
    doc.rect(dateItemX, fieldsY, dateItemW, fieldH);
    doc.setFont('times', 'bold'); doc.setFontSize(9);
    doc.text('DATE :', dateItemX + 4, fieldsY + 12);
    doc.setFont('times', 'normal');
    doc.text(printableDate(issueDate), dateItemX + 35, fieldsY + 12);

    doc.rect(dateItemX + dateItemW, fieldsY, dateItemW, fieldH);
    doc.setFont('times', 'bold'); doc.setFontSize(9);
    doc.text('ITEM :', dateItemX + dateItemW + 4, fieldsY + 12);
    doc.setFont('times', 'normal');
    doc.text(cleanString(matrix.garmentType || matrix.style || ''), dateItemX + dateItemW + 35, fieldsY + 12);

    const pcsPriorityX = CM;
    
    doc.rect(pcsPriorityX, fieldsY + fieldH, dateItemW, fieldH);
    doc.setFont('times', 'bold'); doc.setFontSize(9);
    doc.text(isPendingOrder ? 'PENDING PCS'  : 'TOTAL PCS', pcsPriorityX + 4, fieldsY + fieldH + 12);
    doc.setFont('times', 'normal');
    doc.text(selectedTotalPieces.toString(), pcsPriorityX + 60, fieldsY + fieldH + 12);

    doc.rect(pcsPriorityX + dateItemW, fieldsY + fieldH, dateItemW, fieldH);
    doc.setFont('times', 'bold'); doc.setFontSize(9);
    doc.text('PRIOIRTY', pcsPriorityX + dateItemW + 4, fieldsY + fieldH + 12);
    doc.setFont('times', 'normal');
    doc.text(cleanString(priority ?? 'normal'), pcsPriorityX + dateItemW + 50, fieldsY + fieldH + 12);

    const brandSupervisorX = CM;
    doc.rect(brandSupervisorX, fieldsY + (fieldH * 2), dateItemW, fieldH);
    doc.setFont('times', 'bold'); doc.setFontSize(9);
    doc.text('BRAND :', brandSupervisorX + 4, fieldsY + (fieldH * 2) + 12);
    doc.setFont('times', 'normal');
    doc.text(cleanString(matrix.brand || ''), brandSupervisorX + 45, fieldsY + (fieldH * 2) + 12);

    doc.rect(brandSupervisorX + dateItemW, fieldsY + (fieldH * 2), dateItemW, fieldH);
    doc.setFont('times', 'bold'); doc.setFontSize(9);
    doc.text('SUPERVISOR : ', brandSupervisorX + dateItemW + 4, fieldsY + (fieldH * 2) + 12);
    doc.setFont('times', 'normal');
    doc.text(cleanString(supervisor ?? '________'), brandSupervisorX + dateItemW + 65, fieldsY + (fieldH * 2) + 12);

    // CONSIGNEE FIELD
    const consigneeY = fieldsY + (fieldH * 3);
    doc.rect(CM, consigneeY, contentWidth, fieldH);
    doc.setFont('times', 'bold'); doc.setFontSize(9);
    doc.text('CONSIGNEE :', CM + 4, consigneeY + 12);
    doc.setFont('times', 'normal');
    doc.text(cleanString(consignee || '________________________'), CM + 65, consigneeY + 12);

    const dividingLineY = consigneeY + fieldH + 5;
    doc.setLineWidth(1.5);
    doc.setDrawColor(0);
    doc.line(CM, dividingLineY, CM + contentWidth, dividingLineY);
    doc.setLineWidth(line);

    return { CM, contentWidth, breakdownStartY: dividingLineY + 15 };
  };

  const drawSimpleFooter = (currentPage, pageCount) => {
    doc.setFont('times', 'normal');
    doc.setFontSize(8);
    doc.text(`page ${currentPage} of ${pageCount}`, W / 2, H - 10, { align: 'center' });
  };

  const drawFooterWithSignatures = () => {
    const CM = M + borderPad;
    const contentWidth = W - (CM * 2);
    const signatureSectionHeight = 130;
    const signatureSectionY = H - signatureSectionHeight;
    const signatureBoxWidth = 170;
    const signatureBoxHeight = 50;
    const signatureSpacing = (contentWidth - (signatureBoxWidth * 3)) / 2;
    const boxPad = 5;

    doc.setLineWidth(line);
    doc.setDrawColor(0);
    doc.setTextColor(0);

    const drawSignatureBox = (x, label) => {
      doc.rect(x, signatureSectionY, signatureBoxWidth, signatureBoxHeight);
      doc.setFont('times', 'bold'); doc.setFontSize(9);
      doc.text(label.toLowerCase(), x + boxPad, signatureSectionY + 10);
      doc.setFont('times', 'normal'); doc.setFontSize(8);
      doc.text('NAME:', x + boxPad, signatureSectionY + 28);
      doc.line(x + 35, signatureSectionY + 28, x + signatureBoxWidth - boxPad, signatureSectionY + 28);
      doc.text('date:', x + boxPad, signatureSectionY + 43);
      doc.line(x + 35, signatureSectionY + 43, x + signatureBoxWidth - boxPad, signatureSectionY + 43);
    };

    const supervisorBoxX = CM;
    drawSignatureBox(supervisorBoxX, 'SUPERVISOR SIGN');
    const supplierBoxX = supervisorBoxX + signatureBoxWidth + signatureSpacing;
    drawSignatureBox(supplierBoxX, 'SUPPLIER SIGN');
    const receiverBoxX = supplierBoxX + signatureBoxWidth + signatureSpacing;
    drawSignatureBox(receiverBoxX, 'RECEIVER SIGN');

    const pendingBoxWidth = 140;
    const pendingBoxHeight = 50;
    const pendingBoxX = receiverBoxX;
    const pendingBoxY = signatureSectionY - 55;

    doc.setDrawColor(0);
    doc.setLineWidth(line);
    doc.rect(pendingBoxX, pendingBoxY, pendingBoxWidth, pendingBoxHeight);
    doc.setFont('times', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text('PENDING STATUS', pendingBoxX + pendingBoxWidth/2, pendingBoxY + 8, { align: 'center' });
    doc.setLineWidth(0.5);
    doc.line(pendingBoxX + 5, pendingBoxY + 12, pendingBoxX + pendingBoxWidth - 5, pendingBoxY + 12);
    doc.setFont('times', 'bold');
    doc.setFontSize(8);
    doc.text('PENDING LOTS:', pendingBoxX + 8, pendingBoxY + 22);
    doc.setFontSize(10);
    doc.text(`${pendingData.pendingLots}`, pendingBoxX + pendingBoxWidth - 8, pendingBoxY + 22, { align: 'right' });
    doc.setFont('times', 'bold');
    doc.setFontSize(7);
    doc.text('PENDING ZIP PCS:', pendingBoxX + 8, pendingBoxY + 35);
    doc.setFontSize(9);
    doc.text(`${pendingData.totalPendingZipPcs.toLocaleString()}`, pendingBoxX + pendingBoxWidth - 8, pendingBoxY + 35, { align: 'right' });

    const instructionsY = signatureSectionY + signatureBoxHeight + 15;
    const centerX = CM + contentWidth / 2;
    doc.setFont('times', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text('QR CODE USAGE INSTRUCTION:', centerX, instructionsY, { align: 'center' });
    doc.setFont('times', 'normal');
    doc.setFontSize(7);
    doc.text('• LEFT QR: SCAN WHEN MATERIAL ENTER THE GATE - UPDATES GATE ENTRY PERSON AND DATE', centerX, instructionsY + 10, { align: 'center' });
    doc.text('• RIGHT QR: SCAN WHEN MATERIAL ARE RECEIVED - UPDATE MATERIAL RECEIVED STATUS AND DATE', centerX, instructionsY + 20, { align: 'center' });
  };

  const { CM, contentWidth, breakdownStartY } = drawHeader();
  let finalContentY = breakdownStartY;
  const signatureSectionHeight = 120;
  
  let summaryData = [];
  let totalZipCost = 0;
  let currentPage = 1;
  let pageCount = 1;
  
  if (matrix && selectedRows.length > 0 && selectedPlacements.length > 0 && zipSelections) {
    const zipHead = [['ZIP TYPE', 'PLACEMENT', 'COLOUR', 'ZIP COLOUR', 'QTY', 'PRICE', 'TOTAL']];
    const zipBody = [];
    totalZipCost = 0;
    const zipTypeSummary = {};

    selectedPlacements.forEach(placement => {
      const placementQuantity = placementQuantities[placement] || 1;
      const zipType = placementZipTypes[placement];
      
      if (zipType) {
        selectedRows.forEach(row => {
          const color = row.color;
          if (!color) return;
          
          const zipColor = zipSelections[color];
          if (zipColor && zipColor.trim() !== '' && !blockedShades.has(color)) {
            const price = getZipPricePdf(zipType, zipColor);
            const quantity = getActualQuantity(color, row.totalPcs);
            const requiredQuantity = quantity * placementQuantity;
            const rowTotal = price * requiredQuantity;
            totalZipCost += rowTotal;

            if (!zipTypeSummary[zipType]) {
              zipTypeSummary[zipType] = 0;
            }
            zipTypeSummary[zipType] += requiredQuantity;

            if (requiredQuantity > 0) {
              zipBody.push([
                zipType,
                `${placement} (${placementQuantity} per pc)`,
                color,
                zipColor,
                requiredQuantity.toString(),
                formatPlainNumber(price),
                formatPlainNumber(rowTotal)
              ]);
            }
          }
        });
      }
    });

    // Calculate total quantity from all zip body entries
    const totalQuantityAll = zipBody.reduce((sum, row) => sum + (parseInt(row[4]) || 0), 0);
    
    summaryData = Object.entries(zipTypeSummary).map(([zipType, totalQuantity]) => ({
      zipType,
      totalQuantity
    }));

    if (zipBody.length > 0) {
      const zipFoot = [
        ['', '', '', '', `T QTY: ${totalQuantityAll}`, 'T COST:', formatPlainNumber(totalZipCost)]
      ];

      const zipColStyles = { 
        0: { cellWidth: 120, halign: 'left' },
        1: { cellWidth: 120, halign: 'left' },
        2: { cellWidth: 70, halign: 'center' },
        3: { cellWidth: 80, halign: 'center' },
        4: { cellWidth: 60, halign: 'center' },
        5: { cellWidth: 50, halign: 'center' },
        6: { cellWidth: 50, halign: 'right' }
      };

      autoTable(doc, {
        head: zipHead,
        body: zipBody,
        foot: zipFoot,
        startY: breakdownStartY,
        theme: 'grid',
        tableWidth: contentWidth,
        margin: { top: breakdownStartY, left: CM, right: CM, bottom: 50 },
        pageBreak: 'auto',
        styles: {
          font: 'times',
          fontSize: 9,
          textColor: [0,0,0],
          lineColor: [0,0,0],
          lineWidth: line,
          cellPadding: 4,
          halign: 'left',
        },
        headStyles: { 
          fillColor: [240, 240, 240], 
          textColor: [0,0,0], 
          fontStyle: 'bold',
          halign: 'center'
        },
        footStyles: { 
          fillColor: [240, 240, 240], 
          textColor: [0,0,0], 
          fontStyle: 'bold',
          halign: 'center'
        },
        columnStyles: zipColStyles,
        didDrawPage: function(data) {
          currentPage = data.pageNumber;
          pageCount = data.pageCount;
          if (currentPage < pageCount) {
            drawSimpleFooter(currentPage, pageCount);
          }
          if (data.pageNumber > 1) {
            drawHeader();
            drawSimpleFooter(currentPage, pageCount);
          }
        }
      });

      finalContentY = doc.lastAutoTable.finalY + 20;

      if (summaryData.length > 0) {
        const summaryBoxWidth = contentWidth;
        const summaryBoxHeight = Math.max(80, summaryData.length * 20 + 50);
        
        if (finalContentY + summaryBoxHeight > H - signatureSectionHeight - 20) {
          doc.addPage();
          currentPage++;
          pageCount++;
          drawHeader();
          drawSimpleFooter(currentPage, pageCount);
          finalContentY = breakdownStartY;
        }

        const summaryBoxX = CM;
        const summaryBoxY = finalContentY;

        doc.setDrawColor(0);
        doc.setLineWidth(line);
        doc.rect(summaryBoxX, summaryBoxY, summaryBoxWidth, summaryBoxHeight);
        doc.setFont('times', 'bold');
        doc.setFontSize(11);
        doc.text('ZIP TYPE SUMMARY', summaryBoxX + summaryBoxWidth/2, summaryBoxY + 20, { align: 'center' });
        doc.setLineWidth(0.8);
        doc.line(summaryBoxX + 10, summaryBoxY + 30, summaryBoxX + summaryBoxWidth - 10, summaryBoxY + 30);
        doc.setFont('times', 'normal');
        doc.setFontSize(9);
        
        let summaryContentY = summaryBoxY + 50;
        
        summaryData.forEach((item, index) => {
          const rowY = summaryContentY + (index * 20);
          doc.text(`${item.zipType}:`, summaryBoxX + 20, rowY);
          doc.text(`${item.totalQuantity.toLocaleString()}`, summaryBoxX + summaryBoxWidth - 20, rowY, { align: 'right' });
        });

        const totalQuantity = summaryData.reduce((sum, item) => sum + item.totalQuantity, 0);
        const totalY = summaryContentY + (summaryData.length * 20) + 10;
        
        doc.setLineWidth(0.8);
        doc.line(summaryBoxX + 10, totalY, summaryBoxX + summaryBoxWidth - 10, totalY);
        doc.setFont('times', 'bold');
        doc.text('GRAND TOTAL OF ZIP PCS:', summaryBoxX + 20, totalY + 18);
        doc.text(`${totalQuantity.toLocaleString()}`, summaryBoxX + summaryBoxWidth - 20, totalY + 18, { align: 'right' });

        finalContentY = summaryBoxY + summaryBoxHeight + 20;

        const supplierQRSize = 100;
        const supplierQRX = CM + (contentWidth - supplierQRSize) / 2;
        const supplierQRY = finalContentY + 20;

        doc.rect(supplierQRX, supplierQRY, supplierQRSize, supplierQRSize);
        doc.setFont('times', 'bold'); doc.setFontSize(9);
        doc.text('SCAN FOR', supplierQRX + supplierQRSize/2, supplierQRY + 12, { align: 'center' });
        doc.text('SUPPLIER', supplierQRX + supplierQRSize/2, supplierQRY + 24, { align: 'center' });
        
        if (qrCodes && qrCodes.supplierEntry.image) {
          doc.addImage(qrCodes.supplierEntry.image, 'PNG', supplierQRX + 12, supplierQRY + 32, supplierQRSize - 24, supplierQRSize - 44);
        } else {
          doc.rect(supplierQRX + 12, supplierQRY + 32, supplierQRSize - 24, supplierQRSize - 44);
          doc.setFontSize(7);
          doc.text('QR CODE', supplierQRX + supplierQRSize/2, supplierQRY + supplierQRSize/2 + 5, { align: 'center' });
          doc.text('SUPPLIER ENTRY', supplierQRX + supplierQRSize/2, supplierQRY + supplierQRSize/2 + 18, { align: 'center' });
        }

        finalContentY = supplierQRY + supplierQRSize + 20;
      }
    }
  }

  drawFooterWithSignatures();
  drawSimpleFooter(currentPage, pageCount);

  const fname = `Lot_${cleanString(matrix.lotNumber || 'Unknown')}_${isPendingOrder ? 'PENDING_' : ''}PO_${printableDate(issueDate).replace(/\//g, '-')}.pdf`;
  doc.save(fname);

  let saveResult = { success: true, message: 'Saved skipped (Redownload mode)' };
  if (!skipSave) {
    saveResult = await saveOrderToSheet(
      matrix,
      { 
        issueDate, 
        supervisor, 
        priority,
        zipSelections,
        selectedPlacements,
        placementQuantities,
        placementZipTypes,
        zipQualityData,
        blockedShades,
        pendingInfo
      },
      totalZipCost,
      isPendingOrder
    );
  }

  return {
    success: true,
    pdfGenerated: true,
    dataSaved: saveResult.success,
    message: saveResult.message,
    pendingData: pendingData,
    selectedPieces: selectedTotalPieces,
    totalPieces: matrix.totals.grand,
    isPendingOrder: isPendingOrder
  };
};

// ============================
// Main Component
// ============================
export default function PuneetZip() {
  const [lotInput, setLotInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [matrix, setMatrix] = useState(null);
  const [error, setError] = useState('');
  const abortRef = useRef(null);
  const [priority, setPriority] = useState('Normal');
  const [blockedShades, setBlockedShades] = useState(new Set());
  const [pendingInfo, setPendingInfo] = useState(null);

  const [showIssueDialog, setShowIssueDialog] = useState(false);
  const [issueDate, setIssueDate] = useState(() => todayLocalISO());
  const [supervisor, setSupervisor] = useState('');
  const [dialogError, setDialogError] = useState('');
  const [confirming, setConfirming] = useState(false);

  const [zipSelections, setZipSelections] = useState({});
  const [zipQualityData, setZipQualityData] = useState([]);
  const [selectedZipTypes, setSelectedZipTypes] = useState([]);
  const [loadingZipQuality, setLoadingZipQuality] = useState(false);
  const [zipDataError, setZipDataError] = useState('');

  const [garmentZipConfig, setGarmentZipConfig] = useState({});
  const [selectedPlacements, setSelectedPlacements] = useState([]);
  const [placementQuantities, setPlacementQuantities] = useState({});
  const [placementZipTypes, setPlacementZipTypes] = useState({});
  const [loadingGarmentConfig, setLoadingGarmentConfig] = useState(false);

  const LS_KEY_SUPERVISORS = 'issueStitching.supervisors';
  const DEFAULT_SUPERVISORS = ['SONU', 'SANJAY', 'MONU', 'ROHIT','VINAY'];

  const [supervisorOptions, setSupervisorOptions] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY_SUPERVISORS) || '[]');
      return uniqCaseInsensitive([...DEFAULT_SUPERVISORS, ...saved]);
    } catch {
      return DEFAULT_SUPERVISORS.slice();
    }
  });

  useEffect(() => {
    const preloadData = async () => {
      setLoadingZipQuality(true);
      setLoadingGarmentConfig(true);
      
      try {
        const { garmentConfig, zipData } = await fetchAllRequiredData();
        setGarmentZipConfig(garmentConfig);
        setZipQualityData(zipData);
        
        if (zipData.length === 0) {
          setZipDataError('No zip data found in the sheet.');
        }
      } catch (err) {
        console.error('Failed to preload data:', err);
        setZipDataError(`Failed to load data: ${err.message}`);
      } finally {
        setLoadingZipQuality(false);
        setLoadingGarmentConfig(false);
      }
    };

    preloadData();
  }, []);

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

  const initializeWithPendingDetection = async (matrixData, signal) => {
    const zipSelectionsTemp = {};
    const blockedShadesTemp = new Set();
    const pendingInfoTemp = new Map();
    
    const existingOrders = await analyzeExistingOrders(matrixData.lotNumber, signal);
    
    matrixData.rows.forEach(row => {
      const color = row.color;
      const currentCuttingQty = row.totalPcs || 0;
      const existingOrder = existingOrders.get(color);
      
      if (existingOrder) {
        const orderedQty = existingOrder.orderedPieces;
        const remainingQty = currentCuttingQty - orderedQty;
        
        if (remainingQty <= 0) {
          blockedShadesTemp.add(color);
          zipSelectionsTemp[color] = 'BLOCKED';
          pendingInfoTemp.set(color, {
            status: 'completed',
            ordered: orderedQty,
            remaining: 0,
            total: currentCuttingQty,
            zipColor: existingOrder.zipColor,
            canOrder: false
          });
        } else {
          zipSelectionsTemp[color] = existingOrder.zipColor || '';
          pendingInfoTemp.set(color, {
            status: 'partial',
            ordered: orderedQty,
            remaining: remainingQty,
            total: currentCuttingQty,
            zipColor: existingOrder.zipColor,
            canOrder: true,
            isPending: true
          });
        }
      } else {
        zipSelectionsTemp[color] = '';
        pendingInfoTemp.set(color, {
          status: 'available',
          ordered: 0,
          remaining: currentCuttingQty,
          total: currentCuttingQty,
          zipColor: null,
          canOrder: true,
          isPending: false
        });
      }
    });
    
    return { zipSelections: zipSelectionsTemp, blockedShades: blockedShadesTemp, pendingInfo: pendingInfoTemp };
  };

const handleSearch = async (e) => {
  e?.preventDefault?.();
  const normalizedLot = norm(lotInput);
  if (!normalizedLot || loading) return;

  setError('');
  setMatrix(null);
  setBlockedShades(new Set());
  setPendingInfo(null);
  setZipSelections({}); // Reset to empty object
  setLoading(true);

  abortRef.current?.abort?.();
  const ctrl = new AbortController();
  abortRef.current = ctrl;

  try {
    const cacheKey = `lot_${normalizedLot}`;
    const cachedMatrix = getCached(cacheKey);
    
    if (cachedMatrix) {
      console.log('Using cached lot data');
      setMatrix(cachedMatrix);
      const { zipSelections: selections, blockedShades: blocked, pendingInfo: pending } = await initializeWithPendingDetection(cachedMatrix, ctrl.signal);
      setZipSelections(selections || {}); // Ensure object
      setBlockedShades(blocked || new Set());
      setPendingInfo(pending || new Map());
    } else {
      const data = await fetchLotMatrixViaSheetsApi(normalizedLot, ctrl.signal);
      setCached(cacheKey, data);
      setMatrix(data);
      const { zipSelections: selections, blockedShades: blocked, pendingInfo: pending } = await initializeWithPendingDetection(data, ctrl.signal);
      setZipSelections(selections || {}); // Ensure object
      setBlockedShades(blocked || new Set());
      setPendingInfo(pending || new Map());
    }
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
    setZipSelections({});
    setSelectedPlacements([]);
    setPlacementQuantities({});
    setPlacementZipTypes({});
    setBlockedShades(new Set());
    setPendingInfo(null);
    abortRef.current?.abort?.();
  };

  const handleBack = () => {
    if (window.history?.length > 1) window.history.back();
    else window.close?.();
  };

  const handleZipChange = (color, value) => {
    if (blockedShades.has(color)) {
      alert(`This shade (${color}) already has a purchase order and cannot be modified.`);
      return;
    }
    
    setZipSelections(prev => ({
      ...prev,
      [color]: value
    }));
  };

  const availableZipTypes = useMemo(() => {
    const types = [...new Set(zipQualityData.map(item => item.type))];
    return types.sort();
  }, [zipQualityData]);

  const zipPlacementOptions = useMemo(() => {
    if (!matrix || !matrix.garmentType) return [];
    const normalizedType = norm(matrix.garmentType).toLowerCase();
    return garmentZipConfig[normalizedType] || [];
  }, [matrix, garmentZipConfig]);

  const getZipPrice = (zipType, color) => {
    if (!zipType || !color || !zipQualityData) return 0;
    
    const item = zipQualityData.find(
      item => norm(item.type) === norm(zipType) && 
      norm(item.color).toLowerCase() === norm(color).toLowerCase()
    );
    return item ? item.price : 0;
  };

  const totalCost = useMemo(() => {
    if (!selectedPlacements || selectedPlacements.length === 0 || !matrix) return 0;

    let total = 0;
    selectedPlacements.forEach(placement => {
      const quantity = placementQuantities[placement] || 1;
      const zipType = placementZipTypes[placement];
      
      if (zipType) {
        matrix.rows.forEach(row => {
          const color = row.color;
          const zipColor = zipSelections[color];
          if (zipColor && zipColor.trim() !== '' && !blockedShades.has(color)) {
            let pieces = row.totalPcs || 0;
            const pending = pendingInfo?.get(color);
            if (pending?.status === 'partial' && pending.remaining > 0) {
              pieces = pending.remaining;
            }
            const price = getZipPrice(zipType, zipColor);
            total += (price * pieces) * quantity;
          }
        });
      }
    });

    return total;
  }, [selectedPlacements, placementQuantities, placementZipTypes, matrix, zipSelections, blockedShades, pendingInfo]);

  const togglePlacement = (placement) => {
    setSelectedPlacements(prev => {
      const newPlacements = prev.includes(placement) 
        ? prev.filter(p => p !== placement)
        : [...prev, placement];
      
      if (!newPlacements.includes(placement)) {
        setPlacementQuantities(prev => {
          const newQuantities = { ...prev };
          delete newQuantities[placement];
          return newQuantities;
        });
        setPlacementZipTypes(prev => {
          const newZipTypes = { ...prev };
          delete newZipTypes[placement];
          return newZipTypes;
        });
      } else {
        setPlacementQuantities(prev => ({
          ...prev,
          [placement]: 1
        }));
        setPlacementZipTypes(prev => ({
          ...prev,
          [placement]: availableZipTypes[0] || ''
        }));
      }
      
      return newPlacements;
    });
  };

  const handleQuantityChange = (placement, quantity) => {
    setPlacementQuantities(prev => ({
      ...prev,
      [placement]: Math.max(1, parseInt(quantity) || 1)
    }));
  };

  const handlePlacementZipTypeChange = (placement, zipType) => {
    setPlacementZipTypes(prev => ({
      ...prev,
      [placement]: zipType
    }));
  };

  const openIssueDialog = () => {
    setDialogError('');
    setSupervisor('');
    setIssueDate(todayLocalISO());
    setShowIssueDialog(true);
  };
  
  const closeIssueDialog = () => {
    if (confirming) return;
    setShowIssueDialog(false);
  };

  const generatePendingOrder = async () => {
    setDialogError('');
    setConfirming(true);

    try {
      addSupervisorToOptions(supervisor);

      const result = await generateIssuePdf(matrix, { 
        issueDate, 
        supervisor, 
        priority,
        zipSelections,
        selectedPlacements,
        placementQuantities,
        placementZipTypes,
        zipQualityData,
        blockedShades,
        pendingInfo,
        isPendingOrder: true
      });

      setShowIssueDialog(false);
      
      if (result.success) {
        alert(`✅ PENDING ORDER created successfully!\n\n` +
              `Order Type: Additional/Remaining Quantity\n` +
              `Quantity: ${result.selectedPieces} pieces\n\n` +
              `PDF has been saved and data stored in sheet.`);
      } else {
        alert('PDF generated but data saving failed: ' + result.message);
      }
      
    } catch (e) {
      setDialogError(e?.message || 'Failed to generate PDF.');
    } finally {
      setConfirming(false);
    }
  };

  const generateFullOrder = async () => {
    setDialogError('');
    setConfirming(true);

    try {
      addSupervisorToOptions(supervisor);

      const result = await generateIssuePdf(matrix, { 
        issueDate, 
        supervisor, 
        priority,
        zipSelections,
        selectedPlacements,
        placementQuantities,
        placementZipTypes,
        zipQualityData,
        blockedShades,
        pendingInfo,
        isPendingOrder: false
      });

      setShowIssueDialog(false);
      
      if (result.success) {
        alert(`✅ NEW ORDER created successfully!\n\n` +
              `Quantity: ${result.selectedPieces} pieces`);
      } else {
        alert('PDF generated but data saving failed: ' + result.message);
      }
      
    } catch (e) {
      setDialogError(e?.message || 'Failed to generate PDF.');
    } finally {
      setConfirming(false);
    }
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
  
  // Add safety check for zipSelections
  if (!zipSelections || typeof zipSelections !== 'object') {
    setDialogError('Zip selections not initialized. Please try searching the lot again.');
    return;
  }
  
  const hasPendingSelections = Object.entries(zipSelections).some(([color, selection]) => {
    const pending = pendingInfo?.get(color);
    return selection && selection.trim() !== '' && 
           pending?.status === 'partial' && 
           pending.remaining > 0;
  });
  
  if (hasPendingSelections) {
    const userChoice = window.confirm(
      '⚠️ Some selected shades already have existing orders!\n\n' +
      'Would you like to:\n' +
      '• Click OK to create a PENDING ORDER for the REMAINING quantities only\n' +
      '• Click Cancel to create a NEW ORDER for FULL quantities (duplicate)\n\n' +
      'Note: Creating a pending order will only order the remaining pieces.'
    );
    
    if (userChoice) {
      await generatePendingOrder();
    } else {
      await generateFullOrder();
    }
  } else {
    await generateFullOrder();
  }
};

  const handleDirectRedownload = async () => {
    if (!matrix) return;
    try {
      setConfirming(true);
      await generateIssuePdf(matrix, { 
        issueDate: issueDate || todayLocalISO(), 
        supervisor: supervisor || 'Supervisor', 
        priority: priority || 'Normal',
        zipSelections: zipSelections || {},
        selectedPlacements: selectedPlacements || [],
        placementQuantities: placementQuantities || {},
        placementZipTypes: placementZipTypes || {},
        zipQualityData: zipQualityData || [],
        blockedShades: blockedShades || new Set(),
        pendingInfo: pendingInfo,
        isPendingOrder: false
      }, true);
      alert(`✅ Purchase Order for Lot ${matrix.lotNumber} re-downloaded successfully!`);
    } catch (err) {
      console.error('Error re-downloading PO:', err);
      alert(`❌ Failed to re-download PO: ${err.message}`);
    } finally {
      setConfirming(false);
    }
  };

  const displaySizes = useMemo(() => {
    if (!matrix) return [];
    return matrix.sizes || [];
  }, [matrix]);

  const columns = useMemo(
    () => (matrix ? ['Color', 'Cutting Table', ...displaySizes, 'Total Pcs', 'Zip Color'] : []),
    [matrix, displaySizes]
  );

  return (
    <div className="Wrap">
      <style>
        {`
        .Wrap {
          max-width: 2100px;
          margin: 0 auto;
          padding: 24px 20px 40px;
          font-family: 'Plus Jakarta Sans', 'Outfit', sans-serif;
          color: #1e293b;
          background: transparent;
          min-height: 100vh;
        }

        .HeaderPaper {
          background: white;
          border-radius: 20px;
          padding: 28px;
          margin-bottom: 24px;
          box-shadow: 0 10px 30px rgba(0, 41, 107, 0.03);
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 32px;
          align-items: center;
          border: 1px solid rgba(0, 63, 136, 0.08);
        }

        @media (max-width: 900px) {
          .HeaderPaper {
            grid-template-columns: 1fr;
            gap: 20px;
          }
        }

        .TitleSection {
          display: flex;
          align-items: center;
          gap: 20px;
        }

        .TitleSection h1 {
          margin: 0 0 8px 0;
          font-size: 2rem;
          font-weight: 800;
          color: #003f88;
          background: linear-gradient(135deg, #003f88 0%, #00296b 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .TitleSection p {
          margin: 0;
          color: #64748b;
          font-size: 1.05rem;
          font-weight: 500;
        }

        .TitleIcon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 70px;
          height: 70px;
          border-radius: 18px;
          background: linear-gradient(135deg, #003f88 0%, #00296b 100%);
          color: white;
          font-size: 28px;
          box-shadow: 0 8px 24px rgba(0, 63, 136, 0.25);
        }

        .SearchSection {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .Form {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 16px;
          align-items: center;
        }

        @media (max-width: 560px) {
          .Form {
            grid-template-columns: 1fr;
          }
        }

        .SearchBox {
          display: grid;
          grid-template-columns: 24px 1fr;
          align-items: center;
          gap: 12px;
          padding: 16px 20px;
          border-radius: 16px;
          background: #f8fafc;
          border: 1.5px solid #cbd5e1;
          box-shadow: 0 4px 12px rgba(0, 41, 107, 0.01);
          color: #003f88;
          transition: all 0.3s ease;
        }

        .SearchBox:focus-within {
          border-color: #003f88;
          box-shadow: 0 0 0 4px rgba(0, 63, 136, 0.15), 0 4px 12px rgba(0, 41, 107, 0.05);
          transform: translateY(-2px);
        }

        .SearchBox input {
          background: transparent;
          border: none;
          outline: none;
          color: #1e293b;
          font-size: 1.05rem;
          font-weight: 500;
        }

        .SearchBox input::placeholder {
          color: #94a3b8;
          font-weight: 400;
        }

        .BtnRow {
          display: flex;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
        }

        .BaseBtn {
          border-radius: 14px;
          padding: 14px 22px;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          border: none;
          transition: all 0.3s ease;
          font-size: 0.95rem;
          font-family: inherit;
        }

        .PrimaryBtn {
          background: linear-gradient(135deg, #003f88 0%, #00296b 100%);
          color: white;
          box-shadow: 0 6px 16px rgba(0, 63, 136, 0.25);
        }

        .PrimaryBtn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0, 63, 136, 0.35);
        }

        .PrimaryBtn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none !important;
        }

        .GhostBtn {
          background: white;
          border: 1.5px solid #cbd5e1;
          color: #64748b;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
        }

        .GhostBtn:hover {
          background: #f8fafc;
          border-color: #003f88;
          color: #003f88;
          box-shadow: 0 4px 12px rgba(0, 63, 136, 0.08);
          transform: translateY(-1px);
        }

        .Spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255,255,255,0.6);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .ErrorCard {
          margin-bottom: 24px;
          display: grid;
          grid-template-columns: 20px 1fr;
          gap: 12px;
          align-items: center;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: #dc2626;
          padding: 16px 20px;
          border-radius: 14px;
          font-weight: 500;
          font-size: 0.95rem;
          box-shadow: 0 2px 8px rgba(239, 68, 68, 0.1);
        }

        .HintCard {
          margin-top: 24px;
          padding: 20px;
          border-radius: 16px;
          background: white;
          border: 2px dashed #cbd5e1;
          color: #64748b;
          font-size: 0.95rem;
          line-height: 1.5;
          display: flex;
          align-items: center;
          gap: 12px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
        }

        .ContentGrid {
          display: grid;
          grid-template-columns: 1fr 2fr;
          gap: 28px;
        }

        @media (max-width: 1100px) {
          .ContentGrid {
            grid-template-columns: 1fr;
          }
        }

        .InfoPanel {
          background: white;
          border-radius: 20px;
          padding: 28px;
          box-shadow: 0 10px 30px rgba(0, 41, 107, 0.03);
          border: 1px solid rgba(0, 63, 136, 0.08);
          display: flex;
          flex-direction: column;
          height: fit-content;
        }

        .TablePanel {
          background: white;
          border-radius: 20px;
          padding: 28px;
          box-shadow: 0 10px 30px rgba(0, 41, 107, 0.03);
          border: 1px solid rgba(0, 63, 136, 0.08);
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .ZipQualityPanel {
          background: white;
          border-radius: 20px;
          padding: 28px;
          box-shadow: 0 10px 30px rgba(0, 41, 107, 0.03);
          border: 1px solid rgba(0, 63, 136, 0.08);
          margin-top: 24px;
        }

        .PanelHeader {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 24px;
          padding-bottom: 20px;
          border-bottom: 2px solid #cbd5e1;
        }

        .PanelHeader h3 {
          margin: 0;
          font-size: 1.3rem;
          font-weight: 700;
          color: #003f88;
        }

        .InfoGrid {
          display: grid;
          gap: 16px;
          margin-bottom: 28px;
        }

        .InfoItem {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 16px;
          align-items: center;
          padding: 16px;
          background: #f8fafc;
          border-radius: 14px;
          border: 1px solid #cbd5e1;
          transition: all 0.2s ease;
        }

        .InfoItem:hover {
          background: #f1f5f9;
          transform: translateY(-1px);
          border-color: #d4af37;
        }

        .InfoIcon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 48px;
          height: 48px;
          border-radius: 12px;
          background: linear-gradient(135deg, #003f88 0%, #00296b 100%);
          color: white;
          font-size: 1.2rem;
        }

        .InfoLabel {
          font-size: 0.9rem;
          color: #64748b;
          font-weight: 500;
          margin-bottom: 4px;
        }

        .InfoValue {
          font-weight: 600;
          color: #1e293b;
          font-size: 1.05rem;
        }

        .SummaryCard {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          margin-bottom: 28px;
          padding: 20px;
          background: #f8fafc;
          border-radius: 16px;
          border: 1px solid #cbd5e1;
        }

        .SummaryItem {
          text-align: center;
          padding: 12px;
        }

        .SummaryLabel {
          font-size: 0.85rem;
          color: #64748b;
          margin-bottom: 8px;
          font-weight: 500;
        }

        .SummaryValue {
          font-weight: 800;
          color: #003f88;
          font-size: 1.5rem;
        }

        .ActionsRow {
          display: flex;
          justify-content: flex-end;
          margin-top: auto;
          gap: 16px;
          flex-wrap: wrap;
        }

        .TableContainer {
          width: 100%;
          overflow: auto;
          border-radius: 12px;
          border: 1px solid #cbd5e1;
        }

        .Table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          font-size: 0.92rem;
        }

        .Table thead th {
          position: sticky;
          top: 0;
          background: linear-gradient(135deg, #003f88 0%, #00296b 100%);
          text-align: center;
          padding: 16px 18px;
          border-bottom: 2px solid #d4af37;
          font-weight: 700;
          color: #fff;
          white-space: nowrap;
          border-radius: 0;
          font-size: 0.95rem;
        }

        .Table tbody td, .Table tfoot td {
          padding: 14px 16px;
          border-bottom: 1px solid #cbd5e1;
          color: #1e293b;
        }

        .Table tbody tr {
          transition: background 0.2s ease;
        }

        .Table tbody tr:hover {
          background: #f8fafc;
        }

        .Table td.num {
          text-align: center;
          font-variant-numeric: tabular-nums;
          font-weight: 500;
        }

        .Table td.strong, .Table th.strong {
          font-weight: 700;
        }

        .Table tfoot td {
          background: #f8fafc;
          font-weight: 800;
          color: #003f88;
          font-size: 0.95rem;
          border-top: 2px solid #d4af37;
        }

        .ZipSelect {
          padding: 8px 12px;
          border: 1.5px solid #cbd5e1;
          border-radius: 8px;
          background: white;
          color: #1e293b;
          font-size: 0.9rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          min-width: 120px;
        }

        .ZipSelect:focus {
          outline: none;
          border-color: #003f88;
          box-shadow: 0 0 0 3px rgba(0, 63, 136, 0.15);
        }

        .ZipSelect:hover {
          border-color: #cbd5e1;
        }

        .blocked-row {
          background-color: #fef2f2 !important;
          opacity: 0.7;
        }

        .blocked-row:hover {
          background-color: #fef2f2 !important;
        }

        .ZipQualityForm {
          display: grid;
          gap: 20px;
          margin-bottom: 24px;
        }

        .PlacementSection {
          padding: 20px;
          background: #f8fafc;
          border-radius: 12px;
          border: 1px solid #cbd5e1;
        }

        .PlacementSection h4 {
          margin: 0 0 16px 0;
          color: #003f88;
          font-size: 1rem;
          font-weight: 700;
        }

        .CheckboxGrid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
          margin-bottom: 20px;
        }

        .CheckboxItem {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: white;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .CheckboxItem:hover {
          border-color: #003f88;
          background: #f8fafc;
        }

        .CheckboxItem.selected {
          border-color: #003f88;
          background: rgba(0, 63, 136, 0.05);
        }

        .CheckboxIcon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
          border: 2px solid #cbd5e1;
          border-radius: 4px;
          transition: all 0.2s ease;
        }

        .CheckboxItem.selected .CheckboxIcon {
          background: #003f88;
          border-color: #003f88;
          color: white;
        }

        .CheckboxLabel {
          font-weight: 500;
          color: #1e293b;
        }

        .CostBreakdown {
          margin-top: 20px;
          padding: 20px;
          background: #f8fafc;
          border-radius: 12px;
          border: 1px solid #cbd5e1;
        }

        .CostBreakdown h4 {
          margin: 0 0 16px 0;
          color: #003f88;
          font-size: 1.1rem;
          font-weight: 700;
        }

        .CostItem {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #cbd5e1;
        }

        .CostItem:last-child {
          border-bottom: none;
        }

        .CostLabel {
          color: #475569;
          font-weight: 500;
        }

        .CostValue {
          color: #1e293b;
          font-weight: 600;
        }

        .TotalCost {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 2px solid #d4af37;
          display: flex;
          justify-content: space-between;
          font-size: 1.2rem;
          font-weight: 700;
          color: #003f88;
        }

        .PlacementItem {
          background: white;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 12px;
        }

        .PlacementHeader {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
          font-weight: 700;
          color: #003f88;
        }

        .PlacementContent {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          align-items: end;
        }

        .QuantityInput {
          padding: 8px 12px;
          border: 1.5px solid #cbd5e1;
          border-radius: 6px;
          font-size: 0.9rem;
          width: 100%;
        }

        .QuantityInput:focus {
          outline: none;
          border-color: #003f88;
          box-shadow: 0 0 0 3px rgba(0, 63, 136, 0.15);
        }

        .ZipTypeSelect {
          padding: 8px 12px;
          border: 1.5px solid #cbd5e1;
          border-radius: 6px;
          font-size: 0.9rem;
          width: 100%;
          background: white;
        }

        .FormField {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .FormField label {
          font-size: 0.8rem;
          color: #64748b;
          font-weight: 600;
        }

        .Dialog {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: white;
          border: 1px solid rgba(0, 63, 136, 0.08);
          box-shadow: 0 24px 48px rgba(0, 41, 107, 0.15);
          border-radius: 20px;
          padding: 32px;
          z-index: 1001;
          max-width: 600px;
          width: 90%;
        }

        .DialogHeader {
          display: grid;
          grid-template-columns: 1fr auto;
          align-items: center;
          gap: 20px;
          margin-bottom: 28px;
        }

        .DialogHeader h3 {
          margin: 0;
          font-size: 1.6rem;
          font-weight: 700;
          color: #003f88;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .IconBtn {
          display: inline-grid;
          place-items: center;
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: transparent;
          border: 1.5px solid #cbd5e1;
          color: #64748b;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .IconBtn:hover {
          background: #f8fafc;
          color: #003f88;
          border-color: #003f88;
          transform: scale(1.05);
        }

        .Field {
          display: grid;
          gap: 12px;
          margin: 24px 0 20px;
        }

        .Field input, .Field select {
          width: 100%;
          padding: 16px 20px;
          border-radius: 14px;
          border: 1.5px solid #cbd5e1;
          background: white;
          color: #1e293b;
          outline: none;
          transition: all 0.2s ease;
          font-size: 1.1rem;
          font-weight: 500;
        }

        .Field input:focus, .Field select:focus {
          border-color: #003f88;
          box-shadow: 0 0 0 4px rgba(0, 63, 136, 0.15);
        }

        .FieldLabel {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          font-size: 1.1rem;
          color: #003f88;
          font-weight: 600;
        }

        .InlineError {
          margin-top: 20px;
          display: grid;
          grid-template-columns: 24px 1fr;
          gap: 12px;
          align-items: center;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: #dc2626;
          padding: 16px 20px;
          border-radius: 14px;
          font-size: 1rem;
          font-weight: 500;
        }

        .DialogActions {
          margin-top: 32px;
          display: flex;
          justify-content: flex-end;
          gap: 20px;
        }

        .Backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.5);
          backdrop-filter: blur(8px);
          z-index: 1000;
        }
        `}
      </style>

      <div className="HeaderPaper">
        <div className="TitleSection">
          <div className="TitleIcon"><FiScissors /></div>
          <div>
            <h1>ZIP PURCHASE ORDER</h1>
            <p>Search a Lot No. to view its Cutting Matrix and totals</p>
          </div>
        </div>

        <div className="SearchSection">
          <form className="Form" onSubmit={handleSearch}>
            <label className="SearchBox">
              <FiSearch />
              <input
                value={lotInput}
                onChange={(e) => setLotInput(e.target.value)}
                placeholder="Enter Lot No (e.g., 64003)"
                autoFocus
              />
            </label>

            <div className="BtnRow">
              <motion.button
                className="BaseBtn GhostBtn"
                type="button"
                onClick={handleBack}
                whileTap={{ scale: 0.98 }}
                title="Go back"
              >
                <FiArrowLeft /> Back
              </motion.button>

              <motion.button className="BaseBtn PrimaryBtn" type="submit" disabled={!norm(lotInput) || loading} whileTap={{ scale: 0.98 }}>
                {loading ? <div className="Spinner"></div> : <><FiSearch /> Search</>}
              </motion.button>

              <motion.button className="BaseBtn GhostBtn" type="button" onClick={handleClear} whileTap={{ scale: 0.98 }}>
                <FiRefreshCw /> Reset
              </motion.button>
            </div>
          </form>
        </div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            className="ErrorCard"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
          >
            <FiAlertTriangle />
            <span>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {loadingZipQuality && !matrix && (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div className="Spinner" style={{ margin: '0 auto', width: '32px', height: '32px' }}></div>
          <p style={{ marginTop: '16px', color: '#64748b' }}>Loading application data...</p>
        </div>
      )}

      {matrix ? (
        <>
          <div className="ContentGrid">
            <div className="InfoPanel">
              <div className="PanelHeader">
                <FiInfo />
                <h3>Lot Information</h3>
                <span className={`ConfigStatus ${loadingGarmentConfig ? 'loading' : 'loaded'}`}>
                  {loadingGarmentConfig ? 'Loading config...' : 'Config loaded'}
                </span>
              </div>
              <div className="InfoGrid">
                <div className="InfoItem">
                  <div className="InfoIcon"><FiPackage /></div>
                  <div><div className="InfoLabel">Lot Number</div><div className="InfoValue">{matrix.lotNumber || '—'}</div></div>
                </div>
                <div className="InfoItem">
                  <div className="InfoIcon"><FiTag /></div>
                  <div><div className="InfoLabel">Style</div><div className="InfoValue">{matrix.style || '—'}</div></div>
                </div>
                <div className="InfoItem">
                  <div className="InfoIcon"><FiGrid /></div>
                  <div><div className="InfoLabel">Fabric</div><div className="InfoValue">{matrix.fabric || '—'}</div></div>
                </div>
                <div className="InfoItem">
                  <div className="InfoIcon"><FiTag /></div>
                  <div>
                    <div className="InfoLabel">Garment Type</div>
                    <div className="InfoValue">{matrix.garmentType || '—'}</div>
                  </div>
                </div>
                <div className="InfoItem">
                  <div className="InfoIcon"><FiTag /></div>
                  <div>
                    <div className="InfoLabel">Brand</div>
                    <div className="InfoValue">{matrix.brand || '—'}</div>
                  </div>
                </div>
              </div>
              <div className="SummaryCard">
                <div className="SummaryItem"><div className="SummaryLabel">Total Pieces</div><div className="SummaryValue">{matrix.totals.grand}</div></div>
                <div className="SummaryItem"><div className="SummaryLabel">Colors</div><div className="SummaryValue">{matrix.rows.length}</div></div>
                <div className="SummaryItem"><div className="SummaryLabel">Sizes</div><div className="SummaryValue">{matrix.sizes.length}</div></div>
              </div>

              <div className="ActionsRow" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <motion.button
                  className="BaseBtn PrimaryBtn"
                  type="button"
                  onClick={openIssueDialog}
                  whileTap={{ scale: 0.98 }}
                  whileHover={{ scale: 1.02 }}
                >
                  <FiDownload /> Generate PDF
                </motion.button>

                <motion.button
                  className="BaseBtn GhostBtn"
                  type="button"
                  onClick={handleDirectRedownload}
                  disabled={confirming}
                  whileTap={{ scale: 0.98 }}
                  whileHover={{ scale: 1.02 }}
                  title="Re-download PDF without re-submitting to sheet"
                  style={{ borderColor: '#003f88', color: '#003f88' }}
                >
                  <FiDownload /> Re-download PO
                </motion.button>
              </div>
            </div>

            <div className="TablePanel">
              <div className="PanelHeader"><FiGrid /><h3>Cutting Matrix</h3></div>
              <div className="TableContainer">
                <table className="Table">
                  <thead>
                    <tr>{columns.map((c, i) => <th key={`${c || 'blank'}-${i}`}>{c || '\u00A0'}</th>)}</tr>
                  </thead>
                  <tbody>
                    {matrix.rows.map((r, idx) => {
                      const pending = pendingInfo?.get(r.color);
                      return (
                        <tr key={idx} className={blockedShades.has(r.color) ? 'blocked-row' : ''}>
                          <td>
                            {r.color}
                            {blockedShades.has(r.color) && (
                              <span style={{ marginLeft: '8px', color: '#ef4444', fontSize: '0.8rem' }}>
                                <FiLock /> Fully Ordered
                              </span>
                            )}
                            {pending?.status === 'partial' && (
                              <span style={{ marginLeft: '8px', color: '#f59e0b', fontSize: '0.7rem' }}>
                                (Pending: {pending.remaining}pcs)
                              </span>
                            )}
                          </td>
                          <td className="num">{r.cuttingTable ?? ''}</td>
                          {matrix.sizes.map((s) => (
                            <td key={s} className="num">{r.sizes?.[s] ?? ''}</td>
                          ))}
                          <td className="num strong">{r.totalPcs ?? ''}</td>
                          <td>
                            {blockedShades.has(r.color) ? (
                              <div style={{ 
                                padding: '8px 12px', 
                                backgroundColor: '#fef2f2', 
                                border: '1px solid #fecaca',
                                borderRadius: '8px',
                                color: '#dc2626',
                                fontSize: '0.9rem',
                                textAlign: 'center'
                              }}>
                                <FiLock /> Ordered
                              </div>
                            ) : pending?.status === 'partial' ? (
                              <div>
                                <select 
                                  className="ZipSelect"
                                  value={zipSelections[r.color] || ''}
                                  onChange={(e) => handleZipChange(r.color, e.target.value)}
                                  style={{ marginBottom: '8px' }}
                                >
                                  <option value="">Select Color</option>
                                  <option value="Coloured">Coloured</option>
                                  <option value="Black">Black</option>
                                </select>
                                <div style={{ 
                                  fontSize: '0.7rem', 
                                  color: '#f59e0b',
                                  marginTop: '4px',
                                  padding: '4px 6px',
                                  backgroundColor: '#fef3c7',
                                  borderRadius: '4px'
                                }}>
                                  Ordered: {pending.ordered} pcs<br/>
                                  Remaining: {pending.remaining} pcs
                                </div>
                              </div>
                            ) : (
                              <select 
                                className="ZipSelect"
                                value={zipSelections[r.color] || ''}
                                onChange={(e) => handleZipChange(r.color, e.target.value)}
                              >
                                <option value="">Select Color</option>
                                <option value="Coloured">Coloured</option>
                                <option value="Black">Black</option>
                              </select>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="strong">Total</td>
                      <td className="num">—</td>
                      {matrix.sizes.map((s) => (
                        <td key={s} className="num strong">{matrix.totals.perSize?.[s] ?? 0}</td>
                      ))}
                      <td className="num strong">{matrix.totals.grand}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>

          <div className="ZipQualityPanel">
            <div className="PanelHeader">
              <FiPackage />
              <h3>Zip Quality Requirements</h3>
              {zipQualityData.length > 0 && (
                <span style={{ 
                  fontSize: '0.8rem', 
                  color: '#64748b', 
                  marginLeft: 'auto',
                  background: '#f1f5f9',
                  padding: '4px 8px',
                  borderRadius: '6px'
                }}>
                  {zipQualityData.length} zip types loaded
                </span>
              )}
            </div>
            
            {loadingZipQuality ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>
                <div className="Spinner" style={{ margin: '0 auto' }}></div>
                <p style={{ marginTop: '12px', color: '#64748b' }}>Loading zip quality data...</p>
              </div>
            ) : zipDataError ? (
              <div style={{ 
                textAlign: 'center', 
                padding: '40px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '12px',
                color: '#dc2626'
              }}>
                <FiAlertTriangle style={{ fontSize: '2rem', marginBottom: '12px' }} />
                <p>{zipDataError}</p>
              </div>
            ) : zipQualityData.length === 0 ? (
              <div style={{ 
                textAlign: 'center', 
                padding: '40px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '12px',
                color: '#dc2626'
              }}>
                <FiAlertTriangle style={{ fontSize: '2rem', marginBottom: '12px' }} />
                <p>No zip quality data found. Please check your Google Sheet.</p>
              </div>
            ) : (
              <div className="ZipQualityForm">
                {zipPlacementOptions.length > 0 && (
                  <div className="PlacementSection">
                    <h4>Select the items where the zips are placed in this article:</h4>
                    <div className="CheckboxGrid">
                      {zipPlacementOptions.map((placement) => (
                        <div
                          key={placement}
                          className={`CheckboxItem ${selectedPlacements.includes(placement) ? 'selected' : ''}`}
                          onClick={() => togglePlacement(placement)}
                        >
                          <div className="CheckboxIcon">
                            {selectedPlacements.includes(placement) && <FiCheckSquare />}
                            {!selectedPlacements.includes(placement) && <FiSquare />}
                          </div>
                          <span className="CheckboxLabel">{placement}</span>
                        </div>
                      ))}
                    </div>

                    {selectedPlacements.length > 0 && (
                      <div>
                        <h4 style={{ margin: '20px 0 16px 0', color: '#475569', fontSize: '1rem' }}>
                          Configure each placement:
                        </h4>
                        {selectedPlacements.map((placement) => (
                          <div key={placement} className="PlacementItem">
                            <div className="PlacementHeader">
                              <FiTag style={{ color: '#8b5cf6' }} />
                              <span style={{ fontWeight: '600', color: '#1e293b' }}>{placement}</span>
                            </div>
                            <div className="PlacementContent">
                              <div className="FormField">
                                <label>Quantity per piece</label>
                                <input
                                  type="number"
                                  min="1"
                                  className="QuantityInput"
                                  value={placementQuantities[placement] || 1}
                                  onChange={(e) => handleQuantityChange(placement, e.target.value)}
                                />
                              </div>
                              <div className="FormField">
                                <label>Zip Quality Type</label>
                                <select
                                  className="ZipTypeSelect"
                                  value={placementZipTypes[placement] || ''}
                                  onChange={(e) => handlePlacementZipTypeChange(placement, e.target.value)}
                                >
                                  <option value="">Select Zip Type</option>
                                  {availableZipTypes.map((type) => (
                                    <option key={type} value={type}>{type}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {selectedPlacements.length > 0 && (
                  <div className="CostBreakdown">
                    <h4>Cost Breakdown</h4>
                    
                    {selectedPlacements.map(placement => {
                      const quantity = placementQuantities[placement] || 1;
                      const zipType = placementZipTypes[placement];
                      
                      if (!zipType) {
                        return (
                          <div key={placement} style={{ marginBottom: '16px', padding: '12px', background: '#fef3c7', borderRadius: '8px' }}>
                            <p style={{ fontWeight: 'bold', color: '#92400e', margin: 0 }}>
                              {placement}: Please select a zip type
                            </p>
                          </div>
                        );
                      }

                      let placementSubtotal = 0;
                      const costItems = [];

                      matrix.rows.forEach((row) => {
                        const color = row.color;
                        
                        if (blockedShades.has(color)) return;
                        
                        const zipColor = zipSelections[color];
                        if (zipColor && zipColor.trim() !== '') {
                          const price = getZipPrice(zipType, zipColor);
                          let pieces = row.totalPcs || 0;
                          const pending = pendingInfo?.get(color);
                          if (pending?.status === 'partial' && pending.remaining > 0) {
                            pieces = pending.remaining;
                          }
                          
                          if (price > 0 && pieces > 0) {
                            const itemTotal = (price * pieces) * quantity;
                            placementSubtotal += itemTotal;
                            
                            costItems.push(
                              <div key={`${placement}-${color}`} className="CostItem">
                                <span className="CostLabel">{color} ({zipColor})</span>
                                <span className="CostValue">
                                  {pieces} pcs × {quantity} per piece × ₹{price} = ₹{itemTotal}
                                </span>
                              </div>
                            );
                          }
                        }
                      });

                      return (
                        <div key={placement} style={{ marginBottom: '24px' }}>
                          <div style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            marginBottom: '12px',
                            padding: '12px',
                            background: '#f8fafc',
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0'
                          }}>
                            <span style={{ fontWeight: 'bold', color: '#475569', fontSize: '1rem' }}>
                              {placement}
                            </span>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '0.9rem', color: '#64748b' }}>
                                {quantity} per piece • {zipType}
                              </div>
                              <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#059669' }}>
                                Subtotal: ₹{placementSubtotal}
                              </div>
                            </div>
                          </div>
                          
                          {costItems.length > 0 ? (
                            <div style={{ marginLeft: '16px' }}>
                              {costItems}
                            </div>
                          ) : (
                            <div style={{ 
                              textAlign: 'center', 
                              padding: '16px', 
                              color: '#64748b',
                              fontStyle: 'italic',
                              background: '#f8fafc',
                              borderRadius: '8px',
                              marginLeft: '16px'
                            }}>
                              No zip requirements specified for this placement
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {totalCost > 0 ? (
                      <div className="TotalCost">
                        <span>Grand Total Cost:</span>
                        <span>₹{totalCost}</span>
                      </div>
                    ) : (
                      <div style={{ 
                        textAlign: 'center', 
                        padding: '20px', 
                        color: '#64748b',
                        background: '#f8fafc',
                        borderRadius: '8px',
                        marginTop: '16px'
                      }}>
                        No zip costs calculated. Please ensure zip types and colors are selected.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        !loading && !error && !loadingZipQuality && (
          <div className="HintCard">
            <FiInfo />
            <span>
              💡 Application data loaded. Enter a Lot Number to search.
            </span>
          </div>
        )
      )}

      {showIssueDialog && (
        <>
          <div className="Backdrop" onClick={closeIssueDialog} />
          <div className="Dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="DialogHeader">
              <h3><FiPrinter /> Generate PDF</h3>
              <button className="IconBtn" onClick={closeIssueDialog} aria-label="Close"><FiX /></button>
            </div>

            <label className="Field">
              <div className="FieldLabel"><FiCalendar /> Date</div>
              <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </label>

            <label className="Field">
              <div className="FieldLabel"><FiUser /> Supervisor</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
                <input
                  list="supervisorList"
                  placeholder="Enter supervisor name"
                  value={supervisor}
                  onChange={(e) => setSupervisor(titleCase(e.target.value))}
                />
                {typedIsNewSupervisor && (
                  <button
                    type="button"
                    onClick={() => addSupervisorToOptions(supervisor)}
                    title="Add to suggestions"
                    style={{
                      whiteSpace: 'nowrap',
                      borderRadius: 10,
                      border: '2px solid #e2e8f0',
                      background: '#fff',
                      color: '#475569',
                      fontWeight: 600,
                      padding: '10px 12px',
                      cursor: 'pointer'
                    }}
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
            </label>

            <label className="Field">
              <div className="FieldLabel"><FiAlertTriangle /> Priority</div>
              <select 
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                <option value="Low">Low</option>
                <option value="Normal">Normal</option>
                <option value="High">High</option>
                <option value="Urgent">Urgent</option>
              </select>
            </label>

            {dialogError && (
              <div className="InlineError">
                <FiAlertTriangle />
                <span>{dialogError}</span>
              </div>
            )}

            <div className="DialogActions">
              <button className="BaseBtn GhostBtn" type="button" onClick={closeIssueDialog} disabled={confirming}>Cancel</button>
              <button className="BaseBtn PrimaryBtn" type="button" onClick={handleConfirmIssue} disabled={confirming} title="Generate PDF">
                {confirming ? <div className="Spinner"></div> : <><FiDownload /> Generate PDF</>}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}