import { useMemo, useState } from "react";

/** Enhanced Emoji icon with multiple animation options */
function EmojiIcon({ symbol, size = 24, className = "", label, animate = false, animationType = "pulse" }) {
  return (
    <span
      role="img"
      aria-label={label || symbol}
      className={`${className} ${animate ? `emoji-${animationType}` : ""}`}
      style={{
        display: "inline-block",
        fontSize: size,
        lineHeight: 1,
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.1))"
      }}
    >
      {symbol}
    </span>
  );
}

export default function RgpDashboard({
  counts = { fabric: 0, pending: 0, partial: 0, closed: 0, overdue: 0, details: 0, history: 0, po: 0, poAsPerLotShade: 0 },
  onScan = () => { },
  onNavigate = () => { },
  highlights = [
    "RGP must be approved before materials exit the gate",
    "Carry original RGP copy for verification at security",
    "Returnable items must be closed within stipulated time",
    "Overdue RGPs are subject to escalation",
  ],
  terms = [
    { title: "Approval", text: "All RGPs require departmental head approval prior to issuance. Manual signatures are valid." },
    { title: "Identification", text: "Visitors/vendors must carry a valid ID and RGP copy at all times." },
    { title: "Material Check", text: "Security shall validate item quantity, UOM, and condition at exit and re-entry." },
    { title: "Timelines", text: "Returnable RGPs must be closed within the defined due date. Extensions need written approval." },
    { title: "Damage/Loss", text: "Any loss or damage must be reported immediately with an incident note." },
    { title: "Compliance", text: "Non-adherence may lead to access restrictions and disciplinary action." },
  ],
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeCard, setActiveCard] = useState(null);
  const [showTerms, setShowTerms] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [viewMode, setViewMode] = useState("grid");

  const go = (path) => {
    setIsLoading(true);
    setTimeout(() => {
      onNavigate(path);
      setIsLoading(false);
    }, 300);
  };

  const handleScan = (value) => {
    if (value.trim()) {
      setIsLoading(true);
      setTimeout(() => {
        onScan(value.trim());
        setIsLoading(false);
        setSearchQuery("");
      }, 300);
    }
  };

  /** Main Category Cards */
  const mainCategories = useMemo(
    () => [
      {
        key: "returnable",
        title: "Returnable Gate Pass",
        icon: "🏭",
        color: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
        bgColor: "#eff6ff",
        animation: "bounce",
        badge: "📦",
        description: "Manage fabric materials and stock levels",
        info: "Complete RGP management including pending, partial, closed, and overdue requests",
        stats: { total: 156, active: 23, completed: 133 }
      },
      {
        key: "purchase",
        title: "Purchase Order",
        icon: "🛒",
        color: "linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)",
        bgColor: "#f0f9ff",
        animation: "tada",
        badge: "PO",
        description: "Generate and manage purchase orders",
        info: "Create POs from approved items, view by lot, and manage PO workflows",
        stats: { total: 89, pending: 12, approved: 77 }
      },
      {
        key: "zip",
        title: "ZIP Order",
        icon: "🧾",
        color: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
        bgColor: "#eff6ff",
        animation: "pulse",
        badge: "ZIP",
        description: "ZIP PO management and tracking",
        info: "Manage ZIP purchase orders with supervisor details and approval workflows",
        stats: { total: 45, pending: 8, approved: 37 }
      },
      {
        key: "dori",
        title: "DORI Order",
        icon: "🎗️",
        color: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
        bgColor: "#f0f9ff",
        animation: "pulse",
        badge: "DORI",
        description: "Manage DORI thread and cord orders",
        info: "Create and track DORI thread orders with analytics and PO management",
        stats: { total: 34, pending: 5, completed: 29 }
      },
      {
        key: "poReport",
        title: "PO Report",
        icon: "📊",
        color: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)",
        bgColor: "#f5f3ff",
        animation: "pulse",
        badge: "📈",
        description: "Comprehensive PO reports and analytics",
        info: "Generate, download, and analyze purchase order reports with detailed metrics and insights",
        stats: { total: 124, generated: 89, pending: 35 }
      },
      {
        key: "rateList",
        title: "Rate List",
        icon: "💰",
        color: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
        bgColor: "#fff7ed",
        animation: "pulse",
        badge: "₹",
        description: "View and manage product/service rates",
        info: "Comprehensive rate list containing all product pricing, service charges, and applicable taxes with historical rate tracking and approval workflow",
        stats: { total: 245, active: 189, pending: 56 }
      },
    ],
    []
  );

  /** Enhanced cards with RGP-specific information */
  const allCards = useMemo(
    () => ({
      returnable: [
        {
          key: "fabric",
          title: "Returnable Gate Pass",
          count: counts.fabric ?? 0,
          icon: "🏭",
          path: "/rgp/fabric",
          color: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
          bgColor: "#eff6ff",
          animation: "bounce",
          badge: "📦",
          description: "Manage fabric materials and stock levels",
          info: "This card contains information about fabric inventory management for RGP processing including available stock and material tracking.",
          progress: 75,
          lastUpdated: "2 min ago"
        },
        {
          key: "pending",
          title: "Pending RGP",
          count: counts.pending ?? 0,
          icon: "⏳",
          path: "/rgp/pending",
          color: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
          bgColor: "#fffbeb",
          animation: "spin",
          badge: "🔄",
          description: "Review and approve pending requests",
          info: "This card contains information about pending RGP requests that are awaiting approval and administrative review.",
          progress: 30,
          lastUpdated: "5 min ago"
        },
        {
          key: "partial",
          title: "Partial RGP",
          count: counts.partial ?? 0,
          icon: "🎯",
          path: "/rgp/partial",
          color: "linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)",
          bgColor: "#f0f9ff",
          animation: "wobble",
          badge: "📊",
          description: "Monitor partially completed requests",
          info: "This card contains information about partially completed RGP requests that are currently in progress.",
          progress: 50,
          lastUpdated: "10 min ago"
        },
        {
          key: "closed",
          title: "Closed RGP",
          count: counts.closed ?? 0,
          icon: "🎉",
          path: "/rgp/closed",
          color: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
          bgColor: "#f0fdf4",
          animation: "tada",
          badge: "✅",
          description: "View completed requests history",
          info: "This card contains information about successfully closed and completed RGP requests with full documentation.",
          progress: 100,
          lastUpdated: "1 hour ago"
        },
        {
          key: "overdue",
          title: "Overdue RGP",
          count: counts.overdue ?? 0,
          icon: "🚨",
          path: "/rgp/overdue",
          color: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
          bgColor: "#fef2f2",
          animation: "pulse",
          badge: "⚠️",
          description: "Track overdue and delayed requests",
          info: "This card contains information about overdue RGP requests that require immediate attention and resolution.",
          progress: 15,
          lastUpdated: "Just now"
        },
        {
          key: "details",
          title: "GatePass Detail",
          count: counts.details ?? 0,
          icon: "🧾",
          path: "/rgp/details",
          color: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)",
          bgColor: "#f5f3ff",
          animation: "pulse",
          badge: "ℹ️",
          description: "See item-wise RGP details & history",
          info: "Detailed gate pass records: items, quantities, parties, checkpoints, and audit history.",
          progress: 60,
          lastUpdated: "30 min ago"
        },
        {
          key: "history",
          title: "RGP Material History",
          count: counts.history ?? 0,
          icon: "🗂️",
          path: "/rgp/history",
          color: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
          bgColor: "#eff6ff",
          animation: "pulse",
          badge: "📚",
          description: "Browse material movement logs over time",
          info: "Chronological item-wise movement: issues, returns, adjustments, and notes across all RGPs.",
          progress: 85,
          lastUpdated: "15 min ago"
        },
      ],
      purchase: [
        {
          key: "po",
          title: "Purchase Order",
          count: counts.po ?? 0,
          icon: "🛒",
          path: "/rgp/purchase-order",
          color: "linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)",
          bgColor: "#f0f9ff",
          animation: "tada",
          badge: "PO",
          description: "Generate POs from approved items",
          info: "Create and print supplier POs with auto-filled lines from RGP, taxes/terms, and sign-off metadata.",
          progress: 70,
          lastUpdated: "20 min ago"
        },
        {
          key: "poAsPerLot",
          title: "PO (as per Lot)",
          count: counts.poAsPerLot ?? 0,
          icon: "📦",
          path: "/rgp/po-as-per-lot",
          color: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
          bgColor: "#eff6ff",
          animation: "pulse",
          badge: "PO",
          description: "View Purchase Orders grouped/filtered by Lot",
          info: "See POs created for each Lot, with quick links to related Lot details, receive actions, and PO download/print.",
          progress: 45,
          lastUpdated: "25 min ago"
        },
        {
          key: "poAsPerLotShade",
          title: "PO (as per Lot Shade)",
          count: counts.poAsPerLotShade ?? 0,
          icon: "🎨",
          path: "/rgp/po-as-per-lot-shade",
          color: "linear-gradient(135deg, #ec4899 0%, #db2777 100%)",
          bgColor: "#fdf2f8",
          animation: "pulse",
          badge: "🎨",
          description: "Purchase Orders organized by Lot and Shade",
          info: "Advanced PO management with shade-wise categorization, color matching, and quality control tracking for fabric lots.",
          progress: 35,
          lastUpdated: "40 min ago",
          shades: ["Red", "Blue", "Green", "Yellow"],
          totalLots: 12
        },
        {
          key: "poDashboard",
          title: "PO Dashboard",
          count: counts.poDashboard ?? 0,
          icon: "📋",
          path: "/rgp/po-dashboard",
          color: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
          bgColor: "#f0fdf4",
          animation: "pulse",
          badge: "📊",
          description: "All-in-one PO details dashboard & PDF regenerator",
          info: "Search POs, view PO items, status, dates, and click to regenerate PDF copies instantly.",
          progress: 100,
          lastUpdated: "Just now"
        },
      ],
      zip: [
        {
          key: "puneetZipPO",
          title: "Puneet ZIP PO",
          count: counts.puneetZipPO ?? 0,
          icon: "🧾",
          path: "/rgp/puneet-zip-po",
          color: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
          bgColor: "#eff6ff",
          animation: "pulse",
          badge: "ZIP",
          description: "POs prepared for Puneet (ZIP)",
          info: "View and download ZIP POs grouped by Lot.",
          progress: 80,
          lastUpdated: "1 hour ago"
        },
        {
          key: "ZipPODashboard",
          title: "Dashboard ZIP PO",
          count: counts.puneetZipPO ?? 0,
          icon: "📊",
          path: "/rgp/zip-po-dashboard",
          color: "linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)",
          bgColor: "#f0f9ff",
          animation: "pulse",
          badge: "ZIP",
          description: "ZIP PO Prepared By Supervisor detail",
          info: "View and download ZIP POs grouped by Lot.",
          progress: 65,
          lastUpdated: "50 min ago"
        },
        {
          key: "approvalPanel",
          title: "Approval ZIP PO",
          count: counts.puneetZipPO ?? 0,
          icon: "✅",
          path: "/rgp/zip-po-approval",
          color: "linear-gradient(135deg, #2563eb 0%, #1e40af 100%)",
          bgColor: "#eff6ff",
          animation: "pulse",
          badge: "ZIP",
          description: "ZIP PO Prepared By Supervisor detail",
          info: "View and download ZIP POs grouped by Lot.",
          progress: 25,
          lastUpdated: "2 hours ago"
        },
      ],
      dori: [
        {
          key: "doriOrder",
          title: "DORI Order",
          count: counts.doriOrder ?? 0,
          icon: "🎗️",
          path: "/rgp/dori-order",
          color: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
          bgColor: "#f0f9ff",
          animation: "pulse",
          badge: "DORI",
          description: "Manage DORI thread and cord orders",
          info: "Create and track DORI thread orders with specifications, quantities, and supplier details for garment production.",
          progress: 55,
          lastUpdated: "35 min ago"
        },
        {
          key: "dashboardDoriPO",
          title: "Dashboard DORI PO",
          count: counts.dashboardDoriPO ?? 0,
          icon: "📊",
          path: "/rgp/dashboard-dori-po",
          color: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
          bgColor: "#eff6ff",
          animation: "pulse",
          badge: "DORI",
          description: "DORI PO analytics and overview",
          info: "Comprehensive dashboard for DORI purchase orders with analytics, tracking, and performance metrics.",
          progress: 90,
          lastUpdated: "5 min ago"
        },
      ],
      poReport: [
        {
          key: "poSummary",
          title: "PO Summary Report",
          count: 45,
          icon: "📈",
          path: "/rgp/po-summary",
          color: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)",
          bgColor: "#f5f3ff",
          animation: "pulse",
          badge: "📊",
          description: "Comprehensive PO summary across all categories",
          info: "View aggregated PO data including total value, quantities, supplier performance, and completion rates across all PO types.",
          progress: 95,
          lastUpdated: "1 hour ago"
        },
      ],
      rateList: [
        {
          key: "productRates",
          title: "Product Rate List",
          count: 156,
          icon: "🏷️",
          path: "/rate-list/products",
          color: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
          bgColor: "#fff7ed",
          animation: "pulse",
          badge: "₹",
          description: "View all product pricing and rates",
          info: "Complete product rate list with current and historical pricing, vendor-specific rates, and bulk discount structures.",
          progress: 85,
          lastUpdated: "1 hour ago"
        },
        {
          key: "serviceRates",
          title: "Service Rate List",
          count: 42,
          icon: "⚙️",
          path: "/rate-list/services",
          color: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
          bgColor: "#fffbeb",
          animation: "spin",
          badge: "🛠️",
          description: "Service charges and labor rates",
          info: "Comprehensive service rate list including labor charges, service fees, maintenance costs, and contractor rates.",
          progress: 70,
          lastUpdated: "2 hours ago"
        },
        {
          key: "taxRates",
          title: "Tax Rate List",
          count: 28,
          icon: "📊",
          path: "/rate-list/taxes",
          color: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
          bgColor: "#f0fdf4",
          animation: "tada",
          badge: "🧾",
          description: "Applicable tax rates and slabs",
          info: "Current tax rates including GST, VAT, customs duties, and other applicable taxes with effective dates and jurisdictions.",
          progress: 100,
          lastUpdated: "30 min ago"
        },
        {
          key: "vendorRates",
          title: "Vendor Rate List",
          count: 89,
          icon: "🤝",
          path: "/rate-list/vendors",
          color: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)",
          bgColor: "#f5f3ff",
          animation: "pulse",
          badge: "🏪",
          description: "Vendor-specific pricing agreements",
          info: "Rate list per vendor including negotiated rates, contract pricing, and special offers with validity periods.",
          progress: 60,
          lastUpdated: "45 min ago"
        },
        {
          key: "historicalRates",
          title: "Historical Rate List",
          count: 524,
          icon: "📅",
          path: "/rate-list/history",
          color: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
          bgColor: "#eef2ff",
          animation: "wobble",
          badge: "📜",
          description: "Track rate changes over time",
          info: "Complete historical archive of all rate changes with effective dates, approval history, and trend analysis.",
          progress: 95,
          lastUpdated: "15 min ago"
        },
        {
          key: "approvalPending",
          title: "Pending Rate Approvals",
          count: 12,
          icon: "⏳",
          path: "/rate-list/pending-approvals",
          color: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
          bgColor: "#fef2f2",
          animation: "pulse",
          badge: "⚠️",
          description: "Rate changes awaiting approval",
          info: "Rate change requests that require review and approval from authorized personnel before becoming effective.",
          progress: 40,
          lastUpdated: "Just now"
        }
      ]
    }),
    [counts]
  );

  const currentCards = selectedCategory ? allCards[selectedCategory] : mainCategories;

  const handleCategorySelect = (categoryKey) => {
    setSelectedCategory(categoryKey);
    setActiveCard(null);
  };

  const handleBackToMain = () => {
    setSelectedCategory(null);
    setActiveCard(null);
  };

  return (
    <div className="rgp-dashboard-root">
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        .rgp-loading {
          position: fixed; top: 0; left: 0; width: 100%; height: 4px;
          background: linear-gradient(90deg, #003f88, #d4af37, #00296b, #003f88);
          background-size: 200% 100%;
          animation: loading-shimmer 1.2s infinite; z-index: 1000; display: none;
        }
        .rgp-loading.active { display: block; }
        @keyframes loading-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

        .rgp-dashboard-root {
          min-height: 100vh;
          background-color: #f8fafc;
          background-image: 
            radial-gradient(at 0% 0%, rgba(0, 63, 136, 0.03) 0px, transparent 50%), 
            radial-gradient(at 100% 100%, rgba(212, 175, 55, 0.05) 0px, transparent 50%),
            linear-gradient(rgba(0, 41, 107, 0.02) 1px, transparent 1px), 
            linear-gradient(90deg, rgba(0, 41, 107, 0.02) 1px, transparent 1px);
          background-size: 100% 100%, 100% 100%, 24px 24px, 24px 24px;
          color: #1e293b;
          font-family: 'Plus Jakarta Sans', 'Outfit', sans-serif;
          padding: 40px;
        }

        .rgp-grid-container {
          max-width: 1600px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 360px 1fr;
          gap: 40px;
        }

        /* Side Panel Styling */
        .rgp-side-panel {
          display: flex;
          flex-direction: column;
          gap: 28px;
        }

        .rgp-brand-card {
          background: linear-gradient(135deg, #003f88 0%, #00296b 100%);
          border-radius: 20px;
          padding: 32px 28px;
          color: white;
          box-shadow: 0 10px 25px rgba(0, 41, 107, 0.15);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .rgp-brand-card h1 { font-size: 24px; font-weight: 800; margin-bottom: 12px; }
        .rgp-brand-card p { color: rgba(255, 255, 255, 0.8); font-size: 13px; line-height: 1.5; }

        .rgp-metrics-section {
          background: #ffffff;
          border-radius: 20px;
          padding: 24px;
          border: 1px solid rgba(0, 63, 136, 0.08);
          box-shadow: 0 4px 20px rgba(0, 41, 107, 0.02);
        }

        .rgp-metrics-title { font-size: 12px; font-weight: 700; color: #64748b; margin-bottom: 16px; display: flex; align-items: center; gap: 6px; }

        .rgp-metric-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

        .rgp-metric-block {
          background: #ffffff;
          border-radius: 12px;
          padding: 18px 16px;
          text-align: center;
          border: 1px solid rgba(0, 63, 136, 0.08);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.01);
          transition: all 0.25s ease;
        }

        .rgp-metric-block:hover {
          border-color: #d4af37;
          box-shadow: 0 8px 16px rgba(212, 175, 55, 0.1);
          transform: translateY(-2px);
        }

        .rgp-metric-num { font-size: 26px; font-weight: 800; color: #003f88; margin-bottom: 4px; }
        .rgp-metric-lbl { font-size: 11px; font-weight: 600; color: #64748b; }

        .rgp-policy-panel {
          background: #ffffff;
          border-radius: 20px;
          border: 1px solid rgba(0, 63, 136, 0.08);
          box-shadow: 0 4px 20px rgba(0, 41, 107, 0.02);
          overflow: hidden;
        }

        .rgp-policy-head {
          padding: 20px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #cbd5e1;
          background: #f8fafc;
          cursor: pointer;
        }

        .rgp-policy-head h2 { font-size: 13px; font-weight: 700; color: #003f88; display: flex; align-items: center; gap: 8px; }

        .rgp-policy-toggle-btn {
          background: none;
          border: none;
          color: #003f88;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
          padding: 4px 8px;
        }

        .rgp-policy-list {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          max-height: 380px;
          overflow-y: auto;
        }

        .rgp-policy-item {
          border: 1px solid #cbd5e1;
          border-radius: 12px;
          padding: 14px;
          background: #ffffff;
          transition: all 0.2s;
        }

        .rgp-policy-item-title { font-size: 12px; font-weight: 700; color: #003f88; margin-bottom: 4px; }
        .rgp-policy-item-text { font-size: 11px; color: #64748b; line-height: 1.4; }

        /* Workspace Styling */
        .rgp-workspace {
          display: flex;
          flex-direction: column;
          gap: 28px;
        }

        .rgp-top-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 2px solid #cbd5e1;
          padding-bottom: 18px;
        }

        .rgp-top-title h2 { font-size: 20px; font-weight: 800; color: #003f88; display: flex; align-items: center; gap: 10px; }
        .rgp-top-title p { font-size: 12px; color: #64748b; margin-top: 4px; }
        .rgp-top-controls { display: flex; align-items: center; gap: 16px; }
        .rgp-nav-back {
          background: #ffffff;
          border: 1px solid #cbd5e1;
          color: #003f88;
          padding: 8px 16px;
          border-radius: 10px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 2px 4px rgba(0,0,0,0.01);
        }

        .rgp-nav-back:hover {
          background: #f8fafc;
          border-color: #003f88;
          transform: translateX(-2px);
          box-shadow: 0 4px 10px rgba(0, 63, 136, 0.08);
        }

        /* Dynamic Grid Layout */
        .rgp-cards-wrapper {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 24px;
        }

        .rgp-cards-wrapper.compact {
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
        }

        /* Refined Card Design */
        .rgp-interactive-card {
          background: #ffffff;
          border: 1px solid rgba(0, 63, 136, 0.08);
          border-radius: 20px;
          overflow: hidden;
          padding: 24px;
          text-align: left;
          box-shadow: 0 4px 18px rgba(0, 41, 107, 0.02);
          transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
          cursor: pointer;
          display: flex;
          flex-direction: column;
          height: 100%;
        }

        .rgp-interactive-card:hover {
          transform: translateY(-5px);
          border-color: #d4af37;
          box-shadow: 0 12px 30px rgba(0, 41, 107, 0.06), 0 0 0 1px #d4af37, 0 10px 20px -10px rgba(212, 175, 55, 0.3);
        }

        .rgp-card-top { display: flex; gap: 16px; align-items: flex-start; margin-bottom: 16px; }

        .rgp-card-icon-box {
          width: 52px;
          height: 52px;
          border-radius: 14px;
          display: grid;
          place-items: center;
          font-size: 24px;
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
          border: 1px solid rgba(0, 63, 136, 0.06);
          box-shadow: inset 0 2px 4px rgba(255,255,255,0.8), 0 4px 10px rgba(0, 0, 0, 0.02);
          position: relative;
          flex-shrink: 0;
          transition: all 0.3s ease;
        }

        .rgp-interactive-card:hover .rgp-card-icon-box {
          transform: scale(1.05) rotate(3deg);
          border-color: rgba(212, 175, 55, 0.3);
        }

        .rgp-card-lbl-badge {
          position: absolute;
          top: -6px;
          right: -6px;
          background: #ffffff;
          border-radius: 99px;
          padding: 2px 6px;
          font-size: 9px;
          font-weight: 800;
          border: 1.5px solid;
          box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }

        .rgp-card-details h3 { font-size: 15px; font-weight: 700; color: #003f88; margin-bottom: 4px; }
        .rgp-card-details p { font-size: 11px; color: #64748b; line-height: 1.4; }

        .rgp-card-progress-bar { background: #e2e8f0; height: 4px; border-radius: 99px; overflow: hidden; margin: 12px 0 6px; }
        .rgp-card-progress-fill { height: 100%; border-radius: 99px; }
        .rgp-card-progress-lbl { display: flex; justify-content: space-between; font-size: 10px; color: #64748b; margin-bottom: 12px; }

        .rgp-card-info-box { background: #f8fafc; border-radius: 10px; padding: 10px 14px; font-size: 11px; color: #475569; border-left: 3px solid; margin-top: auto; border: 1px solid rgba(0, 63, 136, 0.04); }
        
        .rgp-card-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 14px; padding-top: 12px; border-top: 1px dashed #e2e8f0; font-size: 10px; color: #94a3b8; }
        
        .rgp-view-switch { display: flex; background: #ffffff; padding: 4px; border-radius: 10px; border: 1px solid rgba(0, 63, 136, 0.08); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.01); }
        .rgp-view-toggle-btn { border: none; background: transparent; padding: 8px 16px; font-size: 11px; font-weight: 700; color: #64748b; cursor: pointer; border-radius: 6px; transition: all 0.2s ease; }
        .rgp-view-toggle-btn:hover { color: #003f88; }
        .rgp-view-toggle-btn.active { background: #003f88; color: white !important; box-shadow: 0 4px 10px rgba(0, 63, 136, 0.15); }

        .rgp-ticker-strip { background: #ffffff; border-radius: 12px; padding: 10px 18px; border: 1px solid #cbd5e1; overflow: hidden; }
        .rgp-ticker { display: inline-flex; gap: 20px; white-space: nowrap; animation: rgp-ticker-scroll 45s linear infinite; }
        @keyframes rgp-ticker-scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }

        .rgp-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: #f1f5f9;
          color: #334155;
          border: 1px solid #cbd5e1;
          padding: 6px 16px;
          border-radius: 99px;
          font-weight: 600;
          font-size: 12px;
        }

        /* Operational Info Desk */
        .rgp-info-desk {
          margin-top: 40px;
          background: #ffffff;
          border-radius: 20px;
          border: 1px solid rgba(0, 63, 136, 0.08);
          box-shadow: 0 4px 20px rgba(0, 41, 107, 0.02);
          overflow: hidden;
        }
        .rgp-info-desk-head {
          padding: 24px;
          border-bottom: 1px solid #cbd5e1;
          background: #f8fafc;
        }
        .rgp-info-desk-head h3 {
          font-size: 15px;
          font-weight: 800;
          color: #003f88;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .rgp-info-desk-head p {
          font-size: 12px;
          color: #64748b;
          margin-top: 4px;
        }
        .rgp-info-grid {
          padding: 24px;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 24px;
        }
        .rgp-info-column h4 {
          font-size: 13px;
          font-weight: 700;
          color: #003f88;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          gap: 6px;
          border-bottom: 1px solid #cbd5e1;
          padding-bottom: 6px;
        }
        .rgp-info-column ul {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .rgp-info-column li {
          font-size: 11px;
          color: #64748b;
          line-height: 1.4;
          display: flex;
          align-items: flex-start;
          gap: 6px;
        }
        .rgp-info-bullet {
          color: #d4af37;
          font-weight: 800;
        }

        @media (max-width: 1024px) {
          .rgp-grid-container { grid-template-columns: 1fr; gap: 28px; }
        }

        @media (max-width: 768px) {
          .rgp-dashboard-root { padding: 20px; }
          .rgp-top-header { flex-direction: column; align-items: stretch; gap: 14px; }
          .rgp-top-controls { justify-content: space-between; }
        }
      `}</style>

      {/* Loading bar */}
      <div className={`rgp-loading ${isLoading ? "active" : ""}`} />

      <div className="rgp-grid-container">
        {/* Left Control Panel */}
        <aside className="rgp-side-panel">
          {/* Welcome Branding Card */}
          <div className="rgp-brand-card">
            <h1>RGP System</h1>
            <p>Welcome to the Returnable Gate Pass & Purchase Order management portal. Track status, monitor compliance rules, and manage material movements securely.</p>
          </div>

          {/* Quick Metrics Module */}
          <div className="rgp-metrics-section">
            <div className="rgp-metrics-title">
              <EmojiIcon symbol="📊" size={14} /> System Analytics
            </div>
            <div className="rgp-metric-row">
              <div className="rgp-metric-block">
                <div className="rgp-metric-num">324</div>
                <div className="rgp-metric-lbl">Total Items</div>
              </div>
              <div className="rgp-metric-block">
                <div className="rgp-metric-num">48</div>
                <div className="rgp-metric-lbl">Pending Approvals</div>
              </div>
            </div>
          </div>

          {/* Live Regulations Ticker */}
          <div className="rgp-ticker-strip">
            <div className="rgp-ticker">
              {[...highlights, ...highlights].map((h, i) => (
                <span key={i} className="rgp-pill">
                  <EmojiIcon symbol="📢" size={12} />
                  <span>{h}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Collapsible Rules List */}
          <div className="rgp-policy-panel">
            <div className="rgp-policy-head" onClick={() => setShowTerms(s => !s)}>
              <h2>
                <EmojiIcon symbol="📜" size={14} /> Regulations Policy
              </h2>
              <span className="rgp-policy-toggle-btn">
                {showTerms ? "COLLAPSE" : "EXPAND"}
              </span>
            </div>
            {showTerms && (
              <div className="rgp-policy-list">
                {terms.map((t, idx) => (
                  <div className="rgp-policy-item" key={idx}>
                    <div className="rgp-policy-item-title">
                      <EmojiIcon symbol="📌" size={11} /> {t.title}
                    </div>
                    <div className="rgp-policy-item-text">{t.text}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Right Workspace Panel */}
        <section className="rgp-workspace">
          {/* Header & Category Controls */}
          <div className="rgp-top-header">
            <div className="rgp-top-title">
              <h2>
                <EmojiIcon symbol={selectedCategory ? "📂" : "⚙️"} size={22} />
                {selectedCategory
                  ? mainCategories.find(cat => cat.key === selectedCategory)?.title
                  : "Operations Workspace"}
              </h2>
              <p>{selectedCategory ? "Select a command utility below to view details and issue new requests." : "Navigate between different purchase order formats and gate pass types."}</p>
            </div>

            <div className="rgp-top-controls">
              {/* Back navigation */}
              {selectedCategory && (
                <button className="rgp-nav-back" onClick={handleBackToMain}>
                  <EmojiIcon symbol="←" size={12} /> Back to Main
                </button>
              )}

              {/* View Switch */}
              <div className="rgp-view-switch">
                <button
                  className={`rgp-view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
                  onClick={() => setViewMode('grid')}
                >
                  Grid View
                </button>
                <button
                  className={`rgp-view-toggle-btn ${viewMode === 'compact' ? 'active' : ''}`}
                  onClick={() => setViewMode('compact')}
                >
                  List View
                </button>
              </div>
            </div>
          </div>

          {/* Main cards display grid */}
          <div className={`rgp-cards-wrapper ${viewMode === 'compact' ? 'compact' : ''}`}>
            {currentCards.map((c) => (
              <div
                key={c.key}
                onClick={() => {
                  if (!selectedCategory) {
                    handleCategorySelect(c.key);
                  } else {
                    setActiveCard(c.key);
                    go(c.path);
                  }
                }}
                className={`rgp-interactive-card ${activeCard === c.key ? "active" : ""}`}
              >
                <div className="rgp-card-top">
                  <div className="rgp-card-icon-box" style={{ background: c.bgColor }}>
                    <EmojiIcon
                      symbol={c.icon}
                      size={24}
                      animate={activeCard === c.key}
                      animationType={c.animation}
                    />
                    <div className="rgp-card-lbl-badge" style={{ borderColor: c.color, color: c.color }}>
                      {c.badge}
                    </div>
                  </div>
                  <div className="rgp-card-details">
                    <h3>{c.title}</h3>
                    <p>{c.description}</p>
                  </div>
                </div>

                {/* Progress bar */}
                {c.progress !== undefined && (
                  <div>
                    <div className="rgp-card-progress-bar">
                      <div
                        className="rgp-card-progress-fill"
                        style={{ width: `${c.progress}%`, background: c.color }}
                      />
                    </div>
                    <div className="rgp-card-progress-lbl">
                      <span>Utility Progress</span>
                      <span>{c.progress}%</span>
                    </div>
                  </div>
                )}

                {/* Shade tags for PO as per Lot Shade */}
                {c.shades && (
                  <div className="rgp-shade-tags">
                    {c.shades.map((shade, idx) => (
                      <span key={idx} className="rgp-shade-tag">{shade}</span>
                    ))}
                    {c.totalLots && <span className="rgp-shade-tag">{c.totalLots} Lots</span>}
                  </div>
                )}

                {/* Info Text */}
                <div className="rgp-card-info-box" style={{ borderLeftColor: c.color }}>
                  {c.info}
                </div>

                {/* Footer metadata */}
                <div className="rgp-card-footer">
                  <span>
                    {c.lastUpdated ? `Updated ${c.lastUpdated}` : "Real-time sync"}
                  </span>
                  <span className="rgp-card-go-arrow">→</span>
                </div>
              </div>
            ))}
          </div>

          {/* Operational Info Desk */}
          <div className="rgp-info-desk">
            <div className="rgp-info-desk-head">
              <h3>
                <EmojiIcon symbol="💡" size={16} /> Operational Guidelines & Reference Desk
              </h3>
              <p>Critical business guidelines and system documentation for managing Gate Passes and Purchase Orders.</p>
            </div>
            <div className="rgp-info-grid">
              <div className="rgp-info-column">
                <h4>
                  <EmojiIcon symbol="🔄" size={12} /> Gate Pass Life Cycle
                </h4>
                <ul>
                  <li>
                    <span className="rgp-info-bullet">•</span>
                    <span><b>Issue RGP</b>: Create a gate pass listing items going out for external processing or vendor delivery.</span>
                  </li>
                  <li>
                    <span className="rgp-info-bullet">•</span>
                    <span><b>Supervisor Check</b>: Authorized managers audit pending items, lot codes, and confirm issue parameters.</span>
                  </li>
                  <li>
                    <span className="rgp-info-bullet">•</span>
                    <span><b>Gate Entry Logs</b>: Scanning QR code on gate entry prompts users for their name and logs timestamps in Google Sheets.</span>
                  </li>
                </ul>
              </div>

              <div className="rgp-info-column">
                <h4>
                  <EmojiIcon symbol="📋" size={12} /> PO Lot & Shade Management
                </h4>
                <ul>
                  <li>
                    <span className="rgp-info-bullet">•</span>
                    <span><b>Lot Grouping</b>: Organize materials, zippers, or dori threads by specific dye lot shades to track raw consumption.</span>
                  </li>
                  <li>
                    <span className="rgp-info-bullet">•</span>
                    <span><b>PDF Validation</b>: QR codes for "Gate In" and "Material Received" are embedded directly in generated files.</span>
                  </li>
                  <li>
                    <span className="rgp-info-bullet">•</span>
                    <span><b>Signing Protocols</b>: Signatures for Prepared By, Approved By, and Suppliers are formatted on the document baseline.</span>
                  </li>
                </ul>
              </div>

              <div className="rgp-info-column">
                <h4>
                  <EmojiIcon symbol="🛡️" size={12} /> System Rules & Sync
                </h4>
                <ul>
                  <li>
                    <span className="rgp-info-bullet">•</span>
                    <span><b>CORS Restrictions</b>: Scanning operates via GET forms to avoid Apps Script sandboxing CORS blockages.</span>
                  </li>
                  <li>
                    <span className="rgp-info-bullet">•</span>
                    <span><b>Rate List Locks</b>: Product and service rate modifications require active review before live implementation.</span>
                  </li>
                  <li>
                    <span className="rgp-info-bullet">•</span>
                    <span><b>Support Desk</b>: For issues with Google Sheet sync or PDF rendering, contact the system administrator.</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}