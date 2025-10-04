// src/examples/auth.ts
import RedisTableAdapter from '../src/RedisTableAdapter';

interface UserRow extends Record<string, string> {
  email: string;
  password: string;
  name: string;
  role: string;
}

async function authExample() {
  console.log('🔐 Authentication Example\n');

  const adapter = new RedisTableAdapter();

  try {
    // Create users table
    console.log('Creating users table...');
    await adapter.createTable('users', ['email', 'password', 'name', 'role']);
    console.log('✅ Table created\n');

    // Register new users
    console.log('Registering users...');
    const userId1 = await adapter.createUser('users', 'john@example.com', 'securePass123', {
      name: 'John Doe',
      role: 'admin'
    });
    console.log(`✅ User created with ID: ${userId1}`);

    const userId2 = await adapter.createUser('users', 'jane@example.com', 'password456', {
      name: 'Jane Smith',
      role: 'user'
    });
    console.log(`✅ User created with ID: ${userId2}\n`);

    // Verify user login - CORRECT PASSWORD
    console.log('Testing login with correct password...');
    const user = await adapter.verifyUser('users', 'john@example.com', 'securePass123');
    if (user) {
      console.log('✅ Login successful!');
      console.log('User data:', user.data);

      // Create session (1 hour)
      const sessionId = await adapter.createSession(user.id, 3600);
      console.log(`✅ Session created: ${sessionId}\n`);

      // Verify session
      console.log('Verifying session...');
      const sessionUserId = await adapter.getSession(sessionId);
      if (sessionUserId) {
        const userData = await adapter.getById<UserRow>('users', sessionUserId);
        console.log(`✅ Session valid for: ${userData?.name}\n`);
      }

      // Change password
      console.log('Changing password...');
      await adapter.updatePassword('users', user.id, 'newSecurePassword999');
      console.log('✅ Password updated\n');

      // Test old password (should fail)
      console.log('Testing login with OLD password...');
      const oldPasswordLogin = await adapter.verifyUser('users', 'john@example.com', 'securePass123');
      console.log(oldPasswordLogin ? '❌ FAILED: Old password still works!' : '✅ Old password rejected\n');

      // Test new password (should work)
      console.log('Testing login with NEW password...');
      const newPasswordLogin = await adapter.verifyUser('users', 'john@example.com', 'newSecurePassword999');
      console.log(newPasswordLogin ? '✅ New password works!\n' : '❌ FAILED: New password rejected\n');

      // Logout
      console.log('Logging out...');
      await adapter.deleteSession(sessionId);
      console.log('✅ Session deleted\n');

      // Try to use deleted session
      const deletedSession = await adapter.getSession(sessionId);
      console.log(deletedSession ? '❌ FAILED: Session still active!' : '✅ Session properly deleted\n');
    } else {
      console.log('❌ Login failed!\n');
    }

    // Test wrong password
    console.log('Testing login with WRONG password...');
    const failedLogin = await adapter.verifyUser('users', 'john@example.com', 'wrongPassword');
    console.log(failedLogin ? '❌ FAILED: Wrong password accepted!' : '✅ Wrong password rejected\n');

    // Find users by role
    console.log('Finding all admins...');
    const admins = await adapter.findByField<UserRow>('users', 'role', 'admin');
    console.log(`✅ Found ${admins.length} admin(s):`);
    admins.forEach((admin: { id: string; data: UserRow }) => {
      console.log(`   - ${admin.data.name} (${admin.data.email})`);
    });

    console.log('\n✨ Authentication example completed successfully!');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    // Cleanup
    await adapter.dropTable('users');
    await adapter.close();
  }
}

authExample();
