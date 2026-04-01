/**
 * Publisher script — assembles article + cover image into a markdown file.
 *
 * stdin:  { article, imagePath, outputDir }
 * stdout: { publishedPath }
 */
import { createInterface } from "readline";
import { writeFileSync, mkdirSync } from "fs";
import { resolve, join, basename } from "path";

function extractHeadline(article) {
  const match = article.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : "untitled";
}

function makeSlug(date, headline) {
  const words = headline
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .slice(0, 6)
    .join("-");
  return `${date}-${words}`;
}

const chunks = [];
const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => chunks.push(line));
rl.on("close", () => {
  const {
    article = "",
    imagePath = "",
    outputDir = "/tmp/zerohand-output",
  } = JSON.parse(chunks.join("\n") || "{}");

  const date = new Date().toISOString().slice(0, 10);
  const headline = extractHeadline(article);
  const slug = makeSlug(date, headline);

  const absOutputDir = resolve(outputDir);
  mkdirSync(absOutputDir, { recursive: true });

  const imageRef = imagePath ? basename(imagePath) : null;
  const content = imageRef ? `![Cover illustration](${imageRef})\n\n${article}` : article;

  const publishedPath = join(absOutputDir, `${slug}.md`);
  writeFileSync(publishedPath, content, "utf-8");

  console.log(JSON.stringify({ publishedPath }));
});
