"use strict";
/**
 * Imagen generation script (CommonJS — NODE_PATH resolves @google/genai via server/node_modules).
 *
 * stdin:  { prompt, modelName, outputDir, slug, aspectRatio, personGeneration, apiKey }
 * stdout: { imagePath }
 */
const { createInterface } = require("readline");
const { writeFileSync, mkdirSync } = require("fs");
const { resolve, join, dirname } = require("path");

const STYLE_SUFFIX =
  ", in the style of a 1950s American editorial newspaper cartoon, " +
  "crosshatched ink illustration, exaggerated caricature, dramatic chiaroscuro, " +
  "newspaper halftone texture, black-and-white with spot color, " +
  "in the tradition of Herblock or Bill Mauldin";

const FALLBACK_PROMPTS = [
  "Satirical editorial newspaper cartoon, 1950s American style. " +
    "A pompous government official drowning in a sea of paperwork, crosshatched ink, " +
    "exaggerated caricature, dramatic black-and-white, newspaper halftone texture.",
  "A classic 1950s editorial cartoon showing a confused bureaucrat, " +
    "crosshatch ink style, exaggerated features, newspaper print aesthetic.",
];

async function generateImage(prompt, outputPath, model, aspectRatio, personGeneration, apiKey) {
  const { GoogleGenAI } = require("@google/genai");
  const client = new GoogleGenAI({ apiKey });

  const response = await client.models.generateImages({
    model,
    prompt,
    config: { numberOfImages: 1, outputMimeType: "image/png", aspectRatio, personGeneration },
  });

  if (!response.generatedImages || response.generatedImages.length === 0) {
    throw new Error("No images returned from Imagen API");
  }

  const imageBytes = response.generatedImages[0].image.imageBytes;
  const absPath = resolve(outputPath);
  mkdirSync(dirname(absPath), { recursive: true });
  const buf = Buffer.from(imageBytes, "base64");
  writeFileSync(absPath, buf);
  return buf.length;
}

const chunks = [];
const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => chunks.push(line));
rl.on("close", async () => {
  const {
    prompt = "",
    modelName = "imagen-4.0-generate-001",
    outputDir = "/tmp/zerohand-output",
    slug = "image",
    aspectRatio = "16:9",
    personGeneration = "allow_all",
    apiKey,
  } = JSON.parse(chunks.join("\n") || "{}");

  if (!apiKey) {
    process.stderr.write("No apiKey provided in input\n");
    process.exit(1);
  }

  const imagePath = join(resolve(outputDir), `${slug}.png`);
  const styledPrompt = prompt.trim() + STYLE_SUFFIX;
  const promptsToTry = [styledPrompt, ...FALLBACK_PROMPTS];

  let lastError = "";
  for (let i = 0; i < promptsToTry.length; i++) {
    try {
      await generateImage(promptsToTry[i], imagePath, modelName, aspectRatio, personGeneration, apiKey);
      console.log(JSON.stringify({ imagePath }));
      return;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Attempt ${i + 1} failed: ${lastError}\n`);
    }
  }

  process.stderr.write(`All ${promptsToTry.length} attempts failed. Last error: ${lastError}\n`);
  process.exit(1);
});
