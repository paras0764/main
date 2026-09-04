/**
 * Centralized API & Service Configuration
 * 
 * Values are dynamically loaded from environment variables (defined in .env or CI/CD),
 * with sensible defaults to ensure uninterrupted local development and testing.
 */

// 1. Google Cloud API Key
export const GOOGLE_API_KEY =
  process.env.REACT_APP_GOOGLE_API_KEY ||
  "AIzaSyAomDFBkOySlIxKWSKGHe6ATv9gvaBr7uk";

// 2. Google Sheet Spreadsheet IDs
export const SHEET_IDS = {
  RGP_NEW:
    process.env.REACT_APP_SHEET_ID_RGP_NEW ||
    "1P7ouFP2No8A-wW_PDH-KCT3OKj5LI_4H24oP6pyGjoA",
  RGP_OLD:
    process.env.REACT_APP_SHEET_ID_RGP_OLD ||
    "1BZ-ufmxeqa9XdU-jkuIgeNxHvhnYKjWj4UpnI3bHJKo",
  CUTTING:
    process.env.REACT_APP_SHEET_ID_CUTTING ||
    "1Hj3JeJEKB43aYYWv8gk2UhdU6BWuEQfCg5pBlTdBMNA",
  DORI:
    process.env.REACT_APP_SHEET_ID_DORI ||
    "1LjwZqU26F0xwL1tEyps8txsM1qS8LLUuE-sy_4CQK6k",
  ZIP_RGP:
    process.env.REACT_APP_SHEET_ID_ZIP_RGP ||
    "16mifNw0WMIlnZ1XRHsuH_8kVUm_6Y1O3uVsoM-Hjppo",
  PURCHASE_ORDER:
    process.env.REACT_APP_SHEET_ID_PURCHASE_ORDER ||
    "1hy43mDxXtGVq4jeMV_NxX25Q7tnX55NnplN7eqpT74k",
};

// 3. Google Apps Script Web App Deployment URLs (/exec)
export const WEB_APP_URLS = {
  RGP:
    process.env.REACT_APP_WEB_APP_URL_RGP ||
    "https://script.google.com/macros/s/AKfycbxuwdUJt_gZuR9ACJVM51X16ZVGipGgiaYxWjHH-M5vBz-PqijJLKghbQ4c9dKOMd7ifw/exec",
  DORI:
    process.env.REACT_APP_WEB_APP_URL_DORI ||
    "https://script.google.com/macros/s/AKfycbxBfA7maSXGPVW3I_HkRpL27l6nC_CgkHip4KYOEpMsdFHcsPTUuiYp0OuFz4_y3zZq/exec",
  LEGACY_RGP:
    process.env.REACT_APP_WEB_APP_URL_LEGACY_RGP ||
    "https://script.google.com/macros/s/AKfycbyPKPQQ_RToEVrfFxpzV5lmlwYvC4_psOof-my3evnTugHT34uuUi7g78NVHs2fmBM/exec",
  PO_ASPER_SHADE:
    process.env.REACT_APP_WEB_APP_URL_PO_ASPER_SHADE ||
    "https://script.google.com/macros/s/AKfycbyM5rwPfx5rpvhNCcIYT4JybUhHSb5fAClauku9W6YKnisJ-Z6Xg4H7bjKCmQiBiqVePA/exec",
  PO_DASHBOARD:
    process.env.REACT_APP_WEB_APP_URL_PO_DASHBOARD ||
    "https://script.google.com/macros/s/AKfycbydY5UUXgbyseONnQvnrWldDpmxzRH_m9crbMMhyTapZZ4flbV6AztESNjmusoH1xAluA/exec",
  PO_LOT:
    process.env.REACT_APP_WEB_APP_URL_PO_LOT ||
    "https://script.google.com/macros/s/AKfycbxLWl9NzLTc7PdY4hxeVwv9tVwdjC4du0YBMYloqIBZdvFzGkBm-R4nT5Ki5VNtUyJjfA/exec",
  PO_TRACKING:
    process.env.REACT_APP_WEB_APP_URL_PO_TRACKING ||
    "https://script.google.com/macros/s/AKfycbzRaIA00MLGmb9hNe7SRfVHbEpNOJBEfr_efWRGJ2jfOdHWgrT6boONM7aSkc_g1X18GA/exec",
  ZIP:
    process.env.REACT_APP_WEB_APP_URL_ZIP ||
    "https://script.google.com/macros/s/AKfycbwwEnHSdSvlLpKRYgMpxcyEukAqrqeTw-M4KQxtkI7dlIt0aRx2l3zQtJgUEYGw4O3-/exec",
  ZIP_APPROVAL:
    process.env.REACT_APP_WEB_APP_URL_ZIP_APPROVAL ||
    "https://script.google.com/macros/s/AKfycbz74M1rClIrxoXcforgEm7cbB6xqsixCsu3j3lr2GUchMCQTXJ50NWVQVFM0tqchn3n/exec",
  PO_SUMMARY_GATE_RECEIVE:
    process.env.REACT_APP_WEB_APP_URL_PO_SUMMARY_GATE_RECEIVE ||
    "https://script.google.com/macros/s/AKfycby3j5r8gP_F0qC0JgV-ZkP5e2xYy-h1w9q9q9q9/exec",
};

// Convenience references
export const DEFAULT_RGP_SPREADSHEET_IDS = [
  SHEET_IDS.RGP_NEW,
  SHEET_IDS.RGP_OLD,
];

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
