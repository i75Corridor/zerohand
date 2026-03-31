#!/usr/bin/env node
/**
 * memory-to-file.mjs
 * Reads a value from ZeroClaw's brain.db SQLite memory store and writes it to a file.
 *
 * Usage: node memory-to-file.mjs <memory-key> <output-path>
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('/app/node_modules/better-sqlite3');
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const memoryKey = process.argv[2];
const outputPath = process.argv[3];

if (!memoryKey || !outputPath) {
  console.error('Usage: node memory-to-file.mjs <memory-key> <output-path>');
  process.exit(1);
}

const DB_PATH = '/zeroclaw-data/workspace/memory/brain.db';

const db = new Database(DB_PATH, { readonly: true });
const row = db.prepare('SELECT content FROM memories WHERE key = ?').get(memoryKey);
db.close();

if (!row) {
  console.error(`Error: No memory found for key "${memoryKey}"`);
  process.exit(1);
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, row.content, 'utf8');
console.log(`Written ${row.content.length} chars to ${outputPath}`);
