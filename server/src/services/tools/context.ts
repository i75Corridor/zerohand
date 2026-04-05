import type { Db } from "@zerohand/db";
import type { WsGlobalAgentEvent, WsDataChanged } from "@zerohand/shared";
import type { runSkillStep } from "../pi-executor.js";

export interface AgentToolContext {
  db: Db;
  broadcast: (msg: WsGlobalAgentEvent | WsDataChanged) => void;
  broadcastDataChanged: (entity: WsDataChanged["entity"], action: WsDataChanged["action"], id: string) => void;
  cancelRun: (runId: string) => void;
  skillsDir: string;
  /** Injected by GlobalAgentService to support test_step tool */
  runSkillStep?: typeof runSkillStep;
}
