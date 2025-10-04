# Redis Table Adapter

A powerful TypeScript Redis adapter that provides table-like abstractions with authentication, sorted sets, and more.

## Features

- 🗄️ Table-based data model with schema validation
- 🔐 Built-in authentication with bcrypt
- 🔑 Session management
- 📊 Sorted sets for leaderboards, rankings, time-series data
- 🔍 Indexed queries for fast lookups
- 🔒 Race condition protection with optimistic locking
- ⚡ High performance with Redis pipelines

## Installation

\`\`\`bash
npm install
\`\`\`

## Setup Redis

Make sure you have Redis running:

\`\`\`bash

# Using Docker

docker run -d -p 6379:6379 redis:latest

# Or install Redis locally

# macOS: brew install redis && brew services start redis

# Ubuntu: sudo apt-get install redis-server

\`\`\`

## Usage

\`\`\`typescript
import RedisTableAdapter from './RedisTableAdapter';

const adapter = new RedisTableAdapter('redis://localhost:6379');

// Create a table
await adapter.createTable('users', ['email', 'password', 'name']);

// Insert data
const userId = await adapter.insert('users', {
email: 'user@example.com',
password: 'hashed',
name: 'John Doe'
});

// Query data
const users = await adapter.findByField('users', 'email', 'user@example.com');
\`\`\`

## Scripts

- \`npm run dev\` - Run with hot reload
- \`npm run build\` - Build for production
- \`npm start\` - Run built version
- \`npm run example:auth\` - Run authentication example
- \`npm run example:ecommerce\` - Run e-commerce example
- \`npm run example:leaderboard\` - Run gaming leaderboard example

## Documentation

See the examples folder for detailed use cases.
