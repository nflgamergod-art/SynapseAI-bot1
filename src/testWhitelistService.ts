import { addWhitelistEntry, removeWhitelistEntry, isWhitelisted, getWhitelist } from './services/whitelistService';

// Test script for whitelistService
(async () => {
    const testUserId = 'test-user-123';

    console.log('--- Initial Whitelist ---');
    console.log(getWhitelist());

    console.log('--- Adding User to Whitelist ---');
    addWhitelistEntry({ id: testUserId, type: 'user' });
    console.log(getWhitelist());

    console.log('--- Checking if User is Whitelisted ---');
    console.log(`Is whitelisted: ${isWhitelisted(testUserId, 'user')}`);

    console.log('--- Removing User from Whitelist ---');
    removeWhitelistEntry(testUserId, 'user');
    console.log(getWhitelist());

    console.log('--- Checking if User is Whitelisted After Removal ---');
    console.log(`Is whitelisted: ${isWhitelisted(testUserId, 'user')}`);
})();