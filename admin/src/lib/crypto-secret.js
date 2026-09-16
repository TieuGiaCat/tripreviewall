const crypto = require("crypto");

const ALGO = "aes-256-gcm";

/**
 * Reads the 32-byte encryption key from SETTINGS_ENCRYPTION_KEY (.env),
 * expected as a 64-character hex string. Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 * NOTE: changing this key after settings have been saved makes the stored
 * password undecryptable — the SMTP password will need to be re-entered.
 */
function getKey() {
  const hex = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "SETTINGS_ENCRYPTION_KEY must be set in .env as a 64-character hex string (32 bytes). " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  return Buffer.from(hex, "hex");
}

/** Encrypts a plaintext string. Returns "ivHex:tagHex:cipherHex", or null for empty input. */
function encrypt(plain) {
  if (!plain) return null;
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

/** Decrypts a string produced by encrypt(). Returns null for empty/malformed input. */
function decrypt(stored) {
  if (!stored) return null;
  const parts = String(stored).split(":");
  if (parts.length !== 3) return null;
  const [ivHex, tagHex, dataHex] = parts;
  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const dec = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  return dec.toString("utf8");
}

module.exports = { encrypt, decrypt };
