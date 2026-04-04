import { lazy, Suspense } from "react";
import { Routes, Route, Navigate, Link } from "react-router-dom";
import Layout from "./components/Layout.tsx";
import ErrorBoundary from "./components/ErrorBoundary.tsx";

const Dashboard = lazy(() => import("./pages/Dashboard.tsx"));
const Pipelines = lazy(() => import("./pages/Pipelines.tsx"));
const PipelineDetail = lazy(() => import("./pages/PipelineDetail.tsx"));
const PipelineBuilder = lazy(() => import("./pages/PipelineBuilder.tsx"));
const RunDetail = lazy(() => import("./pages/RunDetail.tsx"));
const Approvals = lazy(() => import("./pages/Approvals.tsx"));
const Canvas = lazy(() => import("./pages/Canvas.tsx"));
const Settings = lazy(() => import("./pages/Settings.tsx"));
const Packages = lazy(() => import("./pages/Packages.tsx"));
const Skills = lazy(() => import("./pages/Skills.tsx"));
const SkillDetail = lazy(() => import("./pages/SkillDetail.tsx"));
const Costs = lazy(() => import("./pages/Costs.tsx"));

function NotFound() {
  return (
    <div className="p-8 max-w-lg">
      <h1 className="text-2xl font-semibold text-white mb-2">Page not found</h1>
      <p className="text-sm text-slate-400 mb-4">
        The page you are looking for does not exist or has been moved.
      </p>
      <Link
        to="/dashboard"
        className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium rounded-lg transition-colors inline-block"
      >
        Go to Dashboard
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <Layout>
        <Suspense fallback={
            <div className="p-6 lg:p-10 animate-fade-in" role="status" aria-live="polite">
              <div className="h-5 w-24 bg-slate-800/60 rounded animate-pulse mb-2" />
              <div className="h-8 w-48 bg-slate-800/60 rounded animate-pulse mb-8" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <div className="h-24 bg-slate-900/50 border border-slate-800 rounded-xl animate-pulse" />
                <div className="h-24 bg-slate-900/50 border border-slate-800 rounded-xl animate-pulse" />
                <div className="h-24 bg-slate-900/50 border border-slate-800 rounded-xl animate-pulse" />
              </div>
              <span className="sr-only">Loading page content</span>
            </div>
          }>
          <ErrorBoundary>
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
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ErrorBoundary>
        </Suspense>
      </Layout>
    </ErrorBoundary>
  );
}
