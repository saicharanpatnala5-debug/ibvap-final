/**
 * IBVAP One-Command All-Services Orchestrator
 * Launches Gateway (Express + React), AI-Service (FastAPI), and Core-Service (Spring Boot 3)
 * concurrently with toolchain validation, auto-provisioning, health monitoring, and unified Ctrl+C teardown.
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '..');
const AI_DIR = path.join(ROOT_DIR, 'ai-service');
const AWIROS_DIR = path.join(ROOT_DIR, 'awiros-service');
const CORE_DIR = path.join(ROOT_DIR, 'core-service');
const GATEWAY_DIR = path.join(ROOT_DIR, 'gateway');
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');

console.log('====================================================');
console.log('      IBVAP POLYGLOT MULTI-SERVICE LAUNCHER        ');
console.log('====================================================');

// 0. Environment File Auto-Provisioning
function ensureEnvFiles() {
  const dirs = [ROOT_DIR, AI_DIR, CORE_DIR, GATEWAY_DIR, FRONTEND_DIR];
  for (const d of dirs) {
    const envFile = path.join(d, '.env');
    const envExample = path.join(d, '.env.example');
    if (!fs.existsSync(envFile) && fs.existsSync(envExample)) {
      fs.copyFileSync(envExample, envFile);
      const rel = path.relative(ROOT_DIR, d) || 'root';
      console.log(`[Env Auto-Setup] Copied .env.example -> .env (${rel})`);
    }
  }
}
ensureEnvFiles();

// 1. Toolchain verification
function checkToolchain() {
  console.log('[Toolchain Check]');
  try {
    const nodeV = execSync('node -v').toString().trim();
    console.log(`  ✓ Node.js:  ${nodeV}`);
  } catch {
    console.error('  ✗ Node.js is missing!');
  }

  // Python check
  let pythonCmd = 'python';
  const venvPython = process.platform === 'win32'
    ? path.join(AI_DIR, '.venv', 'Scripts', 'python.exe')
    : path.join(AI_DIR, '.venv', 'bin', 'python');

  if (fs.existsSync(venvPython)) {
    pythonCmd = venvPython;
    console.log(`  ✓ Python:   ${pythonCmd} (venv detected)`);
  } else {
    try {
      const pyV = execSync('python --version').toString().trim();
      console.log(`  ✓ Python:   ${pyV} (global)`);
      // Try to auto-create venv if missing
      try {
        console.log('[Setup] Creating ai-service/.venv from python...');
        execSync(`python -m venv "${path.join(AI_DIR, '.venv')}"`, { cwd: AI_DIR, stdio: 'inherit' });
        if (fs.existsSync(venvPython)) {
          pythonCmd = venvPython;
          const pipCmd = process.platform === 'win32'
            ? path.join(AI_DIR, '.venv', 'Scripts', 'pip.exe')
            : path.join(AI_DIR, '.venv', 'bin', 'pip');
          if (fs.existsSync(path.join(AI_DIR, 'requirements.txt'))) {
            console.log('[Setup] Installing requirements.txt into venv...');
            execSync(`"${pipCmd}" install -r requirements.txt`, { cwd: AI_DIR, stdio: 'inherit' });
          }
        }
      } catch (err) {
        console.warn('  ! Automatic venv initialization skipped: ' + err.message);
      }
    } catch {
      console.warn('  ! Python not found on global PATH. Ensure ai-service venv is configured.');
    }
  }

  // Java check
  let javaCmd = 'java';
  const jdkHome = process.env.JAVA_HOME || path.join(process.env.USERPROFILE || process.env.HOME || '', '.jdk', 'jdk-21.0.6+7');
  const jdkBinJava = path.join(jdkHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');

  if (fs.existsSync(jdkBinJava)) {
    javaCmd = jdkBinJava;
    console.log(`  ✓ Java 21:  ${javaCmd} (JDK 21 detected)`);
  } else {
    try {
      const javaV = execSync('java -version 2>&1').toString().split('\n')[0].trim();
      console.log(`  ✓ Java:     ${javaV}`);
    } catch {
      console.warn('  ! Java not found. Please install Java 21 or set JAVA_HOME.');
    }
  }

  console.log('====================================================\n');
  return { pythonCmd, javaCmd, jdkHome };
}

const { pythonCmd, javaCmd, jdkHome } = checkToolchain();
const childProcesses = [];

let isShuttingDown = false;

function startProcess(name, cmd, args, cwd, env = {}) {
  const isNpm = cmd === 'npm' || cmd === 'npm.cmd';
  const isCmdOrBat = typeof cmd === 'string' && (cmd.endsWith('.cmd') || cmd.endsWith('.bat'));
  const useShell = isNpm || isCmdOrBat;

  const p = spawn(cmd, args, {
    cwd,
    shell: useShell,
    env: { ...process.env, ...env },
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  p.stdout.on('data', (d) => {
    const lines = d.toString().split('\n').filter((l) => l.trim().length > 0);
    for (const line of lines) {
      console.log(`[${name}] ${line}`);
    }
  });

  p.stderr.on('data', (d) => {
    const lines = d.toString().split('\n').filter((l) => l.trim().length > 0);
    for (const line of lines) {
      console.error(`[${name} ERR] ${line}`);
    }
  });

  p.on('exit', (code) => {
    console.log(`[${name}] exited with code ${code}`);
    if (code !== 0 && !isShuttingDown) {
      console.log(`[Launcher] Auto-restarting crashed service ${name} in 1.5s...`);
      setTimeout(() => {
        if (!isShuttingDown) {
          startProcess(name, cmd, args, cwd, env);
        }
      }, 1500);
    }
  });

  childProcesses.push(p);
  return p;
}

// 2. Launch Services
console.log('Starting services in background...');

// Awiros ANPR-OCR Service (Port 8001)
const awirosPython = process.platform === 'win32'
  ? path.join(AWIROS_DIR, '.venv', 'Scripts', 'python.exe')
  : path.join(AWIROS_DIR, '.venv', 'bin', 'python');

if (fs.existsSync(awirosPython)) {
  startProcess('awiros-service', awirosPython, ['-m', 'uvicorn', 'main:app', '--host', '0.0.0.0', '--port', '8001'], AWIROS_DIR);
} else {
  console.log('[Launcher] Note: awiros-service venv not found; running with fallback OCR.');
}

// AI-Service (Port 8000)
const uvicornCmd = process.platform === 'win32'
  ? path.join(AI_DIR, '.venv', 'Scripts', 'uvicorn.exe')
  : path.join(AI_DIR, '.venv', 'bin', 'uvicorn');

if (fs.existsSync(uvicornCmd)) {
  startProcess('ai-service', uvicornCmd, ['app.main:app', '--host', '0.0.0.0', '--port', '8000'], AI_DIR);
} else {
  startProcess('ai-service', pythonCmd, ['-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', '8000'], AI_DIR);
}

// Core-Service (Port 8080)
const jarPath = path.join(CORE_DIR, 'target', 'core-service-0.1.0.jar');
const envForCore = {
  JAVA_HOME: jdkHome,
  PATH: `${path.join(jdkHome, 'bin')}${path.delimiter}${path.join(process.env.USERPROFILE || process.env.HOME || '', '.maven', 'apache-maven-3.9.9', 'bin')}${path.delimiter}${process.env.PATH}`,
};

if (fs.existsSync(jarPath)) {
  startProcess('core-service', javaCmd, ['-jar', jarPath, '--server.port=8080'], CORE_DIR, envForCore);
} else {
  const mvnwCmd = process.platform === 'win32' ? '.\\mvnw.cmd' : './mvnw';
  startProcess('core-service', mvnwCmd, ['spring-boot:run'], CORE_DIR, envForCore);
}

// Gateway + Frontend (Port 3000)
const isProduction = process.argv.includes('--prod') || process.env.NODE_ENV === 'production';
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
if (isProduction) {
  console.log('[Launcher] Starting Gateway in PRODUCTION mode (serving pre-built frontend/dist)');
  const gatewayDist = path.join(GATEWAY_DIR, 'dist', 'server.js');
  if (fs.existsSync(gatewayDist)) {
    startProcess('gateway', 'node', [gatewayDist], GATEWAY_DIR, { NODE_ENV: 'production' });
  } else {
    startProcess('gateway', npmCmd, ['--workspace=gateway', 'run', 'start'], ROOT_DIR, { NODE_ENV: 'production' });
  }
} else {
  startProcess('gateway', npmCmd, ['--workspace=gateway', 'run', 'dev'], ROOT_DIR);
}

// Health readiness checker: waits until gateway (3000), ai-service (8000), and core-service (8080) are healthy
const http = require('http');

function checkHttp(url, timeoutMs = 800) {
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const req = http.get({
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        timeout: timeoutMs,
      }, (res) => {
        resolve(res.statusCode >= 200 && res.statusCode < 400);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
    } catch {
      resolve(false);
    }
  });
}

async function waitForAllServicesReady() {
  const startTime = Date.now();
  const maxWaitMs = 60000;
  let printed = false;

  while (Date.now() - startTime < maxWaitMs && !printed) {
    const [gatewayReady, aiReady, coreReady] = await Promise.all([
      checkHttp('http://127.0.0.1:3000/api/health'),
      checkHttp('http://127.0.0.1:8000/health'),
      checkHttp('http://127.0.0.1:8080/api/cameras'),
    ]);

    if (gatewayReady && aiReady && coreReady) {
      console.log('\n====================================================');
      console.log('All services ready: http://localhost:3000');
      console.log('  ✓ Gateway:       http://localhost:3000');
      console.log('  ✓ AI-Service:    http://localhost:8000');
      console.log('  ✓ Core-Service:  http://localhost:8080');
      console.log('====================================================\n');
      printed = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (!printed) {
    console.log('\n[Launcher] Note: Services still initializing in background. Check individual logs.');
  }
}

waitForAllServicesReady();

// Teardown handler
function cleanup() {
  isShuttingDown = true;
  console.log('\nTerminating all services gracefully...');
  for (const p of childProcesses) {
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /pid ${p.pid} /T /F 2>nul`);
      } else {
        p.kill('SIGINT');
      }
    } catch {
      // ignore
    }
  }
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
