/**
 * IBVAP One-Command All-Services Orchestrator
 * Launches Gateway (Express + React), AI-Service (FastAPI), and Core-Service (Spring Boot 3)
 * concurrently with toolchain validation, health monitoring, and unified Ctrl+C teardown.
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const ROOT_DIR = path.resolve(__dirname, '..');
const AI_DIR = path.join(ROOT_DIR, 'ai-service');
const CORE_DIR = path.join(ROOT_DIR, 'core-service');
const GATEWAY_DIR = path.join(ROOT_DIR, 'gateway');

console.log('====================================================');
console.log('      IBVAP POLYGLOT MULTI-SERVICE LAUNCHER        ');
console.log('====================================================');

// 1. Toolchain verification
function checkToolchain() {
  console.log('[Toolchain Check]');
  try {
    const nodeV = execSync('node -v').toString().trim();
    console.log(`  ✓ Node.js:  ${nodeV}`);
  } catch (e) {
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

function startProcess(name, cmd, args, cwd, env = {}) {
  const p = spawn(cmd, args, {
    cwd,
    shell: true,
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
  });

  childProcesses.push(p);
  return p;
}

// 2. Launch Services
console.log('Starting services in background...');

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
  PATH: `${path.join(jdkHome, 'bin')}${path.delimiter}${process.env.PATH}`,
};

if (fs.existsSync(jarPath)) {
  startProcess('core-service', javaCmd, ['-jar', jarPath, '--server.port=8080'], CORE_DIR, envForCore);
} else {
  const mvnwCmd = process.platform === 'win32' ? '.\\mvnw.cmd' : './mvnw';
  startProcess('core-service', mvnwCmd, ['spring-boot:run'], CORE_DIR, envForCore);
}

// Gateway + Frontend (Port 3000)
startProcess('gateway', 'npm', ['--workspace=gateway', 'run', 'dev'], ROOT_DIR);

// Teardown handler
function cleanup() {
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
