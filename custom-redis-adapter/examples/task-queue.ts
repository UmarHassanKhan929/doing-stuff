// src/examples/task-queue.ts
import RedisTableAdapter from '../src/RedisTableAdapter';

interface TaskRow extends Record<string, string> {
  title: string;
  description: string;
  assignee: string;
  status: string;
}

async function taskPriorityQueueExample() {
  console.log('📋 Task Priority Queue Example\n');

  const adapter = new RedisTableAdapter();

  try {
    // Create tasks table
    console.log('Creating tasks table...');
    await adapter.createTable('tasks', ['title', 'description', 'assignee', 'status']);
    console.log('✅ Table created\n');

    // Create tasks
    console.log('Creating tasks...');
    const t1 = await adapter.insert<TaskRow>('tasks', {
      title: 'Fix critical bug',
      description: 'Database connection failing',
      assignee: 'john',
      status: 'pending'
    });
    console.log(`✅ Task created with ID: ${t1}`);

    const t2 = await adapter.insert<TaskRow>('tasks', {
      title: 'Update documentation',
      description: 'Add API examples',
      assignee: 'jane',
      status: 'pending'
    });
    console.log(`✅ Task created with ID: ${t2}`);

    const t3 = await adapter.insert<TaskRow>('tasks', {
      title: 'Deploy to production',
      description: 'Release v2.0',
      assignee: 'mike',
      status: 'pending'
    });
    console.log(`✅ Task created with ID: ${t3}\n`);

    // Priority queue: higher score = higher priority
    console.log('Setting up priority queue...');
    await adapter.addMultipleToSortedSet('queue:tasks', [
      { score: 10, member: t1 }, // Critical
      { score: 3, member: t2 },  // Low priority
      { score: 8, member: t3 }   // High priority
    ]);
    console.log('✅ Priority queue created\n');

    // Get highest priority task
    console.log('Getting highest priority task...');
    const nextTask = await adapter.getSortedSetByRankReverse('queue:tasks', 0, 0, true) as Array<{ member: string; score: number }>;
    if (nextTask.length > 0) {
      const taskId = nextTask[0].member;
      const taskData = await adapter.getById<TaskRow>('tasks', taskId);
      console.log('⚡ Next task to process:', taskData);

      // Process task and remove from queue
      console.log('Processing task...');
      await adapter.update('tasks', taskId, { status: 'completed' });
      await adapter.removeFromSortedSet('queue:tasks', taskId);
      console.log('✅ Task completed and removed from queue\n');
    }

    // Get all pending tasks by priority
    console.log('Getting all pending tasks by priority...');
    const pendingTasks = await adapter.getSortedSetByRankReverse('queue:tasks', 0, -1, true);
    console.log('📋 Pending tasks:', pendingTasks);
    console.log(`Total pending tasks: ${pendingTasks.length}\n`);

    // Get tasks with priority >= 5
    console.log('Getting urgent tasks (priority >= 5)...');
    const urgentTasks = await adapter.getSortedSetByScore('queue:tasks', 5, '+inf', { withScores: true });
    console.log('🚨 Urgent tasks:', urgentTasks);
    console.log(`Total urgent tasks: ${urgentTasks.length}\n`);

    // Count pending tasks
    const pendingCount = await adapter.countSortedSet('queue:tasks');
    console.log('Total pending tasks in queue:', pendingCount);

    console.log('\n✨ Task priority queue example completed successfully!');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    // Cleanup
    await adapter.dropTable('tasks');
    await adapter.getRedis().del('queue:tasks');
    await adapter.close();
  }
}

taskPriorityQueueExample();
