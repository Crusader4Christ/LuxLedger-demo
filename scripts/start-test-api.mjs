import { spawn } from 'node:child_process';

const child = spawn('npm', ['run', 'start'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL_TEST ??
      'postgresql://luxledger:luxledger@127.0.0.1:5433/luxledger_demo_test',
    PORT: '3100',
    NODE_ENV: 'test',
    BOOTSTRAP_TENANT_NAME: 'LL-82 browser tenant',
    BOOTSTRAP_ADMIN_KEY_NAME: 'LL-82 browser key',
    BOOTSTRAP_ADMIN_API_KEY: 'll_ll82_browser_admin_key',
    JWT_SIGNING_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY',
  },
});

const forward = (signal) => child.kill(signal);
process.once('SIGINT', () => forward('SIGINT'));
process.once('SIGTERM', () => forward('SIGTERM'));
child.once('exit', (code) => { process.exitCode = code ?? 1; });
