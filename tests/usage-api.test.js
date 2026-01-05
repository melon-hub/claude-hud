import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getUsage, clearCache } from '../dist/usage-api.js';
import { isLimitReached } from '../dist/types.js';

// Helper to create temp home directory with credentials
async function createTempHome() {
  const homeDir = await mkdtemp(path.join(tmpdir(), 'claude-hud-test-'));
  await mkdir(path.join(homeDir, '.claude'), { recursive: true });
  return homeDir;
}

// Helper to write credentials file
async function writeCredentials(homeDir, credentials) {
  const credPath = path.join(homeDir, '.claude', '.credentials.json');
  await writeFile(credPath, JSON.stringify(credentials), 'utf8');
}

// Valid credentials fixture
function validCredentials(overrides = {}) {
  return {
    claudeAiOauth: {
      accessToken: 'sk-ant-oat01-test-token',
      refreshToken: 'sk-ant-ort01-test-refresh',
      subscriptionType: 'max',
      rateLimitTier: 'default_claude_max_20x',
      expiresAt: Date.now() + 86400000, // 24h from now
      scopes: ['user:inference', 'user:profile'],
      ...overrides,
    },
  };
}

// Mock API response
function mockApiResponse(overrides = {}) {
  return {
    five_hour: { utilization: 6.0, resets_at: '2026-01-05T10:00:00.000Z' },
    seven_day: { utilization: 13.0, resets_at: '2026-01-11T03:00:00.000Z' },
    ...overrides,
  };
}

test('getUsage returns null when CLAUDE_HUD_SHOW_USAGE is not set', async () => {
  const originalEnv = process.env.CLAUDE_HUD_SHOW_USAGE;
  delete process.env.CLAUDE_HUD_SHOW_USAGE;
  clearCache();

  try {
    const result = await getUsage();
    assert.equal(result, null);
  } finally {
    if (originalEnv) process.env.CLAUDE_HUD_SHOW_USAGE = originalEnv;
  }
});

test('getUsage returns null when credentials file does not exist', async () => {
  const originalEnv = process.env.CLAUDE_HUD_SHOW_USAGE;
  process.env.CLAUDE_HUD_SHOW_USAGE = '1';
  clearCache();

  const homeDir = await mkdtemp(path.join(tmpdir(), 'claude-hud-empty-'));

  try {
    const result = await getUsage({ homeDir: () => homeDir });
    assert.equal(result, null);
  } finally {
    process.env.CLAUDE_HUD_SHOW_USAGE = originalEnv || '';
    if (!originalEnv) delete process.env.CLAUDE_HUD_SHOW_USAGE;
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('getUsage returns null when claudeAiOauth is missing', async () => {
  const originalEnv = process.env.CLAUDE_HUD_SHOW_USAGE;
  process.env.CLAUDE_HUD_SHOW_USAGE = '1';
  clearCache();

  const homeDir = await createTempHome();
  await writeCredentials(homeDir, { someOtherKey: 'value' });

  try {
    const result = await getUsage({ homeDir: () => homeDir });
    assert.equal(result, null);
  } finally {
    process.env.CLAUDE_HUD_SHOW_USAGE = originalEnv || '';
    if (!originalEnv) delete process.env.CLAUDE_HUD_SHOW_USAGE;
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('getUsage returns null when accessToken is missing', async () => {
  const originalEnv = process.env.CLAUDE_HUD_SHOW_USAGE;
  process.env.CLAUDE_HUD_SHOW_USAGE = '1';
  clearCache();

  const homeDir = await createTempHome();
  await writeCredentials(homeDir, {
    claudeAiOauth: { subscriptionType: 'max' },
  });

  try {
    const result = await getUsage({ homeDir: () => homeDir });
    assert.equal(result, null);
  } finally {
    process.env.CLAUDE_HUD_SHOW_USAGE = originalEnv || '';
    if (!originalEnv) delete process.env.CLAUDE_HUD_SHOW_USAGE;
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('getUsage returns null when token is expired', async () => {
  const originalEnv = process.env.CLAUDE_HUD_SHOW_USAGE;
  process.env.CLAUDE_HUD_SHOW_USAGE = '1';
  clearCache();

  const homeDir = await createTempHome();
  const now = Date.now();
  await writeCredentials(homeDir, validCredentials({
    expiresAt: now - 1000, // Expired 1 second ago
  }));

  try {
    const result = await getUsage({
      homeDir: () => homeDir,
      now: () => now,
    });
    assert.equal(result, null);
  } finally {
    process.env.CLAUDE_HUD_SHOW_USAGE = originalEnv || '';
    if (!originalEnv) delete process.env.CLAUDE_HUD_SHOW_USAGE;
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('getUsage returns null for API users (no subscriptionType)', async () => {
  const originalEnv = process.env.CLAUDE_HUD_SHOW_USAGE;
  process.env.CLAUDE_HUD_SHOW_USAGE = '1';
  clearCache();

  const homeDir = await createTempHome();
  await writeCredentials(homeDir, {
    claudeAiOauth: {
      accessToken: 'sk-ant-oat01-test-token',
      expiresAt: Date.now() + 86400000,
      // No subscriptionType - API user
    },
  });

  try {
    const result = await getUsage({ homeDir: () => homeDir });
    assert.equal(result, null);
  } finally {
    process.env.CLAUDE_HUD_SHOW_USAGE = originalEnv || '';
    if (!originalEnv) delete process.env.CLAUDE_HUD_SHOW_USAGE;
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('getUsage correctly parses plan names', async () => {
  const originalEnv = process.env.CLAUDE_HUD_SHOW_USAGE;
  process.env.CLAUDE_HUD_SHOW_USAGE = '1';

  const testCases = [
    { subscriptionType: 'max', expected: 'Max' },
    { subscriptionType: 'MAX', expected: 'Max' },
    { subscriptionType: 'pro', expected: 'Pro' },
    { subscriptionType: 'Pro', expected: 'Pro' },
    { subscriptionType: 'team', expected: 'Team' },
    { subscriptionType: 'claude_max_20x', expected: 'Max' },
  ];

  for (const { subscriptionType, expected } of testCases) {
    clearCache();
    const homeDir = await createTempHome();
    await writeCredentials(homeDir, validCredentials({ subscriptionType }));

    try {
      const result = await getUsage({
        homeDir: () => homeDir,
        fetchApi: async () => mockApiResponse(),
      });
      assert.equal(result?.planName, expected, `Expected ${expected} for ${subscriptionType}`);
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  }

  process.env.CLAUDE_HUD_SHOW_USAGE = originalEnv || '';
  if (!originalEnv) delete process.env.CLAUDE_HUD_SHOW_USAGE;
});

test('getUsage correctly parses API response without multiplying by 100', async () => {
  const originalEnv = process.env.CLAUDE_HUD_SHOW_USAGE;
  process.env.CLAUDE_HUD_SHOW_USAGE = '1';
  clearCache();

  const homeDir = await createTempHome();
  await writeCredentials(homeDir, validCredentials());

  try {
    const result = await getUsage({
      homeDir: () => homeDir,
      fetchApi: async () => ({
        five_hour: { utilization: 6.0, resets_at: '2026-01-05T10:00:00.000Z' },
        seven_day: { utilization: 13.0, resets_at: '2026-01-11T03:00:00.000Z' },
      }),
    });

    // Critical: API returns 6.0 meaning 6%, should NOT become 600
    assert.equal(result?.fiveHour, 6);
    assert.equal(result?.sevenDay, 13);
  } finally {
    process.env.CLAUDE_HUD_SHOW_USAGE = originalEnv || '';
    if (!originalEnv) delete process.env.CLAUDE_HUD_SHOW_USAGE;
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('getUsage sets limitReached true when usage hits 100%', async () => {
  const originalEnv = process.env.CLAUDE_HUD_SHOW_USAGE;
  process.env.CLAUDE_HUD_SHOW_USAGE = '1';
  clearCache();

  const homeDir = await createTempHome();
  await writeCredentials(homeDir, validCredentials());

  try {
    const result = await getUsage({
      homeDir: () => homeDir,
      fetchApi: async () => ({
        five_hour: { utilization: 100.0, resets_at: '2026-01-05T10:00:00.000Z' },
        seven_day: { utilization: 45.0, resets_at: '2026-01-11T03:00:00.000Z' },
      }),
    });

    assert.equal(isLimitReached(result), true);
  } finally {
    process.env.CLAUDE_HUD_SHOW_USAGE = originalEnv || '';
    if (!originalEnv) delete process.env.CLAUDE_HUD_SHOW_USAGE;
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('getUsage parses reset timestamps correctly', async () => {
  const originalEnv = process.env.CLAUDE_HUD_SHOW_USAGE;
  process.env.CLAUDE_HUD_SHOW_USAGE = '1';
  clearCache();

  const homeDir = await createTempHome();
  await writeCredentials(homeDir, validCredentials());

  try {
    const result = await getUsage({
      homeDir: () => homeDir,
      fetchApi: async () => ({
        five_hour: { utilization: 6.0, resets_at: '2026-01-05T10:00:00.000Z' },
        seven_day: { utilization: 13.0, resets_at: '2026-01-11T03:00:00.000Z' },
      }),
    });

    assert.ok(result?.fiveHourResetAt instanceof Date);
    assert.ok(result?.sevenDayResetAt instanceof Date);
    assert.equal(result?.fiveHourResetAt?.toISOString(), '2026-01-05T10:00:00.000Z');
  } finally {
    process.env.CLAUDE_HUD_SHOW_USAGE = originalEnv || '';
    if (!originalEnv) delete process.env.CLAUDE_HUD_SHOW_USAGE;
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('getUsage returns fallback with apiUnavailable when API call fails', async () => {
  const originalEnv = process.env.CLAUDE_HUD_SHOW_USAGE;
  process.env.CLAUDE_HUD_SHOW_USAGE = '1';
  clearCache();

  const homeDir = await createTempHome();
  await writeCredentials(homeDir, validCredentials());

  try {
    const result = await getUsage({
      homeDir: () => homeDir,
      fetchApi: async () => null, // Simulate API failure
    });

    assert.equal(result?.planName, 'Max');
    assert.equal(result?.fiveHour, null);
    assert.equal(result?.sevenDay, null);
    assert.equal(result?.apiUnavailable, true, 'should flag API as unavailable');
    assert.equal(isLimitReached(result), false);
  } finally {
    process.env.CLAUDE_HUD_SHOW_USAGE = originalEnv || '';
    if (!originalEnv) delete process.env.CLAUDE_HUD_SHOW_USAGE;
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('getUsage uses cached result within TTL', async () => {
  const originalEnv = process.env.CLAUDE_HUD_SHOW_USAGE;
  process.env.CLAUDE_HUD_SHOW_USAGE = '1';
  clearCache();

  const homeDir = await createTempHome();
  await writeCredentials(homeDir, validCredentials());

  let apiCallCount = 0;
  const mockFetchApi = async () => {
    apiCallCount++;
    return mockApiResponse();
  };

  try {
    // First call should hit API
    await getUsage({
      homeDir: () => homeDir,
      fetchApi: mockFetchApi,
      now: () => 1000000,
    });
    assert.equal(apiCallCount, 1);

    // Second call within TTL should use cache
    await getUsage({
      homeDir: () => homeDir,
      fetchApi: mockFetchApi,
      now: () => 1030000, // 30s later, still within 60s TTL
    });
    assert.equal(apiCallCount, 1); // Should still be 1

    // Clear and call again
    clearCache();
    await getUsage({
      homeDir: () => homeDir,
      fetchApi: mockFetchApi,
      now: () => 1000000,
    });
    assert.equal(apiCallCount, 2); // Should increment after cache clear
  } finally {
    process.env.CLAUDE_HUD_SHOW_USAGE = originalEnv || '';
    if (!originalEnv) delete process.env.CLAUDE_HUD_SHOW_USAGE;
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('clearCache resets the cache', async () => {
  const originalEnv = process.env.CLAUDE_HUD_SHOW_USAGE;
  process.env.CLAUDE_HUD_SHOW_USAGE = '1';
  clearCache();

  const homeDir = await createTempHome();
  await writeCredentials(homeDir, validCredentials());

  let callCount = 0;
  const mockFetchApi = async () => {
    callCount++;
    return mockApiResponse();
  };

  try {
    await getUsage({ homeDir: () => homeDir, fetchApi: mockFetchApi });
    assert.equal(callCount, 1);

    clearCache();

    await getUsage({ homeDir: () => homeDir, fetchApi: mockFetchApi });
    assert.equal(callCount, 2); // Should call API again after cache clear
  } finally {
    process.env.CLAUDE_HUD_SHOW_USAGE = originalEnv || '';
    if (!originalEnv) delete process.env.CLAUDE_HUD_SHOW_USAGE;
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('getUsage expires cache after 60 seconds', async () => {
  const originalEnv = process.env.CLAUDE_HUD_SHOW_USAGE;
  process.env.CLAUDE_HUD_SHOW_USAGE = '1';
  clearCache();

  const homeDir = await createTempHome();
  await writeCredentials(homeDir, validCredentials());

  let apiCallCount = 0;
  const mockFetchApi = async () => {
    apiCallCount++;
    return mockApiResponse();
  };

  try {
    // First call at time T
    await getUsage({
      homeDir: () => homeDir,
      fetchApi: mockFetchApi,
      now: () => 1000000,
    });
    assert.equal(apiCallCount, 1);

    // Second call at T + 61 seconds should call API again (cache expired)
    await getUsage({
      homeDir: () => homeDir,
      fetchApi: mockFetchApi,
      now: () => 1000000 + 61000, // 61 seconds later
    });
    assert.equal(apiCallCount, 2); // Should increment because cache expired
  } finally {
    process.env.CLAUDE_HUD_SHOW_USAGE = originalEnv || '';
    if (!originalEnv) delete process.env.CLAUDE_HUD_SHOW_USAGE;
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('isLimitReached returns true when sevenDay hits 100%', async () => {
  const originalEnv = process.env.CLAUDE_HUD_SHOW_USAGE;
  process.env.CLAUDE_HUD_SHOW_USAGE = '1';
  clearCache();

  const homeDir = await createTempHome();
  await writeCredentials(homeDir, validCredentials());

  try {
    const result = await getUsage({
      homeDir: () => homeDir,
      fetchApi: async () => ({
        five_hour: { utilization: 45.0, resets_at: '2026-01-05T10:00:00.000Z' },
        seven_day: { utilization: 100.0, resets_at: '2026-01-11T03:00:00.000Z' },
      }),
    });

    assert.ok(result, 'Result should not be null');
    assert.equal(result.sevenDay, 100);
    assert.equal(result.fiveHour, 45);
    assert.equal(isLimitReached(result), true);
  } finally {
    process.env.CLAUDE_HUD_SHOW_USAGE = originalEnv || '';
    if (!originalEnv) delete process.env.CLAUDE_HUD_SHOW_USAGE;
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('getUsage handles unknown subscription type by capitalizing', async () => {
  const originalEnv = process.env.CLAUDE_HUD_SHOW_USAGE;
  process.env.CLAUDE_HUD_SHOW_USAGE = '1';
  clearCache();

  const homeDir = await createTempHome();
  await writeCredentials(homeDir, validCredentials({ subscriptionType: 'enterprise' }));

  try {
    const result = await getUsage({
      homeDir: () => homeDir,
      fetchApi: async () => mockApiResponse(),
    });

    assert.ok(result, 'Result should not be null');
    assert.equal(result.planName, 'Enterprise'); // First letter capitalized
  } finally {
    process.env.CLAUDE_HUD_SHOW_USAGE = originalEnv || '';
    if (!originalEnv) delete process.env.CLAUDE_HUD_SHOW_USAGE;
    await rm(homeDir, { recursive: true, force: true });
  }
});
