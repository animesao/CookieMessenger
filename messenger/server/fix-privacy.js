// Fix privacy settings for existing users
const db = require('./db');

console.log('Fixing privacy settings for existing users...');

// Update all users who have privacy_who_can_message set to 'friends' to 'everyone'
const result1 = db.prepare(`
  UPDATE users 
  SET privacy_who_can_message = 'everyone' 
  WHERE privacy_who_can_message = 'friends' OR privacy_who_can_message IS NULL
`).run();

console.log(`Updated privacy_who_can_message for ${result1.changes} users`);

// Update all users who have privacy_who_can_call set to 'friends' to 'everyone'
const result2 = db.prepare(`
  UPDATE users 
  SET privacy_who_can_call = 'everyone' 
  WHERE privacy_who_can_call = 'friends' OR privacy_who_can_call IS NULL
`).run();

console.log(`Updated privacy_who_can_call for ${result2.changes} users`);

// Show current settings
const users = db.prepare(`
  SELECT id, username, privacy_who_can_message, privacy_who_can_call 
  FROM users
`).all();

console.log('\nCurrent privacy settings:');
users.forEach(u => {
  console.log(`User ${u.id} (${u.username}): message=${u.privacy_who_can_message}, call=${u.privacy_who_can_call}`);
});

console.log('\nDone! Privacy settings have been updated.');
console.log('Users can now message and call each other by default.');
console.log('They can change these settings in their profile settings page.');
