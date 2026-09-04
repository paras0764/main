import React, { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from 'jspdf-autotable';
import QRCode from "qrcode";
import "./PoSummaryReport.css";
import { generatePurchaseOrderPDF } from "./PurchaseOrderForm";
import {
  GOOGLE_API_KEY,
  SHEET_ID_PURCHASE_ORDER,
  WEB_APP_URL_PO_SUMMARY_GATE_RECEIVE
} from "../config/apiConfig";

const POSummaryReport = () => {
  const [poData, setPoData] = useState([]);
  const [itemsData, setItemsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPO, setSelectedPO] = useState(null);
  const [viewMode, setViewMode] = useState("card"); // "card" or "table"
  const [showDescriptionDropdown, setShowDescriptionDropdown] = useState(false);
  const [descriptionSearchTerm, setDescriptionSearchTerm] = useState(""); // New state for description search
  
  // Filter states
  const [filters, setFilters] = useState({
    poNumber: "",
    supplier: "",
    status: "",
    supervisor: "",
    fromDate: "",
    toDate: "",
    descriptions: [] // Array for multiple description selection
  });
  
  // Unique filter options
  const [filterOptions, setFilterOptions] = useState({
    suppliers: [],
    statuses: [],
    supervisors: [],
    descriptions: []
  });

  // Replace with your actual values (configured via apiConfig / .env)
  const API_KEY = GOOGLE_API_KEY;
  const SPREADSHEET_ID = SHEET_ID_PURCHASE_ORDER;
  
  const PO_SHEET_NAME = "PO_Main";
  const ITEMS_SHEET_NAME = "PO_Items";
  const PO_RANGE = `${PO_SHEET_NAME}!A:O`;
  const ITEMS_RANGE = `${ITEMS_SHEET_NAME}!A:I`;

  const processSheetData = (data, headers) => {
    const rows = data.values;
    if (!rows || rows.length === 0) return [];
    const result = [];
    for (let i = 1; i < rows.length; i++) {
      let row = {};
      headers.forEach((header, idx) => {
        row[header] = rows[i][idx] || "";
      });
      result.push(row);
    }
    return result;
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        const poUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${PO_RANGE}?key=${API_KEY}`;
        const poResponse = await fetch(poUrl);
        if (!poResponse.ok) throw new Error("Failed to fetch PO data");
        const poJson = await poResponse.json();

        const poHeaders = [
          "PO #",
          "Supplier",
          "Order Date",
          "Order Time",
          "Expected Date",
          "Expected Time",
          "Lead Time (ms)",
          "Lead Time (human)",
          "Supervisor",
          "Total Amount",
          "Status",
          "Gate In At",
          "Received At",
          "Created At",
          "Updated At",
          "REQUISITION RAISED BY",
          "AUTHORIZED BY",
        ];
        const formattedPoData = processSheetData(poJson, poHeaders);
        setPoData(formattedPoData);
        
        const itemsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${ITEMS_RANGE}?key=${API_KEY}`;
        const itemsResponse = await fetch(itemsUrl);
        if (!itemsResponse.ok) throw new Error("Failed to fetch Items data");
        const itemsJson = await itemsResponse.json();

        const itemsHeaders = [
          "PO #",
          "Line #",
          "Department",
          "Description",
          "UOM",
          "Qty",
          "Rate",
          "Amount",
          "Created At",
        ];
        const formattedItemsData = processSheetData(itemsJson, itemsHeaders);
        setItemsData(formattedItemsData);
        
        // Extract filter options
        const suppliers = [...new Set(formattedPoData.map(po => po["Supplier"]).filter(Boolean))];
        const statuses = [...new Set(formattedPoData.map(po => po["Status"]).filter(Boolean))];
        const supervisors = [...new Set(formattedPoData.map(po => po["Supervisor"]).filter(Boolean))];
        const descriptions = [...new Set(formattedItemsData.map(item => item["Description"]).filter(Boolean))];
        
        setFilterOptions({ suppliers, statuses, supervisors, descriptions });
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const getItemsForPO = (poNumber) => {
    return itemsData.filter((item) => item["PO #"] === poNumber);
  };

  const getPOTotal = (poNumber) => {
    const items = getItemsForPO(poNumber);
    return items.reduce((sum, item) => sum + (parseFloat(item["Amount"]) || 0), 0);
  };

  // Check if PO contains any of the selected descriptions
  const hasSelectedDescriptions = (poNumber) => {
    if (filters.descriptions.length === 0) return true;
    const poItems = getItemsForPO(poNumber);
    return poItems.some(item => filters.descriptions.includes(item["Description"]));
  };

  // NEW: Check if PO contains description matching search term
  const hasMatchingDescriptionSearch = (poNumber) => {
    if (!descriptionSearchTerm.trim()) return true;
    const poItems = getItemsForPO(poNumber);
    const searchTermLower = descriptionSearchTerm.toLowerCase().trim();
    return poItems.some(item => 
      item["Description"] && 
      item["Description"].toLowerCase().includes(searchTermLower)
    );
  };

  // Filter PO Data
  const getFilteredPOData = () => {
    return poData.filter(po => {
      // PO Number filter
      if (filters.poNumber && !po["PO #"].toLowerCase().includes(filters.poNumber.toLowerCase())) {
        return false;
      }
      
      // Supplier filter
      if (filters.supplier && po["Supplier"] !== filters.supplier) {
        return false;
      }
      
      // Status filter
      if (filters.status && po["Status"] !== filters.status) {
        return false;
      }
      
      // Supervisor filter
      if (filters.supervisor && po["Supervisor"] !== filters.supervisor) {
        return false;
      }
      
      // Date range filter
      if (filters.fromDate && po["Order Date"]) {
        const orderDate = new Date(po["Order Date"]);
        const fromDate = new Date(filters.fromDate);
        if (orderDate < fromDate) return false;
      }
      
      if (filters.toDate && po["Order Date"]) {
        const orderDate = new Date(po["Order Date"]);
        const toDate = new Date(filters.toDate);
        if (orderDate > toDate) return false;
      }
      
      // Description filter (multi-select)
      if (!hasSelectedDescriptions(po["PO #"])) {
        return false;
      }
      
      // NEW: Description search filter
      if (!hasMatchingDescriptionSearch(po["PO #"])) {
        return false;
      }
      
      return true;
    });
  };

  const clearFilters = () => {
    setFilters({
      poNumber: "",
      supplier: "",
      status: "",
      supervisor: "",
      fromDate: "",
      toDate: "",
      descriptions: []
    });
    setDescriptionSearchTerm(""); // Clear description search as well
  };

  // Handle description selection
  const handleDescriptionChange = (description) => {
    setFilters(prev => {
      const currentDescriptions = [...prev.descriptions];
      if (currentDescriptions.includes(description)) {
        // Remove if already selected
        return {
          ...prev,
          descriptions: currentDescriptions.filter(d => d !== description)
        };
      } else {
        // Add if not selected
        return {
          ...prev,
          descriptions: [...currentDescriptions, description]
        };
      }
    });
  };

  // Select all descriptions
  const selectAllDescriptions = () => {
    setFilters(prev => ({
      ...prev,
      descriptions: [...filterOptions.descriptions]
    }));
  };

  // Clear all description selections
  const clearDescriptions = () => {
    setFilters(prev => ({
      ...prev,
      descriptions: []
    }));
  };

  // Export to Excel
  const exportToExcel = () => {
    const filteredData = getFilteredPOData();
    const exportData = filteredData.map((po, index) => ({
      "S.No": index + 1,
      "PO #": po["PO #"],
      "Supplier": po["Supplier"],
      "Order Date": po["Order Date"],
      "Expected Date": po["Expected Date"],
      "Status": po["Status"],
      "Supervisor": po["Supervisor"],
      "Total Amount": po["Total Amount"] || getPOTotal(po["PO #"]),
      "Items Count": getItemsForPO(po["PO #"]).length,
      "Descriptions": getItemsForPO(po["PO #"]).map(item => item["Description"]).join(", "),
      "Gate In At": po["Gate In At"] || "—",
      "Received At": po["Received At"] || "—"
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PO Summary Report");
    
    // Auto-size columns
    const colWidths = [
      { wch: 8 },  // S.No
      { wch: 15 }, // PO #
      { wch: 25 }, // Supplier
      { wch: 12 }, // Order Date
      { wch: 12 }, // Expected Date
      { wch: 12 }, // Status
      { wch: 15 }, // Supervisor
      { wch: 15 }, // Total Amount
      { wch: 10 }, // Items Count
      { wch: 40 }, // Descriptions
      { wch: 12 }, // Gate In At
      { wch: 12 }  // Received At
    ];
    ws['!cols'] = colWidths;
    
    const fileName = `PO_Summary_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  // Export to PDF
  const exportToPDF = () => {
    const filteredData = getFilteredPOData();
    const doc = new jsPDF('landscape');
    
    // Add title
    doc.setFontSize(18);
    doc.setTextColor(37, 99, 235);
    doc.text('PO Summary Report', 14, 15);
    
    // Add subtitle with date
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 25);
    doc.text(`Total POs: ${filteredData.length}`, 14, 32);
    
    // Add filter info if any filters are applied
    let filterText = "";
    if (filters.poNumber) filterText += `PO #: ${filters.poNumber} | `;
    if (filters.supplier) filterText += `Supplier: ${filters.supplier} | `;
    if (filters.status) filterText += `Status: ${filters.status} | `;
    if (filters.supervisor) filterText += `Supervisor: ${filters.supervisor} | `;
    if (filters.fromDate) filterText += `From: ${filters.fromDate} | `;
    if (filters.toDate) filterText += `To: ${filters.toDate} | `;
    if (filters.descriptions.length > 0) filterText += `Descriptions: ${filters.descriptions.join(", ")} | `;
    if (descriptionSearchTerm) filterText += `Description Search: ${descriptionSearchTerm} | `;
    if (filterText) {
      doc.setFontSize(9);
      doc.setTextColor(150, 150, 150);
      doc.text(`Filters: ${filterText.slice(0, -3)}`, 14, 40);
    }
    
    // Prepare table data
    const tableData = filteredData.map((po, index) => [
      (index + 1).toString(),
      po["PO #"],
      po["Supplier"],
      po["Order Date"],
      po["Expected Date"],
      po["Status"],
      po["Supervisor"],
      `₹${po["Total Amount"] || getPOTotal(po["PO #"])}`,
      getItemsForPO(po["PO #"]).length.toString(),
      getItemsForPO(po["PO #"]).map(item => item["Description"]).join(", ").substring(0, 50)
    ]);
    
    // Add table using autoTable
    autoTable(doc, {
      head: [['S.No', 'PO #', 'Supplier', 'Order Date', 'Expected Date', 'Status', 'Supervisor', 'Total Amount', 'Items', 'Descriptions']],
      body: tableData,
      startY: 45,
      theme: 'striped',
      headStyles: {
        fillColor: [37, 99, 235],
        textColor: 255,
        fontSize: 9,
        fontStyle: 'bold',
        halign: 'center'
      },
      bodyStyles: {
        fontSize: 8
      },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },
        1: { cellWidth: 25 },
        2: { cellWidth: 30 },
        3: { cellWidth: 20, halign: 'center' },
        4: { cellWidth: 20, halign: 'center' },
        5: { cellWidth: 20, halign: 'center' },
        6: { cellWidth: 25 },
        7: { cellWidth: 25, halign: 'right' },
        8: { cellWidth: 15, halign: 'center' },
        9: { cellWidth: 50 }
      },
      margin: { top: 45 },
      didDrawPage: function(data) {
        const pageCount = doc.internal.getNumberOfPages();
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(
          `Page ${data.pageNumber} of ${pageCount}`,
          doc.internal.pageSize.getWidth() / 2,
          doc.internal.pageSize.getHeight() - 10,
          { align: 'center' }
        );
      }
    });
    
    doc.save(`PO_Summary_Report_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const downloadSinglePoPDF = async (poNumber) => {
    try {
      const po = poData.find((p) => p["PO #"] === poNumber);
      if (!po) return;
      const selectedPOItems = getItemsForPO(poNumber);
      const subtotal = getPOTotal(poNumber);

      const company = {
        name: "R5858 GARMENTS",
        address1: "Plot No. 58, Sector 58",
        address2: "Industrial Area, Faridabad, Haryana - 121004",
        phone: "+91 129 4000000",
        email: "info@r5858.com",
        gst: "06AAAAA0000A1Z5"
      };

      let gateQR = null, recvQR = null;
      try {
        const gateUrl = `${WEB_APP_URL_PO_SUMMARY_GATE_RECEIVE}?action=gateIn&po=${encodeURIComponent(poNumber)}`;
        const recvUrl = `${WEB_APP_URL_PO_SUMMARY_GATE_RECEIVE}?action=receive&po=${encodeURIComponent(poNumber)}`;
        const [g, r] = await Promise.all([
          QRCode.toDataURL(gateUrl, { width: 320, margin: 1 }).catch(() => null),
          QRCode.toDataURL(recvUrl, { width: 320, margin: 1 }).catch(() => null)
        ]);
        gateQR = g;
        recvQR = r;
      } catch (_) {}

      const payload = {
        meta: {
          poNumber: poNumber,
          orderDate: po["Order Date"] || null,
          orderTime: po["Order Time"] || null,
          expectedDate: po["Expected Date"] || null,
          expectedTime: po["Expected Time"] || null,
          leadTimeMs: parseFloat(po["Lead Time (ms)"]) || null,
          leadTimeHuman: po["Lead Time (human)"] || null,
          requisitionRaisedBy: po["REQUISITION RAISED BY"] || null,
          preparedBy: po["Supervisor"] || null,
          approvedBy: po["AUTHORIZED BY"] || null,
          remarks: po["Remarks"] || "",
          createdAt: po["Created At"] || new Date().toISOString()
        },
        company,
        supplierName: po["Supplier"] || "N/A",
        rows: selectedPOItems.map((item, idx) => ({
          line: parseInt(item["Line #"]) || idx + 1,
          department: item["Department"] || "",
          description: item["Description"] || "",
          shade: item["Shade"] || "",
          uom: item["UOM"] || "PCS",
          qty: parseFloat(item["Qty"]) || 0,
          rate: parseFloat(item["Rate"]) || 0,
          amount: parseFloat(item["Amount"]) || 0
        })),
        totals: {
          sub: subtotal,
          discountTotal: 0,
          taxTotal: 0,
          gstAmount: 0,
          gstPercentage: 0,
          gross: subtotal,
          payable: subtotal,
          grandTotal: subtotal,
          roundAdj: 0
        }
      };

      const doc = generatePurchaseOrderPDF({
        payload,
        options: {
          qrGateImage: gateQR,
          qrRecvImage: recvQR,
          qrSide: 96
        }
      });
      if (doc && typeof doc.save === "function") {
        doc.save(`${poNumber}.pdf`);
      }
    } catch (err) {
      console.error("Failed to generate official PO PDF:", err);
      alert(`Could not generate PDF: ${err.message || String(err)}`);
    }
  };

  const handleExport = (format) => {
    if (format === 'excel') {
      exportToExcel();
    } else if (format === 'pdf') {
      exportToPDF();
    }
  };

  // Back navigation function
  const handleGoBack = () => {
    window.history.back();
  };

  const filteredPOData = getFilteredPOData();

  if (loading) {
    return (
      <div className="po-summary-loading-container">
        <div className="po-summary-spinner-wrapper">
          <div className="po-summary-spinner"></div>
          <div className="po-summary-spinner-inner"></div>
        </div>
        <div className="po-summary-loading-text">Loading PO Summary Report...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="po-summary-error-container">
        <div className="po-summary-error-card">
          <div className="po-summary-error-icon">⚠️</div>
          <h3 className="po-summary-error-title">Error Occurred</h3>
          <p className="po-summary-error-message">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="po-summary-retry-button"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="po-summary-app">
      {/* Header Section */}
      <div className="po-summary-header">
        <div className="po-summary-header-content">
          <div className="po-summary-header-text">
            <div className="po-summary-header-top">
              <button
                onClick={handleGoBack}
                className="po-summary-back-button"
                title="Go Back"
              >
                <svg className="po-summary-back-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back
              </button>
              <div>
                <h1 className="po-summary-title">
                  PO Summary Report
                </h1>
                <p className="po-summary-subtitle">Purchase Order Management Dashboard</p>
              </div>
            </div>
          </div>
          <div className="po-summary-stats">
            <div className="po-summary-stats-card">
              <span className="po-summary-stats-label">Total POs: </span>
              <span className="po-summary-stats-value">{poData.length}</span>
            </div>
            <div className="po-summary-stats-card">
              <span className="po-summary-stats-label">Filtered: </span>
              <span className="po-summary-stats-value">{filteredPOData.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filters Section */}
      <div className="po-summary-filters-section">
        <div className="po-summary-filters-header">
          <h3 className="po-summary-filters-title">
            <svg className="po-summary-filters-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filters
          </h3>
          <button onClick={clearFilters} className="po-summary-clear-filters">
            Clear All
          </button>
        </div>
        
        <div className="po-summary-filters-grid">
          <div className="po-summary-filter-group">
            <label className="po-summary-filter-label">PO Number</label>
            <input
              type="text"
              placeholder="Search PO #..."
              value={filters.poNumber}
              onChange={(e) => setFilters({...filters, poNumber: e.target.value})}
              className="po-summary-filter-input"
            />
          </div>
          
          <div className="po-summary-filter-group">
            <label className="po-summary-filter-label">Supplier</label>
            <select
              value={filters.supplier}
              onChange={(e) => setFilters({...filters, supplier: e.target.value})}
              className="po-summary-filter-select"
            >
              <option value="">All Suppliers</option>
              {filterOptions.suppliers.map(supplier => (
                <option key={supplier} value={supplier}>{supplier}</option>
              ))}
            </select>
          </div>
          
          <div className="po-summary-filter-group">
            <label className="po-summary-filter-label">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({...filters, status: e.target.value})}
              className="po-summary-filter-select"
            >
              <option value="">All Statuses</option>
              {filterOptions.statuses.map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
          
          <div className="po-summary-filter-group">
            <label className="po-summary-filter-label">Supervisor</label>
            <select
              value={filters.supervisor}
              onChange={(e) => setFilters({...filters, supervisor: e.target.value})}
              className="po-summary-filter-select"
            >
              <option value="">All Supervisors</option>
              {filterOptions.supervisors.map(supervisor => (
                <option key={supervisor} value={supervisor}>{supervisor}</option>
              ))}
            </select>
          </div>
          
          <div className="po-summary-filter-group">
            <label className="po-summary-filter-label">From Date</label>
            <input
              type="date"
              value={filters.fromDate}
              onChange={(e) => setFilters({...filters, fromDate: e.target.value})}
              className="po-summary-filter-input"
            />
          </div>
          
          <div className="po-summary-filter-group">
            <label className="po-summary-filter-label">To Date</label>
            <input
              type="date"
              value={filters.toDate}
              onChange={(e) => setFilters({...filters, toDate: e.target.value})}
              className="po-summary-filter-input"
            />
          </div>

          {/* NEW: Description Search Input */}
          <div className="po-summary-filter-group">
            <label className="po-summary-filter-label">Search Item Description</label>
            <div className="po-summary-search-wrapper">
              <input
                type="text"
                placeholder="Type to search descriptions..."
                value={descriptionSearchTerm}
                onChange={(e) => setDescriptionSearchTerm(e.target.value)}
                className="po-summary-filter-input"
              />
              {descriptionSearchTerm && (
                <button
                  onClick={() => setDescriptionSearchTerm("")}
                  className="po-summary-clear-search"
                >
                  ✕
                </button>
              )}
            </div>
            {descriptionSearchTerm && (
              <div className="po-summary-search-info">
                Showing POs containing "{descriptionSearchTerm}" in item descriptions
              </div>
            )}
          </div>

          {/* Description Multi-Select Filter */}
          <div className="po-summary-filter-group">
            <label className="po-summary-filter-label">Item Description (Multi-Select)</label>
            <div className="po-summary-multiselect-container">
              <div 
                className="po-summary-multiselect-header"
                onClick={() => setShowDescriptionDropdown(!showDescriptionDropdown)}
              >
                <div className="po-summary-multiselect-selected">
                  {filters.descriptions.length === 0 ? (
                    <span className="po-summary-placeholder">Select descriptions...</span>
                  ) : (
                    <span>{filters.descriptions.length} description(s) selected</span>
                  )}
                </div>
                <div className="po-summary-multiselect-arrow">
                  <svg className={`po-summary-arrow-icon ${showDescriptionDropdown ? 'rotate' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
              
              {showDescriptionDropdown && (
                <div className="po-summary-multiselect-dropdown">
                  <div className="po-summary-multiselect-actions">
                    <button onClick={selectAllDescriptions} className="po-summary-select-all-btn">
                      Select All
                    </button>
                    <button onClick={clearDescriptions} className="po-summary-clear-all-btn">
                      Clear All
                    </button>
                  </div>
                  <div className="po-summary-multiselect-options">
                    {/* Filter descriptions based on search term */}
                    {filterOptions.descriptions
                      .filter(desc => !descriptionSearchTerm || desc.toLowerCase().includes(descriptionSearchTerm.toLowerCase()))
                      .map(description => (
                        <label key={description} className="po-summary-multiselect-option">
                          <input
                            type="checkbox"
                            checked={filters.descriptions.includes(description)}
                            onChange={() => handleDescriptionChange(description)}
                          />
                          <span>{description}</span>
                        </label>
                      ))}
                  </div>
                </div>
              )}
            </div>
            {filters.descriptions.length > 0 && (
              <div className="po-summary-selected-tags">
                {filters.descriptions.map(desc => (
                  <span key={desc} className="po-summary-tag">
                    {desc}
                    <button onClick={() => handleDescriptionChange(desc)} className="po-summary-tag-remove">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="po-summary-main">
        {/* View Toggle and Export Buttons */}
        <div className="po-summary-view-toggle">
          <div className="po-summary-cards-header">
            <h2 className="po-summary-cards-title">Purchase Orders</h2>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="po-summary-toggle-buttons">
                <button
                  onClick={() => setViewMode("card")}
                  className={`po-summary-toggle-btn ${viewMode === "card" ? "po-summary-toggle-active" : ""}`}
                >
                  <svg className="po-summary-toggle-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                  Card View
                </button>
                <button
                  onClick={() => setViewMode("table")}
                  className={`po-summary-toggle-btn ${viewMode === "table" ? "po-summary-toggle-active" : ""}`}
                >
                  <svg className="po-summary-toggle-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M3 18h18M3 6h18" />
                  </svg>
                  Table View
                </button>
              </div>
              <div className="po-summary-export-buttons">
                <button
                  onClick={() => handleExport('excel')}
                  className="po-summary-export-excel"
                >
                  <svg className="po-summary-export-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                  </svg>
                  Export Excel
                </button>
                <button
                  onClick={() => handleExport('pdf')}
                  className="po-summary-export-pdf"
                >
                  <svg className="po-summary-export-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  Export PDF
                </button>
              </div>
            </div>
          </div>
          <div className="po-summary-cards-count">
            {filteredPOData.length} orders found
          </div>
        </div>
        
        {/* Card View */}
        {viewMode === "card" && (
          <div className="po-summary-cards-grid">
            {filteredPOData.map((po, idx) => {
              const poItems = getItemsForPO(po["PO #"]);
              const totalItems = poItems.length;
              const calculatedTotal = getPOTotal(po["PO #"]);
              const descriptions = poItems.map(item => item["Description"]).filter((v, i, a) => a.indexOf(v) === i);
              return (
                <div
                  key={idx}
                  className="po-summary-card"
                  onClick={() => setSelectedPO(po["PO #"])}
                >
                  <div className="po-summary-card-inner">
                    <div className="po-summary-card-gradient"></div>
                    <div className="po-summary-card-content">
                      <div className="po-summary-card-header">
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <span className="po-summary-serial-number">#{idx + 1}</span>
                            <h3 className="po-summary-card-po-number">
                              {po["PO #"]}
                            </h3>
                          </div>
                          <p className="po-summary-card-supplier">{po["Supplier"]}</p>
                        </div>
                        <span
                          className={`po-summary-status-badge po-summary-status-${(po["Status"] || "default").toLowerCase()}`}
                        >
                          {po["Status"] || "N/A"}
                        </span>
                      </div>
                      
                      <div className="po-summary-card-details">
                        <div className="po-summary-detail-row">
                          <span className="po-summary-detail-label">Order Date:</span>
                          <span className="po-summary-detail-value">{po["Order Date"]}</span>
                        </div>
                        <div className="po-summary-detail-row">
                          <span className="po-summary-detail-label">Expected:</span>
                          <span className="po-summary-detail-value">{po["Expected Date"]}</span>
                        </div>
                        <div className="po-summary-detail-row">
                          <span className="po-summary-detail-label">Lead Time:</span>
                          <span className="po-summary-detail-value">{po["Lead Time (human)"]}</span>
                        </div>
                        <div className="po-summary-divider"></div>
                        <div className="po-summary-detail-row">
                          <span className="po-summary-detail-label">Total Amount:</span>
                          <span className="po-summary-total-amount">
                            ₹{po["Total Amount"] || calculatedTotal}
                          </span>
                        </div>
                        <div className="po-summary-detail-row">
                          <span className="po-summary-detail-label">Items:</span>
                          <span className="po-summary-detail-value">{totalItems}</span>
                        </div>
                        <div className="po-summary-detail-row">
                          <span className="po-summary-detail-label">Supervisor:</span>
                          <span className="po-summary-detail-value">{po["Supervisor"]}</span>
                        </div>
                        {descriptions.length > 0 && (
                          <div className="po-summary-detail-row">
                            <span className="po-summary-detail-label">Descriptions:</span>
                            <span className="po-summary-detail-value po-summary-descriptions">
                              {descriptions.slice(0, 2).join(", ")}
                              {descriptions.length > 2 && ` +${descriptions.length - 2}`}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      <div className="po-summary-card-footer" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <button className="po-summary-view-button">
                          View Details
                          <svg className="po-summary-view-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadSinglePoPDF(po["PO #"]);
                          }}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            padding: "6px 12px",
                            backgroundColor: "#eff6ff",
                            color: "#1e40af",
                            border: "1px solid #bfdbfe",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: "700",
                            cursor: "pointer",
                            transition: "all 0.2s ease"
                          }}
                          title="Download PDF for this PO"
                        >
                          📄 PDF
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Table View */}
        {viewMode === "table" && (
          <div className="po-summary-table-view">
            <div className="po-summary-table-wrapper">
              <table className="po-summary-table">
                <thead className="po-summary-table-header">
                  <tr>
                    <th className="po-summary-table-th">S.No</th>
                    <th className="po-summary-table-th">PO #</th>
                    <th className="po-summary-table-th">Supplier</th>
                    <th className="po-summary-table-th">Order Date</th>
                    <th className="po-summary-table-th">Expected Date</th>
                    <th className="po-summary-table-th">Status</th>
                    <th className="po-summary-table-th">Supervisor</th>
                    <th className="po-summary-table-th po-summary-text-right">Total Amount</th>
                    <th className="po-summary-table-th po-summary-text-center">Items</th>
                    <th className="po-summary-table-th">Descriptions</th>
                    <th className="po-summary-table-th po-summary-text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="po-summary-table-body">
                  {filteredPOData.map((po, idx) => {
                    const poItems = getItemsForPO(po["PO #"]);
                    const totalItems = poItems.length;
                    const calculatedTotal = getPOTotal(po["PO #"]);
                    const descriptions = poItems.map(item => item["Description"]).join(", ");
                    return (
                      <tr key={idx} className="po-summary-table-row">
                        <td className="po-summary-table-td po-summary-text-center">{idx + 1}</td>
                        <td className="po-summary-table-td po-summary-font-semibold">{po["PO #"]}</td>
                        <td className="po-summary-table-td">{po["Supplier"]}</td>
                        <td className="po-summary-table-td">{po["Order Date"]}</td>
                        <td className="po-summary-table-td">{po["Expected Date"]}</td>
                        <td className="po-summary-table-td">
                          <span className={`po-summary-status-badge po-summary-status-${(po["Status"] || "default").toLowerCase()}`}>
                            {po["Status"] || "N/A"}
                          </span>
                        </td>
                        <td className="po-summary-table-td">{po["Supervisor"]}</td>
                        <td className="po-summary-table-td po-summary-text-right po-summary-font-semibold">
                          ₹{po["Total Amount"] || calculatedTotal}
                        </td>
                        <td className="po-summary-table-td po-summary-text-center">{totalItems}</td>
                        <td className="po-summary-table-td po-summary-descriptions-cell">
                          {descriptions.substring(0, 100)}{descriptions.length > 100 ? "..." : ""}
                        </td>
                        <td className="po-summary-table-td po-summary-text-center" style={{ whiteSpace: "nowrap" }}>
                          <button
                            onClick={() => setSelectedPO(po["PO #"])}
                            className="po-summary-table-view-btn"
                            style={{ marginRight: "6px" }}
                          >
                            View
                          </button>
                          <button
                            onClick={() => downloadSinglePoPDF(po["PO #"])}
                            style={{
                              padding: "4px 8px",
                              backgroundColor: "#dc2626",
                              color: "white",
                              border: "none",
                              borderRadius: "4px",
                              fontSize: "12px",
                              fontWeight: "700",
                              cursor: "pointer"
                            }}
                            title="Download PDF"
                          >
                            PDF
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Selected PO Details Modal */}
        {selectedPO && (
          <div style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.75)",
            backdropFilter: "blur(4px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "clamp(8px, 2vw, 20px)",
            boxSizing: "border-box"
          }}>
            <div style={{
              backgroundColor: "#ffffff",
              borderRadius: "16px",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
              maxWidth: "1100px",
              width: "100%",
              maxHeight: "92vh",
              overflowY: "auto",
              border: "1px solid #cbd5e1",
              boxSizing: "border-box"
            }}>
              {/* Modal Header */}
              <div style={{
                position: "sticky",
                top: 0,
                background: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)",
                color: "#ffffff",
                padding: "clamp(12px, 2vw, 20px) clamp(14px, 2.5vw, 24px)",
                borderTopLeftRadius: "16px",
                borderTopRightRadius: "16px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "10px",
                zIndex: 10,
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
              }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: "clamp(16px, 2vw, 20px)", fontWeight: "700", color: "#ffffff" }}>
                    Purchase Order Details
                  </h2>
                  <div style={{
                    marginTop: "4px",
                    display: "inline-block",
                    backgroundColor: "rgba(255, 255, 255, 0.2)",
                    padding: "3px 8px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "#ffffff"
                  }}>
                    {selectedPO}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    onClick={() => downloadSinglePoPDF(selectedPO)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "7px 14px",
                      backgroundColor: "#ffffff",
                      color: "#1e3a8a",
                      border: "none",
                      borderRadius: "8px",
                      fontSize: "12px",
                      fontWeight: "700",
                      cursor: "pointer",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                      transition: "transform 0.15s ease"
                    }}
                    title="Download PO PDF"
                  >
                    📄 Download PDF
                  </button>
                  <button
                    onClick={() => setSelectedPO(null)}
                    style={{
                      backgroundColor: "#ef4444",
                      border: "2px solid #ffffff",
                      borderRadius: "50%",
                      width: "32px",
                      height: "32px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#ffffff",
                      fontWeight: "bold",
                      fontSize: "16px",
                      cursor: "pointer",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.2)"
                    }}
                    title="Close"
                  >
                    ✕
                  </button>
                </div>
              </div>
              
              <div style={{ padding: "clamp(12px, 2.5vw, 24px)", backgroundColor: "#f8fafc", boxSizing: "border-box" }}>
                {/* PO Main Info */}
                {poData
                  .filter((po) => po["PO #"] === selectedPO)
                  .map((po, idx) => (
                    <div key={idx} style={{
                      backgroundColor: "#ffffff",
                      borderRadius: "12px",
                      padding: "clamp(12px, 2vw, 20px)",
                      marginBottom: "20px",
                      border: "1px solid #e2e8f0",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
                      boxSizing: "border-box"
                    }}>
                      <h3 style={{
                        margin: "0 0 14px 0",
                        fontSize: "15px",
                        fontWeight: "800",
                        color: "#0f172a",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px"
                      }}>
                        ℹ️ Order Information
                      </h3>
                      <div style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                        gap: "10px"
                      }}>
                        {[
                          { label: "Supplier", value: po["Supplier"] },
                          { label: "Order Date/Time", value: `${po["Order Date"]} ${po["Order Time"] || ""}` },
                          { label: "Expected Date/Time", value: `${po["Expected Date"]} ${po["Expected Time"] || ""}` },
                          { label: "Lead Time", value: po["Lead Time (human)"] || "—" },
                          { label: "Supervisor", value: po["Supervisor"] || "—" },
                          { label: "Status", value: po["Status"] || "—", isStatus: true },
                          { label: "Gate In At", value: po["Gate In At"] || "—" },
                          { label: "Received At", value: po["Received At"] || "—" },
                          { label: "Raised By", value: po["REQUISITION RAISED BY"] || "—" },
                          { label: "Authorized By", value: po["AUTHORIZED BY"] || "—" }
                        ].map((info, i) => (
                          <div key={i} style={{
                            backgroundColor: "#f8fafc",
                            border: "1px solid #e2e8f0",
                            borderRadius: "8px",
                            padding: "8px 12px"
                          }}>
                            <div style={{
                              fontSize: "10px",
                              fontWeight: "700",
                              color: "#64748b",
                              textTransform: "uppercase",
                              marginBottom: "3px"
                            }}>
                              {info.label}
                            </div>
                            <div style={{
                              fontSize: "13px",
                              fontWeight: "700",
                              color: "#0f172a",
                              wordBreak: "break-word"
                            }}>
                              {info.isStatus ? (
                                <span style={{
                                  display: "inline-block",
                                  padding: "2px 8px",
                                  borderRadius: "20px",
                                  fontSize: "11px",
                                  fontWeight: "700",
                                  backgroundColor: "#dcfce7",
                                  color: "#166534",
                                  border: "1px solid #86efac"
                                }}>
                                  {info.value}
                                </span>
                              ) : (
                                info.value
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                {/* Items Table */}
                <div style={{
                  backgroundColor: "#ffffff",
                  borderRadius: "12px",
                  padding: "clamp(12px, 2vw, 20px)",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
                  boxSizing: "border-box"
                }}>
                  <h3 style={{
                    margin: "0 0 14px 0",
                    fontSize: "15px",
                    fontWeight: "800",
                    color: "#0f172a",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px"
                  }}>
                    📋 Order Items
                  </h3>
                  <div style={{
                    overflowX: "auto",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1"
                  }}>
                    <table style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      textAlign: "left"
                    }}>
                      <thead>
                        <tr style={{
                          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
                          color: "#ffffff"
                        }}>
                          {["S.No", "Line #", "Department", "Description", "UOM", "Qty", "Rate", "Amount"].map((h, idx) => (
                            <th key={idx} style={{
                              padding: "12px 14px",
                              fontSize: "12px",
                              fontWeight: "800",
                              color: "#ffffff",
                              textTransform: "uppercase",
                              letterSpacing: "0.5px",
                              textAlign: idx >= 5 ? "right" : (idx === 0 || idx === 4 ? "center" : "left"),
                              borderBottom: "2px solid #334155"
                            }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {getItemsForPO(selectedPO).map((item, idx) => (
                          <tr key={idx} style={{
                            backgroundColor: idx % 2 === 0 ? "#ffffff" : "#f8fafc",
                            borderBottom: "1px solid #e2e8f0"
                          }}>
                            <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: "600", color: "#64748b" }}>{idx + 1}</td>
                            <td style={{ padding: "10px 14px", fontWeight: "600", color: "#1e293b" }}>{item["Line #"]}</td>
                            <td style={{ padding: "10px 14px", color: "#334155" }}>{item["Department"]}</td>
                            <td style={{ padding: "10px 14px", fontWeight: "600", color: "#0f172a" }}>{item["Description"]}</td>
                            <td style={{ padding: "10px 14px", textAlign: "center", color: "#64748b" }}>{item["UOM"]}</td>
                            <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: "700", color: "#1e293b" }}>{item["Qty"]}</td>
                            <td style={{ padding: "10px 14px", textAlign: "right", color: "#475569" }}>₹{item["Rate"]}</td>
                            <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: "800", color: "#2563eb" }}>₹{item["Amount"]}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{
                          backgroundColor: "#f1f5f9",
                          borderTop: "2px solid #cbd5e1"
                        }}>
                          <td colSpan="7" style={{
                            padding: "14px 16px",
                            textAlign: "right",
                            fontSize: "14px",
                            fontWeight: "800",
                            color: "#0f172a"
                          }}>
                            Total Amount:
                          </td>
                          <td style={{
                            padding: "14px 16px",
                            textAlign: "right",
                            fontSize: "16px",
                            fontWeight: "800",
                            color: "#2563eb"
                          }}>
                            ₹{getPOTotal(selectedPO)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {filteredPOData.length === 0 && !loading && (
          <div className="po-summary-empty-state">
            <div className="po-summary-empty-icon">📋</div>
            <h3 className="po-summary-empty-title">No Purchase Orders Found</h3>
            <p className="po-summary-empty-message">Try adjusting your filters to see more results.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default POSummaryReport;