import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** Fresh unpredictable state + verifier for each authorization attempt. */
export function createTikTokPKCE(): {
  state: string;
  stateHash: string;
  verifier: string;
  challenge: string;
} {
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  return {
    state,
    stateHash: sha256Hex(state),
    verifier,
    challenge: createHash("sha256").update(verifier, "ascii").digest("base64url"),
  };
}

/** Store only the state hash, never the raw callback state. */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export type TikTokSecretPurpose = "access" | "refresh" | "verifier";

/** Generate once outside the application and supply as a server-only environment variable. */
function decodeKey(encoded: string): Buffer {
  if (!/^[A-Za-z0-9+/_=-]+$/.test(encoded)) {
    throw new Error("TikTok encryption key must be base64 encoded");
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("TikTok encryption key must decode to 32 bytes");
  }
  return key;
}

function authenticatedContext(userId: string, purpose: TikTokSecretPurpose): Buffer {
  if (!userId) throw new Error("TikTok encryption requires a user ID");
  return Buffer.from(`tiktok:${purpose}:${userId}`, "utf8");
}

/** AES-256-GCM with a per-value nonce and user/purpose binding. */
export function encryptTikTokSecret(
  plaintext: string,
  encodedKey: string,
  userId: string,
  purpose: TikTokSecretPurpose,
): string {
  if (!plaintext) throw new Error("Cannot encrypt an empty TikTok secret");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", decodeKey(encodedKey), iv);
  cipher.setAAD(authenticatedContext(userId, purpose));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), ciphertext.toString("base64url"), tag.toString("base64url")].join(".");
}

export function decryptTikTokSecret(
  packed: string,
  encodedKey: string,
  userId: string,
  purpose: TikTokSecretPurpose,
): string {
  try {
    const [version, ivString, payload, tagString, extra] = packed.split(".");
    if (version !== "v1" || !ivString || !payload || !tagString || extra !== undefined) {
      throw new Error("Invalid ciphertext format");
    }
    const iv = Buffer.from(ivString, "base64url");
    const tag = Buffer.from(tagString, "base64url");
    if (iv.length !== 12 || tag.length !== 16) throw new Error("Invalid authentication fields");
    const decipher = createDecipheriv("aes-256-gcm", decodeKey(encodedKey), iv);
    decipher.setAAD(authenticatedContext(userId, purpose));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(Buffer.from(payload, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // Never include plaintext, ciphertext or key in errors/logs.
    throw new Error("TikTok secret decryption failed");
  }
}
