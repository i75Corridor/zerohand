import type { Db } from "@zerohand/db";
import type { WsGlobalAgentEvent, WsDataChanged } from "@zerohand/shared";

export interface AgentToolContext {
  db: Db;
  broadcast: (msg: WsGlobalAgentEvent | WsDataChanged) => void;
  broadcastDataChanged: (entity: WsDataChanged["entity"], action: WsDataChanged["action"], id: string) => void;
  cancelRun: (runId: string) => void;
  skillsDir: string;
}
