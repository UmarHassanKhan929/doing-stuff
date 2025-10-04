// src/examples/event-scheduling.ts
import RedisTableAdapter from '../src/RedisTableAdapter';

interface EventRow extends Record<string, string> {
  title: string;
  description: string;
  organizer: string;
  status: string;
}

async function eventSchedulingExample() {
  console.log('📅 Event Scheduling & Timeline Example\n');

  const adapter = new RedisTableAdapter();

  try {
    // Create events table
    console.log('Creating events table...');
    await adapter.createTable('events', ['title', 'description', 'organizer', 'status']);
    console.log('✅ Table created\n');

    const now = Date.now();
    const tomorrow = now + (24 * 60 * 60 * 1000);
    const nextWeek = now + (7 * 24 * 60 * 60 * 1000);
    const nextMonth = now + (30 * 24 * 60 * 60 * 1000);

    // Create events at different times
    console.log('Creating events...');
    const e1 = await adapter.insert<EventRow>('events', {
      title: 'Team Standup',
      description: 'Daily team sync meeting',
      organizer: 'john',
      status: 'scheduled'
    });
    console.log(`✅ Created: ${e1} - Team Standup (tomorrow)`);

    const e2 = await adapter.insert<EventRow>('events', {
      title: 'Product Launch',
      description: 'Release v2.0 to production',
      organizer: 'jane',
      status: 'scheduled'
    });
    console.log(`✅ Created: ${e2} - Product Launch (next week)`);

    const e3 = await adapter.insert<EventRow>('events', {
      title: 'Company All-Hands',
      description: 'Q4 Review and planning',
      organizer: 'ceo',
      status: 'scheduled'
    });
    console.log(`✅ Created: ${e3} - Company All-Hands (in 3 days)`);

    const e4 = await adapter.insert<EventRow>('events', {
      title: 'Client Presentation',
      description: 'Demo new features to client',
      organizer: 'sales',
      status: 'scheduled'
    });
    console.log(`✅ Created: ${e4} - Client Presentation (next month)\n`);

    // Schedule events (timestamp as score)
    console.log('Scheduling events on timeline...');
    await adapter.createSortedIndex('events', 'scheduled_at', [
      { id: e1, score: tomorrow },
      { id: e2, score: nextWeek },
      { id: e3, score: now + (3 * 24 * 60 * 60 * 1000) }, // 3 days from now
      { id: e4, score: nextMonth }
    ]);
    console.log('✅ Events scheduled on timeline\n');

    // Get upcoming events (chronologically)
    console.log('📅 UPCOMING EVENTS (chronological order):');
    console.log('===========================================');
    const upcomingEvents = await adapter.getRowsBySortedField<EventRow>('events', 'scheduled_at', {
      order: 'asc',
      limit: 10
    });

    upcomingEvents.forEach((event, index) => {
      const eventTime = new Date(event.score);
      const timeUntil = Math.round((event.score - now) / (1000 * 60 * 60)); // hours until event
      const timeString = timeUntil < 24 ? `${timeUntil}h` : `${Math.round(timeUntil / 24)}d`;

      console.log(`${index + 1}. ${event.data.title}`);
      console.log(`   📅 ${eventTime.toLocaleDateString()} ${eventTime.toLocaleTimeString()}`);
      console.log(`   ⏰ In ${timeString} - Organized by ${event.data.organizer}`);
      console.log(`   📝 ${event.data.description}\n`);
    });

    // Get events happening in next 48 hours
    console.log('⏰ EVENTS IN NEXT 48 HOURS:');
    console.log('============================');
    const next48h = now + (48 * 60 * 60 * 1000);
    const soonEvents = await adapter.getRowsBySortedField<EventRow>('events', 'scheduled_at', {
      minScore: now,
      maxScore: next48h,
      order: 'asc'
    });

    if (soonEvents.length > 0) {
      soonEvents.forEach(event => {
        const hoursUntil = Math.round((event.score - now) / (1000 * 60 * 60));
        console.log(`🚨 ${event.data.title} - in ${hoursUntil} hours`);
      });
    } else {
      console.log('No events in the next 48 hours');
    }
    console.log('');

    // Get next event to occur
    console.log('🎯 NEXT EVENT TO OCCUR:');
    console.log('=======================');
    const nextEvent = await adapter.getRowsBySortedField<EventRow>('events', 'scheduled_at', {
      minScore: now,
      order: 'asc',
      limit: 1
    });

    if (nextEvent.length > 0) {
      const event = nextEvent[0];
      const timeUntil = Math.round((event.score - now) / (1000 * 60));
      const timeString = timeUntil < 60 ? `${timeUntil}m` : `${Math.round(timeUntil / 60)}h`;

      console.log(`🎪 ${event.data.title}`);
      console.log(`   📅 ${new Date(event.score).toLocaleString()}`);
      console.log(`   ⏰ Starts in ${timeString}`);
      console.log(`   👤 Organizer: ${event.data.organizer}`);
      console.log(`   📝 ${event.data.description}`);
    }
    console.log('');

    // Events this week
    console.log('📊 THIS WEEK\'S EVENTS:');
    console.log('=======================');
    const weekFromNow = now + (7 * 24 * 60 * 60 * 1000);
    const thisWeekEvents = await adapter.getRowsBySortedField<EventRow>('events', 'scheduled_at', {
      minScore: now,
      maxScore: weekFromNow,
      order: 'asc'
    });

    console.log(`Total events this week: ${thisWeekEvents.length}`);
    thisWeekEvents.forEach(event => {
      const dayName = new Date(event.score).toLocaleDateString('en-US', { weekday: 'long' });
      console.log(`   ${dayName}: ${event.data.title} (${event.data.organizer})`);
    });
    console.log('');

    // Event organizer statistics
    console.log('👥 EVENT ORGANIZER STATISTICS:');
    console.log('===============================');
    const allEvents = await adapter.getAll<EventRow>('events');
    const organizerStats = allEvents.reduce((stats, event) => {
      const organizer = event.data.organizer;
      stats[organizer] = (stats[organizer] || 0) + 1;
      return stats;
    }, {} as Record<string, number>);

    Object.entries(organizerStats)
      .sort(([,a], [,b]) => b - a)
      .forEach(([organizer, count]) => {
        console.log(`   ${organizer}: ${count} event(s)`);
      });

    console.log('\n✨ Event scheduling example completed successfully!');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    // Cleanup
    await adapter.dropTable('events');
    await adapter.close();
  }
}

eventSchedulingExample();
