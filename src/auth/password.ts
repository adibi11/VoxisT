import { pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";

const HASH_ITERATIONS = 120000;
const HASH_KEY_LENGTH = 32;
const HASH_DIGEST = "sha256";

// Stores password hashes in a self-describing format so parameters can change later.
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("base64url");
  const hash = pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEY_LENGTH, HASH_DIGEST).toString("base64url");
  return `pbkdf2:${HASH_DIGEST}:${HASH_ITERATIONS}:${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [algorithm, digest, iterationsText, salt, expectedHash] = storedHash.split(":");
  if (algorithm !== "pbkdf2" || !digest || !iterationsText || !salt || !expectedHash) {
    return false;
  }

  const iterations = Number(iterationsText);
  if (!Number.isFinite(iterations)) {
    return false;
  }

  const actual = pbkdf2Sync(password, salt, iterations, HASH_KEY_LENGTH, digest).toString("base64url");
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expectedHash);

  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
