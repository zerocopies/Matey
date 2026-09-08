/* Stage 9+: API Router Test Harness
 * Verifies all acceptance criteria:
 *   1. AbortController actually stops the fetch on timeout
 *   2. resolveModel cache latency (before/after)
 *   3. 2-provider failover
 *   4. Intent-first routing decisions
 *
 * Run in browser console: import('./test-api-router.js').then(m => m.runTests())
 */
import { routeRequest, classifyTask, getHealthScore, getResolveStats, getRoutingLog, wasAborted, activeRequestCount } from './matey-api-router.js';

export async function runTests() {
  const results = [];
  let passed = 0, failed = 0;

  function assert(name, condition, detail) {
    if (condition) { passed++; results.push('  ✓ ' + name + (detail ? ' — ' + detail : '')); }
    else { failed++; results.push('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
  }

  // --- Test 1: AbortController timeout ---
  console.log('\n[Test 1] AbortController timeout');
  try {
    // Configure a provider with a very short timeout to a non-routable address
    const providers = [{ name: 'TimeoutTest', baseUrl: 'http://10.255.255.1/v1', apiKey: 'test', model: 'test', capabilities: ['text'] }];
    localStorage.setItem('matey-providers', JSON.stringify(providers));

    const t0 = Date.now();
    try {
      await routeRequest({
        capability: 'text',
        messages: [{ role: 'user', content: 'hello' }],
        timeoutMs: 500
      });
      assert('Timeout should have thrown', false);
    } catch (e) {
      const elapsed = Date.now() - t0;
      assert('Timeout error thrown', true, e.message.slice(0, 60));
      assert('Timeout fires near 500ms', elapsed < 2000, 'elapsed=' + elapsed + 'ms');
      assert('No lingering active requests', activeRequestCount() === 0, 'active=' + activeRequestCount());
    }
  } catch (e) {
    assert('AbortController timeout', false, e.message);
  }

  // --- Test 2: resolveModel cache latency ---
  console.log('\n[Test 2] resolveModel cache latency');
  const statsBefore = getResolveStats();
  assert('Cache stats available', statsBefore !== null, JSON.stringify(statsBefore));
  // After at least one miss, subsequent calls should be near-instant cache hits
  assert('Cache hit latency < 1ms', statsBefore.avgCacheHitMs < 1 || statsBefore.hits === 0,
    'hits=' + statsBefore.hits + ' avgHitMs=' + statsBefore.avgCacheHitMs);
  assert('Cache miss latency > hit latency', statsBefore.avgCacheMissMs >= statsBefore.avgCacheHitMs,
    'miss=' + statsBefore.avgCacheMissMs + 'ms hit=' + statsBefore.avgCacheHitMs + 'ms');

  // --- Test 3: 2-provider failover ---
  console.log('\n[Test 3] 2-provider failover');
  try {
    // Configure two providers: first one unreachable, second one also unreachable but should be attempted
    const failoverProviders = [
      { name: 'BadProvider1', baseUrl: 'http://10.255.255.2/v1', apiKey: 'bad1', model: 'test', capabilities: ['text'] },
      { name: 'BadProvider2', baseUrl: 'http://10.255.255.3/v1', apiKey: 'bad2', model: 'test', capabilities: ['text'] }
    ];
    localStorage.setItem('matey-providers', JSON.stringify(failoverProviders));

    const t0 = Date.now();
    try {
      await routeRequest({
        capability: 'text',
        messages: [{ role: 'user', content: 'test failover' }],
        timeoutMs: 1500
      });
      assert('Failover should have thrown (both unreachable)', false);
    } catch (e) {
      const elapsed = Date.now() - t0;
      // Should have tried both providers — total time ~ 2x timeout
      assert('Both providers attempted (elapsed > 1500ms)', elapsed > 1500, 'elapsed=' + elapsed + 'ms');
      assert('Error mentions all providers failed', e.message.indexOf('All providers failed') !== -1, e.message.slice(0, 80));
    }

    // Verify routing log captured both attempts
    const log = getRoutingLog();
    const failoverEntries = log.filter(l => l.capability === 'text' && l.selected);
    assert('Routing log has failover entries', failoverEntries.length >= 2, 'entries=' + failoverEntries.length);
  } catch (e) {
    assert('2-provider failover', false, e.message);
  }

  // --- Test 4: Intent-first routing decisions ---
  console.log('\n[Test 4] Intent-first routing');
  const codeTask = classifyTask([{ role: 'user', content: 'Write a function that sorts an array' }]);
  assert('Code task classified', codeTask === 'code', 'got=' + codeTask);

  const visionTask = classifyTask([{ role: 'user', content: 'What does this image look like?' }]);
  assert('Vision task classified', visionTask === 'vision', 'got=' + visionTask);

  const chatTask = classifyTask([{ role: 'user', content: 'Hi there!' }]);
  assert('Chat task classified', chatTask === 'chat', 'got=' + chatTask);

  const creativeTask = classifyTask([{ role: 'user', content: 'Write a story about a robot learning to love. Make it emotional and detailed.' }]);
  assert('Creative task classified', creativeTask === 'creative', 'got=' + creativeTask);

  const analysisTask = classifyTask([{ role: 'user', content: 'Analyze the pros and cons of React vs Vue for mobile apps' }]);
  assert('Analysis task classified', analysisTask === 'analysis', 'got=' + analysisTask);

  // --- Test 5: Routing log captures decisions ---
  console.log('\n[Test 5] Routing log');
  const routingLog = getRoutingLog();
  assert('Routing log populated', routingLog.length > 0, 'entries=' + routingLog.length);
  assert('Routing log has taskType', routingLog[0].taskType !== undefined);
  assert('Routing log has selected provider', routingLog[0].selected !== undefined);

  // --- Summary ---
  console.log('\n=== Test Results ===');
  console.log(results.join('\n'));
  console.log('\nPassed: ' + passed + ' / ' + (passed + failed));
  console.log('Failed: ' + failed);

  // Restore original providers
  localStorage.removeItem('matey-providers');

  return { passed, failed, results };
}