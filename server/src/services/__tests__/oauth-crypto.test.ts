import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  encrypt,
  decrypt,
  ensureEncryptionKey,
  _setKeyForTesting,
} from "../oauth-crypto.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a fresh 32-byte key and install it via the test helper. */
function installFreshKey(): Buffer {
  const key = randomBytes(32);
  _setKeyForTesting(key);
  return key;
}

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "oauth-crypto-test-"));
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("oauth-crypto", () => {
  // Install a fresh key before each test so tests are isolated.
  beforeEach(() => {
    installFreshKey();
  });

  // ── encrypt / decrypt round-trip ─────────────────────────────────────────

  describe("encrypt + decrypt round-trip", () => {
    it("returns the original plaintext", () => {
      const token = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.test-payload.signature";
      const encrypted = encrypt(token);
      expect(decrypt(encrypted)).toBe(token);
    });

    it("produces three colon-separated base64url parts", () => {
      const encrypted = encrypt("hello");
      const parts = encrypted.split(":");
      expect(parts).toHaveLength(3);
      // Each part should be valid base64url (no +, /, or =)
      for (const part of parts) {
        expect(part).toMatch(/^[A-Za-z0-9_-]+$/);
      }
    });

    it("produces different ciphertexts for the same plaintext (unique IV)", () => {
      const plaintext = "same-token-value";
      const a = encrypt(plaintext);
      const b = encrypt(plaintext);
      expect(a).not.toBe(b);
      // But both decrypt to the same value
      expect(decrypt(a)).toBe(plaintext);
      expect(decrypt(b)).toBe(plaintext);
    });

    it("handles empty string", () => {
      const encrypted = encrypt("");
      expect(decrypt(encrypted)).toBe("");
    });
  });

  // ── Error paths ──────────────────────────────────────────────────────────

  describe("decrypt error paths", () => {
    it("throws when decrypting with wrong key", () => {
      const encrypted = encrypt("secret-token");
      // Swap to a different key
      installFreshKey();
      expect(() => decrypt(encrypted)).toThrow();
    });

    it("throws on corrupted ciphertext", () => {
      const encrypted = encrypt("secret-token");
      const parts = encrypted.split(":");
      // Corrupt the ciphertext portion
      parts[1] = "AAAAAAAAAAAAAAAA";
      const corrupted = parts.join(":");
      expect(() => decrypt(corrupted)).toThrow();
    });

    it("throws on malformed format (missing parts)", () => {
      expect(() => decrypt("onlyonepart")).toThrow(/expected 3 colon-separated parts/);
      expect(() => decrypt("two:parts")).toThrow(/expected 3 colon-separated parts/);
      expect(() => decrypt("a:b:c:d")).toThrow(/expected 3 colon-separated parts/);
    });
  });

  // ── ensureEncryptionKey ──────────────────────────────────────────────────

  describe("ensureEncryptionKey", () => {
    const savedEnv = process.env.OAUTH_ENCRYPTION_KEY;

    afterEach(() => {
      // Restore env
      if (savedEnv === undefined) {
        delete process.env.OAUTH_ENCRYPTION_KEY;
      } else {
        process.env.OAUTH_ENCRYPTION_KEY = savedEnv;
      }
    });

    it("uses OAUTH_ENCRYPTION_KEY env var when set", () => {
      const key = randomBytes(32);
      process.env.OAUTH_ENCRYPTION_KEY = key.toString("hex");
      const source = ensureEncryptionKey(makeTmpDir());
      expect(source).toBe("env:OAUTH_ENCRYPTION_KEY");

      // Verify encryption works with this key
      const encrypted = encrypt("via-env");
      expect(decrypt(encrypted)).toBe("via-env");
    });

    it("throws when env var key has wrong length", () => {
      process.env.OAUTH_ENCRYPTION_KEY = "aabbcc"; // only 3 bytes
      expect(() => ensureEncryptionKey(makeTmpDir())).toThrow(/must be a hex-encoded 32-byte key/);
    });

    it("generates a new key file when none exists", () => {
      delete process.env.OAUTH_ENCRYPTION_KEY;
      const dir = makeTmpDir();
      const source = ensureEncryptionKey(dir);
      expect(source).toBe(`file:${join(dir, "oauth-encryption.key")}`);

      // Key file should exist and contain 64 hex chars
      const keyFile = join(dir, "oauth-encryption.key");
      expect(existsSync(keyFile)).toBe(true);
      const hex = readFileSync(keyFile, "utf-8").trim();
      expect(hex).toMatch(/^[0-9a-f]{64}$/);

      // Encryption should work
      const encrypted = encrypt("generated-key");
      expect(decrypt(encrypted)).toBe("generated-key");
    });

    it("reads an existing key file", () => {
      delete process.env.OAUTH_ENCRYPTION_KEY;
      const dir = makeTmpDir();
      const key = randomBytes(32);
      writeFileSync(join(dir, "oauth-encryption.key"), key.toString("hex"));

      const source = ensureEncryptionKey(dir);
      expect(source).toBe(`file:${join(dir, "oauth-encryption.key")}`);

      const encrypted = encrypt("from-file");
      expect(decrypt(encrypted)).toBe("from-file");
    });

    it("throws when key file is malformed (wrong length)", () => {
      delete process.env.OAUTH_ENCRYPTION_KEY;
      const dir = makeTmpDir();
      writeFileSync(join(dir, "oauth-encryption.key"), "deadbeef"); // only 4 bytes

      expect(() => ensureEncryptionKey(dir)).toThrow(/Key file is malformed/);
    });
  });
});
