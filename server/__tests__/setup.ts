/**
 * Test preload script — runs before all test files.
 * Sets BUN_TEST=1 so that getDb() defaults to :memory: instead of
 * touching the production corvid-agent.db. See #1012.
 */
process.env.BUN_TEST = '1';
