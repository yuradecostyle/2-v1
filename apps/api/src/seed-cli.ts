import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { createDatabase, seedDemoData } from '@bas-alt/core';

const dataDir = process.env.PGLITE_DATA_DIR ?? path.resolve(process.cwd(), '../../data/pglite');
mkdirSync(dataDir, { recursive: true });

const handle = await createDatabase({
  databaseUrl: process.env.DATABASE_URL,
  dataDir: process.env.DATABASE_URL ? undefined : dataDir,
});

const res = await seedDemoData(handle.db);
console.log('Seed result:', res);
await handle.close();
