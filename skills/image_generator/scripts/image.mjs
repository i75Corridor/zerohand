#!/usr/bin/env node
/**
 * Imagen image generator using Google GenAI SDK.
 * Usage: image.mjs <prompt> [--output=PATH] [--model=MODEL] [--no-style-suffix]
 *
 * Automatically appends editorial cartoon style suffix to prompt.
 * Falls back to a generic prompt if the original is refused by the API.
 */

import { writeFileSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";

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

function parseArgs(argv) {
  const args = { prompt: null, output: "output.png", model: "imagen-4.0-fast-generate-001", noStyleSuffix: false };
  const positional = [];
  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else if (arg.startsWith("--model=")) args.model = arg.slice("--model=".length);
    else if (arg === "--no-style-suffix") args.noStyleSuffix = true;
    else if (!arg.startsWith("--")) positional.push(arg);
  }
  args.prompt = positional.join(" ");
  return args;
}

async function generateImage(client, model, prompt, outputPath) {
  const { GoogleGenAI } = await import("@google/genai");
  const response = await client.models.generateImages({
    model,
    prompt,
    config: { numberOfImages: 1, outputMimeType: "image/png" },
  });

  if (!response.generatedImages || response.generatedImages.length === 0) {
    throw new Error("No images returned from API");
  }

  const imageBytes = response.generatedImages[0].image.imageBytes;
  const absPath = resolve(outputPath);
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, Buffer.from(imageBytes, "base64"));
  return Buffer.from(imageBytes, "base64").length;
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.prompt) {
    console.error("ERROR: prompt argument is required");
    process.exit(1);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("ERROR: GEMINI_API_KEY environment variable not set");
    process.exit(1);
  }

  let GoogleGenAI;
  try {
    ({ GoogleGenAI } = await import("@google/genai"));
  } catch {
    console.error("ERROR: @google/genai not installed. Run: npm install @google/genai");
    process.exit(1);
  }

  const client = new GoogleGenAI({ apiKey });

  const styledPrompt = args.noStyleSuffix ? args.prompt : args.prompt + STYLE_SUFFIX;
  const promptsToTry = [styledPrompt, ...FALLBACK_PROMPTS];

  let lastError = null;
  for (let i = 0; i < promptsToTry.length; i++) {
    const label = i === 0 ? "original" : `fallback ${i}`;
    const prompt = promptsToTry[i];
    console.log(`Attempting ${label} prompt with model: ${args.model}`);
    console.log(`Prompt: ${prompt.slice(0, 120)}${prompt.length > 120 ? "..." : ""}`);
    try {
      const size = await generateImage(client, args.model, prompt, args.output);
      console.log(`SUCCESS: Image saved to ${args.output} (${size} bytes)`);
      return;
    } catch (e) {
      lastError = e.message;
      console.error(`Attempt ${i + 1} failed: ${lastError}`);
    }
  }

  console.error(`ERROR: All ${promptsToTry.length} prompt attempts failed. Last error: ${lastError}`);
  process.exit(1);
}

main();
