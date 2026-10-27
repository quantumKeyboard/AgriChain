import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import Check from "./pages/Check";
import Dashboard from "./pages/Dashboard";
import Ledger from "./pages/Ledger";
import Model from "./pages/Model";
import Network from "./pages/Network";
import Quarantine from "./pages/Quarantine";
import Trace from "./pages/Trace";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/check" element={<Check />} />
        <Route path="/quarantine" element={<Quarantine />} />
        <Route path="/ledger" element={<Ledger />} />
        <Route path="/trace" element={<Trace />} />
        <Route path="/network" element={<Network />} />
        <Route path="/model" element={<Model />} />
        <Route path="*" element={<p className="text-muted">Page not found.</p>} />
      </Routes>
    </Layout>
  );
}
