import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

let isDbOnline = false;
let lastCheckTime = 0;

export function isDatabaseAvailable() {
  return isDbOnline;
}

export function setDatabaseAvailable(status) {
  isDbOnline = Boolean(status);
  lastCheckTime = Date.now();
}

export async function checkDatabaseConnection(force = false) {
  const now = Date.now();
  if (!force && now - lastCheckTime < 30000) {
    return isDbOnline;
  }
  lastCheckTime = now;
  try {
    await prisma.$queryRaw`SELECT 1`;
    isDbOnline = true;
  } catch {
    isDbOnline = false;
  }
  return isDbOnline;
}
