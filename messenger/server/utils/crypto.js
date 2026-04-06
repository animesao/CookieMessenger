const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits

// Get or generate encryption key
function getKey() {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex) {
    console.error('[CRYPTO] WARNING: ENCRYPTION_KEY not set! Messages will not be encrypted.');
    return null;
  }
  if (keyHex.length !== 64) {
    console.error('[CRYPTO] ERROR: ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
    return null;
  }
  return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypt a string. Returns "enc:iv:authTag:ciphertext" or original if no key.
 */
function encrypt(text) {
  if (!text) return text;
  const key = getKey();
  if (!key) return text; // fallback: store plaintext if no key configured

  try {
    const iv = crypto.randomBytes(12); // 96-bit IV for GCM
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    
    // Format: enc:iv:authTag:ciphertext
    return `enc:${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch (err) {
    console.error('[CRYPTO] Encryption error:', err.message);
    return text;
  }
}

/**
 * Decrypt a string. Returns original text or null on failure.
 */
function decrypt(text) {
  if (!text) return text;
  if (!text.startsWith('enc:')) return text; // not encrypted, return as-is
  
  const key = getKey();
  if (!key) return '[зашифровано]';

  try {
    const parts = text.split(':');
    if (parts.length < 4) return text;
    
    const iv = Buffer.from(parts[1], 'hex');
    const authTag = Buffer.from(parts[2], 'hex');
    const ciphertext = parts.slice(3).join(':'); // rejoin in case content had colons
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (err) {
    // Auth tag mismatch or corrupted data
    return '[не удалось расшифровать]';
  }
}

/**
 * Check if a value is encrypted
 */
function isEncrypted(text) {
  return typeof text === 'string' && text.startsWith('enc:');
}

module.exports = { encrypt, decrypt, isEncrypted };
