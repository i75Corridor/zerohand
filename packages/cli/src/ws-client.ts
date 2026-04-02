import WebSocket from "ws";
import type { WsMessage } from "@zerohand/shared";

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

export interface StreamOptions {
  onTextDelta: (text: string, stepIndex: number) => void;
  onStepStatus: (stepIndex: number, status: string) => void;
  onRunStatus: (status: string) => void;
  onError: (err: Error) => void;
  onClose: () => void;
}

export function streamRunEvents(
  serverUrl: string,
  runId: string,
  options: StreamOptions,
): { close: () => void } {
  const wsUrl = serverUrl.replace(/^http/, "ws");
  const ws = new WebSocket(wsUrl);

  ws.on("message", (data) => {
    let msg: WsMessage;
    try {
      msg = JSON.parse(data.toString()) as WsMessage;
    } catch {
      return;
    }

    if (msg.type === "step_event" && msg.pipelineRunId === runId) {
      if (msg.eventType === "text_delta" && msg.message) {
        options.onTextDelta(msg.message, msg.stepIndex);
      }
    } else if (msg.type === "step_status" && msg.pipelineRunId === runId) {
      options.onStepStatus(msg.stepIndex, msg.status);
    } else if (msg.type === "run_status" && msg.pipelineRunId === runId) {
      options.onRunStatus(msg.status);
      if (TERMINAL_STATUSES.has(msg.status)) {
        ws.close();
      }
    }
  });

  ws.on("error", (err) => options.onError(err));
  ws.on("close", () => options.onClose());

  return { close: () => ws.close() };
}
