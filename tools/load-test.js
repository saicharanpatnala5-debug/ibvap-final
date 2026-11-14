/**
 * IBVAP Service Load & Stress Tester
 * Benchmarks HTTP latency, throughput (RPS), and error rates across the
 * Gateway, AI-Service, and Core-Service endpoints under concurrent load.
 *
 * Usage:
 *   node tools/load-test.js [--url http://localhost:3000] [--requests 100] [--concurrency 10]
 */

const http = require('http');
const https = require('https');

const args = process.argv.slice(2);
function getArg(name, defaultValue) {
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return defaultValue;
}

const TARGET_URL = getArg('url', 'http://localhost:3000');
const TOTAL_REQUESTS = parseInt(getArg('requests', '100'), 10);
const CONCURRENCY = parseInt(getArg('concurrency', '10'), 10);
const ENDPOINT = getArg('endpoint', '/api/health');

console.log('====================================================');
console.log('         IBVAP HTTP SERVICE LOAD TESTER             ');
console.log('====================================================');
console.log(`Target:       ${TARGET_URL}${ENDPOINT}`);
console.log(`Requests:     ${TOTAL_REQUESTS}`);
console.log(`Concurrency:  ${CONCURRENCY}`);
console.log('Executing benchmark...\n');

const latencies = [];
let completed = 0;
let failed = 0;
let inFlight = 0;
let requestIndex = 0;
const startTime = Date.now();

function executeSingleRequest() {
  if (requestIndex >= TOTAL_REQUESTS) return;
  requestIndex++;

  const reqStart = Date.now();
  const urlObj = new URL(`${TARGET_URL}${ENDPOINT}`);
  const client = urlObj.protocol === 'https:' ? https : http;

  const req = client.request(
    urlObj,
    { method: 'GET', timeout: 5000 },
    (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        const elapsed = Date.now() - reqStart;
        latencies.push(elapsed);
        if (res.statusCode >= 200 && res.statusCode < 400) {
          completed++;
        } else {
          failed++;
        }
        onRequestDone();
      });
    }
  );

  req.on('error', (_err) => {
    failed++;
    onRequestDone();
  });

  req.end();
}

function onRequestDone() {
  inFlight--;
  if (completed + failed >= TOTAL_REQUESTS) {
    printSummary();
  } else {
    while (inFlight < CONCURRENCY && requestIndex < TOTAL_REQUESTS) {
      inFlight++;
      executeSingleRequest();
    }
  }
}

function printSummary() {
  const totalDurationSec = (Date.now() - startTime) / 1000;
  const rps = (completed / totalDurationSec).toFixed(1);

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
  const avg = (latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1)).toFixed(1);

  console.log('----------------------------------------------------');
  console.log('                BENCHMARK RESULTS                   ');
  console.log('----------------------------------------------------');
  console.log(`Total Requests:    ${TOTAL_REQUESTS}`);
  console.log(`Successful (2xx):  ${completed}`);
  console.log(`Failed / Errors:   ${failed}`);
  console.log(`Duration:          ${totalDurationSec.toFixed(2)}s`);
  console.log(`Throughput:        ${rps} req/sec`);
  console.log(`Average Latency:   ${avg} ms`);
  console.log(`Latency p50:       ${p50} ms`);
  console.log(`Latency p95:       ${p95} ms`);
  console.log(`Latency p99:       ${p99} ms`);
  console.log('====================================================\n');
}

// Initial worker pool spawn
for (let i = 0; i < CONCURRENCY && i < TOTAL_REQUESTS; i++) {
  inFlight++;
  executeSingleRequest();
}
