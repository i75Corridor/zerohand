import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as p from "@clack/prompts";
import { Command } from "commander";
import { stringify } from "yaml";

interface StepDef {
  name: string;
  skill: string;
}

export function registerNewCommand(program: Command): void {
  program
    .command("new <package-name>")
    .description("scaffold a new pipeline blueprint")
    .action(async (packageName: string) => {
      p.intro(`Creating new pawn blueprint: ${packageName}`);

      const answers = await p.group(
        {
          pipelineName: () =>
            p.text({
              message: "Pipeline name",
              defaultValue: packageName,
              placeholder: packageName,
            }),
          description: () =>
            p.text({
              message: "Description",
              placeholder: "What does this pipeline do?",
            }),
          model: () =>
            p.text({
              message: "Model",
              defaultValue: "google/gemini-2.5-flash",
              placeholder: "google/gemini-2.5-flash",
            }),
          inputParam: () =>
            p.text({
              message: "Input parameter name (leave blank to skip)",
              placeholder: "topic",
            }),
          stepCount: () =>
            p.text({
              message: "Number of steps",
              defaultValue: "1",
              placeholder: "1",
            }),
        },
        {
          onCancel: () => {
            p.cancel("Cancelled");
            process.exit(0);
          },
        },
      );

      const stepCount = Math.max(1, parseInt(String(answers.stepCount), 10) || 1);
      const steps: StepDef[] = [];

      for (let i = 0; i < stepCount; i++) {
        const stepAnswers = await p.group(
          {
            name: () =>
              p.text({
                message: `Step ${i + 1} name`,
                defaultValue: `Step ${i + 1}`,
              }),
            skill: () =>
              p.text({
                message: `Step ${i + 1} skill name`,
                defaultValue: "my-skill",
              }),
          },
          {
            onCancel: () => {
              p.cancel("Cancelled");
              process.exit(0);
            },
          },
        );
        steps.push({ name: String(stepAnswers.name), skill: String(stepAnswers.skill) });
      }

      // Build pipeline.yaml
      const doc: Record<string, unknown> = {
        name: String(answers.pipelineName),
        description: String(answers.description || ""),
        model: String(answers.model || "google/gemini-2.5-flash"),
      };

      const inputParam = String(answers.inputParam || "").trim();
      if (inputParam) {
        doc.inputSchema = {
          type: "object",
          properties: {
            [inputParam]: { type: "string", description: `The ${inputParam}` },
          },
          required: [inputParam],
        };
      }

      const skillNames = [...new Set(steps.map((s) => s.skill))];
      doc.steps = steps.map((step, i) => ({
        name: step.name,
        skill: step.skill,
        promptTemplate:
          i === 0 && inputParam
            ? `Process the ${inputParam}: "{{input.${inputParam}}}"`
            : i === 0
              ? "Start processing."
              : `Continue from step ${i}: {{steps.${i - 1}.output}}`,
        timeoutSeconds: 300,
      }));

      const dir = join(process.cwd(), packageName);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "pipeline.yaml"), stringify(doc, { lineWidth: 100 }), "utf-8");

      // README
      const readme = [
        `# ${answers.pipelineName}`,
        "",
        answers.description || "",
        "",
        "## Install",
        "",
        "```bash",
        `pawn blueprints install https://github.com/YOUR_ORG/${packageName}`,
        "```",
        "",
        "## Usage",
        "",
        "```bash",
        inputParam
          ? `pawn run "${answers.pipelineName}" --input ${inputParam}="..." --watch`
          : `pawn run "${answers.pipelineName}" --watch`,
        "```",
      ].join("\n");
      writeFileSync(join(dir, "README.md"), readme + "\n", "utf-8");

      // Skill stubs
      for (const skillName of skillNames) {
        const skillDir = join(dir, "skills", skillName, "scripts");
        mkdirSync(skillDir, { recursive: true });

        const skillMd = [
          "---",
          `name: ${skillName}`,
          'version: "1.0.0"',
          `description: "${skillName} skill"`,
          "type: pi",
          "model: google/gemini-2.5-flash",
          "---",
          "",
          `You are the ${skillName}.`,
          "",
          "Complete the task described in the prompt.",
        ].join("\n");
        writeFileSync(join(dir, "skills", skillName, "SKILL.md"), skillMd + "\n", "utf-8");

        const exampleTool = [
          'import { createInterface } from "readline";',
          "const chunks = [];",
          "const rl = createInterface({ input: process.stdin });",
          'rl.on("line", (line) => chunks.push(line));',
          'rl.on("close", async () => {',
          '  const input = JSON.parse(chunks.join("\\n") || "{}");',
          "  // TODO: implement your tool logic",
          "  console.log(JSON.stringify({ result: `Processed: ${JSON.stringify(input)}` }));",
          "});",
        ].join("\n");
        writeFileSync(join(skillDir, "example_tool.js"), exampleTool + "\n", "utf-8");
      }

      // git init
      try {
        execSync("git init", { cwd: dir, stdio: "ignore" });
        // .gitignore hint
        writeFileSync(join(dir, ".gitignore"), "node_modules/\n.env\n", "utf-8");
      } catch {
        // git not available, skip
      }

      p.outro(`Blueprint scaffolded at ./${packageName}/`);
      console.log(`\nNext steps:`);
      console.log(`  cd ${packageName}`);
      console.log(`  # edit pipeline.yaml and skills/`);
      console.log(`  git add . && git commit -m "Initial pipeline blueprint"`);
      console.log(`  pawn blueprints install https://github.com/YOUR_ORG/${packageName}`);
    });
}
