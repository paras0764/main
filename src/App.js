import { Routes, Route, useNavigate } from "react-router-dom";
import RgpDashboard from "./components/RgpDashboard";
import FabricRgpForm from "./components/FabricRgpform";
import PendingRGP from "./components/PendingRgp";
import ClosedRgp from "./components/Closedrgp";
// import PartialRgp from "./components/PartialRGP";
import OverdueRgp from "./components/OverdueRGP";
import GatePassRgp from "./components/GatePassrgp";
import RgpHistory from "./components/RGPhistory";
import PurchaseOrderForm from "./components/PurchaseOrderForm";
import POLot from "./components/POLot";
import PuneetZip from "./components/PunnetZip";
import ZipDashboard from "./components/ZipDashboard";
import ApprovalManager from "./components/ZIpApprovalManager";
import SheetDataViewer from "./components/ZIpApprovalManager";
import DoriOrder from "./components/DoriOrder";
import DoriPurchaseDashboard from "./components/DoriDashboard";
import POasperShade from "./components/POasperShade";
import POSummaryReport from "./components/PoSummaryReport";
import PoDashboard from "./components/PoDashboard";
import RedownloadRgp from "./components/RedownloadRgp";

// Small wrapper so we can inject navigate as a prop
function DashboardRoute() {
  const navigate = useNavigate();
  return <RgpDashboard onNavigate={navigate} />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<DashboardRoute />} />
      <Route path="/rgp" element={<div>All RGPs</div>} />
      <Route path="/rgp/new" element={<div>Create RGP</div>} />
      <Route path="/rgp/items" element={<div>Manage Items</div>} />
      <Route path="/rgp/fabric" element={<FabricRgpForm />} />
      <Route path="/rgp/machine-parts" element={<div>Machine Parts</div>} />
      <Route path="/rgp/samples" element={<div>Samples</div>} />
      <Route path="/rgp/accessories" element={<div>Accessories</div>} />
      <Route path="/rgp/tools" element={<div>Tools</div>} />
      <Route path="/rgp/pending" element={<PendingRGP />} />
      <Route path="/rgp/closed" element={<ClosedRgp />} />
      {/* <Route path="/rgp/partial" element={<PartialRgp/>} /> */}
      <Route path="/rgp/overdue" element={<OverdueRgp />} />
      <Route path="/rgp/details" element={<GatePassRgp />} />
      <Route path="/rgp/history" element={<RgpHistory />} />
      <Route path="/rgp/redownload" element={<RedownloadRgp />} />
      <Route path="/rgp/purchase-order" element={<PurchaseOrderForm />} />
      <Route path="/rgp/po-as-per-lot" element={<POLot />} />
      <Route path="/rgp/puneet-zip-po" element={<PuneetZip />} />
      <Route path="/rgp/zip-po-dashboard" element={<ZipDashboard />} />
      <Route path="/rgp/zip-po-approval" element={<SheetDataViewer />} />
      <Route path="/rgp/dori-order" element={<DoriOrder />} />
      <Route path="/rgp/dashboard-dori-po" element={<DoriPurchaseDashboard />} />
      <Route path="/rgp/po-as-per-lot-shade" element={<POasperShade />} />
      <Route path="/rgp/po-summary" element={<POSummaryReport />} />
      <Route path="/rgp/po-dashboard" element={<PoDashboard />} />
    </Routes>
  );
}
