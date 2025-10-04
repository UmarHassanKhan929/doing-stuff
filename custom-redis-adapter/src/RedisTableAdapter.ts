import { Redis } from 'ioredis';
import bcrypt from 'bcrypt';

// Base row type for flexibility
type Row = Record<string, string>;

interface QueryOptions {
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface RangeOptions {
  min?: number | string;
  max?: number | string;
  limit?: number;
  offset?: number;
  withScores?: boolean;
}

class RedisTableAdapter {
  private redis: Redis;

  constructor(redisUrl: string = 'redis://localhost:6379') {
    this.redis = new Redis(redisUrl);
  }

  // ==================== SCHEMA MANAGEMENT ====================

  // Create a table with a defined schema (list of required fields).
  // All fields are assumed to be strings. Schema is stored as a set in Redis.
  // Throws if schema already exists for the table.
  async createTable(table: string, fields: string[]): Promise<void> {
    const schemaKey = `${table}:schema`;
    if (await this.redis.exists(schemaKey)) {
      throw new Error(`Schema already defined for table "${table}"`);
    }
    if (fields.length === 0) {
      throw new Error('Schema must have at least one field');
    }
    await this.redis.sadd(schemaKey, ...fields);
  }

  // Check if table exists
  async tableExists(table: string): Promise<boolean> {
    const schemaKey = `${table}:schema`;
    return (await this.redis.exists(schemaKey)) === 1;
  }

  // Get table schema
  async getSchema(table: string): Promise<string[]> {
    const schemaKey = `${table}:schema`;
    return await this.redis.smembers(schemaKey);
  }

  // Drop table and all its data
  async dropTable(table: string): Promise<void> {
    const schemaKey = `${table}:schema`;
    const rowsSetKey = `${table}:rows`;
    const nextIdKey = `${table}:next_id`;

    // Get all row IDs
    const rowIds = await this.redis.smembers(rowsSetKey);

    // Delete all rows and their indexes
    const pipeline = this.redis.pipeline();
    for (const rowId of rowIds) {
      const rowKey = `${table}:${rowId}`;

      // Get row data to clean up indexes
      const rowData = await this.redis.hgetall(rowKey);
      for (const [field, value] of Object.entries(rowData)) {
        const indexKey = `${table}:index:${field}:${value}`;
        pipeline.del(indexKey);
      }

      pipeline.del(rowKey);
    }

    // Delete table metadata
    pipeline.del(schemaKey);
    pipeline.del(rowsSetKey);
    pipeline.del(nextIdKey);

    await pipeline.exec();
  }

  // Initialize or reset the next ID counter for a table
  async initNextId(table: string): Promise<void> {
    const nextIdKey = `${table}:next_id`;
    // Set to 0 if not exists, or reset to 0 if exists
    await this.redis.set(nextIdKey, '0');
  }

  // ==================== CRUD OPERATIONS ====================

  // Insert a row into the specified table.
  // Validates the row against the schema (all fields required, no extras).
  // Generates a unique ID for the row and stores it as a hash.
  // Adds the ID to a set for tracking all rows in the table.
  // Indexes each field for fast querying (using sets for potential non-unique values).
  async insert<T extends Row>(table: string, row: T): Promise<string> {
    const schemaKey = `${table}:schema`;
    const schemaExists = await this.redis.exists(schemaKey);
    if (!schemaExists) {
      throw new Error(`Schema not defined for table "${table}". Call createTable first.`);
    }

    const schemaFields = await this.redis.smembers(schemaKey);
    const rowFields = Object.keys(row);

    // Check for missing fields
    for (const field of schemaFields) {
      if (!rowFields.includes(field)) {
        throw new Error(`Missing required field "${field}" in row for table "${table}"`);
      }
    }

    // Check for extra fields
    for (const field of rowFields) {
      if (!schemaFields.includes(field)) {
        throw new Error(`Extra field "${field}" not in schema for table "${table}"`);
      }
    }

    const nextIdKey = `${table}:next_id`;
    const rowsSetKey = `${table}:rows`;

    // Generate unique ID and create row data
    const currentId = await this.redis.incr(nextIdKey);
    const rowId = currentId.toString();
    const rowKey = `${table}:${rowId}`;

    // Add timestamp
    const timestamp = Date.now().toString();
    const rowWithTimestamp = { ...row, _created_at: timestamp, _updated_at: timestamp };

    // Store the row
    await this.redis.hmset(rowKey, rowWithTimestamp);

    // Add to rows set
    await this.redis.sadd(rowsSetKey, rowId);

    // Index each field (using pipeline for performance)
    const indexPipeline = this.redis.pipeline();
    for (const [field, value] of Object.entries(row)) {
      const indexKey = `${table}:index:${field}:${value}`;
      indexPipeline.sadd(indexKey, rowId);
    }
    await indexPipeline.exec();

    return rowId;
  }

  // Update a row by ID
  async update<T extends Row>(table: string, id: string, updates: Partial<T>): Promise<boolean> {
    const rowKey = `${table}:${id}`;

    const maxRetries = 5;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Watch the row for concurrent modifications
        await this.redis.watch(rowKey);

        const exists = await this.redis.exists(rowKey);
        if (!exists) {
          await this.redis.unwatch();
          return false;
        }

        // Get current data to update indexes
        const currentData = await this.redis.hgetall(rowKey);

        // Prepare index updates
        const indexUpdates = [];
        for (const [field, newValue] of Object.entries(updates)) {
          const oldValue = currentData[field];
          if (oldValue && oldValue !== newValue) {
            indexUpdates.push({
              field,
              oldValue,
              newValue: newValue as string
            });
          }
        }

        // Update the row with transaction
        const timestamp = Date.now().toString();
        const results = await this.redis
          .multi()
          .hmset(rowKey, { ...updates, _updated_at: timestamp })
          .exec();

        // Check if transaction succeeded
        if (results === null) {
          // Transaction failed due to concurrent modification, retry
          continue;
        }

        // Update indexes (outside transaction for performance)
        if (indexUpdates.length > 0) {
          const indexPipeline = this.redis.pipeline();
          for (const { field, oldValue, newValue } of indexUpdates) {
            const oldIndexKey = `${table}:index:${field}:${oldValue}`;
            const newIndexKey = `${table}:index:${field}:${newValue}`;
            indexPipeline.srem(oldIndexKey, id);
            indexPipeline.sadd(newIndexKey, id);
          }
          await indexPipeline.exec();
        }

        return true;
      } catch (error) {
        await this.redis.unwatch();
        throw error;
      }
    }

    throw new Error('Failed to update row after maximum retries due to concurrent modifications');
  }

  // Delete a row by ID
  async delete(table: string, id: string): Promise<boolean> {
    const rowKey = `${table}:${id}`;
    const rowsSetKey = `${table}:rows`;

    const maxRetries = 5;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Watch the row for concurrent modifications
        await this.redis.watch(rowKey);

        const rowData = await this.redis.hgetall(rowKey);

        if (Object.keys(rowData).length === 0) {
          await this.redis.unwatch();
          return false;
        }

        // Execute deletion in transaction
        const multi = this.redis.multi();

        // Remove from rows set
        multi.srem(rowsSetKey, id);

        // Delete the row
        multi.del(rowKey);

        const results = await multi.exec();

        // Check if transaction succeeded
        if (results === null) {
          // Transaction failed, retry
          continue;
        }

        // Remove from indexes (outside transaction for performance)
        const indexPipeline = this.redis.pipeline();
        for (const [field, value] of Object.entries(rowData)) {
          if (!field.startsWith('_')) {
            const indexKey = `${table}:index:${field}:${value}`;
            indexPipeline.srem(indexKey, id);
          }
        }
        await indexPipeline.exec();

        return true;
      } catch (error) {
        await this.redis.unwatch();
        throw error;
      }
    }

    throw new Error('Failed to delete row after maximum retries due to concurrent modifications');
  }

  // Get a single row by ID
  async getById<T extends Row>(table: string, id: string): Promise<T | null> {
    const rowKey = `${table}:${id}`;
    const rowData = await this.redis.hgetall(rowKey);
    if (Object.keys(rowData).length === 0) {
      return null;
    }
    return rowData as T;
  }

  // Get all rows from the specified table.
  async getAll<T extends Row>(table: string, options?: QueryOptions): Promise<{ id: string; data: T }[]> {
    const rowsSetKey = `${table}:rows`;
    const rowIds = await this.redis.smembers(rowsSetKey);

    const rows: { id: string; data: T }[] = [];
    for (const rowId of rowIds) {
      const rowKey = `${table}:${rowId}`;
      const rowData = (await this.redis.hgetall(rowKey)) as T;
      rows.push({ id: rowId, data: rowData });
    }

    // Apply options
    return this.applyQueryOptions(rows, options);
  }

  // Scan rows iteratively
  async scanRows<T extends Row>(table: string, cursor: string = '0', count: number = 10): Promise<{ cursor: string; rows: { id: string; data: T }[] }> {
    const rowsSetKey = `${table}:rows`;
    const [newCursor, ids] = await this.redis.sscan(rowsSetKey, cursor, 'COUNT', count);

    const rows: { id: string; data: T }[] = [];
    for (const id of ids) {
      const rowKey = `${table}:${id}`;
      const rowData = (await this.redis.hgetall(rowKey)) as T;
      rows.push({ id, data: rowData });
    }

    return { cursor: newCursor, rows };
  }

  // Find rows by a specific field value using the index.
  async findByField<T extends Row>(table: string, field: keyof T, value: string, options?: QueryOptions): Promise<{ id: string; data: T }[]> {
    const indexKey = `${table}:index:${field as string}:${value}`;
    const rowIds = await this.redis.smembers(indexKey);

    const rows: { id: string; data: T }[] = [];
    for (const rowId of rowIds) {
      const rowKey = `${table}:${rowId}`;
      const rowData = (await this.redis.hgetall(rowKey)) as T;
      rows.push({ id: rowId, data: rowData });
    }

    return this.applyQueryOptions(rows, options);
  }

  // Scan rows by a specific field value iteratively
  async scanByField<T extends Row>(table: string, field: keyof T, value: string, cursor: string = '0', count: number = 10): Promise<{ cursor: string; rows: { id: string; data: T }[] }> {
    const indexKey = `${table}:index:${field as string}:${value}`;
    const [newCursor, ids] = await this.redis.sscan(indexKey, cursor, 'COUNT', count);

    const rows: { id: string; data: T }[] = [];
    for (const id of ids) {
      const rowKey = `${table}:${id}`;
      const rowData = (await this.redis.hgetall(rowKey)) as T;
      rows.push({ id, data: rowData });
    }

    return { cursor: newCursor, rows };
  }

  // Count rows in table
  async count(table: string): Promise<number> {
    const rowsSetKey = `${table}:rows`;
    return await this.redis.scard(rowsSetKey);
  }

  // Count rows by field value
  async countByField(table: string, field: string, value: string): Promise<number> {
    const indexKey = `${table}:index:${field}:${value}`;
    return await this.redis.scard(indexKey);
  }

  // ==================== SORTED SET OPERATIONS ====================

  // Add a row to a sorted set with a score (for ordering)
  // Useful for: leaderboards, time-series data, rankings, priority queues
  async addToSortedSet(key: string, score: number, member: string): Promise<number> {
    return await this.redis.zadd(key, score, member);
  }

  // Add multiple items to sorted set
  async addMultipleToSortedSet(key: string, items: Array<{ score: number; member: string }>): Promise<number> {
    const args: (number | string)[] = [];
    items.forEach(item => {
      args.push(item.score, item.member);
    });
    return await this.redis.zadd(key, ...args);
  }

  // Get items from sorted set by rank (position)
  // Start and stop are zero-based indices
  // Use withScores to get scores along with members
  async getSortedSetByRank(key: string, start: number = 0, stop: number = -1, withScores: boolean = false): Promise<string[] | Array<{ member: string; score: number }>> {
    if (withScores) {
      const results = await this.redis.zrange(key, start, stop, 'WITHSCORES');
      const formatted: Array<{ member: string; score: number }> = [];
      for (let i = 0; i < results.length; i += 2) {
        formatted.push({
          member: results[i],
          score: parseFloat(results[i + 1])
        });
      }
      return formatted;
    }
    return await this.redis.zrange(key, start, stop);
  }

  // Get items from sorted set by rank in reverse order (highest to lowest)
  async getSortedSetByRankReverse(key: string, start: number = 0, stop: number = -1, withScores: boolean = false): Promise<string[] | Array<{ member: string; score: number }>> {
    if (withScores) {
      const results = await this.redis.zrevrange(key, start, stop, 'WITHSCORES');
      const formatted: Array<{ member: string; score: number }> = [];
      for (let i = 0; i < results.length; i += 2) {
        formatted.push({
          member: results[i],
          score: parseFloat(results[i + 1])
        });
      }
      return formatted;
    }
    return await this.redis.zrevrange(key, start, stop);
  }

  // Get items from sorted set by score range
  // min and max can be numbers or '-inf' / '+inf' for unbounded
  async getSortedSetByScore(key: string, min: number | string = '-inf', max: number | string = '+inf', options?: RangeOptions): Promise<string[] | Array<{ member: string; score: number }>> {
    const args: any[] = [key, min, max];

    if (options?.withScores) {
      args.push('WITHSCORES');
    }

    if (options?.offset !== undefined && options?.limit !== undefined) {
      args.push('LIMIT', options.offset, options.limit);
    }

    const results = await (this.redis.zrangebyscore as any)(...args);

    if (options?.withScores) {
      const formatted: Array<{ member: string; score: number }> = [];
      for (let i = 0; i < results.length; i += 2) {
        formatted.push({
          member: results[i],
          score: parseFloat(results[i + 1])
        });
      }
      return formatted;
    }

    return results;
  }

  // Get items from sorted set by score range in reverse
  async getSortedSetByScoreReverse(key: string, max: number | string = '+inf', min: number | string = '-inf', options?: RangeOptions): Promise<string[] | Array<{ member: string; score: number }>> {
    const args: any[] = [key, max, min];

    if (options?.withScores) {
      args.push('WITHSCORES');
    }

    if (options?.offset !== undefined && options?.limit !== undefined) {
      args.push('LIMIT', options.offset, options.limit);
    }

    const results = await (this.redis.zrevrangebyscore as any)(...args);

    if (options?.withScores) {
      const formatted: Array<{ member: string; score: number }> = [];
      for (let i = 0; i < results.length; i += 2) {
        formatted.push({
          member: results[i],
          score: parseFloat(results[i + 1])
        });
      }
      return formatted;
    }

    return results;
  }

  // Get score of a specific member
  async getSortedSetScore(key: string, member: string): Promise<number | null> {
    const score = await this.redis.zscore(key, member);
    return score !== null ? parseFloat(score) : null;
  }

  // Get rank (position) of a member (0-based, lowest score = 0)
  async getSortedSetRank(key: string, member: string): Promise<number | null> {
    return await this.redis.zrank(key, member);
  }

  // Get reverse rank (position from highest score)
  async getSortedSetRankReverse(key: string, member: string): Promise<number | null> {
    return await this.redis.zrevrank(key, member);
  }

  // Increment score of a member
  async incrementSortedSetScore(key: string, member: string, increment: number): Promise<number> {
    // ZINCRBY is atomic, no need for WATCH
    const newScore = await this.redis.zincrby(key, increment, member);
    return parseFloat(newScore);
  }

  // Remove member(s) from sorted set
  async removeFromSortedSet(key: string, ...members: string[]): Promise<number> {
    return await this.redis.zrem(key, ...members);
  }

  // Remove members by rank range
  async removeFromSortedSetByRank(key: string, start: number, stop: number): Promise<number> {
    return await this.redis.zremrangebyrank(key, start, stop);
  }

  // Remove members by score range
  async removeFromSortedSetByScore(key: string, min: number | string, max: number | string): Promise<number> {
    return await this.redis.zremrangebyscore(key, min, max);
  }

  // Count members in sorted set
  async countSortedSet(key: string): Promise<number> {
    return await this.redis.zcard(key);
  }

  // Count members in score range
  async countSortedSetByScore(key: string, min: number | string = '-inf', max: number | string = '+inf'): Promise<number> {
    return await this.redis.zcount(key, min, max);
  }

  // ==================== SORTED SET WITH TABLE INTEGRATION ====================

  // Create a sorted index on a table field (e.g., for timestamp, price, score ordering)
  async createSortedIndex(table: string, field: string, idScorePairs: Array<{ id: string; score: number }>): Promise<void> {
    const sortedIndexKey = `${table}:sorted:${field}`;
    const items = idScorePairs.map(pair => ({ score: pair.score, member: pair.id }));
    await this.addMultipleToSortedSet(sortedIndexKey, items);
  }

  // Get rows ordered by a sorted index field
  async getRowsBySortedField<T extends Row>(
    table: string,
    field: string,
    options?: {
      order?: 'asc' | 'desc';
      limit?: number;
      offset?: number;
      minScore?: number | string;
      maxScore?: number | string;
    }
  ): Promise<{ id: string; data: T; score: number }[]> {
    const sortedIndexKey = `${table}:sorted:${field}`;
    const order = options?.order || 'asc';
    const limit = options?.limit || -1;
    const offset = options?.offset || 0;

    let results: Array<{ member: string; score: number }>;

    if (options?.minScore !== undefined || options?.maxScore !== undefined) {
      const min = options.minScore ?? '-inf';
      const max = options.maxScore ?? '+inf';

      if (order === 'desc') {
        results = await this.getSortedSetByScoreReverse(sortedIndexKey, max, min, {
          withScores: true,
          limit: limit >= 0 ? limit : undefined,
          offset
        }) as Array<{ member: string; score: number }>;
      } else {
        results = await this.getSortedSetByScore(sortedIndexKey, min, max, {
          withScores: true,
          limit: limit >= 0 ? limit : undefined,
          offset
        }) as Array<{ member: string; score: number }>;
      }
    } else {
      const stop = limit >= 0 ? offset + limit - 1 : -1;

      if (order === 'desc') {
        results = await this.getSortedSetByRankReverse(sortedIndexKey, offset, stop, true) as Array<{ member: string; score: number }>;
      } else {
        results = await this.getSortedSetByRank(sortedIndexKey, offset, stop, true) as Array<{ member: string; score: number }>;
      }
    }

    const rows: { id: string; data: T; score: number }[] = [];
    for (const { member: id, score } of results) {
      const rowData = await this.getById<T>(table, id);
      if (rowData) {
        rows.push({ id, data: rowData, score });
      }
    }

    return rows;
  }

  // Update sorted index when a field changes
  async updateSortedIndex(table: string, field: string, id: string, newScore: number): Promise<void> {
    const sortedIndexKey = `${table}:sorted:${field}`;
    // ZADD is atomic, no need for WATCH
    await this.addToSortedSet(sortedIndexKey, newScore, id);
  }

  // ==================== AUTHENTICATION ====================

  // Create a user with hashed password
  async createUser(table: string, email: string, password: string, additionalData: Record<string, string> = {}): Promise<string> {
    // Check if user already exists
    const existing = await this.findByField(table, 'email', email);
    if (existing.length > 0) {
      throw new Error('User with this email already exists');
    }

    // Hash password with bcrypt (10 rounds)
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user record
    const userData = {
      email,
      password: passwordHash,
      ...additionalData
    };

    return await this.insert(table, userData);
  }

  // Verify user credentials
  async verifyUser(table: string, email: string, password: string): Promise<{ id: string; data: any } | null> {
    // Find user by email
    const users = await this.findByField(table, 'email', email);

    if (users.length === 0) {
      return null;
    }

    const user = users[0];

    // Verify password with bcrypt
    const isValid = await bcrypt.compare(password, user.data.password);

    if (!isValid) {
      return null;
    }

    // Remove password from returned data
    const { password: _, ...userData } = user.data;

    return { id: user.id, data: userData };
  }

  // Update user password
  async updatePassword(table: string, userId: string, newPassword: string): Promise<boolean> {
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);
    return await this.update(table, userId, { password: passwordHash });
  }

  // ==================== SESSION MANAGEMENT ====================

  // Create a session for a user
  async createSession(userId: string, expiresInSeconds: number = 86400): Promise<string> {
    const sessionId = this.generateSessionId();
    const sessionKey = `session:${sessionId}`;

    // SETEX is atomic, no need for WATCH
    await this.redis.setex(sessionKey, expiresInSeconds, userId);

    return sessionId;
  }

  // Get user ID from session
  async getSession(sessionId: string): Promise<string | null> {
    const sessionKey = `session:${sessionId}`;
    return await this.redis.get(sessionKey);
  }

  // Delete a session
  async deleteSession(sessionId: string): Promise<boolean> {
    const sessionKey = `session:${sessionId}`;
    const result = await this.redis.del(sessionKey);
    return result > 0;
  }

  // Refresh session expiry
  async refreshSession(sessionId: string, expiresInSeconds: number = 86400): Promise<boolean> {
    const sessionKey = `session:${sessionId}`;

    const maxRetries = 5;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Watch session to prevent race conditions
        await this.redis.watch(sessionKey);

        const userId = await this.redis.get(sessionKey);

        if (!userId) {
          await this.redis.unwatch();
          return false;
        }

        // Update expiry in transaction
        const results = await this.redis
          .multi()
          .setex(sessionKey, expiresInSeconds, userId)
          .exec();

        // Check if transaction succeeded
        if (results === null) {
          // Transaction failed, retry
          continue;
        }

        return true;
      } catch (error) {
        await this.redis.unwatch();
        throw error;
      }
    }

    throw new Error('Failed to refresh session after maximum retries due to concurrent modifications');
  }

  // ==================== HELPER METHODS ====================

  private applyQueryOptions<T extends Row>(rows: { id: string; data: T }[], options?: QueryOptions): { id: string; data: T }[] {
    if (!options) return rows;

    let result = [...rows];

    // Sort
    if (options.sortBy) {
      result.sort((a, b) => {
        const aVal = a.data[options.sortBy!];
        const bVal = b.data[options.sortBy!];
        const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return options.sortOrder === 'desc' ? -comparison : comparison;
      });
    }

    // Pagination
    if (options.offset !== undefined) {
      result = result.slice(options.offset);
    }
    if (options.limit !== undefined) {
      result = result.slice(0, options.limit);
    }

    return result;
  }

  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  // ==================== UTILITY ====================

  // Execute transaction (pipeline)
  async transaction(callback: (pipeline: any) => void): Promise<any> {
    const pipeline = this.redis.pipeline();
    callback(pipeline);
    return await pipeline.exec();
  }

  // Get Redis instance for custom operations
  getRedis(): Redis {
    return this.redis;
  }

  // Close the connection
  async close() {
    await this.redis.quit();
  }
}

export default RedisTableAdapter;
