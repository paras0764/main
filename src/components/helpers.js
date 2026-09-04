// ---------- Helpers (module scope, hoisted) ----------
export function uniqCaseInsensitive(arr) {
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

export function titleCase(str) {
  return String(str ?? "")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

import {
  GOOGLE_API_KEY as CONFIG_API_KEY,
  SHEET_ID_CUTTING,
  SHEET_ID_ZIP_RGP
} from '../config/apiConfig';

// ============================
// Config (via centralized apiConfig / .env)
// ============================
export const GOOGLE_API_KEY = CONFIG_API_KEY;
export const SHEET_ID = SHEET_ID_CUTTING;
export const SHEET_IDD = SHEET_ID_ZIP_RGP;

// Safety guard
export const MAX_RANGE = 'A1:Z';

// Suggestions (free text allowed)
export const DEFAULT_SUPERVISORS = ['SONU', 'SANJAY', 'MONU', 'ROHIT','VINAY'];

// Helpers
export const norm = (v) => (v ?? '').toString().trim();
export const eq = (a, b) => norm(a).toLowerCase() === norm(b).toLowerCase();
export const includes = (hay, needle) => norm(hay).toLowerCase().includes(norm(needle).toLowerCase());

export function todayLocalISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

// ============================
// LOT helpers
// ============================
export function digitsOnly(s) {
  const m = String(s ?? '').match(/\d+/g);
  return m ? m.join('') : '';
}

export function classifyLot(lotInput) {
  const d = digitsOnly(lotInput);
  const searchKey = d;
  return { searchKey };
}

export const valOrEmpty = v => (v == null || v === 0 || v === '0' ? '' : v);

export function toNumOrNull(v) {
  const t = norm(v);
  if (t === '') return null;
  const n = parseFloat(t.replace(/[, ]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function printableDate(d) {
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
// ZIP Rate Calculation
// ============================
export function getZipRate(zipOptions, zipType, color) {
  if (!zipOptions || !zipType || !color) return 0;
  
  const normalizedZipType = norm(zipType).toLowerCase();
  const normalizedColor = norm(color).toLowerCase();
  
  const isBlack = includes(normalizedColor, 'black');
  const isSelf = includes(normalizedColor, 'self');
  
  console.log('Rate calculation:', { normalizedZipType, normalizedColor, isBlack, isSelf });
  
  // Strategy 1: Exact match for color and zip type
  let matchingZip = zipOptions.find(zip => 
    norm(zip.zipType).toLowerCase() === normalizedZipType && 
    norm(zip.color).toLowerCase() === normalizedColor
  );
  
  if (matchingZip) {
    console.log('Found exact match:', matchingZip);
    return matchingZip.price || 0;
  }
  
  // Strategy 2: Category-based matching
  if (isBlack) {
    // Look for any black color with same zip type
    matchingZip = zipOptions.find(zip => 
      norm(zip.zipType).toLowerCase() === normalizedZipType && 
      includes(norm(zip.color).toLowerCase(), 'black')
    );
    
    if (matchingZip) {
      console.log('Found black category match:', matchingZip);
      return matchingZip.price || 0;
    }
  }
  
  if (isSelf) {
    // Look for any self color with same zip type
    matchingZip = zipOptions.find(zip => 
      norm(zip.zipType).toLowerCase() === normalizedZipType && 
      includes(norm(zip.color).toLowerCase(), 'self')
    );
    
    if (matchingZip) {
      console.log('Found self category match:', matchingZip);
      return matchingZip.price || 0;
    }
  }
  
  // Strategy 3: Fallback to any zip of same type (first match)
  matchingZip = zipOptions.find(zip => 
    norm(zip.zipType).toLowerCase() === normalizedZipType
  );
  
  if (matchingZip) {
    console.log('Found fallback match:', matchingZip);
    return matchingZip.price || 0;
  }
  
  // Strategy 4: Ultimate fallback - average price of all zips
  if (zipOptions.length > 0) {
    const averagePrice = zipOptions.reduce((sum, zip) => sum + (zip.price || 0), 0) / zipOptions.length;
    console.log('Using average price:', averagePrice);
    return Math.round(averagePrice * 100) / 100; // Round to 2 decimal places
  }
  
  console.log('No match found, returning 0');
  return 0;
}

// Helper to get available zip types for a color
export function getAvailableZipTypes(zipOptions, color) {
  if (!zipOptions || !color) return [];
  
  const normalizedColor = norm(color).toLowerCase();
  const isBlack = includes(normalizedColor, 'black');
  const isSelf = includes(normalizedColor, 'self');
  
  const availableTypes = new Set();
  
  zipOptions.forEach(zip => {
    const zipColor = norm(zip.color).toLowerCase();
    
    if (isBlack && includes(zipColor, 'black')) {
      availableTypes.add(zip.zipType);
    } else if (isSelf && includes(zipColor, 'self')) {
      availableTypes.add(zip.zipType);
    } else if (!isBlack && !isSelf && !includes(zipColor, 'black') && !includes(zipColor, 'self')) {
      availableTypes.add(zip.zipType);
    }
  });
  
  return Array.from(availableTypes);
}

// Helper to validate if a zip type is available for a color
export function isZipTypeAvailable(zipOptions, zipType, color) {
  const availableTypes = getAvailableZipTypes(zipOptions, color);
  return availableTypes.includes(zipType);
}

// Helper to get all unique zip types from options
// export function getAllZipTypes(zipOptions) {
//   if (!zipOptions) return [];
//   const types = [...new Set(zipOptions.map(zip => zip.zipType))];
//   return types.filter(type => type && norm(type).length > 0);
// }

// Helper to format currency
export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

// Helper to calculate total for a zip item
export function calculateZipTotal(zip) {
  if (!zip) return 0;
  const quantity = zip.quantity || 1;
  const pieces = zip.pieces || 1;
  const price = zip.price || 0;
  return price * quantity * pieces;
}

// Helper to calculate grand total from selected zips
export function calculateGrandTotal(selectedZips) {
  if (!selectedZips || !Array.isArray(selectedZips)) return 0;
  return selectedZips.reduce((total, zip) => total + calculateZipTotal(zip), 0);
}

// Helper to group zips by type
export function groupZipsByType(selectedZips) {
  if (!selectedZips) return {};
  
  return selectedZips.reduce((groups, zip) => {
    const type = zip.zipType || 'Unknown';
    if (!groups[type]) {
      groups[type] = [];
    }
    groups[type].push(zip);
    return groups;
  }, {});
}

// Helper to filter black shades from matrix
export function getBlackShades(matrix) {
  if (!matrix || !matrix.rows) return [];
  
  return matrix.rows
    .map(row => norm(row.color))
    .filter(color => includes(color, 'black'))
    .filter((color, index, self) => self.indexOf(color) === index);
}

// Helper to filter non-black shades from matrix
// export function getNonBlackShades(matrix) {
//   if (!matrix || !matrix.rows) return [];
  
//   return matrix.rows
//     .map(row => norm(row.color))
//     .filter(color => !includes(color, 'black'))
//     .filter((color, index, self) => self.indexOf(color) === index);
// }

// Helper to get total pieces for a color
export function getTotalPiecesForColor(matrix, color) {
  if (!matrix || !matrix.rows || !color) return 0;
  
  return matrix.rows
    .filter(row => norm(row.color) === norm(color))
    .reduce((sum, row) => sum + (row.totalPcs || 0), 0);
}
// Add this function to your existing helpers.js

// Helper to get non-black shades from matrix
export function getNonBlackShades(matrix) {
  if (!matrix || !matrix.rows) return [];
  
  return matrix.rows
    .map(row => norm(row.color))
    .filter(color => !includes(color, 'black'))
    .filter((color, index, self) => self.indexOf(color) === index);
}
// Add these functions to your existing helpers.js

// Helper to get all colors from matrix
export function getAllColors(matrix) {
  if (!matrix || !matrix.rows) return [];
  return matrix.rows
    .map(row => norm(row.color))
    .filter((color, index, self) => self.indexOf(color) === index);
}

// Helper to get all zip types
export function getAllZipTypes(zipOptions) {
  if (!zipOptions) return [];
  const types = [...new Set(zipOptions.map(zip => zip.zipType))];
  return types.filter(type => type && norm(type).length > 0);
}