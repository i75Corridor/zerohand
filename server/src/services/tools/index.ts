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
import { makeGetSkillScript } from "./get-skill-script.js";
import { makeCreateSkill } from "./create-skill.js";
import { makeUpdateSkill } from "./update-skill.js";
import { makeCreateSkillScript } from "./create-skill-script.js";
import { makeUpdateSkillScript } from "./update-skill-script.js";
import { makeDeleteSkillScript } from "./delete-skill-script.js";
import { makeValidatePipeline } from "./validate-pipeline.js";
import { makeGetPipelineYaml } from "./get-pipeline-yaml.js";
import { makeExportBlueprint } from "./export-blueprint.js";
import { makeListMcpServers } from "./list-mcp-servers.js";
import { makeListMcpServerTools } from "./list-mcp-server-tools.js";
import { makeRegisterMcpServer } from "./register-mcp-server.js";
import { makeUpdateMcpServer } from "./update-mcp-server.js";
import { makeDeleteMcpServer } from "./delete-mcp-server.js";
import { makeCloneSkill } from "./clone-skill.js";
import { makeDeleteSkill } from "./delete-skill.js";
import { makeGetStepRunOutput } from "./get-step-run-output.js";
import { makeTestStep } from "./test-step.js";
import { makeListTriggers } from "./list-triggers.js";
import { makeCreateTrigger } from "./create-trigger.js";
import { makeUpdateTrigger } from "./update-trigger.js";
import { makeDeleteTrigger } from "./delete-trigger.js";
import { makeListApprovals } from "./list-approvals.js";
import { makeApproveStep } from "./approve-step.js";
import { makeRejectStep } from "./reject-step.js";
import { makeListSettings } from "./list-settings.js";
import { makeUpdateSetting } from "./update-setting.js";
import { makeListBudgets } from "./list-budgets.js";
import { makeCreateBudget } from "./create-budget.js";
import { makeUpdateBudget } from "./update-budget.js";
import { makeDeleteBudget } from "./delete-budget.js";
import { makeListBlueprints } from "./list-blueprints.js";
import { makeInstallBlueprint } from "./install-blueprint.js";
import { makeUpdateBlueprint } from "./update-blueprint.js";
import { makeUninstallBlueprint } from "./uninstall-blueprint.js";
import { makeDiscoverBlueprints } from "./discover-blueprints.js";
import { makeScanBlueprint } from "./scan-blueprint.js";
import { makeGetRunLog } from "./get-run-log.js";
import { makeDetectMcpEnv } from "./detect-mcp-env.js";
import { makeFixPipelineValidation } from "./fix-pipeline-validation.js";

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
    makeGetSkillScript(ctx),
    makeCreateSkill(ctx),
    makeUpdateSkill(ctx),
    makeCreateSkillScript(ctx),
    makeUpdateSkillScript(ctx),
    makeDeleteSkillScript(ctx),
    makeValidatePipeline(ctx),
    makeFixPipelineValidation(ctx),
    makeGetPipelineYaml(ctx),
    makeExportBlueprint(ctx),
    makeListMcpServers(ctx),
    makeListMcpServerTools(ctx),
    makeRegisterMcpServer(ctx),
    makeUpdateMcpServer(ctx),
    makeDeleteMcpServer(ctx),
    makeDetectMcpEnv(ctx),
    makeCloneSkill(ctx),
    makeDeleteSkill(ctx),
    makeGetStepRunOutput(ctx),
    makeTestStep(ctx),
    makeListTriggers(ctx),
    makeCreateTrigger(ctx),
    makeUpdateTrigger(ctx),
    makeDeleteTrigger(ctx),
    makeListApprovals(ctx),
    makeApproveStep(ctx),
    makeRejectStep(ctx),
    makeListSettings(ctx),
    makeUpdateSetting(ctx),
    makeListBudgets(ctx),
    makeCreateBudget(ctx),
    makeUpdateBudget(ctx),
    makeDeleteBudget(ctx),
    makeListBlueprints(ctx),
    makeInstallBlueprint(ctx),
    makeUpdateBlueprint(ctx),
    makeUninstallBlueprint(ctx),
    makeDiscoverBlueprints(ctx),
    makeScanBlueprint(ctx),
    makeGetRunLog(ctx),
  ];
}
