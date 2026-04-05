-- Prefix bare skill_name values in pipeline_steps with "local/"
-- Skill names that already contain "/" are left unchanged (already namespaced).
UPDATE "pipeline_steps"
SET "skill_name" = 'local/' || "skill_name"
WHERE "skill_name" IS NOT NULL
  AND "skill_name" NOT LIKE '%/%';
