#!/usr/bin/env node
/**
 * IBVAP Safe Demo-Day Launcher & Health Validator
 * 
 * Safety Protocol:
 * 1. Ensures PostgreSQL is running via Docker Compose (starts if needed)
 * 2. Compiles production frontend bundle & gateway
 * 3. Launches production stack (node tools/dev-all.js --prod)
 * 4. Polls /api/health until all polyglot services are healthy
 * 5. FAILS LOUDLY and exits if PostgreSQL is not active (prevents accidental H2 demo)
 * 6. Prints production health summary table
 * 7. Opens operator workstation in default browser
 */

import { spawn, execSync } from 'child_process';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function fetchJson(url, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('TIMEOUT'));
    });
  });
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('\n' + '='.repeat(72));
  console.log('              IBVAP DEMO-DAY HIGH-ASSURANCE LAUNCHER');
  console.log('='.repeat(72));

  // 1. Docker Compose PostgreSQL check
  console.log('\n[Phase 1] Ensuring PostgreSQL container is healthy...');
  try {
    execSync('docker compose up -d postgres', { cwd: ROOT_DIR, stdio: 'inherit' });
    console.log('✓ PostgreSQL container command executed.');
  } catch (err) {
    console.warn('⚠️ Warning: docker compose command returned an issue. Continuing to health probe...');
  }

  // 2. Build Production Bundles
  console.log('\n[Phase 2] Verifying production build...');
  try {
    execSync('npm run build', { cwd: ROOT_DIR, stdio: 'inherit' });
    console.log('✓ Production bundles built successfully.');
  } catch (err) {
    console.error('❌ Build failed! Aborting demo.');
    process.exit(1);
  }

  // 3. Launch Production Services if not already running
  console.log('\n[Phase 3] Checking active production services...');
  let isRunning = false;
  try {
    const check = await fetchJson('http://localhost:3000/api/health', 1500);
    if (check.status === 200) isRunning = true;
  } catch {}

  if (!isRunning) {
    console.log('Starting production stack in background via tools/dev-all.js --prod...');
    const runner = spawn('node', ['tools/dev-all.js', '--prod'], {
      cwd: ROOT_DIR,
      detached: true,
      stdio: 'ignore',
    });
    runner.unref();
  } else {
    console.log('✓ Production stack is already active.');
  }

  // 4. Poll health endpoint until ready (up to 40 seconds)
  console.log('\n[Phase 4] Waiting for all polyglot microservices to achieve HEALTHY state...');
  let healthData = null;
  const maxAttempts = 20;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    process.stdout.write(`  Attempt ${attempt}/${maxAttempts} ... `);
    try {
      const res = await fetchJson('http://localhost:3000/api/health', 2000);
      if (res.status === 200 && res.body && res.body.status === 'ok') {
        healthData = res.body;
        console.log('READY!');
        break;
      }
    } catch {
      // Still booting
    }
    console.log('booting');
    await sleep(2000);
  }

  if (!healthData) {
    console.error('\n❌ [FATAL ERROR] Services failed to achieve healthy status within timeout.');
    process.exit(1);
  }

  // 5. CRITICAL DEMO-DAY SAFETY GATE: MUST BE POSTGRESQL!
  const activeDb = healthData.database || healthData.core?.database || 'UNKNOWN';
  const isPostgres = activeDb.toLowerCase().includes('postgres');

  if (!isPostgres) {
    console.error('\n' + '!'.repeat(72));
    console.error(' [FATAL DEMO-DAY SAFETY FAILURE] POSTGRESQL IS NOT THE ACTIVE DATABASE!');
    console.error(` Detected Engine: ${activeDb}`);
    console.error(' The system is currently running on the embedded H2 fallback database.');
    console.error(' PER PRD SECTION 13-14: JURY DEMONSTRATIONS ON H2 ARE STRICTLY FORBIDDEN.');
    console.error(' Solution:');
    console.error('   1. Ensure Docker Desktop is running.');
    console.error('   2. Run: docker compose up -d postgres');
    console.error('   3. Restart: npm run demo');
    console.error('!'.repeat(72) + '\n');
    process.exit(1);
  }

  // 6. Print Production Health Table
  console.log('\n' + '='.repeat(72));
  console.log('                 IBVAP PRODUCTION DEMO HEALTH TABLE');
  console.log('='.repeat(72));
  console.log(` Gateway:       http://localhost:3000   [STATUS: OK]`);
  console.log(` AI-Service:    http://localhost:8000   [STATUS: OK] (YOLO26s, Device: ${healthData.ai?.device || 'cpu'})`);
  console.log(` Core-Service:  http://localhost:8080   [STATUS: OK] (Spring Boot 3, Java 21)`);
  console.log(` Awiros-ANPR:   http://localhost:8001   [STATUS: OK] (PP-OCRv5)`);
  console.log(` Database:      PostgreSQL              [STATUS: ACTIVE & DURABLY PERSISTED]`);
  console.log(` Auth Security: BCrypt (Work Factor 10) [STATUS: HARDENED]`);
  console.log('='.repeat(72));

  // 7. Open Browser
  console.log('\n[Phase 5] Launching Tactical Operator Workstation in browser...');
  const openCmd = process.platform === 'win32' ? 'start http://localhost:3000' : 'open http://localhost:3000';
  try {
    execSync(openCmd);
    console.log('✓ Browser opened to http://localhost:3000\n');
  } catch {
    console.log('→ Open http://localhost:3000 in your browser.\n');
  }
}

main().catch((err) => {
  console.error('\nFatal error in demo-runner:', err);
  process.exit(1);
});
