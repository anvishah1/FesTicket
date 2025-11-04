// src/db.js
import { PrismaClient } from '../generated/prisma/default.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: './.env' });

// Initialize Prisma client
const prisma = new PrismaClient();

async function main() {
  try {
    console.log('🔄 Connecting to database...');
    await prisma.$connect();
    console.log('✅ Connected to Neon PostgreSQL');

    // Example: create a test post (only works if your schema has a "Post" model)
    const newPost = await prisma.post.create({
      data: {
        title: "Hello World",
        content: "This is a test post",
        authorId: 1, // make sure this matches your schema
      },
    });

    console.log('✅ New post created:', newPost);
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
