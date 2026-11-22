const crypto = require("crypto");

/**
 * Derives a deterministic 32-byte (256-bit) encryption key from
 * APP_ENCRYPTION_KEY with fallback to JWT_SECRET.
 */
function getMasterKey() {
  const rawKey =
    process.env.APP_ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    "sarvya-default-fallback-encryption-key-32b";
  return crypto.createHash("sha256").update(String(rawKey)).digest();
}

const PREFIX = "enc:aes-256-gcm:";

/**
 * Checks whether a string is already encrypted in our standard AES-256-GCM format.
 */
function isEncrypted(value) {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/**
 * Encrypts plaintext using AES-256-GCM with a random 12-byte IV.
 * Returns formatted string: enc:aes-256-gcm:<iv_hex>:<authTag_hex>:<ciphertext_hex>
 */
function encrypt(text) {
  if (text === null || text === undefined) return text;
  const str = String(text);
  if (!str) return str;
  if (isEncrypted(str)) return str;

  const key = getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(str, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${PREFIX}${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted string.
 * If the input is not encrypted (legacy plaintext), it is returned as-is
 * for 100% backward compatibility.
 */
function decrypt(cipherString) {
  if (cipherString === null || cipherString === undefined) return cipherString;
  const str = String(cipherString);
  if (!isEncrypted(str)) {
    return cipherString;
  }

  try {
    const parts = str.slice(PREFIX.length).split(":");
    if (parts.length !== 3) {
      return cipherString;
    }
    const [ivHex, tagHex, encryptedHex] = parts;
    const key = getMasterKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(tagHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    console.warn("[cryptoUtil] Decryption failed, returning raw string:", err.message);
    return cipherString;
  }
}

/**
 * Hashes a phone number using HMAC-SHA-256 with DPDP_SALT or fallback secret.
 * Used for DPDP Act 2023 perpetual marketing opt-out suppression without storing PII.
 */
function hashPhone(phone) {
  if (!phone) return "";
  const salt = process.env.DPDP_SALT || process.env.JWT_SECRET || "sarvya_dpdp_act_salt_2023";
  const clean = String(phone).replace(/\D/g, "");
  return crypto.createHmac("sha256", salt).update(clean).digest("hex");
}

module.exports = {
  encrypt,
  decrypt,
  isEncrypted,
  hashPhone
};
