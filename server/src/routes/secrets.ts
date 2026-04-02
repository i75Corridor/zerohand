import { Router } from "express";
import { eq } from "drizzle-orm";
import type { Db } from "@zerohand/db";
import { secrets } from "@zerohand/db";
import type { ApiSecret } from "@zerohand/shared";
import { encrypt, decrypt, maskValue } from "../services/crypto.js";

function toApi(row: typeof secrets.$inferSelect): ApiSecret {
  let maskedValue = "••••••";
  try {
    const plain = decrypt(row.encryptedValue, row.iv, row.authTag);
    maskedValue = maskValue(plain);
  } catch {
    // Decryption failure on mask — key may have changed; return placeholder
  }
  return {
    key: row.key,
    maskedValue,
    description: row.description,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function createSecretsRouter(db: Db): Router {
  const router = Router();

  router.get("/secrets", async (_req, res, next) => {
    try {
      const rows = await db.select().from(secrets).orderBy(secrets.key);
      res.json(rows.map(toApi));
    } catch (err) {
      next(err);
    }
  });

  router.post("/secrets", async (req, res, next) => {
    try {
      const { key, value, description } = req.body as {
        key: string;
        value: string;
        description?: string;
      };
      if (!key || !value) {
        return res.status(400).json({ error: "key and value are required" });
      }
      const { ciphertext, iv, authTag } = encrypt(value);
      const [row] = await db
        .insert(secrets)
        .values({
          key,
          encryptedValue: ciphertext,
          iv,
          authTag,
          description: description ?? null,
        })
        .onConflictDoUpdate({
          target: secrets.key,
          set: {
            encryptedValue: ciphertext,
            iv,
            authTag,
            description: description ?? null,
            updatedAt: new Date(),
          },
        })
        .returning();
      res.status(201).json(toApi(row));
    } catch (err) {
      next(err);
    }
  });

  router.put("/secrets/:key", async (req, res, next) => {
    try {
      const { value, description } = req.body as {
        value?: string;
        description?: string;
      };

      const existing = await db.query.secrets.findFirst({
        where: eq(secrets.key, req.params.key),
      });
      if (!existing) return res.status(404).json({ error: "Secret not found" });

      const updates: Partial<typeof secrets.$inferInsert> & { updatedAt: Date } = {
        updatedAt: new Date(),
      };

      if (value !== undefined) {
        const { ciphertext, iv, authTag } = encrypt(value);
        updates.encryptedValue = ciphertext;
        updates.iv = iv;
        updates.authTag = authTag;
      }
      if (description !== undefined) {
        updates.description = description;
      }

      const [row] = await db
        .update(secrets)
        .set(updates)
        .where(eq(secrets.key, req.params.key))
        .returning();

      res.json(toApi(row));
    } catch (err) {
      next(err);
    }
  });

  router.delete("/secrets/:key", async (req, res, next) => {
    try {
      const deleted = await db
        .delete(secrets)
        .where(eq(secrets.key, req.params.key))
        .returning();
      if (deleted.length === 0) return res.status(404).json({ error: "Secret not found" });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}

/**
 * Load all secrets from the DB and return a decrypted Map.
 * Used by the execution engine to resolve {{secret.KEY}} tokens.
 */
export async function loadSecretsMap(db: Db): Promise<Map<string, string>> {
  const rows = await db.select().from(secrets);
  const map = new Map<string, string>();
  for (const row of rows) {
    try {
      map.set(row.key, decrypt(row.encryptedValue, row.iv, row.authTag));
    } catch {
      console.error(`[Secrets] Failed to decrypt secret "${row.key}" — skipping`);
    }
  }
  return map;
}
