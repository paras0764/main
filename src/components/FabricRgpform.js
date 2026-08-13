import { useState, useEffect } from "react";
import { jsPDF } from "jspdf";

// MUST be your deployed /exec URL
export const WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbwAB7EHZu-ztnJhzmY-pY5BMW6EySqsUd8T0Cs18ocMAo9eTWoP6faBqZOCJJ6bIvkqlg/exec";

// Enhanced QR code generation with multiple fallbacks
export const generateQRCode = async (url) => {
  const services = [
    `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}`,
    `https://quickchart.io/qr?text=${encodeURIComponent(url)}&size=300&margin=4`,
    `https://chart.googleapis.com/chart?chs=300x300&cht=qr&chl=${encodeURIComponent(url)}&chld=L|1`
  ];

  for (let serviceUrl of services) {
    try {
      console.log(`Trying QR service: ${serviceUrl}`);
      const response = await fetch(serviceUrl);
      if (response.ok) {
        const blob = await response.blob();
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
      }
    } catch (e) {
      console.warn(`QR service failed: ${serviceUrl}`, e);
      continue;
    }
  }
  
  throw new Error('All QR code services are currently unavailable');
};

// Convert image URL to data URL with better error handling
export const toDataURL = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch (error) {
        reject(new Error("Canvas conversion failed: " + error.message));
      }
    };
    img.onerror = () => reject(new Error("Failed to load QR image"));
    img.src = src;
  });

function Emoji({ children, size = 18, mr = 0, ml = 0 }) {
  return (
    <span style={{ fontSize: size, lineHeight: 1, marginRight: mr, marginLeft: ml }}>
      {children}
    </span>
  );
}

const DEPT_OPTIONS = [
  "Cutting", "Stitching", "Finishing", "Quality", "Packing", "Store",
  "Knitting", "Weaving", "Dyeing", "Washing", "Bleaching", "Printing",
  "Embroidery", "Handwork", "Applique", "Fabric Store", "Accessories Store",
  "Sampling", "Pattern Making", "CAD", "Merchandising", "Production",
  "Maintenance", "Cutting Room", "Trimming", "Dispatch", "HR", "Accounts",
  "Admin", "Security", "jacket", "Other"
];

const UOM_OPTIONS = [
  "M", "CM", "MM", "KM", "IN", "FT", "YD", "MI", "ROLL", "BALE", "BUNDLE",
  "THAN", "PKT", "BOLT", "PIECE", "CUT", "KG", "GM", "MG", "TON", "LBS", "OZ",
  "PCS", "UNIT", "PAIR", "SET", "DOZEN", "GROSS", "REAM", "COUNT", "EA", "NO",
  "SQM", "SQCM", "SQFT", "SQIN", "SQYD", "ACRE", "HECTARE", "L", "ML", "CC",
  "M3", "GAL", "CBM", "HR", "MIN", "DAY", "WK", "MONTH", "YR", "CONE", "CARD",
  "SHEET", "SHT", "STRIP", "POLY", "BOX", "CARTON", "PACK", "TUBE", "SPOOL",
  "REEL", "BOBBIN", "HANK", "MTR", "COIL", "LOT", "KIT", "ASSY", "BAG", "SACK",
  "DRUM", "CAN", "JAR", "BOTTLE", "TIN", "CASE", "CRATE", "PALLET", "GARMENT",
  "SHIRT", "PANT", "DRESS", "JACKET", "SUIT", "LTR", "KG/L", "CANISTER", "OTHER"
];

const RGP_TYPES = ["Fabric", "Tools", "Machine", "Sample", "Other"];

// Prepared By & Authorized By Options
const PREPARED_BY_OPTIONS = [
  "RASHMI",
  
];

const AUTHORIZED_BY_OPTIONS = [
  "MOHIT SIR",
  "EA",
  "VARUN SIR",
  "SAHIL CA",
  
];

// Enhanced RGP PDF Generator - With Prepared By & Authorized By
export function generateRgpPDF({ payload, options = {} }) {
  const { qrEntryImage = null, qrReturnImage = null, qrSide = 96 } = options;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.setFont("helvetica", "normal");
  doc.setLineWidth(0.6);

  const page = { w: doc.internal.pageSize.getWidth(), h: doc.internal.pageSize.getHeight(), m: 40, gap: 12 };
  const setSize = (s) => doc.setFontSize(s);
  const bold = () => doc.setFont(undefined, "bold");
  const normal = () => doc.setFont(undefined, "normal");
  const text = (t, x, y, opt = {}) => doc.text(String(t ?? ""), x, y, opt);
  const rtext = (t, x, y, opt = {}) => text(t, x, y, { align: "right", ...opt });
  const line = (x1, y1, x2, y2) => doc.line(x1, y1, x2, y2);
  const wrap = (str, w) => doc.splitTextToSize(String(str || ""), w);
  const roundRect = (x, y, w, h, r = 7, style = "S") =>
    doc.roundedRect ? doc.roundedRect(x, y, w, h, r, r, style) : doc.rect(x, y, w, h, style);

  const drawFrame = () => roundRect(16, 16, page.w - 32, page.h - 32, 8, "S");
  let y = page.m;

  const SIG_H = 92;
  const QR_TITLE_H = 18;
  const QR_SIDE = qrSide || 96;
  const BOTTOM_QR_H = QR_TITLE_H + 8 + QR_SIDE + 10;
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
        text("RETURNABLE GATE PASS", page.m, y);
        normal();
        line(page.m, y + 6, page.w - page.m, y + 6);
        y += 18;
      }
      return true;
    }
    return false;
  };

  drawFrame();
  setSize(20);
  bold();
  text("RETURNABLE GATE PASS", page.w / 2, y, { align: "center" });
  normal();
  line(page.m, y + 6, page.w - page.m, y + 6);
  y += 26;

  // TOP ROW
  (function topRow() {
    const innerW = page.w - 2 * page.m;
    const rRGP = 0.40, rParty = 0.25, rGate = 0.35;
    const wAvail = innerW - page.gap * 2;
    const wRGP = Math.floor(wAvail * rRGP);
    const wParty = Math.floor(wAvail * rParty);
    const wGate = wAvail - wRGP - wParty;

    const x1 = page.m;
    const x2 = x1 + wRGP + page.gap;
    const x3 = x2 + wParty + page.gap;

    const metaPad = 12, lblW = 84;
    const mRows = [
      ["RGP #", (payload.rgpNo || "").replace(/\s+/g, "")],
      ["Date", payload.date || ""],
      ["Type", payload.rgpType || ""],
      ...(payload.expectedReturnDate ? [["Expected Return", payload.expectedReturnDate]] : []),
      ...(payload.vehicleNo ? [["Vehicle No", payload.vehicleNo]] : []),
    ];
    const metaH = 22 + mRows.length * 16 + 16;

    const partyPad = 12;
    const partyBodyW = wParty - partyPad * 2;
    const partyLines = [
      payload.vendor || "",
      ...wrap(payload.partyAddress || "", partyBodyW),
      ...(payload.partyPhone ? [`Phone: ${payload.partyPhone}`] : []),
      ...(payload.partyContact ? [`Contact: ${payload.partyContact}`] : []),
    ];
    const partyH = 22 + partyLines.filter(Boolean).length * 12 + 16;

    const gateH = QR_TITLE_H + 8 + QR_SIDE + 10;
    const blockH = Math.max(metaH, partyH, gateH);
    needSpace(blockH);

    roundRect(x1, y, wRGP, blockH, 7, "S");
    setSize(10);
    bold(); text("RGP DETAILS", x1 + 12, y + 14); normal();
    line(x1 + 12, y + 18, x1 + wRGP - 12, y + 18);
    let my = y + 30;
    mRows.forEach(([label, value]) => {
      bold(); text(`${label}:`, x1 + metaPad, my);
      normal(); text(value || "", x1 + metaPad + lblW, my, { maxWidth: wRGP - metaPad * 2 - lblW });
      my += 16;
    });

    roundRect(x2, y, wParty, blockH, 7, "S");
    setSize(10);
    bold(); text("PARTY / VENDOR", x2 + 12, y + 14); normal();
    line(x2 + 12, y + 18, x2 + wParty - 12, y + 18);
    let py = y + 30;
    partyLines.forEach((ln) => { if (ln) { text(ln, x2 + partyPad, py); py += 12; } });

    roundRect(x3, y, wGate, blockH, 7, "S");
    setSize(10);
    bold(); text("GATE ENTRY — SCAN", x3 + 12, y + 14); normal();
    line(x3 + 12, y + 18, x3 + wGate - 12, y + 18);
    if (qrEntryImage) {
      const qx = x3 + 12 + (wGate - 24 - QR_SIDE) / 2;
      const qy = y + 18 + 10;
      try { doc.addImage(qrEntryImage, "PNG", qx, qy, QR_SIDE, QR_SIDE); } catch {}
    }

    y += blockH + 16;
  })();

  // ITEMS TABLE
  (function drawTable() {
    const x0 = page.m, innerW = page.w - 2 * page.m;
    setSize(10); normal();

    const rows = (payload.entries || []).map((r, i) => {
      const qty1 = (+r.qty1 || 0).toLocaleString();
      const qty2 = (+r.qty2 || 0).toLocaleString();
      const totalQty = (+r.qty1 || 0);
      return { 
        ...r, 
        _i: i + 1,
        _qty1Str: qty1,
        _qty2Str: qty2,
        _totalQty: totalQty,
        _totalQtyStr: totalQty.toLocaleString()
      };
    });

    const measureMax = (arr, key) => arr.reduce((m, r) => Math.max(m, doc.getTextWidth(String(r[key] || ""))), 0);
    
    const MIN = { 
      line: 28, lotNo: 50, department: 80, description: 120, 
      purpose: 70, uom: 45, qty1: 40, qty2: 40, totalQty: 45
    };

    const qty1W = Math.max(MIN.qty1, measureMax(rows, "_qty1Str") + 14);
    const qty2W = Math.max(MIN.qty2, measureMax(rows, "_qty2Str") + 14);
    const totalQtyW = Math.max(MIN.totalQty, measureMax(rows, "_totalQtyStr") + 16);
    const lotNoW = Math.max(MIN.lotNo, measureMax(rows, "lotNo") + 10);

    const lineW = MIN.line, depW = MIN.department, purposeW = MIN.purpose, uomW = MIN.uom;
    const used = lineW + lotNoW + depW + purposeW + uomW + qty1W + qty2W + totalQtyW;
    const descW = Math.max(MIN.description, innerW - used);
    const diff = innerW - (used + descW);
    const adjTotalQtyW = totalQtyW + diff;

    const cols = [
      { key: "line", title: "#", w: lineW, align: "right" },
      { key: "lotNo", title: "LOT NO.", w: lotNoW },
      { key: "department", title: "DEPARTMENT", w: depW },
      { key: "description", title: "DESCRIPTION", w: descW },
      { key: "purpose", title: "PURPOSE", w: purposeW },
      { key: "uom", title: "UOM", w: uomW, align: "center" },
      { key: "qty1", title: "QTY 1", w: qty1W, align: "right" },
      { key: "qty2", title: "BAGS", w: qty2W, align: "right" },
      { key: "totalQty", title: "T.QTY", w: adjTotalQtyW, align: "right" },
    ];
    const xs = [x0]; cols.forEach((c, i) => xs.push(xs[i] + c.w));

    const headerH = 26, baseH = 20;

    const drawHeader = () => {
      needSpace(headerH, true);
      doc.rect(x0, y, innerW, headerH);
      setSize(10); bold();
      cols.forEach((c, i) => {
        const cx = c.align === "right" ? xs[i + 1] - 6 : c.align === "center" ? (xs[i] + xs[i + 1]) / 2 : xs[i] + 6;
        const opt = c.align === "right" ? { align: "right" } : c.align === "center" ? { align: "center" } : {};
        text(c.title, cx, y + 17, opt);
        if (i > 0) line(xs[i], y, xs[i], y + headerH);
      });
      normal(); y += headerH;
    };

    const drawRow = (r, idx) => {
      const descLines = doc.splitTextToSize(r.itemDesc || r.description || "", cols[3].w - 8);
      const purposeLines = doc.splitTextToSize(r.purpose || "", cols[4].w - 8);
      const rowH = Math.max(baseH, Math.max(descLines.length, purposeLines.length) * 12 + 8);
      needSpace(rowH, true);
      doc.rect(x0, y, innerW, rowH);
      for (let i = 1; i < xs.length - 1; i++) line(xs[i], y, xs[i], y + rowH);
      const yy = y + 12;
      
      rtext(r._i, xs[1] - 6, yy);
      text(r.lotNo || "", xs[1] + 6, yy);
      text(r.department || "", xs[2] + 6, yy);
      descLines.forEach((ln, j) => text(ln, xs[3] + 6, yy + j * 12));
      purposeLines.forEach((ln, j) => text(ln, xs[4] + 6, yy + j * 12));
      text(r.uom || "", (xs[5] + xs[6]) / 2, yy, { align: "center" });
      rtext(r._qty1Str, xs[7] - 6, yy);
      rtext(r._qty2Str, xs[8] - 6, yy);
      rtext(r._totalQtyStr, xs[9] - 6, yy);
      y += rowH;
      return r._totalQty;
    };

    drawHeader();
    let totalQuantity = 0; 
    rows.forEach((r, i) => { totalQuantity += drawRow(r, i); });
    
    const totalH = 26;
    needSpace(totalH, true);
    doc.rect(x0, y, innerW, totalH);
    line(xs[xs.length - 2], y, xs[xs.length - 2], y + totalH);
    setSize(11); bold();
    text("TOTAL QUANTITY", x0 + 8, y + 17);
    rtext(totalQuantity.toLocaleString(), xs[9] - 8, y + 17);
    normal(); y += totalH;
  })();

  // BOTTOM BLOCKS with Prepared By & Authorized By
  (function bottomBlocks() {
    const innerW = page.w - 2 * page.m;
    const colW = (innerW - page.gap * 2) / 3;
    const x1 = page.m, x2 = x1 + colW + page.gap, x3 = x2 + colW + page.gap;

    const sigTop = page.h - page.m - SIG_H;
    const blockTop = sigTop - 12 - BOTTOM_QR_H;

    // Left box: MATERIAL RETURN SCAN
    roundRect(x1, blockTop, colW, BOTTOM_QR_H, 7, "S");
    setSize(10);
    bold(); text("MATERIAL RETURN", x1 + 10, blockTop + 14); normal();
    line(x1 + 10, blockTop + 18, x1 + colW - 10, blockTop + 18);
    if (qrReturnImage) {
      const qx = x1 + 10 + (colW - 20 - QR_SIDE) / 2;
      const qy = blockTop + 18 + 10;
      try { doc.addImage(qrReturnImage, "PNG", qx, qy, QR_SIDE, QR_SIDE); } catch {}
    }

    // Wide right box: REMARKS
    const bigW = colW * 2 + page.gap;
    roundRect(x2, blockTop, bigW, BOTTOM_QR_H, 7, "S");
    setSize(10);
    bold(); text("REMARKS", x2 + 10, blockTop + 14); normal();
    line(x2 + 10, blockTop + 18, x2 + bigW - 10, blockTop + 18);
    if (payload.remarks) {
      const remarkLines = wrap(payload.remarks, bigW - 20);
      let ry = blockTop + 30;
      remarkLines.forEach((line) => {
        text(line, x2 + 10, ry);
        ry += 12;
      });
    }

    // Signatures with Prepared By & Authorized By
    [x1, x2, x3].forEach((x) => roundRect(x, sigTop, colW, SIG_H, 7, "S"));
    bold();
    text("PREPARED BY", x1 + 10, sigTop + 16);
    text("AUTHORIZED BY", x2 + 10, sigTop + 16);
    text("SECURITY", x3 + 10, sigTop + 16);
    normal();

    const writeSig = (x, showPrepared = false, showAuthorized = false) => {
      const baseY = sigTop + SIG_H - 26;
      text("Signature", x + 10, baseY - 10);
      line(x + 10, baseY - 8, x + colW - 10, baseY - 8);
      text("Name:", x + 10, baseY + 2);
      if (showPrepared && payload.preparedBy) text(payload.preparedBy, x + 46, baseY + 2);
      if (showAuthorized && payload.authorizedBy) text(payload.authorizedBy, x + 46, baseY + 2);
      text("Date:", x + 10, baseY + 14);
    };
    writeSig(x1, true, false); // Prepared By
    writeSig(x2, false, true); // Authorized By
    writeSig(x3, false, false); // Security
  })();

  return doc;
}

// Preview Modal Component
function PreviewModal({ payload, onClose, onConfirm, loading }) {
  const [previewPdfUrl, setPreviewPdfUrl] = useState(null);

  useEffect(() => {
    const generatePreview = () => {
      try {
        const previewPayload = {
          ...payload,
          rgpNo: payload.rgpNo === "(auto)" ? "RGP-PREVIEW-001" : payload.rgpNo
        };
        const doc = generateRgpPDF({ payload: previewPayload, options: { qrEntryImage: null, qrReturnImage: null } });
        const pdfBlob = doc.output('blob');
        const pdfUrl = URL.createObjectURL(pdfBlob);
        setPreviewPdfUrl(pdfUrl);
        return () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); };
      } catch (error) {
        console.error("Failed to generate preview:", error);
      }
    };
    generatePreview();
  }, [payload]);

  return (
    <div style={modalStyles.overlay}>
      <div style={modalStyles.modal}>
        <div style={modalStyles.header}>
          <h2 style={modalStyles.title}>
            <Emoji size={22} mr={8}>👁️</Emoji>
            Preview RGP Document
          </h2>
          <button onClick={onClose} style={modalStyles.closeButton} disabled={loading}>
            <Emoji size={18}>✕</Emoji>
          </button>
        </div>
        <div style={modalStyles.previewContainer}>
          {previewPdfUrl ? (
            <iframe src={previewPdfUrl} title="RGP Preview" style={modalStyles.previewFrame} />
          ) : (
            <div style={modalStyles.loadingPreview}>
              <Emoji size={40}>⏳</Emoji>
              <p>Generating preview...</p>
            </div>
          )}
        </div>
        <div style={modalStyles.footer}>
          <button onClick={onClose} style={modalStyles.cancelButton} disabled={loading}>
            <Emoji size={16} mr={6}>←</Emoji> Back to Edit
          </button>
          <button onClick={onConfirm} style={modalStyles.confirmButton} disabled={loading}>
            <Emoji size={16} mr={6}>{loading ? "⏳" : "✓"}</Emoji>
            {loading ? "Submitting..." : "Confirm & Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}

const modalStyles = {
  overlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, padding: '20px',
  },
  modal: {
    backgroundColor: 'white', borderRadius: '24px', width: '90%', maxWidth: '1200px',
    maxHeight: '90vh', display: 'flex', flexDirection: 'column',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', overflow: 'hidden',
  },
  header: {
    padding: '28px 36px', backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  title: { margin: 0, fontSize: '1.9rem', fontWeight: '700', color: '#00296b', display: 'flex', alignItems: 'center' },
  closeButton: {
    background: 'none', border: '2px solid #e2e8f0', borderRadius: '12px', width: '48px', height: '48px',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
    fontSize: '20px', transition: 'all 0.3s ease', color: '#64748b',
  },
  previewContainer: { flex: 1, padding: '28px', overflow: 'auto', backgroundColor: '#f1f5f9' },
  previewFrame: { width: '100%', height: '550px', border: 'none', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' },
  loadingPreview: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '550px', color: '#64748b' },
  footer: { padding: '28px 36px', backgroundColor: '#f8fafc', borderTop: '2px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', gap: '20px' },
  cancelButton: {
    padding: '16px 32px', backgroundColor: 'white', color: '#4b5563', border: '2px solid #d1d5db',
    borderRadius: '14px', fontSize: '1rem', fontWeight: '600', cursor: 'pointer',
    transition: 'all 0.3s ease', display: 'flex', alignItems: 'center', fontFamily: 'inherit',
  },
  confirmButton: {
    padding: '16px 36px', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    color: 'white', border: 'none', borderRadius: '14px', fontSize: '1.1rem', fontWeight: '700',
    cursor: 'pointer', transition: 'all 0.3s ease', display: 'flex', alignItems: 'center',
    fontFamily: 'inherit', boxShadow: '0 6px 20px rgba(16, 185, 129, 0.3)',
  },
};

export default function FabricRgpForm({ today = new Date(), onSubmit, onBack }) {
  const toYMD = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const [form, setForm] = useState({
    rgpNo: "(auto)",
    date: toYMD(today),
    vendor: "",
    rgpType: "Fabric",
    department: "",
    purpose: "",
    itemDesc: "",
    qty: "",
    uom: "",
    entries: [{ lotNo: "", itemDesc: "", qty1: "", qty2: "", uom: "", department: "", purpose: "" }],
    expectedReturnDate: "",
    vehicleNo: "",
    preparedBy: "",
    authorizedBy: "",
    remarks: "",
  });

  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [customRgpType, setCustomRgpType] = useState("");
  const [customDepartments, setCustomDepartments] = useState({});
  const [customUoms, setCustomUoms] = useState({});
  const [showPreview, setShowPreview] = useState(false);
  const [submissionComplete, setSubmissionComplete] = useState(false);
  
  // New states for Prepared By & Authorized By
  const [isPreparedByCustom, setIsPreparedByCustom] = useState(false);
  const [isAuthorizedByCustom, setIsAuthorizedByCustom] = useState(false);
  const [preparedByCustomValue, setPreparedByCustomValue] = useState("");
  const [authorizedByCustomValue, setAuthorizedByCustomValue] = useState("");

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const updateEntry = (idx, key, val) =>
    setForm((f) => {
      const entries = [...(f.entries || [])];
      entries[idx] = { ...entries[idx], [key]: val };
      return { ...f, entries };
    });

  const addRow = () =>
    setForm((f) => ({
      ...f,
      entries: [...(f.entries || []), { lotNo: "", itemDesc: "", qty1: "", qty2: "", uom: "", department: "", purpose: "" }],
    }));

  const removeRow = (idx) =>
    setForm((f) => {
      const entries = [...(f.entries || [])];
      entries.splice(idx, 1);
      return { ...f, entries: entries.length ? entries : [{ lotNo: "", itemDesc: "", qty1: "", qty2: "", uom: "", department: "", purpose: "" }] };
    });

  const required = ["date", "vendor", "expectedReturnDate", "preparedBy", "authorizedBy", "rgpType"];

  const validate = () => {
    const e = {};
    required.forEach((k) => {
      let value = form[k];
      if (k === "preparedBy" && isPreparedByCustom) value = preparedByCustomValue;
      if (k === "authorizedBy" && isAuthorizedByCustom) value = authorizedByCustomValue;
      if (!String(value ?? "").trim()) e[k] = "Required";
    });

    const entries = form.entries || [];
    if (!entries.length) {
      e.entries = "At least one item row is required";
    } else {
      const rowErrs = entries.map((row) => {
        const re = {};
        const q1 = Number(row.qty1);
        const hasQ = (Number.isFinite(q1) && q1 > 0);
        if (!row.itemDesc && !row.lotNo) re.itemDesc = "Add Description or Lot No.";
        if (!row.uom) re.uom = "UOM required";
        if (!row.department) re.department = "Department required";
        if (!String(row.purpose || "").trim()) re.purpose = "Purpose required";
        if (!hasQ) re.qty = "Qty1 must be > 0";
        return re;
      });
      if (rowErrs.some((re) => Object.keys(re).length)) e.entries = rowErrs;
    }

    if (form.expectedReturnDate && form.date && form.expectedReturnDate < form.date)
      e.expectedReturnDate = "Cannot be before Issue Date";

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const silentRefresh = () => {
    const formKey = 'rgp_form_backup_' + new Date().getTime();
    sessionStorage.setItem(formKey, JSON.stringify({ form, customRgpType, customDepartments, customUoms, isPreparedByCustom, isAuthorizedByCustom, preparedByCustomValue, authorizedByCustomValue }));
    setSubmissionComplete(true);
    setTimeout(() => {
      sessionStorage.removeItem(formKey);
      window.location.reload();
    }, 100);
  };

  useEffect(() => {
    const checkForBackup = () => {
      const keys = Object.keys(sessionStorage);
      const backupKey = keys.find(key => key.startsWith('rgp_form_backup_'));
      if (backupKey) {
        try {
          const backup = JSON.parse(sessionStorage.getItem(backupKey));
          if (backup) {
            setForm(backup.form);
            setCustomRgpType(backup.customRgpType);
            setCustomDepartments(backup.customDepartments);
            setCustomUoms(backup.customUoms);
            setIsPreparedByCustom(backup.isPreparedByCustom);
            setIsAuthorizedByCustom(backup.isAuthorizedByCustom);
            setPreparedByCustomValue(backup.preparedByCustomValue);
            setAuthorizedByCustomValue(backup.authorizedByCustomValue);
            setTimeout(() => alert("✅ Form submitted successfully! Data has been restored."), 500);
            sessionStorage.removeItem(backupKey);
          }
        } catch (error) {
          console.error("Failed to restore backup:", error);
          sessionStorage.removeItem(backupKey);
        }
      }
    };
    checkForBackup();
  }, []);

  const handlePreview = (e) => {
    e.preventDefault();
    if (!validate()) return;
    setShowPreview(true);
  };

  const handleFinalSubmit = async () => {
    if (submitting) return;
    
    if (!WEB_APP_URL.includes("/exec")) {
      alert("❌ WEB_APP_URL must be a deployed /exec URL");
      return;
    }

    const first = (form.entries && form.entries[0]) || {};
    const legacyQty = (Number(first.qty1) || 0) || "";
    const rgpTypeFinal = form.rgpType === "Other" ? customRgpType.trim() : form.rgpType;
    
    // Get final Prepared By and Authorized By values
    const finalPreparedBy = isPreparedByCustom ? preparedByCustomValue : form.preparedBy;
    const finalAuthorizedBy = isAuthorizedByCustom ? authorizedByCustomValue : form.authorizedBy;

    const payload = {
      date: form.date,
      vendor: form.vendor,
      rgpType: rgpTypeFinal,
      department: first.department || "",
      purpose: first.purpose || "",
      itemDesc: first.itemDesc || "",
      qty: legacyQty,
      uom: first.uom || "",
      entries: (form.entries || []).map((r) => ({
        lotNo: r.lotNo || "",
        itemDesc: r.itemDesc || "",
        qty1: r.qty1 ? Number(r.qty1) : "",
        qty2: r.qty2 ? Number(r.qty2) : "",
        uom: r.uom || "",
        department: r.department || "",
        purpose: r.purpose || "",
      })),
      expectedReturnDate: form.expectedReturnDate,
      vehicleNo: form.vehicleNo,
      preparedBy: finalPreparedBy,
      authorizedBy: finalAuthorizedBy,
      remarks: form.remarks,
      createdAt: new Date().toISOString(),
    };

    setSubmitting(true);
    
    try {
      console.log("Submitting payload to:", WEB_APP_URL);
      
      const res = await fetch(WEB_APP_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "Accept": "application/json" },
        body: "data=" + encodeURIComponent(JSON.stringify(payload)),
      });
      
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      
      const text = await res.text();
      let json;
      try { json = JSON.parse(text); } catch (parseError) { throw new Error('Invalid response from server'); }
      
      if (!json.ok) throw new Error(json.error || "Save failed");

      const assignedRgpNo = json.rgpNo;
      console.log("RGP created successfully:", assignedRgpNo);

      const baseUrl = json.baseUrl || WEB_APP_URL;
      const entryUrl = json.entryUrl || `${baseUrl}?mode=entry&rgp=${encodeURIComponent(assignedRgpNo)}`;
      const returnUrl = json.returnUrl || `${baseUrl}?mode=return&rgp=${encodeURIComponent(assignedRgpNo)}`;

      let entryQR, returnQR;
      try { entryQR = await generateQRCode(entryUrl); } catch (qrError) { console.error("Failed to generate entry QR:", qrError); }
      try { returnQR = await generateQRCode(returnUrl); } catch (qrError) { console.error("Failed to generate return QR:", qrError); }

      let entryQRDataUrl = entryQR, returnQRDataUrl = returnQR;
      if (entryQR && entryQR.startsWith('blob:')) { try { entryQRDataUrl = await toDataURL(entryQR); } catch (error) { console.warn("Failed to convert entry QR to data URL:", error); } }
      if (returnQR && returnQR.startsWith('blob:')) { try { returnQRDataUrl = await toDataURL(returnQR); } catch (error) { console.warn("Failed to convert return QR to data URL:", error); } }

      setForm((f) => ({ ...f, rgpNo: assignedRgpNo }));
      if (onSubmit) onSubmit({ ...payload, rgpNo: assignedRgpNo });
      
      const pdfDoc = generateRgpPDF({ payload: { ...payload, rgpNo: assignedRgpNo }, options: { qrEntryImage: entryQRDataUrl, qrReturnImage: returnQRDataUrl } });
      const safeNo = assignedRgpNo.replace(/[^\w\-]+/g, "-");
      pdfDoc.save(`RGP-${safeNo}.pdf`);
      
      setShowPreview(false);
      alert(`✅ RGP Created Successfully!\nRGP No: ${assignedRgpNo}\nPDF has been downloaded.`);
      silentRefresh();
      
    } catch (err) {
      console.error("Submit error:", err);
      alert(`❌ Error: ${err.message}\n\nData was saved to sheet but PDF generation failed.`);
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setForm({
      rgpNo: "(auto)",
      date: toYMD(today),
      vendor: "",
      rgpType: "Fabric",
      department: "",
      purpose: "",
      itemDesc: "",
      qty: "",
      uom: "",
      entries: [{ lotNo: "", itemDesc: "", qty1: "", qty2: "", uom: "", department: "", purpose: "" }],
      expectedReturnDate: "",
      vehicleNo: "",
      preparedBy: "",
      authorizedBy: "",
      remarks: "",
    });
    setErrors({});
    setCustomRgpType("");
    setCustomDepartments({});
    setCustomUoms({});
    setIsPreparedByCustom(false);
    setIsAuthorizedByCustom(false);
    setPreparedByCustomValue("");
    setAuthorizedByCustomValue("");
  };

  const handleBack = () => {
    if (typeof onBack === "function") return onBack();
    if (window.history.length > 1) window.history.back();
    else window.location.href = "/";
  };

  const handlePreparedByChange = (e) => {
    const value = e.target.value;
    if (value === "custom") {
      setIsPreparedByCustom(true);
      update("preparedBy", "");
    } else {
      setIsPreparedByCustom(false);
      update("preparedBy", value);
      setPreparedByCustomValue("");
    }
  };

  const handleAuthorizedByChange = (e) => {
    const value = e.target.value;
    if (value === "custom") {
      setIsAuthorizedByCustom(true);
      update("authorizedBy", "");
    } else {
      setIsAuthorizedByCustom(false);
      update("authorizedBy", value);
      setAuthorizedByCustomValue("");
    }
  };

  const handleDepartmentChange = (idx, value) => {
    updateEntry(idx, "department", value);
    if (value !== "Other") setCustomDepartments(prev => ({ ...prev, [idx]: "" }));
  };

  const handleUomChange = (idx, value) => {
    updateEntry(idx, "uom", value);
    if (value !== "Other") setCustomUoms(prev => ({ ...prev, [idx]: "" }));
  };

  // Calculate total quantity for display
  const totalQuantity = form.entries.reduce((sum, entry) => sum + (Number(entry.qty1) || 0), 0);

  return (
    <div style={styles.container}>
      {/* Professional Header */}
      <div style={styles.headerWrapper}>
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <button type="button" onClick={handleBack} style={styles.backButton}>
              <Emoji size={18} mr={8}>←</Emoji>
              Back
            </button>
            <div style={styles.logoContainer}>
              <div style={styles.logoIcon}>🏭</div>
              <div style={styles.logoText}>Textile ERP</div>
            </div>
          </div>
          <div style={styles.headerCenter}>
            <h1 style={styles.headerTitle}>
              <Emoji size={28} mr={12}>📋</Emoji>
              Returnable Gate Pass
            </h1>
            <p style={styles.headerSubtitle}>
              <Emoji size={14} mr={6}>🏭</Emoji>
              Material Issue & Return Tracking System
            </p>
          </div>
          <div style={styles.rgpBadge}>
            <div style={styles.badgeLabel}>RGP Number</div>
            <div style={styles.badgeValue}>{form.rgpNo}</div>
          </div>
        </div>
      </div>

      <form onSubmit={handlePreview} style={styles.form}>
        <div style={styles.formBody}>
          {/* Left Column - Form Sections */}
          <div style={styles.leftColumn}>
            {/* Issue Details Section */}
            <div style={styles.section}>
              <div style={styles.sectionHeader}>
                <Emoji size={18} mr={8}>📌</Emoji>
                <h3 style={styles.sectionTitle}>Issue Details</h3>
                <span style={styles.requiredBadge}>Required</span>
              </div>
              <div style={styles.formGrid}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>RGP Number <span style={styles.requiredStar}>*</span></label>
                  <input value={form.rgpNo} readOnly style={styles.inputReadonly} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Issue Date <span style={styles.requiredStar}>*</span></label>
                  <input type="date" value={form.date} onChange={(e) => update("date", e.target.value)} style={errors.date ? styles.inputError : styles.input} />
                  {errors.date && <span style={styles.errorText}>{errors.date}</span>}
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Vendor / Party <span style={styles.requiredStar}>*</span></label>
                  <input value={form.vendor} onChange={(e) => update("vendor", e.target.value)} placeholder="Enter vendor or party name" style={errors.vendor ? styles.inputError : styles.input} />
                  {errors.vendor && <span style={styles.errorText}>{errors.vendor}</span>}
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>RGP Type <span style={styles.requiredStar}>*</span></label>
                  <select value={form.rgpType} onChange={(e) => { update("rgpType", e.target.value); if (e.target.value !== "Other") setCustomRgpType(""); }} style={errors.rgpType ? styles.inputError : styles.input}>
                    {RGP_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
                  </select>
                  {form.rgpType === "Other" && (<input value={customRgpType} onChange={(e) => setCustomRgpType(e.target.value)} placeholder="Enter custom type" style={{ ...styles.input, marginTop: '8px' }} required />)}
                  {errors.rgpType && <span style={styles.errorText}>{errors.rgpType}</span>}
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Expected Return Date <span style={styles.requiredStar}>*</span></label>
                  <input type="date" value={form.expectedReturnDate} onChange={(e) => update("expectedReturnDate", e.target.value)} style={errors.expectedReturnDate ? styles.inputError : styles.input} />
                  {errors.expectedReturnDate && <span style={styles.errorText}>{errors.expectedReturnDate}</span>}
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Vehicle Number</label>
                  <input value={form.vehicleNo} onChange={(e) => update("vehicleNo", e.target.value)} placeholder="Optional - Vehicle registration" style={styles.input} />
                </div>
              </div>
            </div>

            {/* Authorization Section */}
            <div style={styles.section}>
              <div style={styles.sectionHeader}>
                <Emoji size={18} mr={8}>✍️</Emoji>
                <h3 style={styles.sectionTitle}>Authorization</h3>
                <span style={styles.requiredBadge}>Required</span>
              </div>
              <div style={styles.formGrid}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Prepared By <span style={styles.requiredStar}>*</span></label>
                  <select value={isPreparedByCustom ? "custom" : form.preparedBy} onChange={handlePreparedByChange} style={errors.preparedBy ? styles.inputError : styles.input}>
                    <option value="">Select Preparer</option>
                    {PREPARED_BY_OPTIONS.map((option, idx) => (<option key={idx} value={option}>{option}</option>))}
                    <option value="custom">+ Manual Entry</option>
                  </select>
                  {isPreparedByCustom && (<input type="text" placeholder="Name & designation" value={preparedByCustomValue} onChange={(e) => { setPreparedByCustomValue(e.target.value); update("preparedBy", e.target.value); }} style={{ ...styles.input, marginTop: '8px' }} />)}
                  {errors.preparedBy && <span style={styles.errorText}>{errors.preparedBy}</span>}
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Authorized By <span style={styles.requiredStar}>*</span></label>
                  <select value={isAuthorizedByCustom ? "custom" : form.authorizedBy} onChange={handleAuthorizedByChange} style={errors.authorizedBy ? styles.inputError : styles.input}>
                    <option value="">Select Authorizer</option>
                    {AUTHORIZED_BY_OPTIONS.map((option, idx) => (<option key={idx} value={option}>{option}</option>))}
                    <option value="custom">+ Manual Entry</option>
                  </select>
                  {isAuthorizedByCustom && (<input type="text" placeholder="Name & designation" value={authorizedByCustomValue} onChange={(e) => { setAuthorizedByCustomValue(e.target.value); update("authorizedBy", e.target.value); }} style={{ ...styles.input, marginTop: '8px' }} />)}
                  {errors.authorizedBy && <span style={styles.errorText}>{errors.authorizedBy}</span>}
                </div>
              </div>
            </div>

            {/* Remarks Section */}
            <div style={styles.section}>
              <div style={styles.sectionHeader}>
                <Emoji size={18} mr={8}>💬</Emoji>
                <h3 style={styles.sectionTitle}>Remarks</h3>
              </div>
              <textarea value={form.remarks} onChange={(e) => update("remarks", e.target.value)} placeholder="Additional remarks or special instructions..." style={styles.textarea} rows="3" />
            </div>
          </div>

          {/* Right Column - Items Section */}
          <div style={styles.rightColumn}>
            <div style={styles.section}>
              <div style={styles.sectionHeader}>
                <Emoji size={18} mr={8}>📦</Emoji>
                <h3 style={styles.sectionTitle}>Material Items</h3>
                <button type="button" onClick={addRow} style={styles.addButton}>
                  <Emoji size={14} mr={6}>➕</Emoji>
                  Add Item
                </button>
              </div>
              
              <div style={styles.itemsContainer}>
                {(form.entries || []).map((row, idx) => {
                  const rowErr = Array.isArray(errors.entries) && errors.entries[idx] ? errors.entries[idx] : {};
                  return (
                    <div key={idx} style={styles.itemCard}>
                      <div style={styles.itemHeader}>
                        <div style={styles.itemNumber}>Item #{idx + 1}</div>
                        <button type="button" onClick={() => removeRow(idx)} disabled={(form.entries || []).length === 1} style={{ ...styles.removeButton, opacity: (form.entries || []).length === 1 ? 0.5 : 1 }} title="Remove item">
                          <Emoji size={14}>🗑️</Emoji> Remove
                        </button>
                      </div>
                      <div style={styles.itemGrid}>
                        <div style={styles.formGroupCompact}>
                          <label style={styles.labelCompact}>Lot Number</label>
                          <input value={row.lotNo} onChange={(e) => updateEntry(idx, "lotNo", e.target.value)} placeholder="Lot #" style={styles.inputCompact} />
                        </div>
                        <div style={styles.formGroupCompact}>
                          <label style={styles.labelCompact}>Description <span style={styles.requiredStar}>*</span></label>
                          <input value={row.itemDesc} onChange={(e) => updateEntry(idx, "itemDesc", e.target.value)} placeholder="Item description" style={rowErr?.itemDesc ? styles.inputCompactError : styles.inputCompact} />
                          {rowErr?.itemDesc && <span style={styles.errorCompact}>{rowErr.itemDesc}</span>}
                        </div>
                        <div style={styles.formGroupCompact}>
                          <label style={styles.labelCompact}>Department <span style={styles.requiredStar}>*</span></label>
                          <select value={row.department} onChange={(e) => handleDepartmentChange(idx, e.target.value)} style={rowErr?.department ? styles.inputCompactError : styles.inputCompact}>
                            <option value="">Select Department</option>
                            {DEPT_OPTIONS.map((d) => (<option key={d} value={d}>{d}</option>))}
                          </select>
                          {row.department === "Other" && (<input value={customDepartments[idx] || ""} onChange={(e) => { setCustomDepartments(prev => ({ ...prev, [idx]: e.target.value })); updateEntry(idx, "department", e.target.value); }} placeholder="Custom department" style={{ ...styles.inputCompact, marginTop: '6px' }} />)}
                          {rowErr?.department && <span style={styles.errorCompact}>{rowErr.department}</span>}
                        </div>
                        <div style={styles.formGroupCompact}>
                          <label style={styles.labelCompact}>Purpose <span style={styles.requiredStar}>*</span></label>
                          <input value={row.purpose} onChange={(e) => updateEntry(idx, "purpose", e.target.value)} placeholder="Purpose of issue" style={rowErr?.purpose ? styles.inputCompactError : styles.inputCompact} />
                          {rowErr?.purpose && <span style={styles.errorCompact}>{rowErr.purpose}</span>}
                        </div>
                        <div style={styles.formGroupCompact}>
                          <label style={styles.labelCompact}>Quantity <span style={styles.requiredStar}>*</span></label>
                          <input type="number" min="0" step="0.01" value={row.qty1} onChange={(e) => updateEntry(idx, "qty1", e.target.value)} placeholder="0.00" style={styles.inputCompact} />
                          {rowErr?.qty && <span style={styles.errorCompact}>{rowErr.qty}</span>}
                        </div>
                        <div style={styles.formGroupCompact}>
                          <label style={styles.labelCompact}>Bags / Packages</label>
                          <input type="number" min="0" step="1" value={row.qty2} onChange={(e) => updateEntry(idx, "qty2", e.target.value)} placeholder="0" style={styles.inputCompact} />
                        </div>
                        <div style={styles.formGroupCompact}>
                          <label style={styles.labelCompact}>UOM <span style={styles.requiredStar}>*</span></label>
                          <select value={row.uom} onChange={(e) => handleUomChange(idx, e.target.value)} style={rowErr?.uom ? styles.inputCompactError : styles.inputCompact}>
                            <option value="">Select UOM</option>
                            {UOM_OPTIONS.map((u) => (<option key={u} value={u}>{u}</option>))}
                          </select>
                          {row.uom === "Other" && (<input value={customUoms[idx] || ""} onChange={(e) => { setCustomUoms(prev => ({ ...prev, [idx]: e.target.value })); updateEntry(idx, "uom", e.target.value); }} placeholder="Custom UOM" style={{ ...styles.inputCompact, marginTop: '6px' }} />)}
                          {rowErr?.uom && <span style={styles.errorCompact}>{rowErr.uom}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Summary Bar */}
              <div style={styles.summaryBar}>
                <div style={styles.summaryItem}>
                  <span style={styles.summaryLabel}>Total Items:</span>
                  <span style={styles.summaryValue}>{form.entries.length}</span>
                </div>
                <div style={styles.summaryDivider}>|</div>
                <div style={styles.summaryItem}>
                  <span style={styles.summaryLabel}>Total Quantity:</span>
                  <span style={styles.summaryValue}>{totalQuantity.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Bar */}
        <div style={styles.actionBar}>
          <button type="button" onClick={handleReset} disabled={submitting || submissionComplete} style={styles.secondaryButton}>
            <Emoji size={16} mr={6}>↺</Emoji>
            Reset Form
          </button>
          <div style={styles.actionButtons}>
            <button type="submit" disabled={submitting || submissionComplete} style={styles.previewButton}>
              <Emoji size={16} mr={6}>👁️</Emoji>
              Preview Document
            </button>
            <button type="button" onClick={handleFinalSubmit} disabled={submitting || submissionComplete} style={styles.primaryButton}>
              <Emoji size={16} mr={6}>{submitting ? "⏳" : "✓"}</Emoji>
              {submitting ? "Processing..." : "Save & Create Rgp"}
            </button>
          </div>
        </div>
      </form>

      {showPreview && (<PreviewModal payload={form} onClose={() => setShowPreview(false)} onConfirm={handleFinalSubmit} loading={submitting} />)}
    </div>
  );
}

// Professional Modern Styles - Navy & White Theme with Enhanced Typography
const styles = {
  container: {
    maxWidth: "2200px",
    margin: "0 auto",
    padding: "24px",
    fontFamily: "'Plus Jakarta Sans', 'Outfit', sans-serif",
    backgroundColor: "transparent",
    minHeight: "100vh",
  },
  headerWrapper: {
    marginBottom: "28px",
  },
  header: {
    background: "linear-gradient(135deg, #003f88 0%, #00296b 100%)",
    borderRadius: "20px",
    padding: "24px 32px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: "20px",
    boxShadow: "0 10px 30px rgba(0, 41, 107, 0.15)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "20px",
  },
  backButton: {
    display: "inline-flex",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    color: "white",
    border: "1px solid rgba(255, 255, 255, 0.25)",
    padding: "10px 20px",
    borderRadius: "12px",
    cursor: "pointer",
    fontSize: "0.9rem",
    fontWeight: "600",
    transition: "all 0.2s ease",
    fontFamily: "inherit",
  },
  logoContainer: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    padding: "8px 16px",
    borderRadius: "40px",
  },
  logoIcon: {
    fontSize: "28px",
  },
  logoText: {
    fontSize: "1rem",
    fontWeight: "600",
    color: "white",
    letterSpacing: "0.5px",
  },
  headerCenter: {
    textAlign: "center",
  },
  headerTitle: {
    margin: 0,
    fontSize: "2.5rem",
    fontWeight: "700",
    color: "white",
    display: "flex",
    alignItems: "center",
    letterSpacing: "-0.3px",
  },
  headerSubtitle: {
    margin: "8px 0 0 0",
    fontSize: "0.95rem",
    color: "rgba(255, 255, 255, 0.8)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  rgpBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    padding: "12px 20px",
    borderRadius: "16px",
    textAlign: "center",
    minWidth: "140px",
  },
  badgeLabel: {
    fontSize: "0.7rem",
    textTransform: "uppercase",
    letterSpacing: "1px",
    color: "rgba(255, 255, 255, 0.7)",
    marginBottom: "4px",
  },
  badgeValue: {
    fontSize: "1.1rem",
    fontWeight: "700",
    color: "white",
    fontFamily: "monospace",
  },
  form: {
    backgroundColor: "white",
    borderRadius: "20px",
    boxShadow: "0 10px 30px rgba(0, 41, 107, 0.03)",
    overflow: "hidden",
    border: "1px solid rgba(0, 63, 136, 0.08)",
  },
  formBody: {
    display: "grid",
    gridTemplateColumns: "480px 1fr",
    gap: "0",
  },
  leftColumn: {
    padding: "28px",
    borderRight: "1px solid #cbd5e1",
    backgroundColor: "#ffffff",
  },
  rightColumn: {
    padding: "28px",
    backgroundColor: "#ffffff",
  },
  section: {
    marginBottom: "32px",
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    marginBottom: "20px",
    paddingBottom: "12px",
    borderBottom: "2px solid #cbd5e1",
  },
  sectionTitle: {
    margin: 0,
    fontSize: "1.15rem",
    fontWeight: "600",
    color: "#003f88",
    flex: 1,
  },
  requiredBadge: {
    backgroundColor: "#fee2e2",
    color: "#dc2626",
    fontSize: "0.7rem",
    padding: "4px 10px",
    borderRadius: "20px",
    fontWeight: "500",
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: "10px",
  },
  formGroup: {
    display: "flex",
    flexDirection: "column",
  },
  label: {
    marginBottom: "8px",
    fontWeight: "600",
    color: "#003f88",
    fontSize: "0.85rem",
    textTransform: "uppercase",
    letterSpacing: "0.3px",
  },
  requiredStar: {
    color: "#dc2626",
    marginLeft: "4px",
  },
  input: {
    padding: "12px 14px",
    border: "1.5px solid #cbd5e1",
    borderRadius: "10px",
    fontSize: "0.9rem",
    transition: "all 0.2s ease",
    backgroundColor: "white",
    fontFamily: "inherit",
    outline: "none",
    color: "#1e293b",
  },
  inputReadonly: {
    padding: "12px 14px",
    border: "1.5px solid #cbd5e1",
    borderRadius: "10px",
    fontSize: "0.9rem",
    backgroundColor: "#f8fafc",
    fontFamily: "monospace",
    fontWeight: "600",
    color: "#1e293b",
  },
  inputError: {
    borderColor: "#dc2626",
    backgroundColor: "#fef2f2",
  },
  errorText: {
    color: "#dc2626",
    fontSize: "0.7rem",
    marginTop: "6px",
  },
  textarea: {
    padding: "12px 14px",
    border: "1.5px solid #cbd5e1",
    borderRadius: "10px",
    fontSize: "0.9rem",
    resize: "vertical",
    fontFamily: "inherit",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  },
  addButton: {
    display: "inline-flex",
    alignItems: "center",
    backgroundColor: "#003f88",
    color: "white",
    border: "none",
    padding: "8px 16px",
    borderRadius: "10px",
    fontSize: "0.8rem",
    fontWeight: "500",
    cursor: "pointer",
    transition: "all 0.2s ease",
    fontFamily: "inherit",
  },
  itemsContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
    maxHeight: "calc(100vh - 300px)",
    overflowY: "auto",
    paddingRight: "8px",
  },
  itemCard: {
    backgroundColor: "white",
    borderRadius: "14px",
    padding: "20px",
    border: "1px solid #cbd5e1",
    boxShadow: "0 2px 8px rgba(0, 41, 107, 0.01)",
    transition: "all 0.2s ease",
  },
  itemHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "18px",
    paddingBottom: "12px",
    borderBottom: "1px dashed #cbd5e1",
  },
  itemNumber: {
    fontSize: "0.9rem",
    fontWeight: "700",
    color: "#003f88",
    backgroundColor: "rgba(0, 63, 136, 0.05)",
    padding: "4px 12px",
    borderRadius: "20px",
  },
  removeButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    backgroundColor: "transparent",
    color: "#dc2626",
    border: "1px solid #fecaca",
    padding: "6px 12px",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "0.75rem",
    fontWeight: "500",
    transition: "all 0.2s ease",
    fontFamily: "inherit",
  },
  itemGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: "14px",
  },
  formGroupCompact: {
    display: "flex",
    flexDirection: "column",
  },
  labelCompact: {
    marginBottom: "6px",
    fontWeight: "500",
    color: "#003f88",
    fontSize: "0.9rem",
    textTransform: "uppercase",
    letterSpacing: "0.3px",
  },
  inputCompact: {
    padding: "10px 12px",
    border: "1.5px solid #cbd5e1",
    borderRadius: "8px",
    fontSize: "0.85rem",
    transition: "all 0.2s ease",
    backgroundColor: "white",
    fontFamily: "inherit",
    outline: "none",
  },
  inputCompactError: {
    borderColor: "#dc2626",
    backgroundColor: "#fef2f2",
  },
  errorCompact: {
    color: "#dc2626",
    fontSize: "0.65rem",
    marginTop: "4px",
  },
  summaryBar: {
    marginTop: "20px",
    padding: "16px 20px",
    backgroundColor: "#f8fafc",
    border: "1px solid #cbd5e1",
    borderRadius: "12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "20px",
  },
  summaryItem: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  summaryLabel: {
    fontSize: "0.85rem",
    fontWeight: "500",
    color: "#64748b",
  },
  summaryValue: {
    fontSize: "1.1rem",
    fontWeight: "700",
    color: "#003f88",
  },
  summaryDivider: {
    color: "#cbd5e1",
    fontSize: "1.2rem",
  },
  actionBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "20px 28px",
    backgroundColor: "#f8fafc",
    borderTop: "1px solid #cbd5e1",
  },
  actionButtons: {
    display: "flex",
    gap: "16px",
  },
  previewButton: {
    padding: "12px 24px",
    backgroundColor: "#003f88",
    color: "white",
    border: "none",
    borderRadius: "12px",
    fontSize: "0.9rem",
    fontWeight: "600",
    cursor: "pointer",
    transition: "all 0.2s ease",
    display: "inline-flex",
    alignItems: "center",
    fontFamily: "inherit",
  },
  primaryButton: {
    padding: "12px 28px",
    background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
    color: "white",
    border: "none",
    borderRadius: "12px",
    fontSize: "0.9rem",
    fontWeight: "700",
    cursor: "pointer",
    transition: "all 0.2s ease",
    display: "inline-flex",
    alignItems: "center",
    fontFamily: "inherit",
    boxShadow: "0 2px 8px rgba(16, 185, 129, 0.3)",
  },
  secondaryButton: {
    padding: "12px 24px",
    backgroundColor: "white",
    color: "#475569",
    border: "1.5px solid #cbd5e1",
    borderRadius: "12px",
    fontSize: "0.9rem",
    fontWeight: "500",
    cursor: "pointer",
    transition: "all 0.2s ease",
    display: "inline-flex",
    alignItems: "center",
    fontFamily: "inherit",
  },
};

// Add hover styles as CSS (since inline styles don't support :hover)
const styleSheet = document.createElement("style");
styleSheet.textContent = `
  button:hover {
    transform: translateY(-1px);
    opacity: 0.95;
  }
  input:focus, select:focus, textarea:focus {
    outline: none;
    border-color: #003f88 !important;
    box-shadow: 0 0 0 3px rgba(0, 63, 136, 0.15) !important;
    transition: all 0.2s ease !important;
  }
  .itemCard:hover {
    border-color: #d4af37 !important;
    box-shadow: 0 8px 24px rgba(212, 175, 55, 0.1) !important;
  }
  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  ::-webkit-scrollbar-track {
    background: #f8fafc;
    border-radius: 10px;
  }
  ::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 10px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: #003f88;
  }
`;
document.head.appendChild(styleSheet);