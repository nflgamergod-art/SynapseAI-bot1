// Use dynamic import to handle spaces in directory names
(async () => {
    const { addWhitelistEntry, removeWhitelistEntry, isWhitelisted, getWhitelist } = await import('./src/services/whitelistService.js');

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