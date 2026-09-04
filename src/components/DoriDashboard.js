import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';

import {
  SHEET_ID_DORI,
  GOOGLE_API_KEY,
  WEB_APP_URL_DORI
} from '../config/apiConfig';

// Google Sheets Configuration for DORI
const SPREADSHEET_ID = SHEET_ID_DORI;
const API_KEY = GOOGLE_API_KEY;
const PURCHASE_ORDERS_RANGE = 'DoriPurchaseOrders!A:V';
const DORI_DATA_RANGE = 'DoriData!A:C';
const QR_SYSTEM_URL = WEB_APP_URL_DORI;

// Helper functions
const formatDate = (dateString) => {
  if (!dateString) return '-';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  } catch {
    return dateString;
  }
};

const formatNumber = (num) => {
  if (!num && num !== 0) return '0';
  return parseInt(num).toLocaleString('en-IN');
};

const formatCurrency = (amount) => {
  if (!amount && amount !== 0) return '₹0';
  const num = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(/[^\d.]/g, '')) || 0;
  return `₹${Math.round(num).toLocaleString('en-IN')}`;
};

const safeJSONParse = (str, defaultValue = {}) => {
  if (!str) return defaultValue;
  if (typeof str === 'object') return str;
  try {
    let clean = String(str).trim();
    if (clean.startsWith('"') && clean.endsWith('"')) {
      clean = clean.slice(1, -1);
    }
    return JSON.parse(clean);
  } catch {
    return defaultValue;
  }
};

const parsePlacements = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed;
        return [parsed];
      } catch {}
    }
    if (trimmed.includes(',')) {
      return trimmed.split(',').map(s => s.trim()).filter(Boolean);
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
      return [String(parsed)];
    } catch {
      return [trimmed];
    }
  }
  return [String(val)];
};

const parseColorBreakdown = (breakdown) => {
  if (!breakdown) return {};
  if (typeof breakdown === 'object') return breakdown;
  try {
    const str = String(breakdown).trim();
    if (str.startsWith('{')) {
      return JSON.parse(str);
    }
    const result = {};
    str.split(';').forEach(item => {
      const parts = item.split(':').map(s => s.trim());
      if (parts[0]) {
        result[parts[0]] = parseInt((parts[1] || '0').replace(/[^\d]/g, '')) || 0;
      }
    });
    return result;
  } catch {
    return {};
  }
};

const calculateAging = (timestamp, materialEntryDate) => {
  if (!timestamp) return 0;
  const timestampDate = new Date(timestamp);
  let endDate = materialEntryDate ? new Date(materialEntryDate) : new Date();
  const timeDiff = endDate.getTime() - timestampDate.getTime();
  const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
  return Math.max(0, daysDiff);
};

const getAgingColor = (days) => {
  if (days <= 2) return '#10b981';
  if (days <= 5) return '#f59e0b';
  return '#ef4444';
};

// Fetch Dori Quality / Rate Data
const fetchDoriQualityData = async () => {
  try {
    const range = encodeURIComponent(DORI_DATA_RANGE);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?key=${API_KEY}`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    if (!data?.values?.length) return [];
    const headers = data.values[0].map(h => (h || '').toString().trim().toLowerCase());
    const doriTypeIndex = headers.findIndex(h => h.includes('dori') || h.includes('zip') || h.includes('type'));
    const colorIndex = headers.findIndex(h => h.includes('color') || h.includes('colour'));
    const priceIndex = headers.findIndex(h => h.includes('price') || h.includes('rate') || h.includes('cost'));
    if (doriTypeIndex === -1 || colorIndex === -1 || priceIndex === -1) return [];

    const doriData = [];
    for (let i = 1; i < data.values.length; i++) {
      const r = data.values[i] || [];
      const type = (r[doriTypeIndex] || '').toString().trim();
      const color = (r[colorIndex] || '').toString().trim();
      const price = parseFloat((r[priceIndex] || '0').toString().replace(/[^\d.]/g, '')) || 0;
      if (type && color) {
        doriData.push({ type, color, price });
      }
    }
    return doriData;
  } catch (err) {
    console.warn('Could not fetch Dori Quality Data:', err);
    return [];
  }
};

// Generate Full Dori Purchase Order PDF Document
export const generateDoriPoPdf = async (row, doriQualityData = []) => {
  if (!row) throw new Error('Order data is missing');

  const lotNumber = (row['Lot Number'] || 'Unknown').toString().trim();
  const issueDate = row['Issue Date'] || '';
  const supervisor = row['Supervisor'] || '';
  const garmentType = row['Garment Type'] || '';
  const style = row['Style'] || '';
  const fabric = row['Fabric'] || '';
  const brand = row['Brand'] || '';
  const priority = row['Priority'] || 'Normal';
  const consignee = row['Consignee'] || '';
  const totalPieces = parseInt(row['Total Pieces']) || 0;

  // Parse color breakdown and specifications
  let colorBreakdownObj = parseColorBreakdown(row['Color Breakdown']);
  const selectedPlacements = parsePlacements(row['Selected Placements']);
  const placementQuantities = safeJSONParse(row['Placement Quantities'], {});
  const placementZipTypes = safeJSONParse(row['Placement Zip Types'] || row['Placement Dori Types'], {});
  const zipSelections = safeJSONParse(row['Zip Selections'] || row['Dori Selections'], {});

  // Generate QR codes
  const gateEntryQRUrl = `${QR_SYSTEM_URL}?action=gateForm&lot=${encodeURIComponent(lotNumber)}`;
  const materialInQRUrl = `${QR_SYSTEM_URL}?action=materialForm&lot=${encodeURIComponent(lotNumber)}`;
  const supplierQRUrl = `${QR_SYSTEM_URL}?action=supplierForm&lot=${encodeURIComponent(lotNumber)}`;

  const [gateQRImage, materialQRImage, supplierQRImage] = await Promise.all([
    QRCode.toDataURL(gateEntryQRUrl, { width: 120, margin: 1, color: { dark: '#000000', light: '#FFFFFF' } }).catch(() => null),
    QRCode.toDataURL(materialInQRUrl, { width: 120, margin: 1, color: { dark: '#000000', light: '#FFFFFF' } }).catch(() => null),
    QRCode.toDataURL(supplierQRUrl, { width: 120, margin: 1, color: { dark: '#000000', light: '#FFFFFF' } }).catch(() => null)
  ]);

  const qrCodes = {
    gateEntry: { image: gateQRImage },
    materialIn: { image: materialQRImage },
    supplierEntry: { image: supplierQRImage }
  };

  const getDoriPrice = (dType, dColor) => {
    if (!dType || !dColor || !doriQualityData?.length) return 0;
    const normT = dType.toString().trim().toLowerCase();
    const normC = dColor.toString().trim().toLowerCase();
    const item = doriQualityData.find(it => (it.type || '').trim().toLowerCase() === normT && (it.color || '').trim().toLowerCase() === normC);
    if (item && item.price) return parseFloat(item.price) || 0;
    return 0;
  };

  const line = 0.9;
  const doc = new jsPDF({ unit: 'pt', format: 'A4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 18;
  const borderPad = 6;
  doc.setDrawColor(0); doc.setTextColor(0); doc.setLineWidth(line);
  const borderX = 8, borderY = 8, borderW = W - 16, borderH = H - 16;

  const printableDate = (dStr) => {
    if (!dStr) return '';
    try {
      const d = new Date(dStr);
      return isNaN(d.getTime()) ? dStr : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    } catch { return dStr; }
  };

  const drawHeader = () => {
    doc.rect(borderX, borderY, borderW, borderH);
    const CM = M + borderPad;
    const contentWidth = W - (CM * 2);
    const boxY = borderY + 20;
    const boxSize = 100;
    const centerPoint = borderX + borderW / 2;

    // Gate Entry QR
    const box1X = CM;
    doc.rect(box1X, boxY, boxSize, boxSize);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('SCAN FOR', box1X + boxSize/2, boxY + 12, { align: 'center' });
    doc.text('GATE ENTRY', box1X + boxSize/2, boxY + 24, { align: 'center' });
    if (qrCodes.gateEntry.image) {
      doc.addImage(qrCodes.gateEntry.image, 'PNG', box1X + 12, boxY + 32, boxSize - 24, boxSize - 44);
    } else {
      doc.rect(box1X + 12, boxY + 32, boxSize - 24, boxSize - 44);
      doc.setFontSize(7);
      doc.text('GATE QR', box1X + boxSize/2, boxY + boxSize/2 + 5, { align: 'center' });
    }

    // Material In QR
    const box2X = CM + contentWidth - boxSize;
    doc.rect(box2X, boxY, boxSize, boxSize);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('SCAN FOR', box2X + boxSize/2, boxY + 12, { align: 'center' });
    doc.text('MATERIAL IN', box2X + boxSize/2, boxY + 24, { align: 'center' });
    if (qrCodes.materialIn.image) {
      doc.addImage(qrCodes.materialIn.image, 'PNG', box2X + 12, boxY + 32, boxSize - 24, boxSize - 44);
    } else {
      doc.rect(box2X + 12, boxY + 32, boxSize - 24, boxSize - 44);
      doc.setFontSize(7);
      doc.text('MATERIAL QR', box2X + boxSize/2, boxY + boxSize/2 + 5, { align: 'center' });
    }

    // Header Title
    const headerTitleY = boxY + boxSize/2 - 15;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
    doc.text('PURCHASE ORDER', centerPoint, headerTitleY, { align: 'center' });
    doc.setFontSize(12);
    doc.text('DORI MATERIAL REQUIREMENT', centerPoint, headerTitleY + 18, { align: 'center' });
    doc.setFontSize(16);
    doc.text(`LOT NO: ${lotNumber}`, centerPoint, headerTitleY + 40, { align: 'center' });

    // Fields Section
    const fieldsY = boxY + boxSize + 12;
    const fieldH = 20;
    const dateItemW = (contentWidth / 2) - 1;
    const dateItemX = CM;

    doc.rect(dateItemX, fieldsY, dateItemW, fieldH);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('DATE :', dateItemX + 4, fieldsY + 12);
    doc.setFont('helvetica', 'normal');
    doc.text(printableDate(issueDate), dateItemX + 35, fieldsY + 12);

    doc.rect(dateItemX + dateItemW, fieldsY, dateItemW, fieldH);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('ITEM :', dateItemX + dateItemW + 4, fieldsY + 12);
    doc.setFont('helvetica', 'normal');
    doc.text(garmentType || style || '', dateItemX + dateItemW + 35, fieldsY + 12);

    const pcsPriorityX = CM;
    doc.rect(pcsPriorityX, fieldsY + fieldH, dateItemW, fieldH);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('TOTAL PCS', pcsPriorityX + 4, fieldsY + fieldH + 12);
    doc.setFont('helvetica', 'normal');
    doc.text(totalPieces.toString(), pcsPriorityX + 60, fieldsY + fieldH + 12);

    doc.rect(pcsPriorityX + dateItemW, fieldsY + fieldH, dateItemW, fieldH);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('PRIORITY', pcsPriorityX + dateItemW + 4, fieldsY + fieldH + 12);
    doc.setFont('helvetica', 'normal');
    doc.text(priority, pcsPriorityX + dateItemW + 50, fieldsY + fieldH + 12);

    const brandSupervisorX = CM;
    doc.rect(brandSupervisorX, fieldsY + (fieldH * 2), dateItemW, fieldH);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('BRAND :', brandSupervisorX + 4, fieldsY + (fieldH * 2) + 12);
    doc.setFont('helvetica', 'normal');
    doc.text(brand || '', brandSupervisorX + 45, fieldsY + (fieldH * 2) + 12);

    doc.rect(brandSupervisorX + dateItemW, fieldsY + (fieldH * 2), dateItemW, fieldH);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('SUPERVISOR : ', brandSupervisorX + dateItemW + 4, fieldsY + (fieldH * 2) + 12);
    doc.setFont('helvetica', 'normal');
    doc.text(supervisor || '________', brandSupervisorX + dateItemW + 65, fieldsY + (fieldH * 2) + 12);

    const consigneeY = fieldsY + (fieldH * 3);
    doc.rect(CM, consigneeY, contentWidth, fieldH);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('CONSIGNEE :', CM + 4, consigneeY + 12);
    doc.setFont('helvetica', 'normal');
    doc.text(consignee || '________________________', CM + 65, consigneeY + 12);

    const dividingLineY = consigneeY + fieldH + 5;
    doc.setLineWidth(1.5);
    doc.setDrawColor(0);
    doc.line(CM, dividingLineY, CM + contentWidth, dividingLineY);
    doc.setLineWidth(line);

    return { CM, contentWidth, breakdownStartY: dividingLineY + 15 };
  };

  const drawSimpleFooter = (currentPage, pageCount) => {
    doc.setFont('helvetica', 'normal');
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

    const drawSignatureBox = (x, lbl) => {
      doc.rect(x, signatureSectionY, signatureBoxWidth, signatureBoxHeight);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
      doc.text(lbl.toLowerCase(), x + boxPad, signatureSectionY + 10);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
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

    const instructionsY = signatureSectionY + signatureBoxHeight + 15;
    const centerX = CM + contentWidth / 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text('QR CODE USAGE INSTRUCTION:', centerX, instructionsY, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text('• LEFT QR: SCAN WHEN MATERIAL ENTER THE GATE - UPDATES GATE ENTRY PERSON AND DATE', centerX, instructionsY + 10, { align: 'center' });
    doc.text('• RIGHT QR: SCAN WHEN MATERIAL ARE RECEIVED - UPDATE MATERIAL RECEIVED STATUS AND DATE', centerX, instructionsY + 20, { align: 'center' });
  };

  const { CM, contentWidth, breakdownStartY } = drawHeader();
  let finalContentY = breakdownStartY;
  const signatureSectionHeight = 120;

  const doriHead = [['DORI TYPE', 'PLACEMENT', 'COLOUR', 'DORI COLOUR', 'QUANTITY', 'PRICE', 'TOTAL']];
  const doriBody = [];
  let totalDoriCost = 0;
  const doriTypeSummary = {};

  const colors = Object.keys(colorBreakdownObj).length > 0 ? Object.keys(colorBreakdownObj) : ['Default'];
  const placements = selectedPlacements.length > 0 ? selectedPlacements : ['Main'];

  placements.forEach(placement => {
    const placementQuantity = placementQuantities[placement] || 1;
    const doriType = placementZipTypes[placement] || 'Standard Dori';
    colors.forEach(color => {
      const qty = colorBreakdownObj[color] || totalPieces || 0;
      const doriColor = zipSelections[color] || color;
      const price = getDoriPrice(doriType, doriColor);
      const reqQty = qty * placementQuantity;
      const rowTotal = price * reqQty;
      totalDoriCost += rowTotal;

      if (!doriTypeSummary[doriType]) doriTypeSummary[doriType] = 0;
      doriTypeSummary[doriType] += reqQty;

      if (reqQty > 0 || placements.length === 1) {
        doriBody.push([
          doriType,
          `${placement} (${placementQuantity} per pc)`,
          color,
          doriColor,
          reqQty.toString(),
          price > 0 ? price.toFixed(2) : '-',
          rowTotal > 0 ? rowTotal.toFixed(2) : '-'
        ]);
      }
    });
  });

  const totalQuantityAll = doriBody.reduce((sum, r) => sum + (parseInt(r[4]) || 0), 0);
  const totalCostVal = parseFloat(row['Total Cost (₹)']) || totalDoriCost;

  const doriFoot = [
    ['', '', '', '', `T QTY: ${totalQuantityAll || totalPieces}`, 'Total:', totalCostVal > 0 ? totalCostVal.toFixed(2) : '-']
  ];

  let currentPage = 1;
  let pageCount = 1;

  autoTable(doc, {
    head: doriHead,
    body: doriBody,
    foot: doriFoot,
    startY: breakdownStartY,
    theme: 'grid',
    tableWidth: contentWidth,
    margin: { top: breakdownStartY, left: CM, right: CM, bottom: 50 },
    pageBreak: 'auto',
    styles: {
      font: 'helvetica',
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
      halign: 'right'
    },
    columnStyles: { 
      0: { cellWidth: 120, halign: 'left' },
      1: { cellWidth: 120, halign: 'left' },
      2: { cellWidth: 70, halign: 'center' },
      3: { cellWidth: 80, halign: 'center' },
      4: { cellWidth: 60, halign: 'center' },
      5: { cellWidth: 50, halign: 'center' },
      6: { cellWidth: 50, halign: 'right' }
    },
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

  const summaryData = Object.entries(doriTypeSummary).map(([doriType, totalQty]) => ({ doriType, totalQty }));
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
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('DORI TYPE SUMMARY', summaryBoxX + summaryBoxWidth/2, summaryBoxY + 20, { align: 'center' });
    doc.setLineWidth(0.8);
    doc.line(summaryBoxX + 10, summaryBoxY + 30, summaryBoxX + summaryBoxWidth - 10, summaryBoxY + 30);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);

    let summaryContentY = summaryBoxY + 50;
    summaryData.forEach((item, idx) => {
      const rowY = summaryContentY + (idx * 20);
      doc.text(`${item.doriType}:`, summaryBoxX + 20, rowY);
      doc.text(`${item.totalQty.toLocaleString()}`, summaryBoxX + summaryBoxWidth - 20, rowY, { align: 'right' });
    });

    const sumTotalQty = summaryData.reduce((s, it) => s + it.totalQty, 0);
    const totalY = summaryContentY + (summaryData.length * 20) + 10;
    doc.setLineWidth(0.8);
    doc.line(summaryBoxX + 10, totalY, summaryBoxX + summaryBoxWidth - 10, totalY);
    doc.setFont('helvetica', 'bold');
    doc.text('GRAND TOTAL OF DORI PCS:', summaryBoxX + 20, totalY + 18);
    doc.text(`${sumTotalQty.toLocaleString()}`, summaryBoxX + summaryBoxWidth - 20, totalY + 18, { align: 'right' });

    finalContentY = summaryBoxY + summaryBoxHeight + 20;

    const supplierQRSize = 80;
    const supplierQRX = CM + (contentWidth - supplierQRSize) / 2;
    const supplierQRY = finalContentY + 20;

    doc.rect(supplierQRX, supplierQRY, supplierQRSize, supplierQRSize);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    doc.text('SCAN FOR', supplierQRX + supplierQRSize/2, supplierQRY + 10, { align: 'center' });
    doc.text('SUPPLIER ENTRY', supplierQRX + supplierQRSize/2, supplierQRY + 20, { align: 'center' });

    if (qrCodes.supplierEntry.image) {
      doc.addImage(qrCodes.supplierEntry.image, 'PNG', supplierQRX + 10, supplierQRY + 25, supplierQRSize - 20, supplierQRSize - 35);
    }
  }

  drawFooterWithSignatures();
  drawSimpleFooter(currentPage, pageCount);

  const cleanLot = lotNumber.replace(/[^\w\-]+/g, '_');
  const cleanDate = printableDate(issueDate).replace(/\//g, '-');
  const filename = `Lot_${cleanLot}_Purchase_Order_${cleanDate || 'report'}.pdf`;

  return { doc, filename };
};

const DoriPurchaseDashboard = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    garmentType: '',
    supervisor: '',
    status: '',
    dateFrom: '',
    dateTo: '',
    zipPlacement: ''
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // PO Download & Preview State
  const [downloadingPoId, setDownloadingPoId] = useState(null);
  const [doriQualityRates, setDoriQualityRates] = useState([]);
  const [previewPoData, setPreviewPoData] = useState(null);
  const [showLotSearchModal, setShowLotSearchModal] = useState(false);
  const [lotSearchQuery, setLotSearchQuery] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');

  // Fetch data from Google Sheets
  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [sheetRes, doriRates] = await Promise.all([
        fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${PURCHASE_ORDERS_RANGE}?key=${API_KEY}`),
        fetchDoriQualityData()
      ]);

      if (!sheetRes.ok) {
        throw new Error(`Failed to fetch data: ${sheetRes.status}`);
      }

      const result = await sheetRes.json();
      const values = result.values;

      if (!values || values.length === 0) {
        throw new Error('No data found in the spreadsheet');
      }

      const headers = values[0];
      const rows = values.slice(1);

      const processedData = rows.map((row, index) => {
        const obj = { id: index + 1 };
        headers.forEach((header, colIndex) => {
          obj[header] = row[colIndex] || '';
        });

        obj.hasGateEntry = !!(obj['Gate Entry Person'] && obj['Gate Entry Date']);
        obj.hasMaterialReceived = !!(obj['Material Received By'] && obj['Material Received Date']);
        obj.hasSupplierEntry = !!(obj['Supplier Name'] && obj['Material Entry Date']);
        obj.aging = calculateAging(obj['Timestamp'], obj['Material Entry Date']);

        return obj;
      });

      setData(processedData);
      setDoriQualityRates(doriRates);

    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleBackButton = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = '/';
    }
  };

  // Direct Dori PO PDF Download
  const handleDownloadPo = async (row) => {
    if (!row || downloadingPoId) return;
    setDownloadingPoId(row.id);
    try {
      const { doc, filename } = await generateDoriPoPdf(row, doriQualityRates);
      doc.save(filename);
      setFeedbackMessage(`✅ Successfully downloaded Dori PO for Lot ${row['Lot Number'] || ''}`);
      setTimeout(() => setFeedbackMessage(''), 4000);
    } catch (err) {
      console.error('Error generating Dori PO PDF:', err);
      alert(`❌ Failed to generate Dori PO PDF: ${err.message}`);
    } finally {
      setDownloadingPoId(null);
    }
  };

  const handlePreviewPo = (row) => {
    setPreviewPoData(row);
  };

  const filterOptions = useMemo(() => {
    const garmentTypes = [...new Set(data.map(row => row['Garment Type']).filter(Boolean))];
    const supervisors = [...new Set(data.map(row => row['Supervisor']).filter(Boolean))];
    const allPlacements = data.flatMap(row => parsePlacements(row['Selected Placements'])).filter(Boolean);
    const zipPlacements = [...new Set(allPlacements)];
    return { garmentTypes, supervisors, zipPlacements };
  }, [data]);

  const filteredData = useMemo(() => {
    let result = data;

    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      result = result.filter(row =>
        Object.entries(row).some(([key, value]) =>
          key !== 'id' && String(value).toLowerCase().includes(searchLower)
        )
      );
    }

    if (filters.garmentType) {
      result = result.filter(row => row['Garment Type']?.toLowerCase().includes(filters.garmentType.toLowerCase()));
    }

    if (filters.supervisor) {
      result = result.filter(row => row['Supervisor']?.toLowerCase().includes(filters.supervisor.toLowerCase()));
    }

    if (filters.status) {
      switch (filters.status) {
        case 'with-gate-entry': result = result.filter(row => row.hasGateEntry); break;
        case 'with-material-received': result = result.filter(row => row.hasMaterialReceived); break;
        case 'with-supplier-entry': result = result.filter(row => row.hasSupplierEntry); break;
        case 'pending-gate-entry': result = result.filter(row => !row.hasGateEntry); break;
        case 'pending-material-received': result = result.filter(row => !row.hasMaterialReceived); break;
        case 'pending-supplier-entry': result = result.filter(row => !row.hasSupplierEntry); break;
        default: break;
      }
    }

    if (filters.dateFrom) {
      result = result.filter(row => new Date(row['Issue Date']) >= new Date(filters.dateFrom));
    }

    if (filters.dateTo) {
      result = result.filter(row => new Date(row['Issue Date']) <= new Date(filters.dateTo));
    }

    if (filters.zipPlacement) {
      result = result.filter(row => {
        const placements = parsePlacements(row['Selected Placements']);
        return placements.some(p => p.toLowerCase().includes(filters.zipPlacement.toLowerCase()));
      });
    }

    return result;
  }, [data, searchTerm, filters]);

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredData, currentPage, itemsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filters, itemsPerPage]);

  const stats = useMemo(() => {
    const total = filteredData.length;
    const totalPieces = filteredData.reduce((sum, row) => sum + (parseInt(row['Total Pieces']) || 0), 0);
    const totalCost = filteredData.reduce((sum, row) => sum + (parseFloat(row['Total Cost (₹)']) || 0), 0);
    const withGateEntry = filteredData.filter(row => row.hasGateEntry).length;
    const withMaterialReceived = filteredData.filter(row => row.hasMaterialReceived).length;
    const withSupplierEntry = filteredData.filter(row => row.hasSupplierEntry).length;

    const averageAging = filteredData.length > 0
      ? Math.round(filteredData.reduce((sum, row) => sum + (row.aging || 0), 0) / filteredData.length)
      : 0;

    return { total, totalPieces, totalCost, withGateEntry, withMaterialReceived, withSupplierEntry, averageAging };
  }, [filteredData]);

  const handleFilterChange = (filterName, value) => {
    setFilters(prev => ({ ...prev, [filterName]: value }));
  };

  const clearFilters = () => {
    setFilters({
      garmentType: '',
      supervisor: '',
      status: '',
      dateFrom: '',
      dateTo: '',
      zipPlacement: ''
    });
    setSearchTerm('');
  };

  const downloadExcel = () => {
    const headers = [
      'Sr. No.', 'Lot Number', 'Garment Type', 'Style', 'Fabric', 'Total Pieces',
      'Issue Date', 'Supervisor', 'Total Cost (₹)', 'Gate Entry Person', 'Gate Entry Date',
      'Material Received By', 'Material Received Date', 'Supplier Name', 'Material Entry Date', 'Aging (Days)'
    ];

    const csvData = filteredData.map((row, index) => [
      index + 1,
      row['Lot Number'] || '',
      row['Garment Type'] || '',
      row['Style'] || '',
      row['Fabric'] || '',
      row['Total Pieces'] || '',
      formatDate(row['Issue Date']),
      row['Supervisor'] || '',
      row['Total Cost (₹)'] || '',
      row['Gate Entry Person'] || '',
      formatDate(row['Gate Entry Date']),
      row['Material Received By'] || '',
      formatDate(row['Material Received Date']),
      row['Supplier Name'] || '',
      formatDate(row['Material Entry Date']),
      row.aging || 0
    ]);

    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `dori-purchase-orders-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadPDF = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a3' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 8;

    doc.setDrawColor(100, 100, 100);
    doc.setLineWidth(0.3);
    doc.rect(margin, margin, pageWidth - (2 * margin), pageHeight - (2 * margin));

    doc.setFillColor(255, 255, 255);
    doc.rect(margin, margin, pageWidth - (2 * margin), 18, 'F');
    doc.setFontSize(18);
    doc.setTextColor(0, 0, 128);
    doc.setFont('helvetica', 'bold');
    doc.text('DORI PURCHASE ORDERS REPORT', pageWidth / 2, margin + 10, { align: 'center' });

    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated on: ${new Date().toLocaleDateString('en-IN')}`, pageWidth / 2, margin + 16, { align: 'center' });

    const tableData = filteredData.map((row, index) => {
      const hasPendingDori = !row.hasSupplierEntry || !row.hasMaterialReceived;
      return [
        (index + 1).toString(),
        row['Lot Number'] || '-',
        row['Garment Type'] || '-',
        row['Style'] || '-',
        row['Fabric'] || '-',
        formatNumber(row['Total Pieces']),
        formatCurrency(row['Total Cost (₹)']).replace('₹', ''),
        formatDate(row['Issue Date']),
        row['Supervisor'] || '-',
        row.aging?.toString() || '0',
        hasPendingDori ? 'PENDING' : 'DONE'
      ];
    });

    autoTable(doc, {
      head: [['Sr.No.', 'Lot No.', 'Garment Type', 'Style', 'Fabric', 'Pieces', 'Cost', 'Issue Date', 'Supervisor', 'Aging (Days)', 'Status']],
      body: tableData,
      startY: margin + 25,
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 3, textColor: [0, 0, 0] },
      headStyles: { fillColor: [0, 0, 128], textColor: [255, 255, 255] }
    });

    doc.save(`dori-orders-summary-report-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const matchingLotOrders = useMemo(() => {
    if (!lotSearchQuery.trim()) return data.slice(0, 8);
    const q = lotSearchQuery.trim().toLowerCase();
    return data.filter(r => (r['Lot Number'] || '').toLowerCase().includes(q) || (r['Style'] || '').toLowerCase().includes(q));
  }, [data, lotSearchQuery]);

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p style={styles.loadingText}>Loading Dori Purchase Orders...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.errorContainer}>
        <h2 style={styles.errorTitle}>Error Loading Data</h2>
        <p style={styles.errorText}>{error}</p>
        <button onClick={fetchData} style={styles.retryButton}>Retry</button>
      </div>
    );
  }

  return (
    <div style={styles.dashboard}>
      {/* Feedback Toast */}
      {feedbackMessage && (
        <div style={styles.toast}>
          {feedbackMessage}
        </div>
      )}

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <button onClick={handleBackButton} style={styles.backButton} title="Go back">
            ← Back
          </button>
          <div style={styles.headerContent}>
            <h1 style={styles.title}>Dori Purchase Orders Dashboard</h1>
            <p style={styles.subtitle}>Manage, track and re-download all DORI material purchase orders</p>
          </div>
        </div>
        <div style={styles.headerActions}>
          <div style={styles.downloadButtons}>
            <button 
              onClick={() => setShowLotSearchModal(true)} 
              style={styles.redownloadHeaderBtn}
              title="Search lot to re-download DORI PO"
            >
              📥 Re-download PO
            </button>
            <button onClick={downloadPDF} style={styles.pdfButton}>
              📊 PDF Report
            </button>
            <button onClick={downloadExcel} style={styles.excelButton}>
              📈 Excel/CSV
            </button>
          </div>
          <button onClick={fetchData} style={styles.refreshButton}>
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.statIcon}>📋</div>
          <div style={styles.statContent}>
            <h3 style={styles.statNumber}>{stats.total}</h3>
            <p style={styles.statLabel}>Total Orders</p>
          </div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statIcon}>✅</div>
          <div style={styles.statContent}>
            <h3 style={styles.statNumber}>{stats.withGateEntry}</h3>
            <p style={styles.statLabel}>Gate Entry Done</p>
          </div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statIcon}>📦</div>
          <div style={styles.statContent}>
            <h3 style={styles.statNumber}>{stats.withMaterialReceived}</h3>
            <p style={styles.statLabel}>Material Received</p>
          </div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statIcon}>🏢</div>
          <div style={styles.statContent}>
            <h3 style={styles.statNumber}>{stats.withSupplierEntry}</h3>
            <p style={styles.statLabel}>Supplier Entry</p>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div style={styles.controlsSection}>
        <div style={styles.searchBox}>
          <input
            type="text"
            placeholder="Search across lot no, style, supervisor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={styles.searchInput}
          />
        </div>
        
        <div style={styles.filtersGrid}>
          <div style={styles.filterGroup}>
            <label style={styles.filterLabel}>Garment Type</label>
            <select
              value={filters.garmentType}
              onChange={(e) => handleFilterChange('garmentType', e.target.value)}
              style={styles.filterSelect}
            >
              <option value="">All Types</option>
              {filterOptions.garmentTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div style={styles.filterGroup}>
            <label style={styles.filterLabel}>Supervisor</label>
            <select
              value={filters.supervisor}
              onChange={(e) => handleFilterChange('supervisor', e.target.value)}
              style={styles.filterSelect}
            >
              <option value="">All Supervisors</option>
              {filterOptions.supervisors.map(supervisor => (
                <option key={supervisor} value={supervisor}>{supervisor}</option>
              ))}
            </select>
          </div>

          <div style={styles.filterGroup}>
            <label style={styles.filterLabel}>Status</label>
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              style={styles.filterSelect}
            >
              <option value="">All Status</option>
              <option value="with-gate-entry">With Gate Entry</option>
              <option value="pending-gate-entry">Pending Gate Entry</option>
              <option value="with-material-received">Material Received</option>
              <option value="pending-material-received">Pending Material</option>
              <option value="with-supplier-entry">With Supplier</option>
              <option value="pending-supplier-entry">Pending Supplier</option>
            </select>
          </div>

          <div style={styles.filterGroup}>
            <label style={styles.filterLabel}>Dori Placement</label>
            <select
              value={filters.zipPlacement}
              onChange={(e) => handleFilterChange('zipPlacement', e.target.value)}
              style={styles.filterSelect}
            >
              <option value="">All Placements</option>
              {filterOptions.zipPlacements.map(placement => (
                <option key={placement} value={placement}>{placement}</option>
              ))}
            </select>
          </div>

          <div style={styles.filterGroup}>
            <label style={styles.filterLabel}>Date From</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
              style={styles.filterInput}
            />
          </div>

          <div style={styles.filterGroup}>
            <label style={styles.filterLabel}>Date To</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => handleFilterChange('dateTo', e.target.value)}
              style={styles.filterInput}
            />
          </div>

          <div style={styles.filterGroup}>
            <label style={styles.filterLabel}>&nbsp;</label>
            <button onClick={clearFilters} style={styles.clearButton}>
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Pagination Controls - Top */}
      <div style={styles.paginationSection}>
        <div style={styles.paginationInfo}>
          Showing {filteredData.length > 0 ? ((currentPage - 1) * itemsPerPage) + 1 : 0} to {Math.min(currentPage * itemsPerPage, filteredData.length)} of {filteredData.length} entries
        </div>
        <div style={styles.paginationControls}>
          <button
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            style={{...styles.paginationButton, ...(currentPage === 1 ? styles.disabledButton : {})}}
          >
            Previous
          </button>
          <span style={styles.pageInfo}>
            Page {currentPage} of {Math.max(1, totalPages)}
          </span>
          <button
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages || totalPages === 0}
            style={{...styles.paginationButton, ...(currentPage === totalPages || totalPages === 0 ? styles.disabledButton : {})}}
          >
            Next
          </button>
          <select
            value={itemsPerPage}
            onChange={(e) => setItemsPerPage(Number(e.target.value))}
            style={styles.pageSizeSelect}
          >
            <option value={10}>10 per page</option>
            <option value={20}>20 per page</option>
            <option value={50}>50 per page</option>
            <option value={100}>100 per page</option>
          </select>
        </div>
      </div>

      {/* Data Table */}
      <div style={styles.tableContainer}>
        {filteredData.length === 0 ? (
          <div style={styles.noData}>
            <p style={styles.noDataText}>
              {data.length === 0 ? 'No purchase orders found' : 'No orders match your search/filters'}
            </p>
            {(searchTerm || Object.values(filters).some(f => f)) && (
              <button onClick={clearFilters} style={styles.clearSearchButton}>
                Clear Search & Filters
              </button>
            )}
          </div>
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.tableHeader}>Sr. No.</th>
                  <th style={{...styles.tableHeader, background: '#e0e7ff', color: '#1e3a8a'}}>Action / Download</th>
                  <th style={styles.tableHeader}>Lot No.</th>
                  <th style={styles.tableHeader}>Garment Type</th>
                  <th style={styles.tableHeader}>Style</th>
                  <th style={styles.tableHeader}>Pieces</th>
                  <th style={styles.tableHeader}>Cost</th>
                  <th style={styles.tableHeader}>Issue Date</th>
                  <th style={styles.tableHeader}>Supervisor</th>
                  <th style={styles.tableHeader}>Dori Placements</th>
                  <th style={styles.tableHeader}>Gate Entry</th>
                  <th style={styles.tableHeader}>Material Received</th>
                  <th style={styles.tableHeader}>Supplier</th>
                  <th style={styles.tableHeader}>Aging</th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.map((row, index) => {
                  const globalIndex = (currentPage - 1) * itemsPerPage + index;
                  const selectedPlacements = parsePlacements(row['Selected Placements']);
                  const isDownloading = downloadingPoId === row.id;

                  return (
                    <tr 
                      key={row.id} 
                      style={styles.tableRow}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
                    >
                      <td style={styles.srNoCell}>
                        <strong>{globalIndex + 1}</strong>
                      </td>

                      {/* ACTION COLUMN FOR REDOWNLOAD PO */}
                      <td style={styles.actionCell}>
                        <div style={styles.actionBtnGroup}>
                          <button
                            onClick={() => handleDownloadPo(row)}
                            disabled={isDownloading}
                            style={{
                              ...styles.downloadPoBtn,
                              ...(isDownloading ? styles.downloadPoBtnLoading : {})
                            }}
                            title="Re-download Dori Purchase Order PDF"
                          >
                            {isDownloading ? '⏳ Making PDF...' : '📥 Download PO'}
                          </button>
                          <button
                            onClick={() => handlePreviewPo(row)}
                            style={styles.previewPoBtn}
                            title="Preview PO Details & Print"
                          >
                            👁️ View
                          </button>
                        </div>
                      </td>

                      <td style={styles.tableCell}>
                        <strong style={styles.lotNumber}>{row['Lot Number']}</strong>
                      </td>
                      <td style={styles.tableCell}>
                        <div style={styles.garmentInfo}>
                          <div style={styles.garmentType}>{row['Garment Type']}</div>
                          {row['Fabric'] && <div style={styles.fabric}>{row['Fabric']}</div>}
                        </div>
                      </td>
                      <td style={styles.tableCell}>{row['Style']}</td>
                      <td style={styles.tableCell}>
                        <strong>{formatNumber(row['Total Pieces'])}</strong>
                      </td>
                      <td style={styles.tableCell}>
                        <strong style={styles.cost}>{formatCurrency(row['Total Cost (₹)'])}</strong>
                      </td>
                      <td style={styles.tableCell}>{formatDate(row['Issue Date'])}</td>
                      <td style={styles.tableCell}>{row['Supervisor']}</td>
                      <td style={styles.tableCell}>
                        <div style={styles.zipInfo}>
                          {selectedPlacements.map((placement, pIdx) => (
                            <div key={pIdx} style={styles.placement}>
                              {placement}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td style={styles.tableCell}>
                        <div style={styles.statusCell}>
                          {row.hasGateEntry ? (
                            <div style={styles.statusSuccess}>
                              <div>✅ Done</div>
                              <div style={styles.smallText}>{row['Gate Entry Person']}</div>
                              <div style={styles.smallText}>{formatDate(row['Gate Entry Date'])}</div>
                            </div>
                          ) : (
                            <div style={styles.statusPending}>⏳ Pending</div>
                          )}
                        </div>
                      </td>
                      <td style={styles.tableCell}>
                        <div style={styles.statusCell}>
                          {row.hasMaterialReceived ? (
                            <div style={styles.statusSuccess}>
                              <div>✅ Received</div>
                              <div style={styles.smallText}>{row['Material Received By']}</div>
                              <div style={styles.smallText}>{formatDate(row['Material Received Date'])}</div>
                            </div>
                          ) : (
                            <div style={styles.statusPending}>⏳ Pending</div>
                          )}
                        </div>
                      </td>
                      <td style={styles.tableCell}>
                        <div style={styles.statusCell}>
                          {row.hasSupplierEntry ? (
                            <div style={styles.statusSuccess}>
                              <div>✅ Entered</div>
                              <div style={styles.smallText}>{row['Supplier Name']}</div>
                              <div style={styles.smallText}>{formatDate(row['Material Entry Date'])}</div>
                            </div>
                          ) : (
                            <div style={styles.statusPending}>⏳ Pending</div>
                          )}
                        </div>
                      </td>
                      <td style={styles.tableCell}>
                        <div 
                          style={{
                            ...styles.agingBadge,
                            backgroundColor: getAgingColor(row.aging),
                            color: '#ffffff',
                            fontWeight: '600'
                          }}
                        >
                          {row.aging} days
                        </div>
                        <div style={styles.smallText}>
                          {row.hasSupplierEntry ? 'Completed' : 'In Progress'}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination Controls - Bottom */}
      {filteredData.length > 0 && (
        <div style={styles.paginationSection}>
          <div style={styles.paginationInfo}>
            Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredData.length)} of {filteredData.length} entries
          </div>
          <div style={styles.paginationControls}>
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              style={{...styles.paginationButton, ...(currentPage === 1 ? styles.disabledButton : {})}}
            >
              Previous
            </button>
            <span style={styles.pageInfo}>
              Page {currentPage} of {Math.max(1, totalPages)}
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages || totalPages === 0}
              style={{...styles.paginationButton, ...(currentPage === totalPages || totalPages === 0 ? styles.disabledButton : {})}}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* LOT SEARCH MODAL FOR QUICK REDOWNLOAD */}
      {showLotSearchModal && (
        <div style={styles.modalOverlay} onClick={() => setShowLotSearchModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>🔍 Quick Search & Re-download Dori PO</h2>
              <button onClick={() => setShowLotSearchModal(false)} style={styles.modalCloseBtn}>✕</button>
            </div>
            <div style={styles.modalBody}>
              <input
                type="text"
                placeholder="Type Lot Number or Style..."
                value={lotSearchQuery}
                onChange={e => setLotSearchQuery(e.target.value)}
                style={styles.modalSearchInput}
                autoFocus
              />
              <div style={styles.modalListContainer}>
                {matchingLotOrders.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#64748b', padding: '20px' }}>No matching orders found.</p>
                ) : (
                  matchingLotOrders.map(ord => (
                    <div key={ord.id} style={styles.lotResultCard}>
                      <div>
                        <strong style={{ fontSize: '15px', color: '#0369a1' }}>Lot #{ord['Lot Number']}</strong>
                        <div style={{ fontSize: '13px', color: '#475569', marginTop: '2px' }}>
                          {ord['Garment Type']} • {ord['Style']} • {formatNumber(ord['Total Pieces'])} pcs
                        </div>
                        <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                          Date: {formatDate(ord['Issue Date'])} | Sup: {ord['Supervisor']}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => handleDownloadPo(ord)}
                          style={styles.downloadPoBtn}
                        >
                          📥 Download PO
                        </button>
                        <button
                          onClick={() => {
                            setShowLotSearchModal(false);
                            handlePreviewPo(ord);
                          }}
                          style={styles.previewPoBtn}
                        >
                          👁️ View
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PO PREVIEW MODAL */}
      {previewPoData && (
        <div style={styles.modalOverlay} onClick={() => setPreviewPoData(null)}>
          <div style={{...styles.modalContent, maxWidth: '800px'}} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>📄 Dori Purchase Order Preview: Lot #{previewPoData['Lot Number']}</h2>
              <button onClick={() => setPreviewPoData(null)} style={styles.modalCloseBtn}>✕</button>
            </div>
            <div style={styles.modalBody}>
              <div style={styles.previewInfoGrid}>
                <div style={styles.previewInfoBox}>
                  <div style={styles.previewLabel}>Lot Number</div>
                  <div style={styles.previewVal}>{previewPoData['Lot Number']}</div>
                </div>
                <div style={styles.previewInfoBox}>
                  <div style={styles.previewLabel}>Issue Date</div>
                  <div style={styles.previewVal}>{formatDate(previewPoData['Issue Date'])}</div>
                </div>
                <div style={styles.previewInfoBox}>
                  <div style={styles.previewLabel}>Garment & Style</div>
                  <div style={styles.previewVal}>{previewPoData['Garment Type']} - {previewPoData['Style']}</div>
                </div>
                <div style={styles.previewInfoBox}>
                  <div style={styles.previewLabel}>Supervisor</div>
                  <div style={styles.previewVal}>{previewPoData['Supervisor']}</div>
                </div>
                <div style={styles.previewInfoBox}>
                  <div style={styles.previewLabel}>Total Pieces</div>
                  <div style={styles.previewVal}>{formatNumber(previewPoData['Total Pieces'])}</div>
                </div>
                <div style={styles.previewInfoBox}>
                  <div style={styles.previewLabel}>Total Cost</div>
                  <div style={{...styles.previewVal, color: '#059669', fontWeight: 'bold'}}>
                    {formatCurrency(previewPoData['Total Cost (₹)'])}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '20px' }}>
                <h4 style={{ color: '#0369a1', marginBottom: '8px' }}>Dori Placements & Specifications:</h4>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {parsePlacements(previewPoData['Selected Placements']).map((pl, i) => (
                    <span key={i} style={styles.placementBadge}>{pl}</span>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: '20px' }}>
                <h4 style={{ color: '#0369a1', marginBottom: '8px' }}>Color Breakdown:</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
                  {Object.entries(parseColorBreakdown(previewPoData['Color Breakdown'])).map(([c, q], i) => (
                    <div key={i} style={{ padding: '8px', background: '#f1f5f9', borderRadius: '8px', fontSize: '13px' }}>
                      <strong>{c}:</strong> {q} pcs
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={styles.modalFooter}>
              <button onClick={() => setPreviewPoData(null)} style={styles.modalCancelBtn}>Close</button>
              <button 
                onClick={() => {
                  handleDownloadPo(previewPoData);
                  setPreviewPoData(null);
                }} 
                style={styles.modalActionDownloadBtn}
              >
                📥 Download Full Dori PO PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Animation Styles */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

// Complete modern styles
const styles = {
  dashboard: {
    padding: '24px',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    backgroundColor: '#f8fafc',
    minHeight: '100vh',
    color: '#1e293b',
  },
  toast: {
    position: 'fixed',
    top: '20px',
    right: '20px',
    backgroundColor: '#059669',
    color: '#ffffff',
    padding: '12px 24px',
    borderRadius: '10px',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
    zIndex: 9999,
    fontSize: '14px',
    fontWeight: '600',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '24px',
    backgroundColor: '#ffffff',
    padding: '24px 32px',
    borderRadius: '16px',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.08)',
    border: '1px solid #e2e8f0',
    flexWrap: 'wrap',
    gap: '16px'
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    flex: 1,
    minWidth: '280px'
  },
  backButton: {
    padding: '10px 18px',
    backgroundColor: '#475569',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    transition: 'all 0.2s ease',
  },
  headerContent: {
    flex: 1,
  },
  title: {
    fontSize: '22px',
    fontWeight: '700',
    color: '#0f172a',
    margin: '0 0 4px 0',
  },
  subtitle: {
    fontSize: '13px',
    color: '#64748b',
    margin: 0,
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap'
  },
  downloadButtons: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap'
  },
  redownloadHeaderBtn: {
    padding: '10px 18px',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    boxShadow: '0 2px 4px rgba(2, 132, 199, 0.2)',
    transition: 'all 0.2s ease',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px'
  },
  pdfButton: {
    padding: '10px 16px',
    backgroundColor: '#4f46e5',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
  },
  excelButton: {
    padding: '10px 16px',
    backgroundColor: '#059669',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
  },
  refreshButton: {
    padding: '10px 16px',
    backgroundColor: '#ffffff',
    color: '#334155',
    border: '1px solid #cbd5e1',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '24px',
  },
  statCard: {
    display: 'flex',
    alignItems: 'center',
    padding: '18px 20px',
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    border: '1px solid #e2e8f0',
    gap: '16px',
  },
  statIcon: {
    fontSize: '28px',
  },
  statContent: {
    flex: 1,
  },
  statNumber: {
    fontSize: '22px',
    fontWeight: '700',
    color: '#0f172a',
    margin: '0 0 2px 0',
  },
  statLabel: {
    fontSize: '12px',
    color: '#64748b',
    margin: 0,
    fontWeight: '500'
  },
  controlsSection: {
    backgroundColor: '#ffffff',
    padding: '20px 24px',
    borderRadius: '12px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    border: '1px solid #e2e8f0',
    marginBottom: '20px',
  },
  searchBox: {
    marginBottom: '16px',
  },
  searchInput: {
    width: '100%',
    padding: '12px 16px',
    border: '1.5px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '14px',
    color: '#1e293b',
    outline: 'none',
    boxSizing: 'border-box'
  },
  filtersGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: '12px',
    alignItems: 'flex-end',
  },
  filterGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  filterLabel: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#475569',
    textTransform: 'uppercase',
  },
  filterSelect: {
    padding: '9px 12px',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    fontSize: '13px',
    backgroundColor: '#ffffff',
    color: '#1e293b',
    outline: 'none',
  },
  filterInput: {
    padding: '8px 12px',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    fontSize: '13px',
    color: '#1e293b',
    outline: 'none',
  },
  clearButton: {
    padding: '9px 14px',
    backgroundColor: '#e2e8f0',
    color: '#475569',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '600',
  },
  paginationSection: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
    flexWrap: 'wrap',
    gap: '12px',
  },
  paginationInfo: {
    fontSize: '13px',
    color: '#64748b',
  },
  paginationControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  paginationButton: {
    padding: '7px 14px',
    backgroundColor: '#ffffff',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '500',
  },
  disabledButton: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  pageInfo: {
    fontSize: '13px',
    color: '#475569',
  },
  pageSizeSelect: {
    padding: '6px 10px',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    fontSize: '12px',
    backgroundColor: '#ffffff',
  },
  tableContainer: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    border: '1px solid #e2e8f0',
    overflow: 'hidden',
    marginBottom: '20px',
  },
  tableWrapper: {
    overflowX: 'auto',
    maxHeight: '650px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
    textAlign: 'left',
  },
  tableHeader: {
    backgroundColor: '#f1f5f9',
    padding: '12px 14px',
    fontSize: '11px',
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    borderBottom: '2px solid #e2e8f0',
    position: 'sticky',
    top: 0,
    zIndex: 1,
    whiteSpace: 'nowrap'
  },
  tableRow: {
    borderBottom: '1px solid #f1f5f9',
    transition: 'background-color 0.15s ease',
  },
  srNoCell: {
    padding: '14px 12px',
    textAlign: 'center',
    color: '#64748b',
    backgroundColor: '#f8fafc',
    fontSize: '12px',
  },
  actionCell: {
    padding: '10px 12px',
    whiteSpace: 'nowrap',
    backgroundColor: '#fdfdfe',
    borderRight: '1px solid #e2e8f0'
  },
  actionBtnGroup: {
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
  },
  downloadPoBtn: {
    padding: '7px 12px',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '600',
    transition: 'all 0.2s ease',
    whiteSpace: 'nowrap',
    boxShadow: '0 1px 3px rgba(2, 132, 199, 0.2)'
  },
  downloadPoBtnLoading: {
    backgroundColor: '#7dd3fc',
    cursor: 'wait'
  },
  previewPoBtn: {
    padding: '7px 10px',
    backgroundColor: '#f1f5f9',
    color: '#334155',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '500',
    transition: 'all 0.2s ease',
  },
  tableCell: {
    padding: '14px 12px',
    color: '#1e293b',
    borderBottom: '1px solid #f1f5f9',
    whiteSpace: 'nowrap',
  },
  lotNumber: {
    color: '#0369a1',
    fontSize: '14px',
    fontWeight: '700',
  },
  garmentInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  garmentType: {
    fontWeight: '600',
    color: '#0f172a',
  },
  fabric: {
    fontSize: '11px',
    color: '#64748b',
  },
  cost: {
    color: '#059669',
    fontWeight: '600',
  },
  zipInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    maxWidth: '180px',
  },
  placement: {
    fontSize: '11px',
    backgroundColor: '#e0f2fe',
    padding: '3px 6px',
    borderRadius: '4px',
    color: '#0369a1',
  },
  placementBadge: {
    padding: '6px 12px',
    backgroundColor: '#e0f2fe',
    color: '#0369a1',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '500',
    border: '1px solid #bae6fd'
  },
  statusCell: {
    display: 'flex',
    flexDirection: 'column',
  },
  statusSuccess: {
    color: '#059669',
    fontWeight: '600',
    fontSize: '12px',
  },
  statusPending: {
    color: '#d97706',
    fontWeight: '500',
    fontSize: '12px',
  },
  smallText: {
    fontSize: '10px',
    color: '#64748b',
    marginTop: '1px',
  },
  agingBadge: {
    padding: '4px 10px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: '600',
    textAlign: 'center',
    display: 'inline-block',
  },
  noData: {
    padding: '48px 20px',
    textAlign: 'center',
    color: '#64748b',
  },
  noDataText: {
    fontSize: '15px',
    marginBottom: '12px',
  },
  clearSearchButton: {
    padding: '8px 16px',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '60vh',
    color: '#64748b',
  },
  spinner: {
    border: '4px solid #e2e8f0',
    borderTop: '4px solid #0284c7',
    borderRadius: '50%',
    width: '36px',
    height: '36px',
    animation: 'spin 0.8s linear infinite',
    marginBottom: '12px',
  },
  loadingText: {
    fontSize: '14px',
    fontWeight: '500',
  },
  errorContainer: {
    textAlign: 'center',
    padding: '60px 20px',
    color: '#6b7280',
  },
  errorTitle: {
    color: '#dc2626',
    marginBottom: '8px',
    fontSize: '18px',
  },
  errorText: {
    marginBottom: '16px',
    fontSize: '14px',
  },
  retryButton: {
    padding: '10px 20px',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: '20px',
    backdropFilter: 'blur(4px)'
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    width: '100%',
    maxWidth: '650px',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    display: 'flex',
    flexDirection: 'column',
  },
  modalHeader: {
    padding: '20px 24px',
    borderBottom: '1px solid #e2e8f0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#0f172a',
    margin: 0,
  },
  modalCloseBtn: {
    background: 'none',
    border: 'none',
    fontSize: '20px',
    cursor: 'pointer',
    color: '#64748b',
  },
  modalBody: {
    padding: '24px',
  },
  modalFooter: {
    padding: '16px 24px',
    borderTop: '1px solid #e2e8f0',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    backgroundColor: '#f8fafc',
    borderRadius: '0 0 16px 16px',
  },
  modalSearchInput: {
    width: '100%',
    padding: '12px 16px',
    border: '1.5px solid #cbd5e1',
    borderRadius: '8px',
    fontSize: '14px',
    boxSizing: 'border-box',
    marginBottom: '16px',
    outline: 'none',
  },
  modalListContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    maxHeight: '360px',
    overflowY: 'auto',
  },
  lotResultCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    backgroundColor: '#f8fafc',
    borderRadius: '10px',
    border: '1px solid #e2e8f0',
  },
  previewInfoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '14px',
  },
  previewInfoBox: {
    padding: '12px',
    backgroundColor: '#f8fafc',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
  },
  previewLabel: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    marginBottom: '4px',
  },
  previewVal: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#0f172a',
  },
  modalCancelBtn: {
    padding: '10px 18px',
    backgroundColor: '#ffffff',
    border: '1px solid #cbd5e1',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    color: '#475569',
  },
  modalActionDownloadBtn: {
    padding: '10px 20px',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
  }
};

export default DoriPurchaseDashboard;