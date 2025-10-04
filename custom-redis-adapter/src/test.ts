import RedisTableAdapter from './RedisTableAdapter';

async function test() {
  const adapter = new RedisTableAdapter();

  try {
    // Test connection
    await adapter.getRedis().ping();
    console.log('✅ Redis connected!');

    // Drop table if it exists, then create a fresh test table
    if (await adapter.tableExists('test')) {
      await adapter.dropTable('test');
      console.log('✅ Existing table dropped!');
    }

    await adapter.createTable('test', ['name', 'value']);
    console.log('✅ Table created!');

    // Initialize the ID counter to ensure it starts from 1
    await adapter.initNextId('test');
    console.log('✅ ID counter initialized!');

    // Insert data
    const id = await adapter.insert('test', { name: 'test', value: '123' });
    console.log('✅ Data inserted:', id);

    // Query data
    const data = await adapter.getById('test', id);
    console.log('✅ Data retrieved:', data);

    // Cleanup
    await adapter.dropTable('test');
    console.log('✅ Cleanup complete!');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await adapter.close();
  }
}

test();
