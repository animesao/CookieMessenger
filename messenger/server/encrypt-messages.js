/**
 * One-time migration: encrypt existing plaintext messages in DB
 * Run AFTER setting ENCRYPTION_KEY in .env
 * Run AFTER making a backup!
 */

// Load .env
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && key.trim() && !key.startsWith('#')) {
      process.env[key.trim()] = val.join('=').trim();
    }
  });
}

const Database = require('better-sqlite3');
const { encrypt, isEncrypted } = require('./utils/crypto');

const db = new Database(path.join(__dirname, 'messenger.db'));

if (!process.env.ENCRYPTION_KEY) {
  console.error('❌ ENCRYPTION_KEY not set in .env!');
  console.error('Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  process.exit(1);
}

console.log('🔐 Starting message encryption migration...');
console.log('⚠️  Make sure you have a backup before proceeding!');

// Encrypt direct messages
const msgs = db.prepare('SELECT id, content FROM messages WHERE content IS NOT NULL').all();
console.log(`\nFound ${msgs.length} direct messages`);

let encryptedMsgs = 0;
const updateMsg = db.prepare('UPDATE messages SET content = ? WHERE id = ?');
const encryptMsgs = db.transaction((messages) => {
  messages.forEach(m => {
    if (!isEncrypted(m.content)) {
      updateMsg.run(encrypt(m.content), m.id);
      encryptedMsgs++;
    }
  });
});
encryptMsgs(msgs);
console.log(`✓ Encrypted ${encryptedMsgs} direct messages`);

// Encrypt group messages
const groupMsgs = db.prepare('SELECT id, content FROM group_messages WHERE content IS NOT NULL').all();
console.log(`\nFound ${groupMsgs.length} group messages`);

let encryptedGroupMsgs = 0;
const updateGroupMsg = db.prepare('UPDATE group_messages SET content = ? WHERE id = ?');
const encryptGroupMsgs = db.transaction((messages) => {
  messages.forEach(m => {
    if (!isEncrypted(m.content)) {
      updateGroupMsg.run(encrypt(m.content), m.id);
      encryptedGroupMsgs++;
    }
  });
});
encryptGroupMsgs(groupMsgs);
console.log(`✓ Encrypted ${encryptedGroupMsgs} group messages`);

console.log('\n✅ Migration complete!');
console.log(`Total encrypted: ${encryptedMsgs + encryptedGroupMsgs} messages`);
console.log('\nIMPORTANT: Keep your ENCRYPTION_KEY safe! Without it, messages cannot be decrypted.');
