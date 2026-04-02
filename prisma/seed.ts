import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  const existingCount = await prisma.task.count();
  if (existingCount > 0) {
    console.log(`Tasks table already has ${existingCount} records, skipping seed.`);
    return;
  }

  const tasksPath = path.join(__dirname, 'tasks.seed.json');
  const tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf-8'));

  const result = await prisma.task.createMany({ data: tasks });
  console.log(`Seeded ${result.count} tasks.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
