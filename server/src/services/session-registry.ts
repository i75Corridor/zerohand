import type { AgentSession } from "@mariozechner/pi-coding-agent";

interface ActiveSession {
  session: AgentSession;
  pipelineRunId: string;
}

export class SessionRegistry {
  private sessions = new Map<string, ActiveSession>();

  register(stepRunId: string, entry: ActiveSession): void {
    this.sessions.set(stepRunId, entry);
  }

  unregister(stepRunId: string): void {
    this.sessions.delete(stepRunId);
  }

  get(stepRunId: string): ActiveSession | undefined {
    return this.sessions.get(stepRunId);
  }

  getByRunId(pipelineRunId: string): Array<{ stepRunId: string } & ActiveSession> {
    const results: Array<{ stepRunId: string } & ActiveSession> = [];
    for (const [stepRunId, entry] of this.sessions) {
      if (entry.pipelineRunId === pipelineRunId) {
        results.push({ stepRunId, ...entry });
      }
    }
    return results;
  }
}
