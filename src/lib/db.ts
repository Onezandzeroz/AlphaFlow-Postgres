/**
 * Database client for PostgreSQL (Neon)
 *
 * Uses DATABASE_URL environment variable for the connection string.
 * Prisma schema defines: url = env("DATABASE_URL")
 */

import { PrismaClient } from '@prisma/client'

// Singleton pattern for development (prevents multiple connections)
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
