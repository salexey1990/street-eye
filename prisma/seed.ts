import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  // Seed tasks
  const existingTaskCount = await prisma.task.count();
  if (existingTaskCount === 0) {
    const tasks = JSON.parse(fs.readFileSync(path.join(__dirname, 'tasks.seed.json'), 'utf-8'));
    const result = await prisma.task.createMany({ data: tasks });
    console.log(`Seeded ${result.count} tasks.`);
  } else {
    console.log(`Tasks table already has ${existingTaskCount} records, skipping.`);
  }

  // Seed badges (upsert — safe to run multiple times)
  const badges = JSON.parse(fs.readFileSync(path.join(__dirname, 'badges.seed.json'), 'utf-8'));
  for (const badge of badges) {
    await prisma.badge.upsert({
      where: { key: badge.key },
      update: { name: badge.name, description: badge.description },
      create: badge,
    });
  }
  console.log(`Seeded ${badges.length} badges.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
