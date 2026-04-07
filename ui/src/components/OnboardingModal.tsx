import { useState } from "react";
import { Rocket, GitBranch, Play, MessageSquare, Package } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Modal from "./Modal.tsx";

interface Step {
  icon: LucideIcon;
  title: string;
  description: string;
  tip?: string;
}

const STEPS: Step[] = [
  {
    icon: Rocket,
    title: "Welcome to Pawn",
    description:
      "Pawn is an agentic workflow orchestration system. Build pipelines that chain AI skills together, trigger them on schedule or via webhooks, and monitor everything in real time.",
    tip: "Think of it as an automation platform where each step is powered by an AI agent.",
  },
  {
    icon: GitBranch,
    title: "Pipelines",
    description:
      "A pipeline is a sequence of steps executed in order. Each step references a skill by name. Pipelines have a name, input schema, a top-level model, and a system prompt shared across all steps.",
    tip: "Start by creating a pipeline or installing one from a package.",
  },
  {
    icon: Play,
    title: "Running Pipelines",
    description:
      "Trigger pipelines manually, on a cron schedule, via webhook, or through a channel integration (Telegram, Slack). Monitor runs in real time from the dashboard — cancel, retry, or inspect step-by-step output.",
    tip: "Runs that need human review will pause for approval before continuing.",
  },
  {
    icon: MessageSquare,
    title: "Agent Chat",
    description:
      "The AI copilot in the sidebar can help you create pipelines, manage skills, trigger runs, and navigate the app — all through natural language. It has access to every tool in the system.",
    tip: "Try asking: \"Create a pipeline that summarizes news articles daily.\"",
  },
  {
    icon: Package,
    title: "Skills & Packages",
    description:
      "Skills are the building blocks — each one is a focused AI agent with a system prompt and optional scripts. Packages bundle pipelines and skills together for easy sharing and installation from GitHub.",
    tip: "Browse the Packages page to discover and install community packages.",
  },
];

interface OnboardingModalProps {
  open: boolean;
  onClose: () => void;
}

export default function OnboardingModal({ open, onClose }: OnboardingModalProps) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  const handleClose = () => {
    setStep(0);
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="" maxWidth="max-w-lg">
      {/* Step indicator dots */}
      <div className="flex justify-center gap-1.5 mb-6">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full transition-colors ${
              i === step ? "bg-pawn-gold-500" : "bg-pawn-surface-700"
            }`}
          />
        ))}
      </div>

      {/* Step content */}
      <div className="text-center px-2">
        <div className="mx-auto w-12 h-12 rounded-card bg-pawn-gold-500/10 flex items-center justify-center mb-4">
          <Icon className="w-6 h-6 text-pawn-gold-400" />
        </div>
        <h2 className="text-xl font-semibold text-white mb-3">{current.title}</h2>
        <p className="text-sm text-pawn-surface-300 leading-relaxed mb-4">{current.description}</p>
        {current.tip && (
          <p className="text-xs text-pawn-surface-500 italic">{current.tip}</p>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between mt-8 pt-4 border-t border-pawn-surface-800">
        <button
          onClick={handleClose}
          className="text-xs text-pawn-surface-500 hover:text-pawn-surface-300 transition-colors"
        >
          Skip
        </button>
        <div className="flex gap-2">
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="px-4 py-2 text-sm font-medium text-pawn-surface-300 hover:text-white bg-pawn-surface-800 hover:bg-pawn-surface-700 rounded-button transition-colors"
            >
              Back
            </button>
          )}
          <button
            onClick={isLast ? handleClose : () => setStep(step + 1)}
            className="px-4 py-2 text-sm font-medium text-pawn-surface-950 bg-pawn-gold-500 hover:bg-pawn-gold-400 rounded-button transition-colors btn-press"
          >
            {isLast ? "Get Started" : "Next"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
