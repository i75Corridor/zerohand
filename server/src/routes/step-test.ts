import { Router } from "express";
import { eq, asc } from "drizzle-orm";
import type { Db } from "@pawn/db";
import { pipelines, pipelineSteps } from "@pawn/db";
import { runSkillStep } from "../services/pi-executor.js";
import { loadSkillDef } from "../services/skill-loader.js";
import { resolvePrompt } from "../services/execution-engine.js";
import { readModelSetting } from "../services/model-utils.js";
import { skillsDir as getSkillsDir } from "../services/paths.js";

export function createStepTestRouter(db: Db): Router {
  const router = Router();

  router.post("/pipelines/:id/steps/:stepIndex/test", async (req, res, next) => {
    try {
      const { id: pipelineId, stepIndex: stepIndexStr } = req.params;
      const stepIndex = parseInt(stepIndexStr, 10);
      if (isNaN(stepIndex)) return res.status(400).json({ error: "Invalid stepIndex" });

      const { mockInputs = {}, previousOutputs = {} } = req.body as {
        mockInputs?: Record<string, string>;
        previousOutputs?: Record<string, string>;
      };

      const pipeline = await db.query.pipelines.findFirst({ where: eq(pipelines.id, pipelineId) });
      if (!pipeline) return res.status(404).json({ error: "Pipeline not found" });

      const steps = await db.query.pipelineSteps.findMany({
        where: eq(pipelineSteps.pipelineId, pipelineId),
        orderBy: [asc(pipelineSteps.stepIndex)],
      });

      const step = steps.find((s) => s.stepIndex === stepIndex);
      if (!step) return res.status(404).json({ error: `Step ${stepIndex} not found in pipeline` });
      if (!step.skillName) return res.status(400).json({ error: `Step ${stepIndex} has no skill assigned` });

      const skill = loadSkillDef(step.skillName, getSkillsDir());
      if (!skill) return res.status(404).json({ error: `Skill not found: "${step.skillName}"` });

      const stepOutputsMap = new Map<number, string>();
      for (const [k, v] of Object.entries(previousOutputs)) {
        const idx = parseInt(k, 10);
        if (!isNaN(idx)) stepOutputsMap.set(idx, v);
      }

      const resolvedPrompt = resolvePrompt(step.promptTemplate, mockInputs, stepOutputsMap);

      const defaultModel = await readModelSetting(db, "default_pipeline_model", "google/gemini-2.5-flash");
      const modelProvider = pipeline.modelProvider ?? defaultModel.provider;
      const modelName = pipeline.modelName ?? defaultModel.modelId;
      const pipelineContext = ((pipeline.metadata as Record<string, unknown>)?.context ?? {}) as Record<string, string>;

      const toolCalls: string[] = [];
      const result = await runSkillStep(
        skill,
        pipeline.systemPrompt ?? null,
        modelProvider,
        modelName,
        resolvedPrompt,
        pipelineContext,
        (eventType, message) => {
          if (eventType === "tool_call_start") toolCalls.push(message ?? "");
        },
      );

      res.json({ output: result.output, toolCalls, usage: result.usage });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
