import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { migrationHistoryMatches, npmExecutable } from './migration-history.mjs';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error('DATABASE_URL is required');
}

const journal = JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8'));
const expectedHashes = await Promise.all(
  journal.entries.map(async ({ tag }) =>
    createHash('sha256').update(await readFile(`drizzle/${tag}.sql`)).digest('hex'),
  ),
);

const sql = postgres(databaseUrl, { max: 1 });
try {
  const [migrationTable] = await sql`
    select to_regclass('drizzle.__drizzle_migrations') is not null as exists
  `;
  if (migrationTable?.exists) {
    const applied = await sql`
      select hash from drizzle.__drizzle_migrations order by created_at, id
    `;
    const historyMatches = migrationHistoryMatches(
      applied.map(({ hash }) => hash),
      expectedHashes,
    );
    if (!historyMatches) {
      throw new Error(
        'Incompatible demo migration history detected. For the disposable local demo, run ' +
          '`docker compose down -v`, start PostgreSQL again, and rerun db:migrate:local.',
      );
    }
  }
} finally {
  await sql.end({ timeout: 5 });
}

const child = spawn(
  npmExecutable(),
  ['run', 'db:migrate'],
  { env: process.env, stdio: 'inherit' },
);

const exitCode = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', (code, signal) => {
    if (signal !== null) reject(new Error(`drizzle-kit terminated by ${signal}`));
    else resolve(code ?? 1);
  });
});

if (exitCode !== 0) {
  throw new Error(`npm run db:migrate failed with exit code ${exitCode}`);
}
