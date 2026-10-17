import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Already stopped. */ }
  }
  process.exitCode = code;
}
function start(command, args) {
  const child = spawn(command, args, { stdio: 'inherit', detached: true });
  children.push(child);
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => { if (!stopping) stop(code || 0); });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

// Match the frontend's primary OCI service and Supabase fallback.
if (existsSync('.env.server')) start('npm', ['run', 'ai-server']);
if (existsSync('supabase/.env.functions')) {
  start('npx', ['supabase', 'functions', 'serve', 'analyze-food', '--env-file', 'supabase/.env.functions', '--no-verify-jwt']);
  // The function verifies the bearer token with auth.getUser itself. This also supports local asymmetric JWTs.
} else if (!existsSync('.env.server')) {
  console.warn('Photo AI is not configured. Add GEMINI_API_KEY to supabase/.env.functions. Manual donations remain available.');
}
start('npm', ['run', 'dev', '--', '--host', '127.0.0.1']);
