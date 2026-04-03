import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import Pipelines from "./pages/Pipelines.tsx";
import PipelineDetail from "./pages/PipelineDetail.tsx";
import PipelineBuilder from "./pages/PipelineBuilder.tsx";
import RunDetail from "./pages/RunDetail.tsx";
import Approvals from "./pages/Approvals.tsx";
import Canvas from "./pages/Canvas.tsx";
import Settings from "./pages/Settings.tsx";
import Packages from "./pages/Packages.tsx";
import Skills from "./pages/Skills.tsx";
import SkillDetail from "./pages/SkillDetail.tsx";
import Costs from "./pages/Costs.tsx";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/pipelines" element={<Pipelines />} />
        <Route path="/pipelines/new" element={<PipelineBuilder />} />
        <Route path="/pipelines/:id" element={<PipelineDetail />} />
        <Route path="/pipelines/:id/edit" element={<PipelineBuilder />} />
        <Route path="/approvals" element={<Approvals />} />
        <Route path="/canvas" element={<Canvas />} />
        <Route path="/packages" element={<Packages />} />
        <Route path="/skills" element={<Skills />} />
        <Route path="/skills/:name" element={<SkillDetail />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/runs/:id" element={<RunDetail />} />
        <Route path="/costs" element={<Costs />} />
      </Routes>
    </Layout>
  );
}
