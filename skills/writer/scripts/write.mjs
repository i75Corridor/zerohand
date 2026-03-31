#!/usr/bin/env node
/**
 * Write stdin to a file.
 * Usage: node write.mjs <output-path>
 * Content is read from stdin (heredoc-friendly).
 */
import { writeFileSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";

const outputPath = process.argv[2];
if (!outputPath) {
  console.error("Usage: node write.mjs <output-path>");
  process.exit(1);
}

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const content = chunks.join("");

const absPath = resolve(outputPath);
mkdirSync(dirname(absPath), { recursive: true });
writeFileSync(absPath, content, "utf8");
console.log(`Written: ${absPath} (${content.length} chars)`);
