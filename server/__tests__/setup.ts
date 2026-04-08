/**
 * Test preload script — runs before all test files.
 * Sets BUN_TEST=1 so that getDb() defaults to :memory: instead of
 * touching the production corvid-agent.db. See #1012.
 */
process.env.BUN_TEST = '1';

/**
 * Catch leaked unhandled rejections from fire-and-forget Discord operations
 * (setInterval-based typing/progress/ack) that fire after test cleanup has
 * set the REST client to null. These are expected in test environments and
 * should not fail unrelated tests. See #1891.
 */
process.on('unhandledRejection', (reason) => {
    if (
        reason instanceof Error &&
        reason.message.includes('REST client not initialized')
    ) {
        return; // swallow — expected in tests
    }
});
