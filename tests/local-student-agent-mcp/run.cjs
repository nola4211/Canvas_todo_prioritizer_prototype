'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const tests = __dirname;
const psqlDefault = 'C:/Program Files/PostgreSQL/18/bin/psql.exe';
const args = process.argv.slice(2);
let port = 55487;
let psql = psqlDefault;
let keepDatabase = false;
let confirmed = false;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--port' && args[i + 1]) port = Number(args[++i]);
  else if (args[i] === '--psql' && args[i + 1]) psql = args[++i];
  else if (args[i] === '--keep-db') keepDatabase = true;
  else if (args[i] === '--allow-loopback-test-database') confirmed = true;
  else throw new Error(`Unknown or incomplete option: ${args[i]}`);
}
assert.ok(confirmed, 'pass --allow-loopback-test-database to create one disposable database on 127.0.0.1');
assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535, '--port must be an explicit non-privileged local port');
assert.ok(path.isAbsolute(psql), '--psql must be an absolute local executable path');
assert.ok(fs.existsSync(psql), `psql executable not found: ${psql}`);

const database = `mcp_local_${crypto.randomBytes(8).toString('hex')}`;
assert.match(database, /^mcp_local_[0-9a-f]{16}$/i);
const node = process.execPath;
const connection = (name, extra = []) => ['-X', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', name, '-w', '-v', 'ON_ERROR_STOP=1', ...extra];
function psqlRun(name, extra = [], input) {
  const result = childProcess.spawnSync(psql, connection(name, extra), { encoding: 'utf8', input, windowsHide: true, shell: false });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || String(result.error)).slice(-6000));
  return result.stdout.trim();
}

let created = false;
let failed = false;
try {
  const version = Number(psqlRun('postgres', ['-qAt', '-c', 'SELECT current_setting(\'server_version_num\')::integer']));
  assert.ok(version >= 150000, `PostgreSQL 15 or later is required; received ${version}`);
  psqlRun('postgres', ['-c', `CREATE DATABASE ${database}`]);
  created = true;
  process.stdout.write(`Created disposable local database ${database} on 127.0.0.1:${port}.\n`);
  psqlRun(database, ['-f', path.join(tests, 'baseline.sql')]);
  psqlRun('postgres', ['-c', `ALTER DATABASE ${database} SET search_path=public,extensions`]);
  const migrations = fs.readdirSync(path.join(root, 'supabase', 'migrations')).filter(name => name.endsWith('.sql')).sort();
  assert.ok(migrations.some(name => name.includes('student_agent_mcp')), 'the MCP migration is missing');
  for (const migration of migrations) {
    process.stdout.write(`Applying ${migration}\n`);
    psqlRun(database, ['-f', path.join(root, 'supabase', 'migrations', migration)]);
  }
  const env = {
    ...process.env,
    MCP_LOCAL_TEST_DATABASE: database,
    MCP_LOCAL_TEST_PORT: String(port),
    MCP_LOCAL_TEST_PSQL: psql,
  };
  for (const script of ['verify.cjs', 'concurrency.cjs', 'cleanup.cjs', 'regression.cjs', 'agent-limits.cjs']) {
    process.stdout.write(`Running ${script}\n`);
    const result = childProcess.spawnSync(node, [path.join(tests, script)], { cwd: root, env, encoding: 'utf8', windowsHide: true, shell: false });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.status !== 0) throw new Error(`${script} failed with exit code ${result.status}`);
  }
  process.stdout.write('PASS: local synthetic PostgreSQL database acceptance checks.\n');
} catch (error) {
  failed = true;
  console.error(error.message || error);
} finally {
  if (created && !keepDatabase) {
    try {
      psqlRun('postgres', ['-c', `DROP DATABASE ${database}`]);
      process.stdout.write(`Removed disposable database ${database}.\n`);
    } catch (error) {
      failed = true;
      console.error(`Could not remove the disposable database ${database}; it remains for manual cleanup. ${error.message || error}`);
    }
  } else if (created && keepDatabase) {
    process.stdout.write(`Kept disposable database ${database} by request. Drop only this named database when finished.\n`);
  }
}
if (failed) process.exitCode = 1;
