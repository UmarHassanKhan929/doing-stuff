// src/examples/rate-limiting.ts
import RedisTableAdapter from '../src/RedisTableAdapter';

async function rateLimitingExample() {
  console.log('⏱️  Rate Limiting (Sliding Window) Example\n');

  const adapter = new RedisTableAdapter();

  try {
    const userId = 'user:123';
    const rateLimitKey = `ratelimit:${userId}`;
    const maxRequests = 10; // Max 10 requests per minute
    const windowMs = 60 * 1000; // 1 minute

    console.log(`Setting up rate limiter for ${userId}:`);
    console.log(`- Max requests: ${maxRequests} per minute`);
    console.log(`- Window: ${windowMs / 1000} seconds\n`);

    // Simulate API requests
    async function makeRequest(requestNumber: number): Promise<boolean> {
      const now = Date.now();
      const windowStart = now - windowMs;

      console.log(`📨 Request #${requestNumber} at ${new Date(now).toLocaleTimeString()}`);

      // Add current request with timestamp as score
      await adapter.addToSortedSet(rateLimitKey, now, `request:${now}`);

      // Remove requests older than the window
      await adapter.removeFromSortedSetByScore(rateLimitKey, '-inf', windowStart);

      // Count requests in current window
      const requestCount = await adapter.countSortedSet(rateLimitKey);

      if (requestCount > maxRequests) {
        console.log(`❌ Rate limit exceeded! (${requestCount}/${maxRequests})`);
        return false;
      }

      console.log(`✅ Request allowed (${requestCount}/${maxRequests})`);
      return true;
    }

    console.log('🚀 Starting API requests simulation...\n');

    // Make requests (some should be allowed, some blocked)
    const results = [];
    for (let i = 1; i <= 12; i++) {
      const allowed = await makeRequest(i);
      results.push(allowed);

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('\n📊 SUMMARY:');
    console.log('===========');
    const allowedCount = results.filter(r => r).length;
    const blockedCount = results.filter(r => !r).length;

    console.log(`✅ Allowed requests: ${allowedCount}`);
    console.log(`❌ Blocked requests: ${blockedCount}`);
    console.log(`📈 Success rate: ${((allowedCount / results.length) * 100).toFixed(1)}%\n`);

    // Show current state of rate limiter
    console.log('🔍 Current rate limiter state:');
    const currentRequests = await adapter.getSortedSetByScore(rateLimitKey, '-inf', '+inf', { withScores: true }) as Array<{ member: string; score: number }>;
    console.log(`Active requests in window: ${currentRequests.length}`);

    if (currentRequests.length > 0) {
      console.log('Request timestamps:');
      currentRequests.forEach(req => {
        const timestamp = new Date(req.score).toLocaleTimeString();
        console.log(`  - ${timestamp}`);
      });
    }

    console.log('\n✨ Rate limiting example completed successfully!');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    // Cleanup
    await adapter.getRedis().del('ratelimit:user:123');
    await adapter.close();
  }
}

rateLimitingExample();
