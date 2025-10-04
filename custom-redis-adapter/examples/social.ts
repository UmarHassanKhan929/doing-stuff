// src/examples/social.ts
import RedisTableAdapter from '../src/RedisTableAdapter';

interface PostRow extends Record<string, string> {
  title: string;
  content: string;
  author: string;
  likes: string;
  category: string;
}

interface CommentRow extends Record<string, string> {
  postId: string;
  author: string;
  content: string;
}

interface UserRow extends Record<string, string> {
  username: string;
  fullName: string;
  followers: string;
  posts: string;
}

async function socialMediaFeedExample() {
  console.log('📱 Social Media Feed Example\n');

  const adapter = new RedisTableAdapter();

  try {
    // Create tables
    console.log('Creating tables...');
    await adapter.createTable('posts', ['title', 'content', 'author', 'likes', 'category']);
    await adapter.createTable('comments', ['postId', 'author', 'content']);
    await adapter.createTable('users', ['username', 'fullName', 'followers', 'posts']);
    console.log('✅ Tables created\n');

    // Create users
    console.log('Creating user profiles...');
    const u1 = await adapter.insert<UserRow>('users', {
      username: 'techblogger',
      fullName: 'Alex Tech',
      followers: '15420',
      posts: '234'
    });

    const u2 = await adapter.insert<UserRow>('users', {
      username: 'foodie_chef',
      fullName: 'Sarah Kitchen',
      followers: '28500',
      posts: '567'
    });

    const u3 = await adapter.insert<UserRow>('users', {
      username: 'devmaster',
      fullName: 'Mike Developer',
      followers: '42100',
      posts: '892'
    });

    const u4 = await adapter.insert<UserRow>('users', {
      username: 'fitnessguru',
      fullName: 'Emma Fitness',
      followers: '19800',
      posts: '445'
    });

    console.log('✅ 4 users created\n');

    // Create posts at different times
    console.log('Publishing posts...');
    const now = Date.now();

    const post1 = await adapter.insert<PostRow>('posts', {
      title: 'Getting Started with Redis',
      content: 'Redis is an amazing in-memory database that can be used for caching, real-time analytics, and more...',
      author: 'techblogger',
      likes: '150',
      category: 'tech'
    });

    const post2 = await adapter.insert<PostRow>('posts', {
      title: 'Top 10 Recipes for Winter',
      content: 'As winter approaches, try these delicious and warming recipes that will keep you cozy...',
      author: 'foodie_chef',
      likes: '320',
      category: 'food'
    });

    const post3 = await adapter.insert<PostRow>('posts', {
      title: 'TypeScript Best Practices 2024',
      content: 'Here are the most important TypeScript patterns and practices you should know this year...',
      author: 'devmaster',
      likes: '280',
      category: 'tech'
    });

    const post4 = await adapter.insert<PostRow>('posts', {
      title: '30-Day Fitness Challenge',
      content: 'Join me in this transformative 30-day fitness journey! No equipment needed...',
      author: 'fitnessguru',
      likes: '195',
      category: 'fitness'
    });

    const post5 = await adapter.insert<PostRow>('posts', {
      title: 'Homemade Pasta Tutorial',
      content: 'Learn how to make authentic Italian pasta from scratch with just flour, eggs, and love...',
      author: 'foodie_chef',
      likes: '445',
      category: 'food'
    });

    const post6 = await adapter.insert<PostRow>('posts', {
      title: 'Why Redis Sorted Sets are Powerful',
      content: 'Sorted sets in Redis provide O(log N) performance for a variety of use cases...',
      author: 'techblogger',
      likes: '89',
      category: 'tech'
    });

    console.log('✅ 6 posts published\n');

    // Create time-based index (timestamp as score) - simulating post times
    console.log('Creating timeline index...');
    await adapter.createSortedIndex('posts', 'timestamp', [
      { id: post1, score: now - 7200000 },  // 2 hours ago
      { id: post2, score: now - 5400000 },  // 1.5 hours ago
      { id: post3, score: now - 3600000 },  // 1 hour ago
      { id: post4, score: now - 1800000 },  // 30 minutes ago
      { id: post5, score: now - 900000 },   // 15 minutes ago
      { id: post6, score: now }              // now
    ]);
    console.log('✅ Timeline created\n');

    // Create popularity index (likes as score)
    console.log('Creating popularity index...');
    await adapter.createSortedIndex('posts', 'popularity', [
      { id: post1, score: 150 },
      { id: post2, score: 320 },
      { id: post3, score: 280 },
      { id: post4, score: 195 },
      { id: post5, score: 445 },
      { id: post6, score: 89 }
    ]);
    console.log('✅ Popularity index created\n');

    // Add comments to posts
    console.log('Adding comments...');
    await adapter.insert<CommentRow>('comments', {
      postId: post1,
      author: 'devmaster',
      content: 'Great article! Redis is indeed powerful for real-time applications.'
    });

    await adapter.insert<CommentRow>('comments', {
      postId: post1,
      author: 'user123',
      content: 'Thanks for sharing! Very helpful for beginners.'
    });

    await adapter.insert<CommentRow>('comments', {
      postId: post2,
      author: 'foodlover99',
      content: 'Tried the soup recipe, absolutely delicious! 😋'
    });

    await adapter.insert<CommentRow>('comments', {
      postId: post5,
      author: 'italianfood',
      content: 'Nonna approved! 👌'
    });

    console.log('✅ Comments added\n');

    // SCENARIO 1: View feed (newest posts first)
    console.log('📱 YOUR FEED (Latest Posts):');
    console.log('============================');
    const recentPosts = await adapter.getRowsBySortedField<PostRow>('posts', 'timestamp', {
      order: 'desc',
      limit: 5
    });

    for (const post of recentPosts) {
      const user = await adapter.findByField<UserRow>('users', 'username', post.data.author);
      const timeAgo = Math.floor((now - post.score) / 60000); // minutes ago
      console.log(`\n┌─────────────────────────────────────────────────────`);
      console.log(`│ @${post.data.author} · ${timeAgo}m ago`);
      console.log(`│ ${post.data.title}`);
      console.log(`│ ${post.data.content.substring(0, 80)}...`);
      console.log(`│ ❤️  ${post.data.likes} likes · 💬 View comments · #${post.data.category}`);
      console.log(`└─────────────────────────────────────────────────────`);
    }
    console.log('\n');

    // SCENARIO 2: Trending posts (by likes)
    console.log('🔥 TRENDING POSTS:');
    console.log('==================');
    const trending = await adapter.getRowsBySortedField<PostRow>('posts', 'popularity', {
      order: 'desc',
      limit: 3
    });

    trending.forEach((post, idx) => {
      const flames = idx === 0 ? '🔥🔥🔥' : idx === 1 ? '🔥🔥' : '🔥';
      console.log(`${flames} ${post.data.title}`);
      console.log(`   by @${post.data.author} · ❤️  ${post.data.likes} likes`);
      console.log('');
    });

    // SCENARIO 3: View specific category
    console.log('🍕 FOOD CATEGORY:');
    console.log('=================');
    const foodPosts = await adapter.findByField<PostRow>('posts', 'category', 'food');
    foodPosts.forEach(post => {
      console.log(`📝 ${post.data.title}`);
      console.log(`   by @${post.data.author} · ❤️  ${post.data.likes} likes`);
      console.log('');
    });

    // SCENARIO 4: User profile view
    console.log('👤 USER PROFILE: @foodie_chef');
    console.log('==============================');
    const profileUser = await adapter.findByField<UserRow>('users', 'username', 'foodie_chef');
    if (profileUser.length > 0) {
      const user = profileUser[0].data;
      console.log(`Name: ${user.fullName}`);
      console.log(`Followers: ${parseInt(user.followers).toLocaleString()}`);
      console.log(`Total Posts: ${user.posts}`);

      // Get user's posts
      const userPosts = await adapter.findByField<PostRow>('posts', 'author', 'foodie_chef');
      console.log(`\nRecent Posts (${userPosts.length}):`);
      userPosts.forEach(post => {
        console.log(`  • ${post.data.title} (❤️  ${post.data.likes})`);
      });
    }
    console.log('\n');

    // SCENARIO 5: View post with comments
    console.log('💬 POST WITH COMMENTS:');
    console.log('======================');
    const selectedPost = await adapter.getById<PostRow>('posts', post1);
    if (selectedPost) {
      console.log(`Title: ${selectedPost.title}`);
      console.log(`By: @${selectedPost.author}`);
      console.log(`${selectedPost.content}`);
      console.log(`❤️  ${selectedPost.likes} likes\n`);

      const comments = await adapter.findByField<CommentRow>('comments', 'postId', post1);
      console.log(`Comments (${comments.length}):`);
      comments.forEach(comment => {
        console.log(`  @${comment.data.author}: ${comment.data.content}`);
      });
    }
    console.log('\n');

    // SCENARIO 6: User likes a post
    console.log('❤️  User likes a post...');
    const currentLikes = parseInt(selectedPost!.likes);
    await adapter.update('posts', post1, { likes: (currentLikes + 1).toString() });
    await adapter.updateSortedIndex('posts', 'popularity', post1, currentLikes + 1);
    console.log(`✅ Post liked! New count: ${currentLikes + 1}\n`);

    // SCENARIO 7: Posts from last hour
    console.log('⏰ POSTS FROM LAST HOUR:');
    console.log('========================');
    const oneHourAgo = now - (60 * 60 * 1000);
    const recentInRange = await adapter.getRowsBySortedField<PostRow>('posts', 'timestamp', {
      minScore: oneHourAgo,
      order: 'desc'
    });
    console.log(`Found ${recentInRange.length} posts:`);
    recentInRange.forEach(post => {
      const minutesAgo = Math.floor((now - post.score) / 60000);
      console.log(`  • ${post.data.title} (${minutesAgo}m ago)`);
    });
    console.log('\n');

    // SCENARIO 8: Platform statistics
    console.log('📊 PLATFORM STATISTICS:');
    console.log('=======================');
    const totalPosts = await adapter.count('posts');
    const totalComments = await adapter.count('comments');
    const totalUsers = await adapter.count('users');

    const allUsers = await adapter.getAll<UserRow>('users');
    const totalFollowers = allUsers.reduce((sum, u) => sum + parseInt(u.data.followers), 0);

    const allPosts = await adapter.getAll<PostRow>('posts');
    const totalLikes = allPosts.reduce((sum, p) => sum + parseInt(p.data.likes), 0);
    const avgLikesPerPost = totalLikes / totalPosts;

    const techPosts = await adapter.countByField('posts', 'category', 'tech');
    const foodPosts2 = await adapter.countByField('posts', 'category', 'food');
    const fitnessPosts = await adapter.countByField('posts', 'category', 'fitness');

    console.log(`Total Users: ${totalUsers}`);
    console.log(`Total Posts: ${totalPosts}`);
    console.log(`Total Comments: ${totalComments}`);
    console.log(`Total Followers: ${totalFollowers.toLocaleString()}`);
    console.log(`Total Likes: ${totalLikes.toLocaleString()}`);
    console.log(`Avg Likes/Post: ${Math.round(avgLikesPerPost)}`);
    console.log(`\nCategory Breakdown:`);
    console.log(`  - Tech: ${techPosts} posts`);
    console.log(`  - Food: ${foodPosts2} posts`);
    console.log(`  - Fitness: ${fitnessPosts} posts`);

    // SCENARIO 9: Top influencers by followers
    console.log('\n\n🌟 TOP INFLUENCERS:');
    console.log('===================');
    await adapter.createSortedIndex('users', 'followers_rank', [
      { id: u1, score: 15420 },
      { id: u2, score: 28500 },
      { id: u3, score: 42100 },
      { id: u4, score: 19800 }
    ]);

    const topInfluencers = await adapter.getRowsBySortedField<UserRow>('users', 'followers_rank', {
      order: 'desc',
      limit: 3
    });

    topInfluencers.forEach((user, idx) => {
      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉';
      console.log(`${medal} @${user.data.username} (${user.data.fullName})`);
      console.log(`   ${parseInt(user.data.followers).toLocaleString()} followers · ${user.data.posts} posts`);
    });

    console.log('\n✨ Social media example completed successfully!');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    // Cleanup
    await adapter.dropTable('posts');
    await adapter.dropTable('comments');
    await adapter.dropTable('users');
    await adapter.close();
  }
}

socialMediaFeedExample();
