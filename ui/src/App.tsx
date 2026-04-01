import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import Pipelines from "./pages/Pipelines.tsx";
import Workers from "./pages/Workers.tsx";
import RunDetail from "./pages/RunDetail.tsx";
import Approvals from "./pages/Approvals.tsx";
import Canvas from "./pages/Canvas.tsx";
import Settings from "./pages/Settings.tsx";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/pipelines" element={<Pipelines />} />
        <Route path="/workers" element={<Workers />} />
        <Route path="/approvals" element={<Approvals />} />
        <Route path="/canvas" element={<Canvas />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/runs/:id" element={<RunDetail />} />
      </Routes>
    </Layout>
  );
}
