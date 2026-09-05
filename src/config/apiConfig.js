/**
 * API & Service Configuration
 * 
 * All values are loaded strictly from the .env file (or deployment environment variables).
 * NO credentials, keys, or IDs are stored in this file.
 */

// 1. Google Cloud API Key
export const GOOGLE_API_KEY = process.env.REACT_APP_GOOGLE_API_KEY || "";

// 2. Google Sheet Spreadsheet IDs
export const SHEET_IDS = {
  RGP_NEW: process.env.REACT_APP_SHEET_ID_RGP_NEW || "",
  RGP_OLD: process.env.REACT_APP_SHEET_ID_RGP_OLD || "",
  CUTTING: process.env.REACT_APP_SHEET_ID_CUTTING || "",
  DORI: process.env.REACT_APP_SHEET_ID_DORI || "",
  ZIP_RGP: process.env.REACT_APP_SHEET_ID_ZIP_RGP || "",
  PURCHASE_ORDER: process.env.REACT_APP_SHEET_ID_PURCHASE_ORDER || "",
};

// 3. Google Apps Script Web App Deployment URLs (/exec)
export const WEB_APP_URLS = {
  RGP: process.env.REACT_APP_WEB_APP_URL_RGP || "",
  DORI: process.env.REACT_APP_WEB_APP_URL_DORI || "",
  LEGACY_RGP: process.env.REACT_APP_WEB_APP_URL_LEGACY_RGP || "",
  PO_ASPER_SHADE: process.env.REACT_APP_WEB_APP_URL_PO_ASPER_SHADE || "",
  PO_DASHBOARD: process.env.REACT_APP_WEB_APP_URL_PO_DASHBOARD || "",
  PO_LOT: process.env.REACT_APP_WEB_APP_URL_PO_LOT || "",
  PO_TRACKING: process.env.REACT_APP_WEB_APP_URL_PO_TRACKING || "",
  ZIP: process.env.REACT_APP_WEB_APP_URL_ZIP || "",
  ZIP_APPROVAL: process.env.REACT_APP_WEB_APP_URL_ZIP_APPROVAL || "",
  PO_SUMMARY_GATE_RECEIVE: process.env.REACT_APP_WEB_APP_URL_PO_SUMMARY_GATE_RECEIVE || "",
};

// Convenience references
export const DEFAULT_RGP_SPREADSHEET_IDS = [
  SHEET_IDS.RGP_NEW,
  SHEET_IDS.RGP_OLD,
].filter(Boolean);

export const SHEET_ID_CUTTING = SHEET_IDS.CUTTING;
export const SHEET_ID_ZIP_RGP = SHEET_IDS.ZIP_RGP;
export const SHEET_ID_DORI = SHEET_IDS.DORI;
export const SHEET_ID_PURCHASE_ORDER = SHEET_IDS.PURCHASE_ORDER;
export const SHEET_ID_RGP_NEW = SHEET_IDS.RGP_NEW;
export const SHEET_ID_RGP_OLD = SHEET_IDS.RGP_OLD;

export const WEB_APP_URL_RGP = WEB_APP_URLS.RGP;
export const WEB_APP_URL_DORI = WEB_APP_URLS.DORI;
export const WEB_APP_URL_ZIP = WEB_APP_URLS.ZIP;
export const WEB_APP_URL_ZIP_APPROVAL = WEB_APP_URLS.ZIP_APPROVAL;
export const WEB_APP_URL_PO_DASHBOARD = WEB_APP_URLS.PO_DASHBOARD;
export const WEB_APP_URL_PO_LOT = WEB_APP_URLS.PO_LOT;
export const WEB_APP_URL_PO_TRACKING = WEB_APP_URLS.PO_TRACKING;
export const WEB_APP_URL_PO_ASPER_SHADE = WEB_APP_URLS.PO_ASPER_SHADE;
export const WEB_APP_URL_PO_SUMMARY_GATE_RECEIVE = WEB_APP_URLS.PO_SUMMARY_GATE_RECEIVE;

const API_CONFIG = {
  GOOGLE_API_KEY,
  SHEET_IDS,
  WEB_APP_URLS,
  DEFAULT_RGP_SPREADSHEET_IDS,
  SHEET_ID_CUTTING,
  SHEET_ID_ZIP_RGP,
  SHEET_ID_DORI,
  SHEET_ID_PURCHASE_ORDER,
  SHEET_ID_RGP_NEW,
  SHEET_ID_RGP_OLD,
  WEB_APP_URL_RGP,
  WEB_APP_URL_DORI,
  WEB_APP_URL_ZIP,
  WEB_APP_URL_ZIP_APPROVAL,
  WEB_APP_URL_PO_DASHBOARD,
  WEB_APP_URL_PO_LOT,
  WEB_APP_URL_PO_TRACKING,
  WEB_APP_URL_PO_ASPER_SHADE,
  WEB_APP_URL_PO_SUMMARY_GATE_RECEIVE,
};

export default API_CONFIG;
