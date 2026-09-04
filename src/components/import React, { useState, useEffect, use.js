import React, { useState, useEffect, useMemo, useRef } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';

import {
  WEB_APP_URL_LEGACY_RGP,
  SHEET_ID_ZIP_RGP,
  GOOGLE_API_KEY
} from '../config/apiConfig';

// QR System Configuration
const QR_SYSTEM_URL = WEB_APP_URL_LEGACY_RGP;

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
      gateEntry: {
        url: gateEntryQRUrl,
        image: gateQRImage
      },
      materialIn: {
        url: materialInQRUrl,
        image: materialQRImage
      },
      supplierEntry: {
        url: supplierQRUrl,
        image: supplierQRImage
      }
    };
  } catch (error) {
    console.error('Error generating QR codes:', error);
    return null;
  }
};

// Helper function to parse JSON safely
const safeJSONParse = (str, defaultValue = {}) => {
  try {
    return JSON.parse(str);
  } catch {
    return defaultValue;
  }
};

// PDF Generation Function for Approved POs with QR Codes
const generateApprovedPOPDF = async (row) => {
  const line = 0.9;

function printableDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return String(d);
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yyyy = dt.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function printableDateTime(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return String(d);
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yyyy = dt.getFullYear();
  const hh = String(dt.getHours()).padStart(2, '0');
  const min = String(dt.getMinutes()).padStart(2, '0');
  const ss = String(dt.getSeconds()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;
}

// Add this function for time-only formatting
function printableTime(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return String(d);
  const hh = String(dt.getHours()).padStart(2, '0');
  const min = String(dt.getMinutes()).padStart(2, '0');
  const ss = String(dt.getSeconds()).padStart(2, '0');
  return `${hh}:${min}:${ss}`;
}

  function cleanString(v) {
    return (v || '').toString().trim();
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

  // Generate QR codes
  const qrCodes = await generateSimpleQR(row['Lot Number']);

  const doc = new jsPDF({ unit: 'pt', format: 'A4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  const M = 18;
  const borderPad = 6;
  doc.setDrawColor(0); doc.setTextColor(0); doc.setLineWidth(line);
  const borderX = 8, borderY = 8, borderW = W - 16, borderH = H - 16;

  // Function to draw header (reusable for multiple pages)
  const drawHeader = () => {
    // Draw outer border
    doc.rect(borderX, borderY, borderW, borderH);

    const CM = M + borderPad;
    const contentWidth = W - (CM * 2);

    // --- Simple QR Codes in Boxes ---
    const boxY = borderY + 20; 
    const boxSize = 80; 
    const centerPoint = borderX + borderW / 2;

    // Box 1 - GATE ENTRY QR
    const box1X = CM; 
    doc.rect(box1X, boxY, boxSize, boxSize);

    doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    doc.text('SCAN FOR', box1X + boxSize/2, boxY + 10, { align: 'center' });
    doc.text('GATE ENTRY', box1X + boxSize/2, boxY + 20, { align: 'center' });
    
    if (qrCodes && qrCodes.gateEntry.image) {
      doc.addImage(qrCodes.gateEntry.image, 'PNG', box1X + 10, boxY + 25, boxSize - 20, boxSize - 35);
    } else {
      // Fallback placeholder
      doc.rect(box1X + 10, boxY + 25, boxSize - 20, boxSize - 35);
      doc.setFontSize(6);
      doc.text('QR CODE', box1X + boxSize/2, boxY + boxSize/2 + 5, { align: 'center' });
      doc.text('GATE ENTRY', box1X + boxSize/2, boxY + boxSize/2 + 15, { align: 'center' });
    }

    // Box 2 - MATERIAL IN QR
    const box2X = CM + contentWidth - boxSize;
    doc.rect(box2X, boxY, boxSize, boxSize);

    doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    doc.text('SCAN FOR', box2X + boxSize/2, boxY + 10, { align: 'center' });
    doc.text('MATERIAL IN', box2X + boxSize/2, boxY + 20, { align: 'center' });
    
    if (qrCodes && qrCodes.materialIn.image) {
      doc.addImage(qrCodes.materialIn.image, 'PNG', box2X + 10, boxY + 25, boxSize - 20, boxSize - 35);
    } else {
      // Fallback placeholder
      doc.rect(box2X + 10, boxY + 25, boxSize - 20, boxSize - 35);
      doc.setFontSize(6);
      doc.text('QR CODE', box2X + boxSize/2, boxY + boxSize/2 + 5, { align: 'center' });
      doc.text('MATERIAL IN', box2X + boxSize/2, boxY + boxSize/2 + 15, { align: 'center' });
    }

    const headerTitleY = boxY + 20; 
    
    doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
    doc.text('PURCHASE ORDER', centerPoint, headerTitleY, { align: 'center' });
    
    doc.setFontSize(14);
    doc.text('ZIPPER MATERIAL REQUIREMENT', centerPoint, headerTitleY + 20, { align: 'center' }); 

    const lotNumberText = cleanString(row['Lot Number'] || 'LOT NO. UNKNOWN');
    doc.setFont('helvetica', 'bold'); 
    doc.setFontSize(18);
    doc.text(`LOT NO: ${lotNumberText}`, centerPoint, headerTitleY + 45, { align: 'center' });

    // Rest of your existing PDF content...
    const fieldsY = boxY + boxSize + 15;
    const fieldH = 20;
    
    // Line 1: DATE, ITEM
    const dateItemW = (contentWidth / 2) - 1;
    const dateItemX = CM;
    
    doc.rect(dateItemX, fieldsY, dateItemW, fieldH);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('DATE :', dateItemX + 4, fieldsY + 12);
    doc.setFont('helvetica', 'normal');
    doc.text(printableDate(row['Issue Date']), dateItemX + 35, fieldsY + 12);

    doc.rect(dateItemX + dateItemW, fieldsY, dateItemW, fieldH);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('ITEM :', dateItemX + dateItemW + 4, fieldsY + 12);
    doc.setFont('helvetica', 'normal');
    doc.text(cleanString(row['Garment Type'] || row['Style'] || ''), dateItemX + dateItemW + 35, fieldsY + 12);

    // Line 2: TOTAL PCS, PRIORITY
    const pcsPriorityX = CM;
    
    doc.rect(pcsPriorityX, fieldsY + fieldH, dateItemW, fieldH);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('TOTAL PCS', pcsPriorityX + 4, fieldsY + fieldH + 12);
    doc.setFont('helvetica', 'normal');
    const totalPcs = cleanString(row['Total Pieces'] || '');
    doc.text(totalPcs, pcsPriorityX + 60, fieldsY + fieldH + 12);

    doc.rect(pcsPriorityX + dateItemW, fieldsY + fieldH, dateItemW, fieldH);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('PRIORITY', pcsPriorityX + dateItemW + 4, fieldsY + fieldH + 12);
    doc.setFont('helvetica', 'normal');
    doc.text(row['Priority'] || 'Medium', pcsPriorityX + dateItemW + 50, fieldsY + fieldH + 12);

    // Line 3: LOT NO., SUPERVISOR
    const lotSupervisorX = CM;

    doc.rect(lotSupervisorX, fieldsY + (fieldH * 2), dateItemW, fieldH);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('LOT NO.', lotSupervisorX + 4, fieldsY + (fieldH * 2) + 12);
    doc.setFont('helvetica', 'normal');
    doc.text(cleanString(row['Lot Number'] || ''), lotSupervisorX + 45, fieldsY + (fieldH * 2) + 12);

    doc.rect(lotSupervisorX + dateItemW, fieldsY + (fieldH * 2), dateItemW, fieldH);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('SUPERVISOR : ', lotSupervisorX + dateItemW + 4, fieldsY + (fieldH * 2) + 12);
    doc.setFont('helvetica', 'normal');
    doc.text(cleanString(row['Supervisor'] ?? '________'), lotSupervisorX + dateItemW + 65, fieldsY + (fieldH * 2) + 12);

    const dividingLineY = fieldsY + (fieldH * 3) + 5;
    doc.setLineWidth(1.5);
    doc.setDrawColor(0);
    doc.line(CM, dividingLineY, CM + contentWidth, dividingLineY);
    doc.setLineWidth(line);

    return {
      CM,
      contentWidth,
      breakdownStartY: dividingLineY + 15
    };
  };

  // Function to draw footer with signatures and QR instructions (only on last page)
  const drawFooterWithSignatures = (currentPage, pageCount) => {
    const CM = M + borderPad;
    const contentWidth = W - (CM * 2);
    
    // Define signature section height
    const signatureSectionHeight = 120;
    
    // ALWAYS position signature section at the bottom (only on last page)
    const signatureSectionY = H - signatureSectionHeight;

    // Signature boxes
    const signatureBoxWidth = 160;
    const signatureBoxHeight = 50;
    const signatureSpacing = (contentWidth - (signatureBoxWidth * 3)) / 2;
    const boxPad = 5; 

    doc.setLineWidth(line);
    doc.setDrawColor(0);
    doc.setTextColor(0);

    const drawSignatureBox = (x, label) => {
      doc.rect(x, signatureSectionY, signatureBoxWidth, signatureBoxHeight);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
      doc.text(label, x + boxPad, signatureSectionY + 10);
      
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      doc.text('NAME:', x + boxPad, signatureSectionY + 28);
      doc.line(x + 35, signatureSectionY + 28, x + signatureBoxWidth - boxPad, signatureSectionY + 28); 
      
      doc.text('DATE:', x + boxPad, signatureSectionY + 43);
      doc.line(x + 35, signatureSectionY + 43, x + signatureBoxWidth - boxPad, signatureSectionY + 43); 
    };

    const supervisorBoxX = CM;
    drawSignatureBox(supervisorBoxX, 'SUPERVISOR SIGN');

    const supplierBoxX = supervisorBoxX + signatureBoxWidth + signatureSpacing;
    drawSignatureBox(supplierBoxX, 'SUPPLIER SIGN');

    const receiverBoxX = supplierBoxX + signatureBoxWidth + signatureSpacing;
    drawSignatureBox(receiverBoxX, 'RECEIVER SIGN');

    // Pending Lot Zip Box - placed above the receiver sign
    const pendingBoxWidth = 160;
    const pendingBoxHeight = 30;
    const pendingBoxX = receiverBoxX;
    const pendingBoxY = signatureSectionY - 40; // Position above receiver sign

    // Draw Pending Lot Zip box
    doc.setDrawColor(0);
    doc.setLineWidth(line);
    doc.rect(pendingBoxX, pendingBoxY, pendingBoxWidth, pendingBoxHeight);
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('PENDING LOT ZIP', pendingBoxX + pendingBoxWidth/2, pendingBoxY + 12, { align: 'center' });
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Zip Counts:', pendingBoxX + 10, pendingBoxY + 25);
    doc.line(pendingBoxX + 45, pendingBoxY + 25, pendingBoxX + pendingBoxWidth - 10, pendingBoxY + 25);

    // QR code usage instructions - ALWAYS below signature boxes
    const instructionsY = signatureSectionY + signatureBoxHeight + 20;

    // Center point for the content area
    const centerX = CM + contentWidth / 2;

    // Title - centered and bold
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('QR CODE USAGE INSTRUCTIONS:', centerX, instructionsY, { align: 'center' });
    
    // Instructions - centered with bullet points
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('• LEFT QR: Scan when material enters the gate - updates Gate Entry Person & Date', centerX, instructionsY + 12, { align: 'center' });
    doc.text('• RIGHT QR: Scan when material is received - updates Material Received status & Date', centerX, instructionsY + 24, { align: 'center' });

    // Page number for last page
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Page ${currentPage} of ${pageCount}`, W / 2, H - 10, { align: 'center' });
  };

  // Function to draw simple footer with page number (for all pages except last)
  const drawSimpleFooter = (currentPage, pageCount) => {
    // Page number
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Page ${currentPage} of ${pageCount}`, W / 2, H - 10, { align: 'center' });
  };

  // Function to check if we need a new page
  const checkNewPage = (requiredHeight, currentY) => {
    const signatureSectionHeight = 120;
    const minBottomMargin = 50;
    const availableHeight = H - currentY - signatureSectionHeight - minBottomMargin;
    
    if (requiredHeight > availableHeight) {
      doc.addPage();
      drawHeader();
      return breakdownStartY;
    }
    return currentY;
  };

  // Draw first page header
  const { CM, contentWidth, breakdownStartY } = drawHeader();
  
  let finalContentY = breakdownStartY;
  
  // Define signature section height early so we can calculate available space
  const signatureSectionHeight = 120;
  
  // Calculate available space for content
  const maxContentHeight = H - signatureSectionHeight - 50;

  // Variables for summary data
  let summaryData = [];
  let totalZipCost = 0;
  let currentPage = 1;
  let pageCount = 1;
  
  // Parse data from the row
  const zipSelections = safeJSONParse(row['Zip Selections']);
  const selectedPlacements = safeJSONParse(row['Selected Placements'], []);
  const placementQuantities = safeJSONParse(row['Placement Quantities']);
  const placementZipTypes = safeJSONParse(row['Placement Zip Types']);
  
  // Parse color breakdown
  const colorBreakdown = {};
  if (row['Color Breakdown']) {
    try {
      row['Color Breakdown'].split(';').forEach(item => {
        const [color, pieces] = item.split(':').map(s => s.trim());
        if (color && pieces) {
          const piecesNum = parseInt(pieces.replace('pcs', '')) || 0;
          colorBreakdown[color] = piecesNum;
        }
      });
    } catch (error) {
      console.error('Error parsing color breakdown:', error);
    }
  }

  if (selectedPlacements.length > 0 && zipSelections) {
    const zipHead = [['ZIP TYPE', 'PLACEMENT', 'COLOUR', 'ZIP COLOUR', 'QUANTITY', 'PRICE', 'TOTAL']];
    
    const zipBody = [];
    totalZipCost = 0;

    // Create a map to aggregate quantities by zip type
    const zipTypeSummary = {};

    selectedPlacements.forEach(placement => {
      const placementQuantity = placementQuantities[placement] || 1;
      const zipType = placementZipTypes[placement];
      
      if (zipType) {
        Object.entries(colorBreakdown).forEach(([color, quantity]) => {
          const zipColor = zipSelections[color];
          if (zipColor) {
            // For demo, using fixed price since we don't have zipQualityData in dashboard
            const price = 20; // Default price, you can adjust this
            const requiredQuantity = quantity * placementQuantity; 
            const rowTotal = price * requiredQuantity;
            totalZipCost += rowTotal;

            // Aggregate for summary
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

    // Convert summary map to array for display
    summaryData = Object.entries(zipTypeSummary).map(([zipType, totalQuantity]) => ({
      zipType,
      totalQuantity
    }));

    if (zipBody.length > 0) {
      const zipFoot = [[ 
        '', '', '', '', '', 'Total:', 
        formatPlainNumber(totalZipCost)
      ]];

      const zipColStyles = { 
        0: { cellWidth: 120, halign: 'left' },
        1: { cellWidth: 120, halign: 'left' },
        2: { cellWidth: 70, halign: 'center' },
        3: { cellWidth: 80, halign: 'center' },
        4: { cellWidth: 60, halign: 'center' },
        5: { cellWidth: 50, halign: 'center' },
        6: { cellWidth: 50, halign: 'right' }
      };

      // Use autoTable with custom didDrawPage to handle multiple pages
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
        columnStyles: zipColStyles,
        didDrawPage: function(data) {
          // Update current page for footer
          currentPage = data.pageNumber;
          pageCount = data.pageCount;
          
          // Draw simple footer for all pages except last
          if (currentPage < pageCount) {
            drawSimpleFooter(currentPage, pageCount);
          }
          
          // If this is not the first page, draw header
          if (data.pageNumber > 1) {
            drawHeader();
            // Add simple footer for intermediate pages
            drawSimpleFooter(currentPage, pageCount);
          }
        }
      });

      finalContentY = doc.lastAutoTable.finalY + 20;

      // Draw summary box below the table
      if (summaryData.length > 0) {
        const summaryBoxWidth = contentWidth;
        const summaryBoxHeight = Math.max(80, summaryData.length * 20 + 50);
        const supplierQRSize = 80;
        const totalRequiredHeight = summaryBoxHeight + supplierQRSize + 60; // Total space needed for summary + QR + spacing

        // Check if we need a new page for summary and supplier QR
        finalContentY = checkNewPage(totalRequiredHeight, finalContentY);

        const summaryBoxX = CM;
        const summaryBoxY = finalContentY;

        // Draw summary box with proper padding
        doc.setDrawColor(0);
        doc.setLineWidth(line);
        doc.rect(summaryBoxX, summaryBoxY, summaryBoxWidth, summaryBoxHeight);

        // Summary title with proper padding from top
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('ZIP TYPE SUMMARY', summaryBoxX + summaryBoxWidth/2, summaryBoxY + 20, { align: 'center' });

        // Draw line under title with proper spacing
        doc.setLineWidth(0.8);
        doc.line(summaryBoxX + 10, summaryBoxY + 30, summaryBoxX + summaryBoxWidth - 10, summaryBoxY + 30);
        
        // Summary content with proper spacing
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        
        let summaryContentY = summaryBoxY + 50;
        const columnWidth = summaryBoxWidth / 2;
        
        summaryData.forEach((item, index) => {
          const rowY = summaryContentY + (index * 20);
          doc.text(`${item.zipType}:`, summaryBoxX + 20, rowY);
          doc.text(`${item.totalQuantity.toLocaleString()}`, summaryBoxX + summaryBoxWidth - 20, rowY, { align: 'right' });
        });

        // Total line with proper spacing
        const totalQuantity = summaryData.reduce((sum, item) => sum + item.totalQuantity, 0);
        const totalY = summaryContentY + (summaryData.length * 20) + 10;
        
        doc.setLineWidth(0.8);
        doc.line(summaryBoxX + 10, totalY, summaryBoxX + summaryBoxWidth - 10, totalY);
        
        doc.setFont('helvetica', 'bold');
        doc.text('GRAND TOTAL OF ZIP PCS:', summaryBoxX + 20, totalY + 18);
        doc.text(`${totalQuantity.toLocaleString()}`, summaryBoxX + summaryBoxWidth - 20, totalY + 18, { align: 'right' });

        finalContentY = summaryBoxY + summaryBoxHeight + 20;

        // Check if we need a new page for supplier QR
        finalContentY = checkNewPage(supplierQRSize + 40, finalContentY);

        // ADD SUPPLIER QR BELOW THE SUMMARY BOX
        const supplierQRX = CM + (contentWidth - supplierQRSize) / 2; // Center the QR code
        const supplierQRY = finalContentY + 20;

        // Draw Supplier QR box
        doc.rect(supplierQRX, supplierQRY, supplierQRSize, supplierQRSize);

        doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
        doc.text('SCAN FOR', supplierQRX + supplierQRSize/2, supplierQRY + 10, { align: 'center' });
        doc.text('SUPPLIER ENTRY', supplierQRX + supplierQRSize/2, supplierQRY + 20, { align: 'center' });
        
        if (qrCodes && qrCodes.supplierEntry.image) {
          doc.addImage(qrCodes.supplierEntry.image, 'PNG', supplierQRX + 10, supplierQRY + 25, supplierQRSize - 20, supplierQRSize - 35);
        } else {
          // Fallback placeholder
          doc.rect(supplierQRX + 10, supplierQRY + 25, supplierQRSize - 20, supplierQRSize - 35);
          doc.setFontSize(6);
          doc.text('QR CODE', supplierQRX + supplierQRSize/2, supplierQRY + supplierQRSize/2 + 5, { align: 'center' });
          doc.text('SUPPLIER ENTRY', supplierQRX + supplierQRSize/2, supplierQRY + supplierQRSize/2 + 15, { align: 'center' });
        }

        finalContentY = supplierQRY + supplierQRSize + 20;
      }

    } else {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      doc.text('No zip cost breakdown available', CM, breakdownStartY + 10);
      finalContentY = breakdownStartY + 30;
    }
  } else {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text('No zip cost breakdown available', CM, breakdownStartY + 10);
    finalContentY = breakdownStartY + 30;
  }

  // Add approval status if approved
// Add approval status if approved - Professional Design
// Add approval status if approved - Simple Plain Text Design
if (row['Approval Status'] === 'APPROVED') {
  // Check if we need a new page for approval status
  finalContentY = checkNewPage(40, finalContentY);

  const approvalY = finalContentY + 20;
  
  // Simple plain text approval information
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(0, 128, 0);
  doc.text('APPROVED PURCHASE ORDER', W/2, approvalY, { align: 'center' });
  
  // Approval details
  const approvedBy = cleanString(row['Approved By'] || 'Not Specified');
  const approvalDate = printableDate(row['Approval Decision Date']);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(`Approved by: ${approvedBy}`, W/2, approvalY + 15, { align: 'center' });
  doc.text(`Date of Approval: ${approvalDate}`, W/2, approvalY + 30, { align: 'center' });
  
  finalContentY = approvalY + 45;
}
  // Draw final footer with signatures and QR instructions on the last page
  drawFooterWithSignatures(currentPage, pageCount);

  // Save the PDF
  const fileName = `Approved_PO_${row['Lot Number']}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
};

// Basic PDF for non-approved POs
const downloadBasicPDF = (row) => {
  const doc = new jsPDF();
  
  doc.setFontSize(16);
  doc.setTextColor(13, 71, 161);
  doc.text(`Purchase Order - Lot #${row['Lot Number']}`, 20, 20);
  
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Status: ${row['Approval Status'] || 'Pending Approval'}`, 20, 35);
  doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 20, 45);
  
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  
  let yPosition = 65;
  const fields = [
    ['Lot Number', row['Lot Number']],
    ['Garment Type', row['Garment Type']],
    ['Style', row['Style']],
    ['Total Pieces', row['Total Pieces']],
    ['Total Cost', row['Total Cost (₹)'] ? `₹${row['Total Cost (₹)']}` : 'N/A'],
    ['Issue Date', row['Issue Date']],
    ['Supervisor', row['Supervisor']],
    ['Status', row['Approval Status'] || 'Pending']
  ];
  
  fields.forEach(([label, value]) => {
    doc.text(`${label}: ${value || 'N/A'}`, 20, yPosition);
    yPosition += 10;
  });
  
  if (row['Approval Status'] !== 'APPROVED') {
    yPosition += 10;
    doc.setTextColor(255, 0, 0);
    doc.text('⚠️ This PO is not approved yet. Full PDF with QR codes available after approval.', 20, yPosition);
  }
  
  const fileName = `PO_${row['Lot Number']}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
};

// Main ZipDashboard Component
const ZipDashboard = () => {
  const [sheetData, setSheetData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [selectedRow, setSelectedRow] = useState(null);
  const [filters, setFilters] = useState({
    garmentType: '',
    supplier: '',
    dateFrom: '',
    dateTo: '',
    minPieces: '',
    maxPieces: '',
    minCost: '',
    maxCost: '',
    status: ''
  });
  const [showFilters, setShowFilters] = useState(false);
  const tableRef = useRef();

  // Google Sheets configuration
  const SPREADSHEET_ID = SHEET_ID_ZIP_RGP;
  const API_KEY = GOOGLE_API_KEY;
  const RANGE = 'ZipPurchaseOrders!A:AA';

  useEffect(() => {
    fetchGoogleSheetData();
  }, []);

  const fetchGoogleSheetData = async () => {
    try {
      setLoading(true);
      setError(null);

      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${RANGE}?key=${API_KEY}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      const values = data.values;

      if (values && values.length > 0) {
        const headers = values[0];
        const rows = values.slice(1);
        
        const formattedData = rows.map((row, index) => {
          const obj = { id: index };
          headers.forEach((header, colIndex) => {
            obj[header] = row[colIndex] || '';
          });
          return obj;
        });

        setSheetData(formattedData);
      } else {
        setSheetData([]);
      }
    } catch (err) {
      console.error('Error fetching Google Sheets data:', err);
      setError('Failed to fetch data. Please check your API key and spreadsheet ID.');
    } finally {
      setLoading(false);
    }
  };

  // Get unique values for filter dropdowns
  const filterOptions = useMemo(() => {
    const garmentTypes = [...new Set(sheetData.map(row => row['Garment Type']).filter(Boolean))];
    const suppliers = [...new Set(sheetData.map(row => row['Supplier Name']).filter(Boolean))];
    const statuses = [...new Set(sheetData.map(row => row['Approval Status']).filter(Boolean))];
    
    return { garmentTypes, suppliers, statuses };
  }, [sheetData]);

  // Filter data based on search term and filters
  const filteredData = useMemo(() => {
    let result = sheetData;

    // Text search
    if (searchTerm) {
      result = result.filter(row =>
        Object.entries(row).some(([key, value]) =>
          key !== 'id' && 
          value.toString().toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
    }

    // Apply filters
    if (filters.garmentType) {
      result = result.filter(row => 
        row['Garment Type']?.toLowerCase().includes(filters.garmentType.toLowerCase())
      );
    }

    if (filters.supplier) {
      result = result.filter(row => 
        row['Supplier Name']?.toLowerCase().includes(filters.supplier.toLowerCase())
      );
    }

    if (filters.status) {
      result = result.filter(row => 
        row['Approval Status']?.toLowerCase().includes(filters.status.toLowerCase())
      );
    }

    if (filters.dateFrom) {
      result = result.filter(row => {
        const rowDate = new Date(row['Issue Date']);
        const filterDate = new Date(filters.dateFrom);
        return rowDate >= filterDate;
      });
    }

    if (filters.dateTo) {
      result = result.filter(row => {
        const rowDate = new Date(row['Issue Date']);
        const filterDate = new Date(filters.dateTo);
        return rowDate <= filterDate;
      });
    }

    if (filters.minPieces) {
      result = result.filter(row => {
        const pieces = parseInt(row['Total Pieces']) || 0;
        return pieces >= parseInt(filters.minPieces);
      });
    }

    if (filters.maxPieces) {
      result = result.filter(row => {
        const pieces = parseInt(row['Total Pieces']) || 0;
        return pieces <= parseInt(filters.maxPieces);
      });
    }

    if (filters.minCost) {
      result = result.filter(row => {
        const cost = parseInt(row['Total Cost (₹)']) || 0;
        return cost >= parseInt(filters.minCost);
      });
    }

    if (filters.maxCost) {
      result = result.filter(row => {
        const cost = parseInt(row['Total Cost (₹)']) || 0;
        return cost <= parseInt(filters.maxCost);
      });
    }

    return result;
  }, [sheetData, searchTerm, filters]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortConfig.key) return filteredData;
    
    return [...filteredData].sort((a, b) => {
      const aValue = a[sortConfig.key] || '';
      const bValue = b[sortConfig.key] || '';
      
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortConfig]);

  // Paginate data
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedData.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedData, currentPage, itemsPerPage]);

  // Get important columns for main table
  const mainColumns = ['Lot Number', 'Garment Type', 'Style', 'Total Pieces', 'Total Cost (₹)', 'Issue Date', 'Approval Status'];

  // Handle column sorting
  const handleSort = (columnKey) => {
    setSortConfig({
      key: columnKey,
      direction: sortConfig.key === columnKey && sortConfig.direction === 'asc' ? 'desc' : 'asc'
    });
  };

  // Handle filter changes
  const handleFilterChange = (filterName, value) => {
    setFilters(prev => ({
      ...prev,
      [filterName]: value
    }));
    setCurrentPage(1);
  };

  // Clear all filters
  const clearFilters = () => {
    setFilters({
      garmentType: '',
      supplier: '',
      dateFrom: '',
      dateTo: '',
      minPieces: '',
      maxPieces: '',
      minCost: '',
      maxCost: '',
      status: ''
    });
    setCurrentPage(1);
  };

  // Refresh data
  const refreshData = () => {
    fetchGoogleSheetData();
    setCurrentPage(1);
    setSelectedRow(null);
  };

  // Download PDF for individual lot
  const downloadLotPDF = async (row) => {
    try {
      if (row['Approval Status'] === 'APPROVED') {
        await generateApprovedPOPDF(row);
      } else {
        downloadBasicPDF(row);
        alert('This Purchase Order is not approved yet. Basic information PDF downloaded.');
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF. Please try again.');
    }
  };

  // Calculate total pages
  const totalPages = Math.ceil(sortedData.length / itemsPerPage);

  // Download CSV functionality
  const downloadCSV = () => {
    const headers = Object.keys(sheetData[0] || {}).filter(key => key !== 'id');
    const csvContent = [
      headers.join(','),
      ...filteredData.map(row => 
        headers.map(header => {
          const value = row[header] || '';
          return `"${String(value).replace(/"/g, '""')}"`;
        }).join(',')
      )
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `zip-production-data-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p style={styles.loadingText}>Loading data from Google Sheets...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.errorContainer}>
        <h2 style={styles.errorTitle}>Error</h2>
        <p style={styles.errorText}>{error}</p>
        <button onClick={refreshData} style={styles.retryButton}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={styles.dashboard}>
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          @media (max-width: 768px) {
            .dashboard-header {
              flex-direction: column;
              align-items: stretch;
            }
            .controls {
              flex-direction: column;
            }
            .table-container {
              overflow-x: auto;
            }
          }
        `}
      </style>

      {/* Header Section */}
      <div className="dashboard-header" style={styles.header}>
        <h1 style={styles.title}>Zip Production Dashboard</h1>
        <div className="controls" style={styles.controls}>
          <input
            type="text"
            placeholder="Search across all records..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            style={styles.searchInput}
          />
          <button 
            onClick={() => setShowFilters(!showFilters)}
            style={{...styles.button, ...styles.filterButton}}
          >
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
          <button onClick={refreshData} style={styles.button}>
            Refresh
          </button>
          <button onClick={downloadCSV} style={{...styles.button, ...styles.csvButton}}>
            Download CSV
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div style={styles.filtersPanel}>
          <div style={styles.filtersHeader}>
            <h3 style={styles.filtersTitle}>Advanced Filters</h3>
            <button onClick={clearFilters} style={styles.clearFiltersButton}>
              Clear All Filters
            </button>
          </div>
          <div style={styles.filtersGrid}>
            {/* Status Filter */}
            <div style={styles.filterGroup}>
              <label style={styles.filterLabel}>Approval Status</label>
              <select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                style={styles.filterSelect}
              >
                <option value="">All Status</option>
                <option value="APPROVED">Approved</option>
                <option value="PENDING">Pending</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>

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
              <label style={styles.filterLabel}>Supplier</label>
              <select
                value={filters.supplier}
                onChange={(e) => handleFilterChange('supplier', e.target.value)}
                style={styles.filterSelect}
              >
                <option value="">All Suppliers</option>
                {filterOptions.suppliers.map(supplier => (
                  <option key={supplier} value={supplier}>{supplier}</option>
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
              <label style={styles.filterLabel}>Min Pieces</label>
              <input
                type="number"
                value={filters.minPieces}
                onChange={(e) => handleFilterChange('minPieces', e.target.value)}
                placeholder="0"
                style={styles.filterInput}
              />
            </div>

            <div style={styles.filterGroup}>
              <label style={styles.filterLabel}>Max Pieces</label>
              <input
                type="number"
                value={filters.maxPieces}
                onChange={(e) => handleFilterChange('maxPieces', e.target.value)}
                placeholder="10000"
                style={styles.filterInput}
              />
            </div>

            <div style={styles.filterGroup}>
              <label style={styles.filterLabel}>Min Cost (₹)</label>
              <input
                type="number"
                value={filters.minCost}
                onChange={(e) => handleFilterChange('minCost', e.target.value)}
                placeholder="0"
                style={styles.filterInput}
              />
            </div>

            <div style={styles.filterGroup}>
              <label style={styles.filterLabel}>Max Cost (₹)</label>
              <input
                type="number"
                value={filters.maxCost}
                onChange={(e) => handleFilterChange('maxCost', e.target.value)}
                placeholder="100000"
                style={styles.filterInput}
              />
            </div>
          </div>
        </div>
      )}

      {/* Statistics */}
      <div style={styles.statsContainer}>
        <div style={styles.statCard}>
          <h3 style={styles.statTitle}>Total Records</h3>
          <p style={styles.statNumber}>{filteredData.length}</p>
        </div>
        <div style={styles.statCard}>
          <h3 style={styles.statTitle}>Approved POs</h3>
          <p style={styles.statNumber}>
            {filteredData.filter(row => row['Approval Status'] === 'APPROVED').length}
          </p>
        </div>
        <div style={styles.statCard}>
          <h3 style={styles.statTitle}>Total Pieces</h3>
          <p style={styles.statNumber}>
            {filteredData.reduce((sum, row) => sum + (parseInt(row['Total Pieces']) || 0), 0).toLocaleString('en-IN')}
          </p>
        </div>
        <div style={styles.statCard}>
          <h3 style={styles.statTitle}>Total Cost</h3>
          <p style={styles.statNumber}>
            ₹{filteredData.reduce((sum, row) => sum + (parseInt(row['Total Cost (₹)']) || 0), 0).toLocaleString('en-IN')}
          </p>
        </div>
      </div>

      {/* Pagination Controls */}
      <div style={styles.paginationControls}>
        <div style={styles.paginationInfo}>
          Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, sortedData.length)} of {sortedData.length} entries
        </div>
        <div style={styles.paginationButtons}>
          <button
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            style={{...styles.paginationButton, ...(currentPage === 1 ? styles.disabledButton : {})}}
          >
            Previous
          </button>
          <span style={styles.pageInfo}>
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
            style={{...styles.paginationButton, ...(currentPage === totalPages ? styles.disabledButton : {})}}
          >
            Next
          </button>
          <select
            value={itemsPerPage}
            onChange={(e) => {
              setItemsPerPage(Number(e.target.value));
              setCurrentPage(1);
            }}
            style={styles.pageSizeSelect}
          >
            <option value={10}>10 per page</option>
            <option value={20}>20 per page</option>
            <option value={50}>50 per page</option>
          </select>
        </div>
      </div>

      {/* Main Data Table */}
      {sortedData.length === 0 ? (
        <div style={styles.noData}>
          <p style={styles.noDataText}>No data found {searchTerm || Object.values(filters).some(f => f) ? 'matching your search/filters' : ''}</p>
          {(searchTerm || Object.values(filters).some(f => f)) && (
            <button onClick={clearFilters} style={styles.clearSearchButton}>
              Clear Search & Filters
            </button>
          )}
        </div>
      ) : (
        <div className="table-container" style={styles.tableContainer} ref={tableRef}>
          <table style={styles.table}>
            <thead>
              <tr>
                {mainColumns.map(column => (
                  <th
                    key={column}
                    onClick={() => handleSort(column)}
                    style={styles.tableHeader}
                  >
                    <div style={styles.headerContent}>
                      {column}
                      {sortConfig.key === column && (
                        <span style={styles.sortIndicator}>
                          {sortConfig.direction === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
                <th style={styles.tableHeader}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.map(row => (
                <tr key={row.id} style={styles.tableRow}>
                  {mainColumns.map(column => (
                    <td key={column} style={{
                      ...styles.tableCell,
                      ...(column === 'Approval Status' ? 
                        { 
                          color: row[column] === 'APPROVED' ? '#059669' : 
                                 row[column] === 'PENDING' ? '#d97706' : '#dc2626', 
                          fontWeight: 'bold',
                          fontSize: '14px'
                        } : {})
                    }}>
                      {row[column] || '-'}
                    </td>
                  ))}
                  <td style={styles.tableCell}>
                    <div style={styles.actionButtons}>
                      <button
                        onClick={() => downloadLotPDF(row)}
                        style={{
                          ...styles.downloadLotButton,
                          ...(row['Approval Status'] === 'APPROVED' ? 
                            { backgroundColor: '#059669' } : 
                            row['Approval Status'] === 'PENDING' ? 
                            { backgroundColor: '#d97706' } : 
                            { backgroundColor: '#dc2626' })
                        }}
                        title={row['Approval Status'] === 'APPROVED' ? 
                          'Download Full PDF with QR Codes' : 'Download Basic PDF'}
                      >
                        {row['Approval Status'] === 'APPROVED' ? '📄 Full PDF' : '📄 Basic PDF'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Bottom Pagination */}
      {sortedData.length > 0 && (
        <div style={styles.bottomPagination}>
          <div style={styles.paginationInfo}>
            Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, sortedData.length)} of {sortedData.length} entries
          </div>
          <div style={styles.downloadButtons}>
            <button onClick={downloadCSV} style={{...styles.smallButton, ...styles.csvButton}}>
              Export CSV
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Styles
const styles = {
  dashboard: {
    padding: '20px',
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    maxWidth: '2100px',
    margin: '0 auto',
    backgroundColor: '#ffffffff',
    minHeight: '100vh',
    color: '#000000',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '25px',
    flexWrap: 'wrap',
    gap: '15px',
    backgroundColor: '#ffffff',
    padding: '25px',
    borderRadius: '12px',
    boxShadow: '0 4px 12px rgba(13, 71, 161, 0.1)',
    border: '1px solid #e3f2fd',
  },
  title: {
    color: '#0d47a1',
    margin: '0',
    fontSize: '32px',
    fontWeight: '700',
    textShadow: '0 1px 2px rgba(13, 71, 161, 0.1)',
  },
  controls: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  searchInput: {
    padding: '12px 16px',
    border: '2px solid #bbdefb',
    borderRadius: '8px',
    fontSize: '15px',
    minWidth: '280px',
    outline: 'none',
    transition: 'all 0.3s ease',
    color: '#000000',
    backgroundColor: '#ffffff',
  },
  button: {
    padding: '12px 24px',
    backgroundColor: '#0d47a1',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '15px',
    fontWeight: '600',
    transition: 'all 0.3s ease',
    boxShadow: '0 2px 8px rgba(13, 71, 161, 0.3)',
  },
  filterButton: {
    backgroundColor: '#1976d2',
  },
  csvButton: {
    backgroundColor: '#388e3c',
  },
  smallButton: {
    padding: '8px 16px',
    fontSize: '14px',
  },
  filtersPanel: {
    backgroundColor: '#ffffff',
    padding: '25px',
    borderRadius: '12px',
    boxShadow: '0 4px 12px rgba(13, 71, 161, 0.1)',
    marginBottom: '25px',
    border: '1px solid #e3f2fd',
  },
  filtersHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  filtersTitle: {
    color: '#0d47a1',
    margin: '0',
    fontSize: '20px',
    fontWeight: '600',
  },
  clearFiltersButton: {
    padding: '8px 16px',
    backgroundColor: '#ff6b6b',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'all 0.3s ease',
  },
  filtersGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '20px',
  },
  filterGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  filterLabel: {
    color: '#0d47a1',
    fontSize: '14px',
    fontWeight: '600',
  },
  filterSelect: {
    padding: '10px',
    border: '2px solid #bbdefb',
    borderRadius: '6px',
    fontSize: '14px',
    color: '#000000',
    backgroundColor: '#ffffff',
    cursor: 'pointer',
    transition: 'border-color 0.3s ease',
  },
  filterInput: {
    padding: '10px',
    border: '2px solid #bbdefb',
    borderRadius: '6px',
    fontSize: '14px',
    color: '#000000',
    backgroundColor: '#ffffff',
    transition: 'border-color 0.3s ease',
  },
  statsContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '20px',
    marginBottom: '25px',
  },
  statCard: {
    background: 'linear-gradient(135deg, #ffffff, #e3f2fd)',
    padding: '20px',
    borderRadius: '12px',
    border: '1px solid #bbdefb',
    boxShadow: '0 4px 12px rgba(13, 71, 161, 0.1)',
    textAlign: 'center',
    transition: 'transform 0.2s ease',
  },
  statTitle: {
    color: '#0d47a1',
    margin: '0 0 12px 0',
    fontSize: '14px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  statNumber: {
    margin: '0',
    fontSize: '28px',
    fontWeight: '700',
    color: '#0d47a1',
  },
  paginationControls: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    padding: '18px',
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    boxShadow: '0 4px 12px rgba(13, 71, 161, 0.1)',
    border: '1px solid #e3f2fd',
  },
  paginationInfo: {
    color: '#0d47a1',
    fontSize: '14px',
    fontWeight: '500',
  },
  paginationButtons: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  paginationButton: {
    padding: '10px 18px',
    backgroundColor: '#0d47a1',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    transition: 'all 0.3s ease',
  },
  disabledButton: {
    backgroundColor: '#90caf9',
    cursor: 'not-allowed',
    color: '#e3f2fd',
  },
  pageInfo: {
    margin: '0 12px',
    fontSize: '14px',
    color: '#0d47a1',
    fontWeight: '500',
  },
  pageSizeSelect: {
    padding: '10px',
    border: '2px solid #bbdefb',
    borderRadius: '6px',
    fontSize: '14px',
    color: '#000000',
    backgroundColor: '#ffffff',
    cursor: 'pointer',
  },
  tableContainer: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 4px 16px rgba(13, 71, 161, 0.1)',
    marginBottom: '25px',
    border: '1px solid #e3f2fd',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px',
  },
  tableHeader: {
    backgroundColor: '#0d47a1',
    color: '#ffffff',
    padding: '16px 20px',
    textAlign: 'left',
    fontWeight: '600',
    cursor: 'pointer',
    userSelect: 'none',
    borderRight: '1px solid #bbdefb',
    fontSize: '15px',
    transition: 'background-color 0.2s ease',
  },
  headerContent: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sortIndicator: {
    marginLeft: '8px',
    fontSize: '12px',
  },
  tableRow: {
    borderBottom: '1px solid #e3f2fd',
    transition: 'background-color 0.2s ease',
    backgroundColor: '#ffffff',
  },
  tableCell: {
    padding: '16px 20px',
    borderRight: '1px solid #f3f9ff',
    color: '#000000',
    fontSize: '14px',
    fontWeight: '400',
  },
  actionButtons: {
    display: 'flex',
    gap: '8px',
    flexDirection: 'column',
    alignItems: 'center',
  },
  downloadLotButton: {
    padding: '8px 16px',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500',
    transition: 'all 0.3s ease',
    minWidth: '100px',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '60vh',
    color: '#000000',
  },
  spinner: {
    border: '5px solid #e3f2fd',
    borderTop: '5px solid #0d47a1',
    borderRadius: '50%',
    width: '50px',
    height: '50px',
    animation: 'spin 1s linear infinite',
    marginBottom: '25px',
  },
  loadingText: {
    fontSize: '16px',
    fontWeight: '500',
    color: '#0d47a1',
  },
  errorContainer: {
    textAlign: 'center',
    padding: '50px',
    color: '#000000',
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    margin: '25px',
    boxShadow: '0 4px 16px rgba(13, 71, 161, 0.1)',
    border: '1px solid #ffcdd2',
  },
  errorTitle: {
    color: '#d32f2f',
    marginBottom: '15px',
    fontSize: '24px',
  },
  errorText: {
    color: '#000000',
    fontSize: '16px',
    marginBottom: '25px',
  },
  retryButton: {
    padding: '12px 24px',
    backgroundColor: '#d32f2f',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '15px',
    fontWeight: '600',
    transition: 'all 0.3s ease',
  },
  noData: {
    textAlign: 'center',
    padding: '50px',
    color: '#000000',
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    boxShadow: '0 4px 16px rgba(13, 71, 161, 0.1)',
    border: '1px solid #e3f2fd',
  },
  noDataText: {
    fontSize: '16px',
    fontWeight: '500',
    color: '#0d47a1',
  },
  clearSearchButton: {
    padding: '10px 20px',
    backgroundColor: '#1976d2',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    marginTop: '15px',
    transition: 'all 0.3s ease',
  },
  bottomPagination: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '18px',
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    boxShadow: '0 4px 12px rgba(13, 71, 161, 0.1)',
    border: '1px solid #e3f2fd',
  },
  downloadButtons: {
    display: 'flex',
    gap: '10px',
  },
};

export default ZipDashboard;