/**
 * Client-side encryption utilities
 * Encrypts messages before sending to server
 */

// Generate encryption key from user password/session
async function deriveKey(password, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

// Encrypt text
export async function encryptMessage(text, userId) {
  try {
    // Use userId as salt for key derivation
    const salt = `msg_salt_${userId}`;
    const sessionKey = localStorage.getItem('session_key') || 'default_key';
    const key = await deriveKey(sessionKey, salt);

    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    
    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // Encrypt
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );

    // Combine IV + encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);

    // Convert to base64
    return btoa(String.fromCharCode(...combined));
  } catch (err) {
    console.error('[Crypto] Encryption failed:', err);
    return text; // Fallback to plaintext
  }
}

// Decrypt text
export async function decryptMessage(encryptedText, userId) {
  try {
    // Use userId as salt for key derivation
    const salt = `msg_salt_${userId}`;
    const sessionKey = localStorage.getItem('session_key') || 'default_key';
    const key = await deriveKey(sessionKey, salt);

    // Decode from base64
    const combined = Uint8Array.from(atob(encryptedText), c => c.charCodeAt(0));
    
    // Extract IV and encrypted data
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);

    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (err) {
    console.error('[Crypto] Decryption failed:', err);
    return encryptedText; // Fallback to showing encrypted text
  }
}

// Generate session key on login
export function generateSessionKey() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array));
}

// Initialize session key
export function initSessionKey() {
  if (!localStorage.getItem('session_key')) {
    localStorage.setItem('session_key', generateSessionKey());
  }
}

// Clear session key on logout
export function clearSessionKey() {
  localStorage.removeItem('session_key');
}
