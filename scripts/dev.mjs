import { spawn } from 'node:child_process';

const env = { ...process.env, ...(process.argv.includes('--idbi-sandbox') ? { IDBI_LIVE_SANDBOX: 'true' } : {}) };

const children = [
  spawn(process.execPath, ['server/index.mjs'], { stdio: 'inherit', env }),
  spawn(process.platform === 'win32' ? 'node_modules\\.bin\\vite.cmd' : 'node_modules/.bin/vite', [], { stdio: 'inherit', env }),
];

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach((child) => child.kill('SIGTERM'));
  setTimeout(() => process.exit(code), 50);
}

children.forEach((child) => child.on('exit', (code) => { if (!stopping && code) stop(code); }));
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
