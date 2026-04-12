/**
 * AES-256-GCM encryption service for OAuth token storage at rest.
 *
 * Tokens are encrypted with a 32-byte key that is either:
 *   1. Provided via OAUTH_ENCRYPTION_KEY env var (hex-encoded), or
 *   2. Read from / generated into DATA_DIR/oauth-encryption.key
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const KEY_LENGTH = 32; // 256 bits
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag

// Module-level key, initialised by ensureEncryptionKey()
let encryptionKey: Buffer | null = null;

// ── Helpers ──────────────────────────────────────────────────────────────────

function toBase64Url(buf: Buffer): string {
  return buf.toString("base64url");
}

function fromBase64Url(str: string): Buffer {
  return Buffer.from(str, "base64url");
}

function getKey(): Buffer {
  if (!encryptionKey) {
    throw new Error(
      "[oauth-crypto] Encryption key not initialised. Call ensureEncryptionKey() first.",
    );
  }
  return encryptionKey;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns `iv:ciphertext:authTag` (all base64url-encoded, colon-separated).
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${toBase64Url(iv)}:${toBase64Url(encrypted)}:${toBase64Url(authTag)}`;
}

/**
 * Decrypt a string previously produced by `encrypt()`.
 * Expects `iv:ciphertext:authTag` format (base64url-encoded, colon-separated).
 */
export function decrypt(encrypted: string): string {
  const key = getKey();
  const parts = encrypted.split(":");

  if (parts.length !== 3) {
    throw new Error(
      "[oauth-crypto] Malformed encrypted string: expected 3 colon-separated parts.",
    );
  }

  const [ivB64, ciphertextB64, authTagB64] = parts;
  const iv = fromBase64Url(ivB64);
  const ciphertext = fromBase64Url(ciphertextB64);
  const authTag = fromBase64Url(authTagB64);

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * Initialise the module-level encryption key.
 *
 * Resolution order:
 *   1. `OAUTH_ENCRYPTION_KEY` env var (hex-encoded 32-byte key)
 *   2. `<dataDir>/oauth-encryption.key` file (hex-encoded)
 *   3. Generate a new random key and persist it to the file above
 *
 * Returns a human-readable source description for logging, e.g.
 *   `"env:OAUTH_ENCRYPTION_KEY"` or `"file:/path/to/oauth-encryption.key"`
 */
export function ensureEncryptionKey(dataDir: string): string {
  // 1. Environment variable
  const envKey = process.env.OAUTH_ENCRYPTION_KEY;
  if (envKey) {
    const buf = Buffer.from(envKey, "hex");
    if (buf.length !== KEY_LENGTH) {
      throw new Error(
        `[oauth-crypto] OAUTH_ENCRYPTION_KEY must be a hex-encoded ${KEY_LENGTH}-byte key ` +
          `(${KEY_LENGTH * 2} hex chars). Got ${buf.length} bytes.`,
      );
    }
    encryptionKey = buf;
    return "env:OAUTH_ENCRYPTION_KEY";
  }

  // 2. Key file
  const keyFilePath = join(dataDir, "oauth-encryption.key");

  if (existsSync(keyFilePath)) {
    const hex = readFileSync(keyFilePath, "utf-8").trim();
    const buf = Buffer.from(hex, "hex");
    if (buf.length !== KEY_LENGTH) {
      throw new Error(
        `[oauth-crypto] Key file is malformed: expected ${KEY_LENGTH}-byte key ` +
          `(${KEY_LENGTH * 2} hex chars) but got ${buf.length} bytes. ` +
          `Fix or remove: ${keyFilePath}`,
      );
    }
    encryptionKey = buf;
    return `file:${keyFilePath}`;
  }

  // 3. Generate new key
  const newKey = randomBytes(KEY_LENGTH);
  mkdirSync(dirname(keyFilePath), { recursive: true });
  writeFileSync(keyFilePath, newKey.toString("hex"), { mode: 0o600 });
  encryptionKey = newKey;
  return `file:${keyFilePath}`;
}

// ── Test-only helpers ────────────────────────────────────────────────────────

/**
 * Replace the module-level encryption key. **Test use only.**
 */
export function _setKeyForTesting(key: Buffer): void {
  encryptionKey = key;
}
