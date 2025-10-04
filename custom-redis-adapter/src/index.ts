import RedisTableAdapter from './RedisTableAdapter';

async function main() {
  const adapter = new RedisTableAdapter();

  console.log('🚀 Redis Table Adapter initialized');
  console.log('✅ Ready to use!');

  // Example: Check connection
  const redis = adapter.getRedis();
  await redis.ping();
  console.log('✅ Redis connection successful');

  await adapter.close();
}

main().catch(console.error);