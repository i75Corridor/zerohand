import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32; // 256 bits

let cachedKey: Buffer | null = null;

export function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey) {
    if (envKey.length !== 64) {
      throw new Error("ENCRYPTION_KEY must be a 64-character hex string (32 bytes)");
    }
    cachedKey = Buffer.from(envKey, "hex");
    return cachedKey;
  }

  // Auto-generate and persist
  const keyFile = join(
    process.env.DATA_DIR ?? join(process.cwd(), ".data"),
    ".encryption-key",
  );

  console.warn(
    "[Crypto] ENCRYPTION_KEY env var not set. Using auto-generated key at",
    keyFile,
    "— Set ENCRYPTION_KEY in production to ensure secrets survive restarts.",
  );

  if (existsSync(keyFile)) {
    const stored = readFileSync(keyFile, "utf-8").trim();
    cachedKey = Buffer.from(stored, "hex");
    return cachedKey;
  }

  const newKey = randomBytes(KEY_BYTES);
  mkdirSync(dirname(keyFile), { recursive: true });
  writeFileSync(keyFile, newKey.toString("hex"), { mode: 0o600 });
  cachedKey = newKey;
  return cachedKey;
}

export interface EncryptedValue {
  ciphertext: string;
  iv: string;
  authTag: string;
}

export function encrypt(plaintext: string): EncryptedValue {
  const key = getEncryptionKey();
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let ciphertext = cipher.update(plaintext, "utf-8", "hex");
  ciphertext += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return {
    ciphertext,
    iv: iv.toString("hex"),
    authTag,
  };
}

export function decrypt(ciphertext: string, iv: string, authTag: string): string {
  const key = getEncryptionKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(authTag, "hex"));

  let plaintext = decipher.update(ciphertext, "hex", "utf-8");
  plaintext += decipher.final("utf-8");
  return plaintext;
}

export function maskValue(value: string): string {
  if (value.length <= 8) return "••••••";
  return `${value.slice(0, 3)}...${value.slice(-4)}`;
}

/** Derive a short fingerprint for a plaintext value (for change detection without storing plaintext) */
export function fingerprintValue(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
}
