import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import postgres from 'postgres';

const targetUrl = new URL(
  process.env.DATABASE_URL_TEST ??
    'postgresql://luxledger:luxledger@127.0.0.1:5433/luxledger_demo_test',
);
const databaseName = targetUrl.pathname.slice(1) || 'luxledger_demo_test';
if (databaseName !== 'luxledger_demo_test') {
  throw new Error('DATABASE_URL_TEST must target the dedicated luxledger_demo_test database');
}

const run = (command, args, env = process.env) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} failed (${signal ?? code})`));
    });
  });

const databaseServerIsAvailable = () =>
  new Promise((resolve) => {
    const socket = connect(Number(targetUrl.port || 5432), targetUrl.hostname);
    socket.setTimeout(500);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => resolve(false));
  });

if (!(await databaseServerIsAvailable())) {
  await run('docker', ['compose', 'up', '-d', 'postgres_test']);
}

const adminUrl = new URL(targetUrl);
adminUrl.pathname = '/postgres';
const sql = postgres(adminUrl.toString(), { max: 1 });
try {
  await sql.unsafe(`drop database if exists ${databaseName} with (force)`);
  await sql.unsafe(`create database ${databaseName}`);
} finally {
  await sql.end({ timeout: 5 });
}

await run('npm', ['run', 'db:migrate'], { ...process.env, DATABASE_URL: targetUrl.toString() });
console.log(`Prepared ${databaseName}`);
