import { useState } from "react";
import {
  HelpCircle,
  Rocket,
  GitBranch,
  Cpu,
  FileCode,
  Play,
  Webhook,
  ShieldCheck,
  MessageSquare,
  Package,
  Settings,
  Navigation,
  DollarSign,
} from "lucide-react";
import OnboardingModal from "../components/OnboardingModal.tsx";
import PageHeader from "../components/PageHeader.tsx";
import SectionPanel from "../components/SectionPanel.tsx";

const CONCEPTS = [
  {
    icon: GitBranch,
    name: "Pipeline",
    description:
      "An orchestration graph of sequential steps executed in order. Each step references a skill by name. Has a name, input schema, a top-level model, and a system prompt shared across all steps.",
  },
  {
    icon: Cpu,
    name: "Skill",
    description:
      "A folder containing a SKILL.md file (YAML frontmatter + system prompt body) and an optional scripts/ directory of executable tools. Skills are the primary unit of execution — pipelines compose them.",
  },
  {
    icon: FileCode,
    name: "Script",
    description:
      "An executable file inside a skill's scripts/ directory (.js, .py, .sh). The filename minus extension becomes a tool the skill's agent can call. Scripts receive input as JSON on stdin and write results to stdout.",
  },
  {
    icon: Play,
    name: "Run",
    description:
      "A pipeline execution instance. Runs can be triggered manually, by cron schedule, via webhook, or through a channel integration. Each run executes steps sequentially, recording output and cost per step.",
  },
  {
    icon: Webhook,
    name: "Trigger",
    description:
      "An automation that starts pipeline runs. Supports cron schedules (e.g., daily at 9am), webhooks (HTTP POST to a unique URL), and channel integrations (Telegram, Slack).",
  },
  {
    icon: ShieldCheck,
    name: "Approval",
    description:
      "A human-in-the-loop checkpoint. Pipeline steps can require approval before execution. Pending approvals are visible in the sidebar and on the Approvals page.",
  },
];

const CAPABILITIES = [
  { icon: GitBranch, label: "Pipelines", description: "List, create, edit, delete; add/update/remove steps" },
  { icon: Cpu, label: "Skills", description: "List, read, create, update (writes SKILL.md to disk)" },
  { icon: FileCode, label: "Scripts", description: "Create, update, delete script files within a skill" },
  { icon: Play, label: "Runs", description: "Trigger, cancel, check status and recent history" },
  { icon: Webhook, label: "Triggers", description: "List, create, update, delete cron/webhook/channel triggers" },
  { icon: ShieldCheck, label: "Approvals", description: "List pending approvals, approve or reject pipeline steps" },
  { icon: DollarSign, label: "Budgets", description: "List, create, update, delete budget policies for cost control" },
  { icon: Package, label: "Packages", description: "Install from repo, update, uninstall, discover on GitHub, scan for security" },
  { icon: Settings, label: "Settings", description: "List all settings, update configuration values" },
  { icon: Navigation, label: "Navigation", description: "Navigate the UI to any page" },
];

export default function Help() {
  const [showTour, setShowTour] = useState(false);

  return (
    <div className="p-4 sm:p-6 lg:p-10 max-w-6xl pt-14 lg:pt-10">
      <PageHeader title="Help & Reference" subtitle="Learn" />

      {/* Getting Started */}
      <div className="bg-pawn-surface-900/40 border border-pawn-surface-800/50 rounded-card p-6 mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-button bg-pawn-gold-500/10 flex items-center justify-center">
              <Rocket className="w-5 h-5 text-pawn-gold-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Getting Started</h2>
              <p className="text-sm text-pawn-surface-400">New to Pawn? Take a quick tour of the key concepts.</p>
            </div>
          </div>
          <button
            onClick={() => setShowTour(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-pawn-gold-600 hover:bg-pawn-gold-500 rounded-button transition-colors btn-press"
          >
            Take the Tour
          </button>
        </div>
      </div>

      {/* Core Concepts */}
      <div className="mb-8">
        <h2 className="text-xs font-semibold text-pawn-surface-400 uppercase tracking-wider mb-4">Core Concepts</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {CONCEPTS.map((c) => (
            <div
              key={c.name}
              className="bg-pawn-surface-900/40 border border-pawn-surface-800/50 rounded-card p-5"
            >
              <div className="flex items-center gap-2.5 mb-2">
                <c.icon className="w-4 h-4 text-pawn-surface-400" />
                <h3 className="text-sm font-semibold text-white">{c.name}</h3>
              </div>
              <p className="text-xs text-pawn-surface-400 leading-relaxed">{c.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Agent Capabilities */}
      <div className="mb-8">
        <h2 className="text-xs font-semibold text-pawn-surface-400 uppercase tracking-wider mb-4">Agent Capabilities</h2>
        <p className="text-sm text-pawn-surface-400 mb-4">
          The AI copilot in the sidebar can perform all of these actions through natural language:
        </p>
        <SectionPanel>
          {CAPABILITIES.map((cap, i) => (
            <div
              key={cap.label}
              className={`flex items-center gap-3 px-5 py-3 ${
                i > 0 ? "border-t border-pawn-surface-800/50" : ""
              }`}
            >
              <cap.icon className="w-4 h-4 text-pawn-surface-500 shrink-0" />
              <span className="text-sm font-medium text-pawn-surface-200 w-24 shrink-0">{cap.label}</span>
              <span className="text-xs text-pawn-surface-400">{cap.description}</span>
            </div>
          ))}
        </SectionPanel>
      </div>

      {/* Tips */}
      <div>
        <h2 className="text-xs font-semibold text-pawn-surface-400 uppercase tracking-wider mb-4">Quick Tips</h2>
        <div className="bg-pawn-surface-900/40 border border-pawn-surface-800/50 rounded-card p-5">
          <ul className="space-y-2 text-sm text-pawn-surface-400">
            <li className="flex items-start gap-2">
              <MessageSquare className="w-4 h-4 text-pawn-surface-500 mt-0.5 shrink-0" />
              <span>Open the agent chat from the sidebar to create pipelines, manage skills, or trigger runs with natural language.</span>
            </li>
            <li className="flex items-start gap-2">
              <HelpCircle className="w-4 h-4 text-pawn-surface-500 mt-0.5 shrink-0" />
              <span>Pipeline steps requiring human review will pause and appear on the Approvals page.</span>
            </li>
            <li className="flex items-start gap-2">
              <Package className="w-4 h-4 text-pawn-surface-500 mt-0.5 shrink-0" />
              <span>Install packages from GitHub to quickly add pre-built pipelines and skills.</span>
            </li>
          </ul>
        </div>
      </div>

      <OnboardingModal open={showTour} onClose={() => setShowTour(false)} />
    </div>
  );
}
