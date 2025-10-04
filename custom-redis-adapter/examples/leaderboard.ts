// src/examples/leaderboard.ts
import RedisTableAdapter from '../src/RedisTableAdapter';

interface PlayerRow extends Record<string, string> {
  username: string;
  level: string;
  country: string;
}

async function gamingLeaderboardExample() {
  console.log('🎮 Gaming Leaderboard Example\n');

  const adapter = new RedisTableAdapter();

  try {
    // Create players table
    console.log('Creating players table...');
    await adapter.createTable('players', ['username', 'level', 'country']);
    console.log('✅ Table created\n');

    // Create players
    console.log('Adding players...');
    const p1 = await adapter.insert<PlayerRow>('players', {
      username: 'ProGamer123',
      level: '50',
      country: 'US'
    });
    const p2 = await adapter.insert<PlayerRow>('players', {
      username: 'ElitePlayer',
      level: '45',
      country: 'UK'
    });
    const p3 = await adapter.insert<PlayerRow>('players', {
      username: 'NinjaWarrior',
      level: '60',
      country: 'JP'
    });
    const p4 = await adapter.insert<PlayerRow>('players', {
      username: 'DragonSlayer',
      level: '55',
      country: 'US'
    });
    const p5 = await adapter.insert<PlayerRow>('players', {
      username: 'ShadowHunter',
      level: '48',
      country: 'CA'
    });
    console.log('✅ 5 players added\n');

    // Global leaderboard by score
    console.log('Setting up global leaderboard...');
    await adapter.addMultipleToSortedSet('leaderboard:global', [
      { score: 15420, member: p1 },
      { score: 12890, member: p2 },
      { score: 18750, member: p3 },
      { score: 16200, member: p4 },
      { score: 14100, member: p5 }
    ]);
    console.log('✅ Leaderboard created\n');

    // Get top 10 players globally
    console.log('🏆 TOP 10 GLOBAL LEADERBOARD:');
    console.log('================================');
    const top10Global = await adapter.getSortedSetByRankReverse('leaderboard:global', 0, 9, true) as Array<{ member: string; score: number }>;

    for (let i = 0; i < top10Global.length; i++) {
      const playerData = await adapter.getById<PlayerRow>('players', top10Global[i].member);
      const rank = i + 1;
      const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '  ';
      console.log(`${medal} #${rank}: ${playerData?.username.padEnd(20)} | Score: ${top10Global[i].score} | ${playerData?.country}`);
    }
    console.log('');

    // Get specific player rank
    const playerRank = await adapter.getSortedSetRankReverse('leaderboard:global', p3);
    const playerScore = await adapter.getSortedSetScore('leaderboard:global', p3);
    const playerData = await adapter.getById<PlayerRow>('players', p3);
    console.log(`📊 Player Stats for ${playerData?.username}:`);
    console.log(`   Rank: #${playerRank !== null ? playerRank + 1 : 'Unranked'}`);
    console.log(`   Score: ${playerScore}`);
    console.log(`   Level: ${playerData?.level}`);
    console.log('');

    // Player wins a match, increment score
    console.log('⚔️  ProGamer123 wins a match! +500 points');
    const newScore = await adapter.incrementSortedSetScore('leaderboard:global', p1, 500);
    console.log(`✅ New score: ${newScore}\n`);

    // Show updated leaderboard
    console.log('🏆 UPDATED TOP 3:');
    console.log('==================');
    const updatedTop3 = await adapter.getSortedSetByRankReverse('leaderboard:global', 0, 2, true) as Array<{ member: string; score: number }>;

    for (let i = 0; i < updatedTop3.length; i++) {
      const pData = await adapter.getById<PlayerRow>('players', updatedTop3[i].member);
      const rank = i + 1;
      const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉';
      console.log(`${medal} #${rank}: ${pData?.username.padEnd(20)} | Score: ${updatedTop3[i].score}`);
    }
    console.log('');

    // Weekly leaderboard (separate sorted set)
    console.log('Setting up weekly leaderboard...');
    await adapter.addMultipleToSortedSet('leaderboard:weekly', [
      { score: 3200, member: p1 },
      { score: 2900, member: p2 },
      { score: 4100, member: p3 },
      { score: 3500, member: p4 }
    ]);
    console.log('✅ Weekly leaderboard created\n');

    // Get top 3 this week
    console.log('📅 TOP 3 THIS WEEK:');
    console.log('===================');
    const topWeekly = await adapter.getSortedSetByRankReverse('leaderboard:weekly', 0, 2, true) as Array<{ member: string; score: number }>;

    for (let i = 0; i < topWeekly.length; i++) {
      const pData = await adapter.getById<PlayerRow>('players', topWeekly[i].member);
      const rank = i + 1;
      const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉';
      console.log(`${medal} #${rank}: ${pData?.username.padEnd(20)} | Weekly Score: ${topWeekly[i].score}`);
    }
    console.log('');

    // Get players with scores between 13000-17000
    console.log('Finding mid-tier players (13k-17k score range)...');
    const midTierPlayers = await adapter.getSortedSetByScore('leaderboard:global', 13000, 17000, { withScores: true }) as Array<{ member: string; score: number }>;
    console.log(`✅ Found ${midTierPlayers.length} mid-tier players:`);
    for (const player of midTierPlayers) {
      const pData = await adapter.getById<PlayerRow>('players', player.member);
      console.log(`   - ${pData?.username}: ${player.score} points`);
    }
    console.log('');

    // Count total players in leaderboard
    const totalPlayers = await adapter.countSortedSet('leaderboard:global');
    console.log(`📊 Total players on leaderboard: ${totalPlayers}\n`);

    // Player performance analytics
    console.log('📈 PLAYER PERFORMANCE ANALYTICS:');
    console.log('=================================');
    const allPlayers = await adapter.getSortedSetByRankReverse('leaderboard:global', 0, -1, true) as Array<{ member: string; score: number }>;
    const avgScore = allPlayers.reduce((sum, p) => sum + p.score, 0) / allPlayers.length;
    const topScore = allPlayers[0].score;
    const lowestScore = allPlayers[allPlayers.length - 1].score;

    console.log(`Average Score: ${Math.round(avgScore)}`);
    console.log(`Highest Score: ${topScore}`);
    console.log(`Lowest Score: ${lowestScore}`);
    console.log(`Score Range: ${topScore - lowestScore}`);

    console.log('\n✨ Leaderboard example completed successfully!');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    // Cleanup
    await adapter.dropTable('players');
    await adapter.getRedis().del('leaderboard:global', 'leaderboard:weekly');
    await adapter.close();
  }
}

gamingLeaderboardExample();
