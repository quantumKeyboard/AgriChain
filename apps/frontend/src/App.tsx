import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import AllTransactions from "./pages/AllTransactions";
import Check from "./pages/Check";
import Dashboard from "./pages/Dashboard";
import FraudCenter from "./pages/FraudCenter";
import Ledger from "./pages/Ledger";
import LifecycleExplorer from "./pages/LifecycleExplorer";
import Login from "./pages/Login";
import Model from "./pages/Model";
import Network from "./pages/Network";
import ParticipantBatches from "./pages/ParticipantBatches";
import ParticipantIdentity from "./pages/ParticipantIdentity";
import ParticipantPortal from "./pages/ParticipantPortal";
import ParticipantTransfers from "./pages/ParticipantTransfers";
import Quarantine from "./pages/Quarantine";
import SignUp from "./pages/SignUp";
import SupplyChainOverview from "./pages/SupplyChainOverview";
import Trace from "./pages/Trace";
import { useApp } from "./state/AppState";

function RootRedirect() {
  const { activeUser, isAuthenticated } = useApp();
  if (!isAuthenticated || !activeUser) {
    return <Navigate to="/login" replace />;
  }
  if (activeUser.role === "ADMIN" || activeUser.role === "AUDITOR") {
    return <Navigate to="/admin" replace />;
  }
  return <Navigate to="/portal" replace />;
}

export default function App() {
  return (
    <Layout>
      <Routes>
        {/* Authentication Routes (Public) */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<SignUp />} />

        {/* Dynamic Root Entrypoint */}
        <Route path="/" element={<RootRedirect />} />

        {/* Admin Control Tower Routes (Protected: ADMIN & AUDITOR only) */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={["ADMIN", "AUDITOR"]}>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/overview"
          element={
            <ProtectedRoute allowedRoles={["ADMIN", "AUDITOR"]}>
              <SupplyChainOverview />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/lifecycle"
          element={
            <ProtectedRoute allowedRoles={["ADMIN", "AUDITOR"]}>
              <LifecycleExplorer />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/transactions"
          element={
            <ProtectedRoute allowedRoles={["ADMIN", "AUDITOR"]}>
              <AllTransactions />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/fraud"
          element={
            <ProtectedRoute allowedRoles={["ADMIN", "AUDITOR"]}>
              <FraudCenter />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/quarantine"
          element={
            <ProtectedRoute allowedRoles={["ADMIN", "AUDITOR"]}>
              <Quarantine />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/ledger"
          element={
            <ProtectedRoute allowedRoles={["ADMIN", "AUDITOR"]}>
              <Ledger />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/network"
          element={
            <ProtectedRoute allowedRoles={["ADMIN", "AUDITOR"]}>
              <Network />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/model"
          element={
            <ProtectedRoute allowedRoles={["ADMIN", "AUDITOR"]}>
              <Model />
            </ProtectedRoute>
          }
        />

        {/* Participant Portal Routes (Protected: Registered participants and Admin) */}
        <Route
          path="/portal"
          element={
            <ProtectedRoute allowedRoles={["FARMER", "COOP", "PROCESSOR", "DISTRIBUTOR", "RETAILER", "ADMIN"]}>
              <ParticipantPortal />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/batches"
          element={
            <ProtectedRoute allowedRoles={["FARMER", "COOP", "PROCESSOR", "DISTRIBUTOR", "RETAILER", "ADMIN"]}>
              <ParticipantBatches />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/transfers"
          element={
            <ProtectedRoute allowedRoles={["FARMER", "COOP", "PROCESSOR", "DISTRIBUTOR", "RETAILER", "ADMIN"]}>
              <ParticipantTransfers />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/identity"
          element={
            <ProtectedRoute allowedRoles={["FARMER", "COOP", "PROCESSOR", "DISTRIBUTOR", "RETAILER", "ADMIN"]}>
              <ParticipantIdentity />
            </ProtectedRoute>
          }
        />

        {/* Legacy & Shortcut Routes for Backwards Compatibility (Protected) */}
        <Route
          path="/check"
          element={
            <ProtectedRoute allowedRoles={["ADMIN", "AUDITOR"]}>
              <Check />
            </ProtectedRoute>
          }
        />
        <Route
          path="/quarantine"
          element={
            <ProtectedRoute allowedRoles={["ADMIN", "AUDITOR"]}>
              <Quarantine />
            </ProtectedRoute>
          }
        />
        <Route
          path="/ledger"
          element={
            <ProtectedRoute allowedRoles={["ADMIN", "AUDITOR"]}>
              <Ledger />
            </ProtectedRoute>
          }
        />
        <Route
          path="/trace"
          element={
            <ProtectedRoute allowedRoles={["ADMIN", "AUDITOR"]}>
              <LifecycleExplorer />
            </ProtectedRoute>
          }
        />
        <Route
          path="/legacy-trace"
          element={
            <ProtectedRoute allowedRoles={["ADMIN", "AUDITOR"]}>
              <Trace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/network"
          element={
            <ProtectedRoute allowedRoles={["ADMIN", "AUDITOR"]}>
              <Network />
            </ProtectedRoute>
          }
        />
        <Route
          path="/model"
          element={
            <ProtectedRoute allowedRoles={["ADMIN", "AUDITOR"]}>
              <Model />
            </ProtectedRoute>
          }
        />
        <Route
          path="/overview"
          element={
            <ProtectedRoute allowedRoles={["ADMIN", "AUDITOR"]}>
              <SupplyChainOverview />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lifecycle"
          element={
            <ProtectedRoute allowedRoles={["ADMIN", "AUDITOR"]}>
              <LifecycleExplorer />
            </ProtectedRoute>
          }
        />
        <Route
          path="/fraud"
          element={
            <ProtectedRoute allowedRoles={["ADMIN", "AUDITOR"]}>
              <FraudCenter />
            </ProtectedRoute>
          }
        />
        <Route
          path="/transactions"
          element={
            <ProtectedRoute allowedRoles={["ADMIN", "AUDITOR"]}>
              <AllTransactions />
            </ProtectedRoute>
          }
        />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
