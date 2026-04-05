import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { AgentToolContext } from "./context.js";
import { makeListPipelines } from "./list-pipelines.js";
import { makeTriggerPipeline } from "./trigger-pipeline.js";
import { makeCancelRun } from "./cancel-run.js";
import { makeListRecentRuns } from "./list-recent-runs.js";
import { makeGetRunStatus } from "./get-run-status.js";
import { makeGetSystemStats } from "./get-system-stats.js";
import { makeNavigateUi } from "./navigate-ui.js";
import { makeGetPipelineDetail } from "./get-pipeline-detail.js";
import { makeCreatePipeline } from "./create-pipeline.js";
import { makeUpdatePipeline } from "./update-pipeline.js";
import { makeDeletePipeline } from "./delete-pipeline.js";
import { makeAddPipelineStep } from "./add-pipeline-step.js";
import { makeUpdatePipelineStep } from "./update-pipeline-step.js";
import { makeRemovePipelineStep } from "./remove-pipeline-step.js";
import { makeListSkills } from "./list-skills.js";
import { makeGetSkill } from "./get-skill.js";
import { makeCreateSkill } from "./create-skill.js";
import { makeUpdateSkill } from "./update-skill.js";
import { makeCreateSkillScript } from "./create-skill-script.js";
import { makeUpdateSkillScript } from "./update-skill-script.js";
import { makeDeleteSkillScript } from "./delete-skill-script.js";
import { makeValidatePipeline } from "./validate-pipeline.js";
import { makeGetPipelineYaml } from "./get-pipeline-yaml.js";
import { makeExportPackage } from "./export-package.js";
import { makeListMcpServers } from "./list-mcp-servers.js";
import { makeListMcpServerTools } from "./list-mcp-server-tools.js";
import { makeRegisterMcpServer } from "./register-mcp-server.js";
import { makeUpdateMcpServer } from "./update-mcp-server.js";
import { makeDeleteMcpServer } from "./delete-mcp-server.js";
import { makeCloneSkill } from "./clone-skill.js";
import { makeDeleteSkill } from "./delete-skill.js";
import { makeGetStepRunOutput } from "./get-step-run-output.js";
import { makeTestStep } from "./test-step.js";

export type { AgentToolContext } from "./context.js";

export function makeAllTools(ctx: AgentToolContext): ToolDefinition[] {
  return [
    makeListPipelines(ctx),
    makeTriggerPipeline(ctx),
    makeCancelRun(ctx),
    makeListRecentRuns(ctx),
    makeGetRunStatus(ctx),
    makeGetSystemStats(ctx),
    makeNavigateUi(ctx),
    makeGetPipelineDetail(ctx),
    makeCreatePipeline(ctx),
    makeUpdatePipeline(ctx),
    makeDeletePipeline(ctx),
    makeAddPipelineStep(ctx),
    makeUpdatePipelineStep(ctx),
    makeRemovePipelineStep(ctx),
    makeListSkills(ctx),
    makeGetSkill(ctx),
    makeCreateSkill(ctx),
    makeUpdateSkill(ctx),
    makeCreateSkillScript(ctx),
    makeUpdateSkillScript(ctx),
    makeDeleteSkillScript(ctx),
    makeValidatePipeline(ctx),
    makeGetPipelineYaml(ctx),
    makeExportPackage(ctx),
    makeListMcpServers(ctx),
    makeListMcpServerTools(ctx),
    makeRegisterMcpServer(ctx),
    makeUpdateMcpServer(ctx),
    makeDeleteMcpServer(ctx),
    makeCloneSkill(ctx),
    makeDeleteSkill(ctx),
    makeGetStepRunOutput(ctx),
    makeTestStep(ctx),
  ];
}
