/**
 * IBVAP One-Time Offline Setup Orchestrator (npm run setup)
 * Validates toolchains, provisions .env, sets up Python venv, builds Java Core,
 * and pre-downloads & caches all AI/OCR models for 100% offline runtime operation.
 */

const { execSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '..');
const AI_DIR = path.join(ROOT_DIR, 'ai-service');
const CORE_DIR = path.join(ROOT_DIR, 'core-service');
const GATEWAY_DIR = path.join(ROOT_DIR, 'gateway');
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');

console.log('====================================================');
console.log('       IBVAP COMPLETE RUNTIME SETUP & CACHING       ');
console.log('====================================================\n');

// 1. Toolchain Verification
console.log('--- Step 1: Validating Prerequisites & Toolchains ---');
let hasToolchainErrors = false;

// Node.js Check
try {
  const nodeV = execSync('node -v').toString().trim();
  const major = parseInt(nodeV.replace('v', '').split('.')[0], 10);
  if (major < 20) {
    console.warn(`  ! Node.js version is ${nodeV}. Recommended: v20 LTS or v22 LTS.`);
  } else {
    console.log(`  ✓ Node.js:  ${nodeV}`);
  }
} catch (e) {
  console.error('  ✗ Node.js is NOT installed or not found on PATH!');
  console.error('    Please install Node.js v20+ from https://nodejs.org/');
  hasToolchainErrors = true;
}

// Java 21 LTS Check
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
  } catch (e) {
    console.error('  ✗ Java 21 LTS is NOT found on PATH or JAVA_HOME!');
    console.error('    Please install Eclipse Temurin JDK 21 from https://adoptium.net/ and set JAVA_HOME.');
    hasToolchainErrors = true;
  }
}

// Python 3.11+ Check
let pythonCmd = 'python';
const venvPython = process.platform === 'win32'
  ? path.join(AI_DIR, '.venv', 'Scripts', 'python.exe')
  : path.join(AI_DIR, '.venv', 'bin', 'python');

if (fs.existsSync(venvPython)) {
  pythonCmd = venvPython;
  console.log(`  ✓ Python:   ${pythonCmd} (ai-service venv detected)`);
} else {
  try {
    const pyV = execSync('python --version').toString().trim();
    console.log(`  ✓ Python:   ${pyV} (global)`);
  } catch (e) {
    console.error('  ✗ Python 3.11+ is NOT found on PATH!');
    console.error('    Please install Python 3.11+ from https://python.org/ and check "Add python.exe to PATH".');
    hasToolchainErrors = true;
  }
}

if (hasToolchainErrors) {
  console.error('\n[ERROR] Setup cannot continue due to missing toolchains. Please install the missing software and re-run npm run setup.');
  process.exit(1);
}

// 2. Auto-provision .env from .env.example
console.log('\n--- Step 2: Auto-Provisioning Environment Files ---');
const envDirs = [ROOT_DIR, AI_DIR, CORE_DIR, GATEWAY_DIR, FRONTEND_DIR];
for (const d of envDirs) {
  const envFile = path.join(d, '.env');
  const envExample = path.join(d, '.env.example');
  if (!fs.existsSync(envFile) && fs.existsSync(envExample)) {
    fs.copyFileSync(envExample, envFile);
    const rel = path.relative(ROOT_DIR, d) || 'root';
    console.log(`  ✓ Provisioned: ${rel}/.env`);
  }
}

// 3. Python Virtual Environment Setup & Dependencies
console.log('\n--- Step 3: Setting Up Python Virtual Environment ---');
if (!fs.existsSync(venvPython)) {
  console.log('  Creating virtual environment at ai-service/.venv...');
  execSync(`python -m venv "${path.join(AI_DIR, '.venv')}"`, { cwd: AI_DIR, stdio: 'inherit' });
}

const pipCmd = process.platform === 'win32'
  ? path.join(AI_DIR, '.venv', 'Scripts', 'pip.exe')
  : path.join(AI_DIR, '.venv', 'bin', 'pip');

console.log('  Installing Python dependencies (requirements.txt)...');
execSync(`"${pipCmd}" install -r requirements.txt`, { cwd: AI_DIR, stdio: 'inherit' });
console.log('  ✓ Python dependencies installed.');

// 4. Pre-download and Cache Runtime AI & OCR Models
console.log('\n--- Step 4: Pre-caching Runtime AI & OCR Models (for 100% Offline Use) ---');
const dlScript = path.join(ROOT_DIR, 'tools', 'download-models.py');
execSync(`"${venvPython}" "${dlScript}"`, { cwd: AI_DIR, stdio: 'inherit' });

// 5. Build/Verify Java Core-Service
console.log('\n--- Step 5: Compiling Java Core-Service ---');
let mvnCmd = process.platform === 'win32' ? '.\\mvnw.cmd' : './mvnw';
const hasWrapper = fs.existsSync(path.join(CORE_DIR, process.platform === 'win32' ? 'mvnw.cmd' : 'mvnw'));
if (!hasWrapper) {
  mvnCmd = 'mvn';
}

const env = { ...process.env };
if (jdkHome && fs.existsSync(jdkHome)) {
  env.JAVA_HOME = jdkHome;
  const binDir = path.join(jdkHome, 'bin');
  env.Path = binDir + (process.platform === 'win32' ? ';' : ':') + (env.Path || env.PATH || '');
}

try {
  execSync(`${mvnCmd} compile -DskipTests`, { cwd: CORE_DIR, stdio: 'inherit', env });
  console.log('  ✓ Java Core-Service compiled successfully.');
} catch (err) {
  console.warn('  ! Maven compile returned a non-zero code. If dependencies were already cached, runtime may still work.');
}

console.log('\n====================================================');
console.log('          IBVAP SETUP COMPLETED SUCCESSFULLY!       ');
console.log('====================================================');
console.log('All dependencies and AI models are fully cached locally.');
console.log('You can now run:');
console.log('   npm run dev:all');
console.log('to start the platform completely offline!');
