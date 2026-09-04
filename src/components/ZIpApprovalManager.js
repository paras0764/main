import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  SHEET_ID_ZIP_RGP,
  GOOGLE_API_KEY,
  WEB_APP_URL_ZIP_APPROVAL
} from '../config/apiConfig';

const SheetDataViewer = () => {
  const [data, setData] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionLoading, setActionLoading] = useState(null);
  const [selectedRow, setSelectedRow] = useState(null);
  const [expandedRow, setExpandedRow] = useState(null);
  const [poDialogOpen, setPoDialogOpen] = useState(false);
  const [selectedPoData, setSelectedPoData] = useState(null);
  const [zipQualityData, setZipQualityData] = useState([]);

  const SPREADSHEET_ID = SHEET_ID_ZIP_RGP;
  const API_KEY = GOOGLE_API_KEY;
  const RANGE = 'ZipPurchaseOrders!A:AA';
  const ZIP_DATA_RANGE = 'ZipData!A:C';
  const QR_SYSTEM_URL = WEB_APP_URL_ZIP_APPROVAL;

  // Professional Blue & White Theme Styles
  const styles = {
    container: {
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      padding: '24px',
      backgroundColor: '#f8fafc',
      minHeight: '100vh'
    },
    header: {
      textAlign: 'center',
      marginBottom: '32px'
    },
    headerTitle: {
      fontSize: '2.25rem',
      fontWeight: '700',
      color: '#1e40af',
      marginBottom: '8px'
    },
    headerSubtitle: {
      fontSize: '1.1rem',
      color: '#64748b',
      fontWeight: '400'
    },
    dashboard: {
      backgroundColor: 'white',
      borderRadius: '12px',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
      overflow: 'hidden',
      border: '1px solid #e2e8f0'
    },
    controls: {
      padding: '20px',
      borderBottom: '1px solid #e2e8f0',
      backgroundColor: '#f8fafc',
      display: 'flex',
      gap: '12px',
      alignItems: 'center',
      flexWrap: 'wrap'
    },
    searchBox: {
      padding: '10px 16px',
      border: '1px solid #d1d5db',
      borderRadius: '8px',
      fontSize: '14px',
      minWidth: '300px',
      flex: '1',
      backgroundColor: 'white',
      outline: 'none',
      transition: 'border-color 0.2s ease'
    },
    refreshButton: {
      padding: '10px 20px',
      backgroundColor: '#3b82f6',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      fontWeight: '600',
      fontSize: '14px',
      whiteSpace: 'nowrap',
      minWidth: '120px',
      transition: 'background-color 0.2s ease'
    },
    stats: {
      padding: '16px 20px',
      backgroundColor: '#1e40af',
      color: 'white',
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      gap: '16px'
    },
    statItem: {
      textAlign: 'center'
    },
    statNumber: {
      fontSize: '1.5rem',
      fontWeight: '700',
      marginBottom: '4px'
    },
    statLabel: {
      fontSize: '0.875rem',
      opacity: '0.9',
      fontWeight: '500'
    },
    tableContainer: {
      overflow: 'auto',
      maxHeight: '70vh'
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      minWidth: '1400px'
    },
    tableHeader: {
      backgroundColor: '#f8fafc',
      borderBottom: '2px solid #e2e8f0',
      position: 'sticky',
      top: 0,
      zIndex: 10
    },
    headerCell: {
      padding: '12px 8px',
      fontWeight: '600',
      color: '#374151',
      fontSize: '11px',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      textAlign: 'center',
      borderRight: '1px solid #e2e8f0',
      whiteSpace: 'nowrap',
      backgroundColor: '#f8fafc',
      position: 'sticky',
      top: 0
    },
    tableRow: {
      borderBottom: '1px solid #f1f5f9',
      transition: 'background-color 0.2s ease',
      cursor: 'pointer'
    },
    tableRowHover: {
      backgroundColor: '#f8fafc'
    },
    tableCell: {
      padding: '12px 8px',
      fontSize: '13px',
      color: '#374151',
      borderRight: '1px solid #f1f5f9',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      maxWidth: '200px',
      verticalAlign: 'top',
      textAlign: 'center',
    },
    actionCell: {
      padding: '12px 8px',
      textAlign: 'center',
      whiteSpace: 'nowrap',
      position: 'sticky',
      right: 0,
      backgroundColor: 'inherit',
      borderLeft: '2px solid #e2e8f0'
    },
    actionButtons: {
      display: 'flex',
      gap: '6px',
      justifyContent: 'center',
      minWidth: '180px' // Reduced width since we removed buttons
    },
    displayPoButton: {
      padding: '6px 12px',
      backgroundColor: '#3b82f6',
      color: 'white',
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
      fontSize: '11px',
      fontWeight: '600',
      transition: 'background-color 0.2s ease',
      minWidth: '100px'
    },
    expandButton: {
      padding: '6px 12px',
      backgroundColor: '#6b7280',
      color: 'white',
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
      fontSize: '11px',
      fontWeight: '600',
      transition: 'background-color 0.2s ease',
      minWidth: '70px'
    },
    disabledButton: {
      opacity: '0.6',
      cursor: 'not-allowed'
    },
    loadingSpinner: {
      display: 'inline-block',
      width: '12px',
      height: '12px',
      border: '2px solid transparent',
      borderTop: '2px solid currentColor',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite'
    },
    emptyState: {
      padding: '60px 20px',
      textAlign: 'center',
      color: '#64748b'
    },
    errorState: {
      padding: '40px',
      textAlign: 'center',
      backgroundColor: '#fef2f2',
      border: '1px solid #fecaca',
      borderRadius: '8px',
      margin: '20px'
    },
    expandedRow: {
      backgroundColor: '#f0f9ff'
    },
    expandedContent: {
      padding: '20px',
      backgroundColor: '#f8fafc',
      borderTop: '1px solid #e2e8f0'
    },
    detailGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
      gap: '16px'
    },
    detailGroup: {
      marginBottom: '16px'
    },
    detailGroupTitle: {
      fontSize: '14px',
      fontWeight: '600',
      color: '#1e40af',
      marginBottom: '8px',
      paddingBottom: '4px',
      borderBottom: '1px solid #e2e8f0'
    },
    detailItem: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      padding: '6px 0',
      borderBottom: '1px solid #f1f5f9'
    },
    detailLabel: {
      fontWeight: '500',
      color: '#374151',
      fontSize: '12px',
      minWidth: '140px'
    },
    detailValue: {
      color: '#6b7280',
      fontSize: '12px',
      textAlign: 'right',
      flex: 1,
      paddingLeft: '12px'
    }
  };

  // Column grouping for better organization
  const columnGroups = {
    'Basic Information': [
      'Lot Number', 'Garment Type', 'Style', 'Fabric', 'Total Pieces'
    ],
    'Order Details': [
      'Issue Date', 'Supervisor', 'Total Cost (₹)', 'PDF Generated Date'
    ],
    'Material Tracking': [
      'Gate Entry Person', 'Gate Entry Date', 'Material Received By', 
      'Material Received Date', 'Supplier Name', 'Material Entry Date'
    ],
    'Zip Specifications': [
      'Zip Selections', 'Selected Placements', 'Placement Quantities', 
      'Placement Zip Types', 'Color Breakdown', 'Zip Requirements'
    ],
    'Approval Information': [
      'Approval ID', 'Approval Status', 'Approval Request Date', 
      'Approval Decision Date', 'Approved By', 'Approver Comments', 'Approval Link'
    ]
  };

  // Helper functions for zip quality data
  const norm = (v) => (v ?? '').toString().trim();
  const includes = (hay, needle) => norm(hay).toLowerCase().includes(norm(needle).toLowerCase());

  // Fetch zip quality data
  const fetchZipQualityData = useCallback(async () => {
    try {
      const range = encodeURIComponent(ZIP_DATA_RANGE);
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?key=${API_KEY}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch zip quality data: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data?.values?.length) {
        console.warn('Zip Quality sheet is empty');
        return [];
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
        console.warn('Required columns not found in Zip Quality sheet');
        return [];
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
    } catch (error) {
      console.error('Error fetching zip quality data:', error);
      return [];
    }
  }, []);

  // Get zip price from zip quality data
  const getZipPrice = (zipType, color) => {
    if (!zipType || !color || !zipQualityData || zipQualityData.length === 0) return null;
    
    const item = zipQualityData.find(
      item => norm(item.type) === norm(zipType) && 
      norm(item.color).toLowerCase() === norm(color).toLowerCase()
    );
    return item ? item.price : null;
  };

  // Safe JSON parsing with error handling
  const safeJSONParse = (jsonString, defaultValue = {}) => {
    if (!jsonString || typeof jsonString !== 'string') return defaultValue;
    
    try {
      let cleanedString = jsonString.trim();
      
      if (cleanedString.startsWith('"') && cleanedString.endsWith('"')) {
        cleanedString = cleanedString.slice(1, -1);
      }
      
      const parsed = JSON.parse(cleanedString);
      return parsed;
    } catch (error) {
      console.warn('JSON parse error:', error.message, 'String:', jsonString);
      return defaultValue;
    }
  };

  // Parse comma-separated values into object
  const parseCSVToObject = (csvString) => {
    if (!csvString) return {};
    
    try {
      const pairs = csvString.split(',').map(pair => pair.trim());
      const result = {};
      
      pairs.forEach(pair => {
        const [key, value] = pair.split(':').map(part => part.trim());
        if (key && value !== undefined) {
          result[key] = value;
        }
      });
      
      return result;
    } catch (error) {
      console.warn('CSV parse error:', error);
      return {};
    }
  };

  // Generate unique approval ID
  const generateApprovalId = () => {
    return `APPROVAL_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  // Save approval data to Google Sheets via AppScript
  const saveApprovalData = async (approvalData) => {
    try {
      const response = await fetch(QR_SYSTEM_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: JSON.stringify({
          type: 'APPROVAL_DATA',
          approvalData: approvalData
        }),
      });

      const result = await response.text();
      return { success: result.includes('SUCCESS'), message: result };
    } catch (error) {
      console.error('Error saving approval data:', error);
      return { success: false, message: error.message };
    }
  };

  // Fetch data from Google Sheets
  const fetchSheetData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch both purchase orders and zip quality data in parallel
      const [purchaseOrdersData, zipData] = await Promise.all([
        fetchPurchaseOrdersData(),
        fetchZipQualityData()
      ]);

      setZipQualityData(zipData);
      
    } catch (err) {
      setError(err.message);
      console.error('Error fetching sheet data:', err);
    } finally {
      setLoading(false);
    }
  }, [fetchZipQualityData]);

  // Fetch purchase orders data
  const fetchPurchaseOrdersData = async () => {
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${RANGE}?key=${API_KEY}`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch data: ${response.status}`);
      
      const result = await response.json();
      const rows = result.values || [];
      
      if (rows.length === 0) {
        setHeaders([]);
        setData([]);
        return [];
      }

      const sheetHeaders = rows[0];
      setHeaders(sheetHeaders);

      const sheetData = rows.slice(1).map((row, index) => {
        const rowData = { id: index };
        sheetHeaders.forEach((header, colIndex) => {
          rowData[header] = row[colIndex] || '';
        });
        return rowData;
      });

      setData(sheetData);
      return sheetData;
      
    } catch (err) {
      throw err;
    }
  };

  // Handle Accept Action - Now saves to Google Sheets
  const handleAccept = useCallback(async (lotNumber, rowId) => {
    setActionLoading(rowId);
    try {
      // Generate approval ID if not exists
      const approvalId = generateApprovalId();
      
      // Save approval data to Google Sheets
      const approvalData = {
        approvalId,
        lotNumber,
        status: 'APPROVED',
        approvedBy: 'Admin User', // You can change this to dynamic user
        decisionDate: new Date().toISOString(),
        comments: 'Approved via Admin Dashboard'
      };

      const saveResult = await saveApprovalData(approvalData);
      
      if (saveResult.success) {
        // Update local state
        setData(prevData => 
          prevData.map(row => 
            row['Lot Number'] === lotNumber 
              ? { 
                  ...row, 
                  'Approval Status': 'APPROVED',
                  'Approved By': 'Admin User',
                  'Approval Decision Date': new Date().toISOString(),
                  'Approval ID': approvalId
                }
              : row
          )
        );
        
        console.log(`✅ Approved Lot: ${lotNumber} and saved to Google Sheets`);
        alert(`✅ Purchase Order for Lot ${lotNumber} has been APPROVED and saved to the system.`);
      } else {
        throw new Error(saveResult.message);
      }
    } catch (error) {
      console.error('Error accepting:', error);
      alert(`❌ Failed to approve: ${error.message}`);
    } finally {
      setActionLoading(null);
    }
  }, []);

  // Handle Reject Action - Now saves to Google Sheets
  const handleReject = useCallback(async (lotNumber, rowId) => {
    setActionLoading(rowId);
    try {
      // Generate approval ID if not exists
      const approvalId = generateApprovalId();
      
      // Save approval data to Google Sheets
      const approvalData = {
        approvalId,
        lotNumber,
        status: 'REJECTED',
        approvedBy: 'Admin User', // You can change this to dynamic user
        decisionDate: new Date().toISOString(),
        comments: 'Rejected via Admin Dashboard'
      };

      const saveResult = await saveApprovalData(approvalData);
      
      if (saveResult.success) {
        // Update local state
        setData(prevData => 
          prevData.map(row => 
            row['Lot Number'] === lotNumber 
              ? { 
                  ...row, 
                  'Approval Status': 'REJECTED',
                  'Approved By': 'Admin User',
                  'Approval Decision Date': new Date().toISOString(),
                  'Approval ID': approvalId
                }
              : row
          )
        );
        
        console.log(`❌ Rejected Lot: ${lotNumber} and saved to Google Sheets`);
        alert(`❌ Purchase Order for Lot ${lotNumber} has been REJECTED and saved to the system.`);
      } else {
        throw new Error(saveResult.message);
      }
    } catch (error) {
      console.error('Error rejecting:', error);
      alert(`❌ Failed to reject: ${error.message}`);
    } finally {
      setActionLoading(null);
    }
  }, []);

  // Display PO Dialog
  const handleDisplayPO = useCallback((row) => {
    setSelectedPoData(row);
    setPoDialogOpen(true);
  }, []);

  // Close PO Dialog
  const handleClosePO = useCallback(() => {
    setPoDialogOpen(false);
    setSelectedPoData(null);
  }, []);

  // Enhanced formatting functions for human-readable display
  const formatDate = (dateString) => {
    if (!dateString || dateString.toString().trim() === '') return 'N/A';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;
      
      return date.toLocaleDateString('en-IN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
    } catch {
      return dateString;
    }
  };

  const formatDateTime = (dateString) => {
    if (!dateString || dateString.toString().trim() === '') return 'N/A';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;
      
      return date.toLocaleString('en-IN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return dateString;
    }
  };

  // Fixed formatCurrency function
  const formatCurrency = (amount) => {
    if (!amount && amount !== 0) return '₹0.00';
    
    // Convert to string and clean
    const amountStr = amount.toString().trim();
    if (amountStr === '' || isNaN(parseFloat(amountStr))) return '₹0.00';
    
    const numericAmount = parseFloat(amountStr);
    return `₹${numericAmount.toLocaleString('en-IN', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    })}`;
  };

  // Fixed Format PO Data for Display with proper color breakdown
  const parseColorBreakdown = (breakdownStr) => {
    if (!breakdownStr) return {};
    
    try {
      // Handle both JSON and CSV formats
      if (breakdownStr.startsWith('{') || breakdownStr.startsWith('[')) {
        return safeJSONParse(breakdownStr, {});
      }
      
      // Handle "Color: quantitypcs; Color2: quantitypcs" format
      const result = {};
      const pairs = breakdownStr.split(';').map(pair => pair.trim()).filter(pair => pair);
      
      pairs.forEach(pair => {
        const [color, quantityWithPcs] = pair.split(':').map(part => part.trim());
        if (color && quantityWithPcs) {
          // Extract numeric quantity (remove "pcs" and any other text)
          const quantity = parseInt(quantityWithPcs.replace(/[^\d]/g, '')) || 0;
          result[color] = quantity;
        }
      });
      
      return result;
    } catch (error) {
      console.warn('Error parsing color breakdown:', error);
      return {};
    }
  };

  // Update the formatPOData function to use this enhanced parser
  const formatPOData = useCallback((row) => {
    if (!row) return null;

    // Enhanced color breakdown parsing
    const colorBreakdown = parseColorBreakdown(row['Color Breakdown']);
    const zipRequirements = safeJSONParse(row['Zip Requirements'], {});
    const zipSelections = safeJSONParse(row['Zip Selections'], {});
    const selectedPlacements = safeJSONParse(row['Selected Placements'], []);
    const placementQuantities = safeJSONParse(row['Placement Quantities'], {});
    const placementZipTypes = safeJSONParse(row['Placement Zip Types'], {});
    
    // If JSON parsing fails, try CSV parsing as fallback
    const finalZipRequirements = Object.keys(zipRequirements).length > 0 ? zipRequirements : parseCSVToObject(row['Zip Requirements']);
    const finalZipSelections = Object.keys(zipSelections).length > 0 ? zipSelections : parseCSVToObject(row['Zip Selections']);

    // Calculate zip details with rates - FIXED to include all colors
    const zipDetails = [];
    let totalZipCost = 0;

    console.log('Processing PO:', {
      lotNumber: row['Lot Number'],
      colorBreakdown,
      zipSelections: finalZipSelections,
      placements: selectedPlacements,
      placementQuantities,
      zipTypes: placementZipTypes
    });

    if (selectedPlacements.length > 0 && finalZipSelections) {
      selectedPlacements.forEach(placement => {
        const placementQuantity = placementQuantities[placement] || 1;
        const zipType = placementZipTypes[placement];
        
        if (zipType) {
          // Process each color in the color breakdown
          Object.entries(colorBreakdown).forEach(([color, quantity]) => {
            const zipColor = finalZipSelections[color];
            if (zipColor && quantity > 0) {
              // Get price from zip quality data
              const price = getZipPrice(zipType, zipColor);
              
              console.log(`Color: ${color}, ZipColor: ${zipColor}, Price: ${price}, Quantity: ${quantity}`);
              
              if (price !== null) {
                const requiredQuantity = quantity * placementQuantity; 
                const rowTotal = price * requiredQuantity;
                totalZipCost += rowTotal;

                zipDetails.push({
                  type: zipType,
                  description: `${placement} (${placementQuantity} per pc)`,
                  color: color,
                  zipColor: zipColor,
                  quantity: requiredQuantity,
                  rate: price,
                  total: rowTotal
                });
              } else {
                console.warn(`No price found for zip type: ${zipType}, color: ${zipColor}`);
              }
            }
          });
        }
      });
    }

    console.log('Final zip details:', {
      totalZipCost,
      zipDetailsCount: zipDetails.length,
      zipDetails
    });

    return {
      lotNumber: row['Lot Number'] || 'N/A',
      garmentType: row['Garment Type'] || 'N/A',
      style: row['Style'] || 'N/A',
      fabric: row['Fabric'] || 'N/A',
      supervisor: row['Supervisor'] || 'N/A',
      issueDate: formatDate(row['Issue Date']),
      totalPieces: row['Total Pieces'] || '0',
      colorBreakdown: colorBreakdown,
      zipRequirements: finalZipRequirements,
      zipSelections: finalZipSelections,
      zipDetails: zipDetails,
      totalZipCost: totalZipCost,
      totalCost: row['Total Cost (₹)'] || '0',
      approvalId: row['Approval ID'] || generateApprovalId(),
      approvalStatus: row['Approval Status'] || 'PENDING',
      generatedDate: formatDateTime(row['PDF Generated Date'] || row['Timestamp'] || new Date().toISOString())
    };
  }, [zipQualityData]);

  // Enhanced JSON formatting with human-readable display
  const formatJSONForDisplay = (jsonString) => {
    if (!jsonString || jsonString.toString().trim() === '') return null;
    
    try {
      const parsed = safeJSONParse(jsonString.toString());
      
      if (Array.isArray(parsed)) {
        return (
          <div>
            {parsed.map((item, index) => (
              <div key={index} style={{ display: 'inline-block', margin: '2px 4px 2px 0', padding: '2px 6px', backgroundColor: '#e2e8f0', borderRadius: '3px', fontSize: '11px' }}>
                {typeof item === 'object' ? JSON.stringify(item) : String(item)}
              </div>
            ))}
          </div>
        );
      } else if (typeof parsed === 'object' && parsed !== null) {
        return (
          <div>
            {Object.entries(parsed).map(([key, value]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontWeight: '600', color: '#374151', fontSize: '11px' }}>
                  {key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^./, str => str.toUpperCase()).trim()}:
                </span>
                <span style={{ color: '#6b7280', fontSize: '11px', marginLeft: '8px' }}>
                  {Array.isArray(value) ? value.join(', ') : String(value)}
                </span>
              </div>
            ))}
          </div>
        );
      } else {
        return String(parsed);
      }
    } catch {
      return jsonString;
    }
  };

  // Format specific fields with custom logic
  const formatFieldValue = (header, value) => {
    if (!value && value !== 0 && value !== false) return '-';

    const stringValue = value.toString();

    // Date fields
    if (header.includes('Date') || header.includes('Timestamp')) {
      return formatDateTime(stringValue);
    }

    // Currency fields
    if (header.includes('Cost') || header.includes('Amount')) {
      return formatCurrency(stringValue);
    }

    // Numeric fields
    if (header.includes('Pieces') || header.includes('Quantity') || header.includes('Number')) {
      if (!isNaN(parseFloat(stringValue))) {
        return parseFloat(stringValue).toLocaleString('en-IN');
      }
    }

    // Status fields
    if (header.includes('Status')) {
      return (
        <span style={{
          padding: '2px 8px',
          borderRadius: '12px',
          fontSize: '10px',
          fontWeight: '600',
          backgroundColor: 
            stringValue === 'APPROVED' ? '#10b981' :
            stringValue === 'REJECTED' ? '#ef4444' :
            stringValue === 'PENDING' ? '#f59e0b' : '#6b7280',
          color: 'white'
        }}>
          {stringValue}
        </span>
      );
    }

    // JSON-like fields
    if (header.includes('Breakdown') || header.includes('Selections') || 
        header.includes('Requirements') || header.includes('Placements')) {
      const formatted = formatJSONForDisplay(stringValue);
      if (formatted) return formatted;
    }

    // Long text fields - truncate in table view
    if (stringValue.length > 50 && !header.includes('Link')) {
      return (
        <span title={stringValue}>
          {stringValue.substring(0, 47)}...
        </span>
      );
    }

    // URLs
    if (header.includes('Link') && (stringValue.startsWith('http') || stringValue.includes('.com'))) {
      return (
        <a 
          href={stringValue} 
          target="_blank" 
          rel="noopener noreferrer"
          style={{ color: '#3b82f6', textDecoration: 'none' }}
          onClick={(e) => e.stopPropagation()}
        >
          🔗 Open Link
        </a>
      );
    }

    return stringValue;
  };

  // Filter only pending/not-approved records
  const pendingData = useMemo(() => {
    return data.filter(row => 
      !row['Approval Status'] || 
      row['Approval Status'] === 'PENDING' || 
      row['Approval Status'] === 'NOT_REQUESTED' ||
      row['Approval Status'] === ''
    );
  }, [data]);

  // Filter data based on search
  const filteredData = useMemo(() => {
    if (!searchTerm) return pendingData;
    
    const lowerSearch = searchTerm.toLowerCase();
    return pendingData.filter(row => 
      Object.values(row).some(value => 
        value.toString().toLowerCase().includes(lowerSearch)
      )
    );
  }, [pendingData, searchTerm]);

  // Get statistics
  const stats = useMemo(() => ({
    totalPending: pendingData.length,
    totalFiltered: filteredData.length,
    totalApproved: data.filter(row => row['Approval Status'] === 'APPROVED').length,
    totalRejected: data.filter(row => row['Approval Status'] === 'REJECTED').length
  }), [pendingData, filteredData, data]);

  const toggleRowExpand = (rowId) => {
    setExpandedRow(expandedRow === rowId ? null : rowId);
  };

  // Get main table columns (key columns for compact view) - REMOVED Timestamp and Approval Status
  const mainTableColumns = [
    'Lot Number', 'Garment Type', 'Style', 'Total Pieces', 
    'Supervisor', 'Total Cost (₹)'
  ];

  useEffect(() => {
    fetchSheetData();
  }, [fetchSheetData]);

  // PO Dialog Component with Zip Rate Integration
  const PODialog = () => {
    if (!poDialogOpen || !selectedPoData) return null;

    const poData = formatPOData(selectedPoData);
    if (!poData) return null;

    // Enhanced professional styles
    const professionalStyles = {
      dialogOverlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
        backdropFilter: 'blur(8px)'
      },
      dialogContent: {
        backgroundColor: 'white',
        borderRadius: '24px',
        boxShadow: '0 32px 64px -12px rgba(0, 0, 0, 0.35), 0 16px 32px -8px rgba(0, 0, 0, 0.15)',
        maxWidth: '1400px',
        width: '100%',
        maxHeight: '95vh',
        overflow: 'auto',
        border: '1px solid #e5e7eb',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
      },
      dialogHeader: {
        padding: '32px 40px 24px 40px',
        borderBottom: '1px solid #f3f4f6',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        background: 'linear-gradient(135deg, #1e3a8a 0%, #3730a3 100%)',
        color: 'white',
        borderRadius: '24px 24px 0 0',
        position: 'relative'
      },
      dialogTitle: {
        fontSize: '2rem',
        fontWeight: '700',
        margin: '0 0 8px 0',
        letterSpacing: '-0.025em'
      },
      closeButton: {
        background: 'rgba(255, 255, 255, 0.15)',
        border: 'none',
        fontSize: '1.75rem',
        cursor: 'pointer',
        color: 'white',
        padding: '12px 16px',
        borderRadius: '12px',
        transition: 'all 0.2s ease',
        width: '48px',
        height: '48px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'absolute',
        top: '32px',
        right: '40px'
      },
      dialogBody: {
        padding: '0',
        backgroundColor: '#fafafa'
      },
      section: {
        padding: '32px 40px',
        borderBottom: '1px solid #f3f4f6',
        backgroundColor: 'white'
      },
      sectionHeader: {
        display: 'flex',
        alignItems: 'center',
        marginBottom: '28px',
        paddingBottom: '20px',
        borderBottom: '2px solid #f1f5f9'
      },
      sectionIcon: {
        width: '48px',
        height: '48px',
        backgroundColor: '#3b82f6',
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: '20px',
        color: 'white',
        fontSize: '1.3rem',
        boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
      },
      sectionTitle: {
        fontSize: '1.5rem',
        fontWeight: '600',
        color: '#111827',
        margin: 0,
        flex: 1,
        letterSpacing: '-0.025em'
      },
      grid: {
        display: 'grid',
        gap: '24px'
      },
      twoColumnGrid: {
        gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))'
      },
      threeColumnGrid: {
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))'
      },
      card: {
        backgroundColor: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: '16px',
        padding: '28px',
        boxShadow: '0 2px 12px rgba(0, 0, 0, 0.04)',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        height: 'fit-content'
      },
      infoCard: {
        backgroundColor: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: '16px',
        padding: '24px',
        textAlign: 'center',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)'
      },
      label: {
        fontSize: '0.875rem',
        fontWeight: '600',
        color: '#6b7280',
        marginBottom: '8px',
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
      },
      value: {
        fontSize: '1.125rem',
        fontWeight: '500',
        color: '#111827',
        marginBottom: '8px',
        lineHeight: '1.4'
      },
      largeValue: {
        fontSize: '1.875rem',
        fontWeight: '700',
        color: '#1e40af',
        margin: '12px 0',
        lineHeight: '1.2'
      },
      statusBadge: {
        display: 'inline-flex',
        alignItems: 'center',
        padding: '10px 20px',
        borderRadius: '24px',
        fontSize: '0.875rem',
        fontWeight: '600',
        marginLeft: '12px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
      },
      pendingBadge: {
        backgroundColor: '#fffbeb',
        color: '#d97706',
        border: '1px solid #fcd34d'
      },
      actionSection: {
        padding: '40px',
        backgroundColor: '#f8fafc',
        borderRadius: '0 0 24px 24px',
        borderTop: '1px solid #e5e7eb'
      },
      actionGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '24px',
        marginTop: '24px'
      },
      actionButton: {
        padding: '20px 28px',
        borderRadius: '16px',
        border: 'none',
        fontSize: '1.125rem',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        textDecoration: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        boxShadow: '0 6px 20px rgba(0, 0, 0, 0.12)',
        letterSpacing: '-0.025em'
      },
      approveButton: {
        backgroundColor: '#059669',
        color: 'white'
      },
      rejectButton: {
        backgroundColor: '#dc2626',
        color: 'white'
      },
      approvalInfo: {
        backgroundColor: '#f0f9ff',
        border: '2px solid #bae6fd',
        borderRadius: '20px',
        padding: '32px',
        marginBottom: '24px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.05)'
      },
      approvalTitle: {
        fontSize: '1.5rem',
        fontWeight: '700',
        color: '#0369a1',
        marginBottom: '16px',
        textAlign: 'center',
        letterSpacing: '-0.025em'
      },
      approvalMessage: {
        fontSize: '1.1rem',
        color: '#475569',
        lineHeight: '1.6',
        textAlign: 'center',
        marginBottom: '24px'
      },
      tableContainer: {
        backgroundColor: 'white',
        borderRadius: '16px',
        border: '1px solid #e5e7eb',
        overflow: 'hidden',
        boxShadow: '0 2px 12px rgba(0, 0, 0, 0.04)'
      },
      table: {
        width: '100%',
        borderCollapse: 'collapse'
      },
      tableHeader: {
        backgroundColor: '#f8fafc',
        borderBottom: '2px solid #e5e7eb'
      },
      tableHeaderCell: {
        padding: '20px 24px',
        textAlign: 'left',
        fontSize: '0.875rem',
        fontWeight: '600',
        color: '#374151',
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
      },
      tableRow: {
        borderBottom: '1px solid #f3f4f6',
        transition: 'background-color 0.2s ease'
      },
      tableCell: {
        padding: '20px 24px',
        fontSize: '1rem',
        fontWeight: '500',
        color: '#111827'
      },
      totalRow: {
        backgroundColor: '#f0fdf4',
        borderTop: '2px solid #bbf7d0'
      },
      totalCell: {
        padding: '20px 24px',
        fontSize: '1.125rem',
        fontWeight: '700',
        color: '#166534'
      }
    };

    return (
      <div style={professionalStyles.dialogOverlay} onClick={handleClosePO}>
        <div style={professionalStyles.dialogContent} onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div style={professionalStyles.dialogHeader}>
            <div style={{ flex: 1 }}>
              <h2 style={professionalStyles.dialogTitle}>Purchase Order Details</h2>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '24px',
                marginTop: '12px',
                flexWrap: 'wrap'
              }}>
                <p style={{ margin: 0, opacity: 0.9, fontSize: '1.1rem' }}>
                  📋 Lot #{poData.lotNumber} • Requires Approval
                </p>
                <span style={{...professionalStyles.statusBadge, ...professionalStyles.pendingBadge}}>
                  ⏳ Pending Approval
                </span>
              </div>
            </div>
            <button 
              style={professionalStyles.closeButton}
              onClick={handleClosePO}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.25)';
                e.target.style.transform = 'scale(1.1)';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
                e.target.style.transform = 'scale(1)';
              }}
            >
              ×
            </button>
          </div>

          <div style={professionalStyles.dialogBody}>
            {/* Approval Information */}
            <div style={professionalStyles.section}>
              <div style={professionalStyles.approvalInfo}>
                <h3 style={professionalStyles.approvalTitle}>📋 APPROVAL REQUIRED</h3>
                <div style={professionalStyles.approvalMessage}>
                  This purchase order requires your approval. Please review all details including zip rates before taking action.
                </div>
                
                <div style={{...professionalStyles.grid, ...professionalStyles.twoColumnGrid}}>
                  <div style={professionalStyles.card}>
                    <div style={professionalStyles.label}>Order Summary</div>
                    <div style={professionalStyles.value}>
                      <strong>{poData.garmentType}</strong> • {poData.style}
                    </div>
                    <div style={professionalStyles.value}>
                      {parseInt(poData.totalPieces).toLocaleString('en-IN')} pieces
                    </div>
                    <div style={professionalStyles.largeValue}>
                      {formatCurrency(poData.totalCost)}
                    </div>
                  </div>
                  
                  <div style={professionalStyles.card}>
                    <div style={professionalStyles.label}>Timeline & Status</div>
                    <div style={professionalStyles.value}>📅 Created: {poData.issueDate}</div>
                    <div style={professionalStyles.value}>⏰ Status: Pending Review</div>
                    <div style={{...professionalStyles.value, color: '#dc2626', fontWeight: '700'}}>
                      ⚠️ Respond within 24 hours
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Order Overview */}
            <div style={professionalStyles.section}>
              <div style={professionalStyles.sectionHeader}>
                <div style={professionalStyles.sectionIcon}>📦</div>
                <h3 style={professionalStyles.sectionTitle}>Order Overview</h3>
              </div>
              
              <div style={{...professionalStyles.grid, ...professionalStyles.twoColumnGrid}}>
                <div style={professionalStyles.card}>
                  <div style={professionalStyles.label}>Garment Details</div>
                  <div style={professionalStyles.value}>
                    <strong>{poData.garmentType}</strong>
                  </div>
                  <div style={{...professionalStyles.value, color: '#6b7280', fontSize: '1.1rem'}}>
                    {poData.style}
                  </div>
                  <div style={{...professionalStyles.value, color: '#6b7280', fontSize: '1rem'}}>
                    {poData.fabric}
                  </div>
                </div>
                
                <div style={professionalStyles.card}>
                  <div style={professionalStyles.grid}>
                    <div>
                      <div style={professionalStyles.label}>Supervisor</div>
                      <div style={professionalStyles.value}>👤 {poData.supervisor}</div>
                    </div>
                    <div>
                      <div style={professionalStyles.label}>Issue Date</div>
                      <div style={professionalStyles.value}>📅 {poData.issueDate}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Zip Rates Section - UPDATED with single color column */}
            <div style={professionalStyles.section}>
              <div style={professionalStyles.sectionHeader}>
                <div style={professionalStyles.sectionIcon}>💰</div>
                <h3 style={professionalStyles.sectionTitle}>Zip Details & Rates</h3>
              </div>
              
              <div style={professionalStyles.tableContainer}>
                <table style={professionalStyles.table}>
                  <thead style={professionalStyles.tableHeader}>
                    <tr>
                      <th style={professionalStyles.tableHeaderCell}>Zip Type</th>
                      <th style={professionalStyles.tableHeaderCell}>Placement</th>
                      <th style={professionalStyles.tableHeaderCell}>Color</th>
                      <th style={professionalStyles.tableHeaderCell}>Quantity</th>
                      <th style={professionalStyles.tableHeaderCell}>Rate/Piece</th>
                      <th style={professionalStyles.tableHeaderCell}>Total Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {poData.zipDetails?.map((zip, index) => (
                      <tr key={index} style={professionalStyles.tableRow}>
                        <td style={professionalStyles.tableCell}>
                          <strong>{zip.type}</strong>
                        </td>
                        <td style={professionalStyles.tableCell}>
                          {zip.description}
                        </td>
                        <td style={professionalStyles.tableCell}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                              width: '16px',
                              height: '16px',
                              borderRadius: '50%',
                              backgroundColor: getColorCode(zip.color),
                              border: '1px solid #e5e7eb'
                            }}></div>
                            <span>{zip.color}</span>
                          </div>
                        </td>
                        <td style={professionalStyles.tableCell}>
                          {parseInt(zip.quantity).toLocaleString('en-IN')}
                        </td>
                        <td style={professionalStyles.tableCell}>
                          {formatCurrency(zip.rate)}
                        </td>
                        <td style={professionalStyles.tableCell}>
                          <strong>{formatCurrency(zip.total)}</strong>
                        </td>
                      </tr>
                    ))}
                    {/* Total Row */}
                    <tr style={professionalStyles.totalRow}>
                      <td style={professionalStyles.totalCell} colSpan="5">
                        Total Zip Cost
                      </td>
                      <td style={professionalStyles.totalCell}>
                        {formatCurrency(poData.totalZipCost)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Production Summary */}
            <div style={professionalStyles.section}>
              <div style={professionalStyles.sectionHeader}>
                <div style={professionalStyles.sectionIcon}>✂️</div>
                <h3 style={professionalStyles.sectionTitle}>Production Summary</h3>
              </div>
              
              <div style={{...professionalStyles.grid, ...professionalStyles.threeColumnGrid}}>
                <div style={professionalStyles.infoCard}>
                  <div style={professionalStyles.label}>Total Pieces</div>
                  <div style={professionalStyles.largeValue}>
                    {parseInt(poData.totalPieces).toLocaleString('en-IN')}
                  </div>
                  <div style={{...professionalStyles.label, marginTop: '12px'}}>Garments</div>
                </div>
                
                <div style={professionalStyles.infoCard}>
                  <div style={professionalStyles.label}>Color Variants</div>
                  <div style={professionalStyles.largeValue}>
                    {Object.keys(poData.colorBreakdown || {}).length}
                  </div>
                  <div style={{...professionalStyles.label, marginTop: '12px'}}>Colors</div>
                </div>
                
                <div style={professionalStyles.infoCard}>
                  <div style={professionalStyles.label}>Total Cost</div>
                  <div style={professionalStyles.largeValue}>
                    {formatCurrency(poData.totalCost)}
                  </div>
                  <div style={{...professionalStyles.label, marginTop: '12px'}}>Inclusive of all</div>
                </div>
              </div>
            </div>

            {/* Action Section */}
            <div style={professionalStyles.actionSection}>
              <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                <div style={{...professionalStyles.label, color: '#dc2626', fontSize: '1.1rem'}}>
                  🚨 APPROVAL ACTION REQUIRED
                </div>
                <div style={{...professionalStyles.value, color: '#dc2626', fontSize: '1.3rem'}}>
                  Review and take appropriate action
                </div>
              </div>
              
              <div style={professionalStyles.actionGrid}>
                <button
                  onClick={async () => {
                    try {
                      await handleAccept(poData.lotNumber, selectedPoData.id);
                      handleClosePO();
                    } catch (error) {
                      console.error('Approval failed:', error);
                    }
                  }}
                  style={{...professionalStyles.actionButton, ...professionalStyles.approveButton}}
                  onMouseEnter={(e) => {
                    e.target.style.transform = 'translateY(-4px) scale(1.02)';
                    e.target.style.boxShadow = '0 16px 40px rgba(5, 150, 105, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.transform = 'translateY(0) scale(1)';
                    e.target.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.12)';
                  }}
                >
                  ✅ Approve Purchase Order
                </button>
                
                <button
                  onClick={async () => {
                    try {
                      await handleReject(poData.lotNumber, selectedPoData.id);
                      handleClosePO();
                    } catch (error) {
                      console.error('Rejection failed:', error);
                    }
                  }}
                  style={{...professionalStyles.actionButton, ...professionalStyles.rejectButton}}
                  onMouseEnter={(e) => {
                    e.target.style.transform = 'translateY(-4px) scale(1.02)';
                    e.target.style.boxShadow = '0 16px 40px rgba(220, 38, 38, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.transform = 'translateY(0) scale(1)';
                    e.target.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.12)';
                  }}
                >
                  ❌ Reject Purchase Order
                </button>
              </div>
              
              <div style={{ 
                textAlign: 'center', 
                marginTop: '28px',
                paddingTop: '20px',
                borderTop: '1px solid #e5e7eb'
              }}>
                <div style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '8px' }}>
                  Approval ID: <strong>{poData.approvalId}</strong>
                </div>
                <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>
                  Document Generated: {poData.generatedDate}
                </div>
              </div>
            </div> 
          </div>
        </div>
      </div>
    );
  };

  // Helper function to get color codes for visual representation
  const getColorCode = (colorName) => {
    const colorMap = {
      'black': '#000000',
      'white': '#FFFFFF',
      'red': '#FF0000',
      'blue': '#0000FF',
      'green': '#008000',
      'yellow': '#FFFF00',
      'orange': '#FFA500',
      'purple': '#800080',
      'pink': '#FFC0CB',
      'brown': '#A52A2A',
      'gray': '#808080',
      'grey': '#808080',
      'navy': '#000080',
      'olive': '#808000',
      'teal': '#008080',
      'maroon': '#800000',
      'silver': '#C0C0C0',
      'gold': '#FFD700',
      'beige': '#F5F5DC',
      'cream': '#FFFDD0',
      'offwhite': '#FAF9F6',
      'charcoal': '#36454F',
      'khaki': '#F0E68C',
      'burgundy': '#800020',
      'mustard': '#FFDB58',
      'mint': '#98FB98',
      'lavender': '#E6E6FA',
      'peach': '#FFDAB9',
      'coral': '#FF7F50',
      'turquoise': '#40E0D0',
      'indigo': '#4B0082',
      'violet': '#EE82EE',
      'magenta': '#FF00FF',
      'cyan': '#00FFFF',
      'lime': '#00FF00'
    };

    // Convert to lowercase and remove special characters for matching
    const normalizedColor = colorName.toLowerCase().replace(/[^a-z]/g, '');
    
    // Find the closest match
    for (const [key, value] of Object.entries(colorMap)) {
      if (normalizedColor.includes(key) || key.includes(normalizedColor)) {
        return value;
      }
    }

    // Default color if no match found
    return '#E5E7EB';
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.dashboard}>
          <div style={styles.emptyState}>
            <div style={{
              width: '40px',
              height: '40px',
              border: '3px solid #f3f4f6',
              borderTop: '3px solid #3b82f6',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 20px'
            }}></div>
            <h3 style={{ color: '#374151', marginBottom: '8px' }}>Loading Pending Approvals</h3>
            <p style={{ color: '#64748b' }}>Fetching data from Google Sheets...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.dashboard}>
          <div style={styles.errorState}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
            <h3 style={{ color: '#dc2626', marginBottom: '8px' }}>Connection Error</h3>
            <p style={{ color: '#6b7280', marginBottom: '20px' }}>{error}</p>
            <button 
              onClick={fetchSheetData}
              style={styles.refreshButton}
            >
              Retry Connection
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.headerTitle}>Pending Approvals Dashboard</h1>
        <p style={styles.headerSubtitle}>
          Review and approve purchase orders awaiting decision
          {zipQualityData.length > 0 && ` • ${zipQualityData.length} zip types loaded`}
        </p>
      </div>

      {/* Dashboard */}
      <div style={styles.dashboard}>
        {/* Controls */}
        <div style={styles.controls}>
          <input
            type="text"
            placeholder="Search across all columns..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={styles.searchBox}
          />
          <button
            onClick={fetchSheetData}
            style={styles.refreshButton}
          >
            Refresh Data
          </button>
        </div>

        {/* Statistics */}
        <div style={styles.stats}>
          <div style={styles.statItem}>
            <div style={styles.statNumber}>{stats.totalPending}</div>
            <div style={styles.statLabel}>Pending Approval</div>
          </div>
          <div style={styles.statItem}>
            <div style={styles.statNumber}>{stats.totalFiltered}</div>
            <div style={styles.statLabel}>Filtered Results</div>
          </div>
          <div style={styles.statItem}>
            <div style={styles.statNumber}>{stats.totalApproved}</div>
            <div style={styles.statLabel}>Total Approved</div>
          </div>
          <div style={styles.statItem}>
            <div style={styles.statNumber}>{stats.totalRejected}</div>
            <div style={styles.statLabel}>Total Rejected</div>
          </div>
        </div>

        {/* Main Table */}
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead style={styles.tableHeader}>
              <tr>
                {mainTableColumns.map(header => (
                  <th key={header} style={styles.headerCell}>
                    {header}
                  </th>
                ))}
                <th style={{...styles.headerCell, ...styles.actionCell}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={mainTableColumns.length + 1} style={styles.emptyState}>
                    <div style={{fontSize: '48px', marginBottom: '16px'}}>📋</div>
                    <h3 style={{color: '#374151', marginBottom: '8px'}}>
                      {pendingData.length === 0 ? 'No Pending Approvals' : 'No Matching Records'}
                    </h3>
                    <p style={{color: '#64748b'}}>
                      {pendingData.length === 0 
                        ? 'All purchase orders have been processed.' 
                        : 'Try adjusting your search terms.'
                      }
                    </p>
                  </td>
                </tr>
              ) : (
                filteredData.map((row) => (
                  <React.Fragment key={row.id}>
                    <tr 
                      style={{
                        ...styles.tableRow,
                        ...(selectedRow === row.id && styles.tableRowHover)
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#f8fafc';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'white';
                      }}
                      onClick={() => setSelectedRow(row.id)}
                    >
                      {mainTableColumns.map(header => (
                        <td key={header} style={styles.tableCell} title={row[header]}>
                          {formatFieldValue(header, row[header])}
                        </td>
                      ))}
                      <td style={styles.actionCell}>
                        <div style={styles.actionButtons}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDisplayPO(row);
                            }}
                            style={styles.displayPoButton}
                          >
                            View Details
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleRowExpand(row.id);
                            }}
                            style={styles.expandButton}
                            title="View all details"
                          >
                            {expandedRow === row.id ? '▲ Less' : '▼ More'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedRow === row.id && (
                      <tr style={styles.expandedRow}>
                        <td colSpan={mainTableColumns.length + 1} style={styles.expandedContent}>
                          <div style={styles.detailGrid}>
                            {Object.entries(columnGroups).map(([groupName, groupColumns]) => (
                              <div key={groupName} style={styles.detailGroup}>
                                <div style={styles.detailGroupTitle}>{groupName}</div>
                                {groupColumns.map(header => {
                                  const value = row[header];
                                  
                                  return (
                                    <div key={header} style={styles.detailItem}>
                                      <span style={styles.detailLabel}>{header}:</span>
                                      <span style={styles.detailValue}>
                                        {formatFieldValue(header, value)}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* PO Dialog */}
      <PODialog />

      {/* CSS Animation */}
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
};

export default SheetDataViewer;