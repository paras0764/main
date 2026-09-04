import { GOOGLE_API_KEY } from "../config/apiConfig";

/**
 * Silent Fallback, Cache-Expiry & Offline-Queue Sync Engine for RGP
 */

const API_KEY = GOOGLE_API_KEY;
const OFFLINE_QUEUE_KEY = "rgp_pending_sync_queue";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache refresh window

/**
 * Normalize RGP No for strict uniqueness comparison
 * e.g. "RGP 0001", "RGP-0001", "RGP0001" -> "RGP0001"
 */
export function normalizeRgpNo(val) {
  return String(val || "")
    .toUpperCase()
    .trim()
    // .replace(/[\s\/-]/g, "");
    .replace(/[\s/-]/g, "");
}

/**
 * Extract integer sequence specifically for RGP 0001 - RGP 10000 series
 */
export function extractRgpSeq(val) {
  if (!val) return null;
  const str = String(val).trim();
  const match = str.match(/^RGP[\s-]?0*([1-9]\d{0,3}|10000)$/i);
  if (match) {
    const num = parseInt(match[1], 10);
    return num >= 1 && num <= 10000 ? num : null;
  }
  return null;
}

/**
 * Format sequence integer as clean "RGP 0001"
 */
export function formatRgpNumber(seq) {
  const n = parseInt(seq, 10);
  if (!n || n < 1) return "RGP 0001";
  if (n >= 10000) return "RGP 10000";
  return `RGP ${String(n).padStart(4, "0")}`;
}

/**
 * 1. CACHE MANAGEMENT WITH TTL & OFFLINE PRESERVATION
 */
export function setCachedData(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({
      timestamp: Date.now(),
      data: data
    }));
  } catch (_) {}
}

export function getCachedData(key, maxAgeMs = CACHE_TTL_MS) {
  try {
    const cachedStr = localStorage.getItem(key);
    if (!cachedStr) return null;
    const parsed = JSON.parse(cachedStr);
    const isExpired = Date.now() - (parsed.timestamp || 0) > maxAgeMs;
    // When offline, NEVER discard cache even if expired
    const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
    if (isExpired && !isOffline) {
      return { data: parsed.data, isExpired: true };
    }
    return { data: parsed.data, isExpired: false };
  } catch (_) {
    return null;
  }
}

/**
 * 2. SILENT FETCH WITH RETRIES & LOCAL CACHE FALLBACK
 */
export async function fetchSheetsWithFallback({
  spreadsheetIds = [],
  range = "Fabric_RGP!A1:Z",
  apiKey = API_KEY,
  cacheKey = "rgp_cache_Fabric_RGP"
}) {
  const allRows = [];
  let fetchedAny = false;

  await Promise.all(
    spreadsheetIds.map(async (id) => {
      // Attempt live fetch with 2 retries
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const url = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}?key=${apiKey}`;
          const res = await fetch(url);
          if (res.ok) {
            const json = await res.json();
            const values = json.values || [];
            if (values.length > 0) {
              allRows.push({ values, fromCache: false });
              fetchedAny = true;
              break;
            }
          }
        } catch (_) {
          await new Promise(r => setTimeout(r, 250));
        }
      }
    })
  );

  // If live fetch succeeded, parse, deduplicate & update cache
  if (fetchedAny && allRows.length > 0) {
    const combined = parseAndDeduplicateRows(allRows);
    setCachedData(cacheKey, combined);
    return combined;
  }

  // If offline or fetch failed, load from local cache (NEVER return empty if cache exists)
  const cached = getCachedData(cacheKey);
  if (cached && Array.isArray(cached.data) && cached.data.length > 0) {
    console.log(`[Offline Cache] Loaded ${cached.data.length} records safely from local storage`);
    return cached.data;
  }

  return [];
}

/**
 * Convert 2D Google Sheets values to array of objects and strictly deduplicate by RGP No
 */
export function parseAndDeduplicateRows(sheetResults) {
  const combined = [];
  const seenRgp = new Set();

  sheetResults.forEach(({ values }) => {
    if (!values || values.length <= 1) return;
    const [header, ...rows] = values;
    const cleanHeader = header.map(h => String(h || "").trim());

    rows.forEach(r => {
      const obj = {};
      cleanHeader.forEach((h, i) => {
        obj[h] = r[i] !== undefined ? String(r[i]).trim() : "";
      });

      const rgpVal = obj["RGP No"] || obj["RGP NO"] || obj["rgpNo"] || "";
      const normKey = normalizeRgpNo(rgpVal);

      if (normKey) {
        if (!seenRgp.has(normKey)) {
          seenRgp.add(normKey);
          combined.push(obj);
        }
      } else {
        combined.push(obj);
      }
    });
  });

  return combined;
}

/**
 * 3. GET NEXT SEQUENTIAL RGP WITHOUT DUPLICATION RISK
 */
export function calculateNextSafeRgpNo(existingRecords = []) {
  let maxNum = 0;

  // 1. Check local storage persistent tracker
  try {
    const storedMax = localStorage.getItem("rgp_0001_series_max_seq");
    if (storedMax) {
      const parsed = parseInt(storedMax, 10);
      if (parsed > maxNum && parsed <= 10000) maxNum = parsed;
    }
  } catch (_) {}

  // 2. Check all sheet records & offline queue
  const queue = getOfflineQueue();
  const allItems = [...(Array.isArray(existingRecords) ? existingRecords : []), ...queue.map(q => q.payload?.rgpNo)];

  allItems.forEach(item => {
    const val = typeof item === "string" ? item : (item?.["RGP No"] || item?.["RGP NO"] || item?.rgpNo);
    const seq = extractRgpSeq(val);
    if (seq && seq > maxNum) maxNum = seq;
  });

  const nextSeq = Math.min(10000, maxNum + 1);

  // Update persistent sequence counter
  try {
    localStorage.setItem("rgp_0001_series_max_seq", String(maxNum));
    localStorage.setItem("rgp_0001_series_last_no", formatRgpNumber(maxNum));
  } catch (_) {}

  return formatRgpNumber(nextSeq);
}

/**
 * 4. PERSISTENT OFFLINE QUEUE (NEVER MISS DATA, AUTO-SYNC, NO DUPLICATES)
 */
export function getOfflineQueue() {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]");
  } catch (_) {
    return [];
  }
}

export function saveToOfflineQueue(payload) {
  try {
    const queue = getOfflineQueue();
    const normTarget = normalizeRgpNo(payload.rgpNo);

    // Guard: Do not add if already in queue
    const exists = queue.some(item => normalizeRgpNo(item.payload?.rgpNo) === normTarget);
    if (!exists) {
      queue.push({
        id: Date.now() + "_" + Math.random().toString(36).substring(2, 6),
        payload: payload,
        addedAt: new Date().toISOString(),
        retries: 0
      });
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
      console.log(`[Offline Queue] Saved RGP ${payload.rgpNo} locally for auto-sync`);
    }

    // Also inject into local cache so dashboards show it immediately
    try {
      const cached = getCachedData("rgp_cache_Fabric_RGP") || { data: [] };
      const list = Array.isArray(cached.data) ? [...cached.data] : [];
      const firstEntry = (payload.entries && payload.entries[0]) || {};
      const newRow = {
        "RGP No": payload.rgpNo,
        "Date": payload.date,
        "RGP Type": payload.rgpType || "Fabric",
        "Department": firstEntry.department || payload.department || "",
        "Vendor / Party": payload.vendor,
        "Purpose": firstEntry.purpose || payload.purpose || "",
        "Item Description": payload.itemDesc || firstEntry.itemDesc || "",
        "Quantity Sent": String(payload.qty || ""),
        "UOM": firstEntry.uom || payload.uom || "",
        "Expected Return Date": payload.expectedReturnDate || "",
        "Vehicle No": payload.vehicleNo || "",
        "Authorized By": payload.authorizedBy || "",
        "Returned Quantity": "",
        "Return Date": "",
        "Remarks": payload.remarks || "",
        "Status": "Active (Queued)",
        "Prepared By": payload.preparedBy || ""
      };
      const seen = new Set(list.map(r => normalizeRgpNo(r["RGP No"])));
      if (!seen.has(normTarget)) {
        list.unshift(newRow);
        setCachedData("rgp_cache_Fabric_RGP", list);
      }
    } catch (_) {}
  } catch (err) {
    console.warn("Failed to write to offline queue:", err);
  }
}

/**
 * 5. AUTO-SYNC QUEUE TO GOOGLE SHEETS DATABASE (RETRY UNTIL SAVED)
 */
let isSyncing = false;
export async function syncOfflineQueue(webAppUrl) {
  if (isSyncing) return;
  const queue = getOfflineQueue();
  if (!queue.length) return;

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return; // Don't attempt sync if browser is strictly offline
  }

  isSyncing = true;
  const remaining = [];

  for (const item of queue) {
    try {
      const res = await fetch(webAppUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "Accept": "application/json" },
        body: "data=" + encodeURIComponent(JSON.stringify(item.payload)),
      });

      if (res.ok) {
        const text = await res.text();
        let json;
        try { json = JSON.parse(text); } catch (_) {}
        if (json && (json.ok || json.status === "success")) {
          console.log(`[Auto-Sync] Successfully synced ${item.payload.rgpNo} to Google Sheets database!`);
          continue; // Item successfully saved to database!
        }
      }
      // If server returned non-200 or lock timeout, keep in queue to retry next cycle
      item.retries = (item.retries || 0) + 1;
      remaining.push(item);
    } catch (err) {
      item.retries = (item.retries || 0) + 1;
      remaining.push(item);
    }
  }

  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
  isSyncing = false;

  // Trigger custom event so dashboards refresh
  if (queue.length !== remaining.length && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("rgp_queue_synced", { detail: { remaining: remaining.length } }));
  }
}

/**
 * 6. INITIALIZE BACKGROUND SYNC WORKER
 */
export function initBackgroundSyncWorker(webAppUrl) {
  if (typeof window === "undefined") return;

  // Sync on online event
  window.addEventListener("online", () => {
    console.log("[Network] Connection restored. Syncing offline RGPs...");
    syncOfflineQueue(webAppUrl);
  });

  // Sync every 20 seconds periodically in background
  setInterval(() => {
    if (navigator.onLine && getOfflineQueue().length > 0) {
      syncOfflineQueue(webAppUrl);
    }
  }, 20000);

  // Run immediately on init
  syncOfflineQueue(webAppUrl);
}
