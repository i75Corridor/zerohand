/**
 * Built-in worker type implementations.
 *
 * imagen  — generates a PNG via Google Imagen, returns the saved file path
 * publish — assembles article + cover image into a markdown file, returns the file path
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, join, dirname, basename } from "node:path";

// ---------------------------------------------------------------------------
// imagen
// ---------------------------------------------------------------------------

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

async function generateImage(prompt: string, outputPath: string, model: string): Promise<number> {
  const { GoogleGenAI } = await import("@google/genai");
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  const response = await client.models.generateImages({
    model,
    prompt,
    config: { numberOfImages: 1, outputMimeType: "image/png" },
  });

  if (!response.generatedImages || response.generatedImages.length === 0) {
    throw new Error("No images returned from Imagen API");
  }

  const imageBytes = response.generatedImages[0].image!.imageBytes!;
  const absPath = resolve(outputPath);
  mkdirSync(dirname(absPath), { recursive: true });
  const buf = Buffer.from(imageBytes as string, "base64");
  writeFileSync(absPath, buf);
  return buf.length;
}

export async function runImagenWorker(
  imagePrompt: string,
  modelName: string,
  outputDir: string,
  slug: string,
  onUpdate: (msg: string) => void,
): Promise<string> {
  const imagePath = join(resolve(outputDir), `${slug}.png`);
  const styledPrompt = imagePrompt.trim() + STYLE_SUFFIX;
  const promptsToTry = [styledPrompt, ...FALLBACK_PROMPTS];

  onUpdate(`Generating cover image with model: ${modelName}`);

  let lastError = "";
  for (let i = 0; i < promptsToTry.length; i++) {
    const label = i === 0 ? "primary prompt" : `fallback ${i}`;
    onUpdate(`Attempting ${label}...`);
    try {
      const bytes = await generateImage(promptsToTry[i], imagePath, modelName);
      onUpdate(`Image saved: ${imagePath} (${bytes} bytes)`);
      return imagePath;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
      onUpdate(`Attempt ${i + 1} failed: ${lastError}`);
    }
  }

  throw new Error(`All ${promptsToTry.length} image generation attempts failed. Last error: ${lastError}`);
}

// ---------------------------------------------------------------------------
// publish
// ---------------------------------------------------------------------------

function makeSlug(date: string, headline: string): string {
  const words = headline
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .slice(0, 6)
    .join("-");
  return `${date}-${words}`;
}

function extractHeadline(article: string): string {
  const match = article.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : "untitled";
}

export async function runPublishWorker(
  article: string,
  imagePath: string,
  outputDir: string,
  onUpdate: (msg: string) => void,
): Promise<string> {
  const date = new Date().toISOString().slice(0, 10);
  const headline = extractHeadline(article);
  const slug = makeSlug(date, headline);

  const absOutputDir = resolve(outputDir);
  mkdirSync(absOutputDir, { recursive: true });

  const imageRef = imagePath ? basename(imagePath) : null;
  const content = imageRef ? `![Cover illustration](${imageRef})\n\n${article}` : article;

  const mdPath = join(absOutputDir, `${slug}.md`);
  writeFileSync(mdPath, content, "utf-8");

  onUpdate(`Article published: ${mdPath}`);
  return mdPath;
}
