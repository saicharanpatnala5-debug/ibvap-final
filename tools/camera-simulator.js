/**
 * IBVAP Camera Stream & Telemetry Simulator
 * Generates synthetic camera streams, moving target trajectories,
 * zone-breach incidents, and ANPR plate readings for testing and demonstrations.
 *
 * Usage:
 *   node tools/camera-simulator.js [--url http://localhost:3000] [--cameras 3] [--interval 2000]
 */

const http = require('http');
const https = require('https');

const args = process.argv.slice(2);
function getArg(name, defaultValue) {
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return defaultValue;
}

const GATEWAY_URL = getArg('url', 'http://localhost:3000');
const NUM_CAMERAS = parseInt(getArg('cameras', '3'), 10);
const INTERVAL_MS = parseInt(getArg('interval', '2500'), 10);

console.log('====================================================');
console.log('       IBVAP SURVEILLANCE CAMERA SIMULATOR          ');
console.log('====================================================');
console.log(`Target Gateway:   ${GATEWAY_URL}`);
console.log(`Simulated Nodes:  ${NUM_CAMERAS}`);
console.log(`Event Frequency:  Every ${INTERVAL_MS}ms`);
console.log('Press Ctrl+C to terminate simulation.\n');

const CAMERA_PROFILES = [
  { id: 'cam-sim-north', name: 'Sector 4 North Perimeter Checkpoint', location: 'Gate 01-N' },
  { id: 'cam-sim-east', name: 'East Border Highway Portal', location: 'Toll 04-E' },
  { id: 'cam-sim-south', name: 'South River Crossing Node', location: 'Watchtower 08-S' },
  { id: 'cam-sim-west', name: 'Western Cargo Logistics Depot', location: 'Depot 12-W' },
];

const SAMPLE_PLATES = ['DL01AB1234', 'MH12CD5678', 'KA04E9999', '22BH1234AA', 'UP16BC9999'];
const SAMPLE_CLASSES = ['person', 'car', 'truck', 'motorcycle'];

let tick = 0;

function sendEvent(endpoint, payload) {
  const urlObj = new URL(`${GATEWAY_URL}${endpoint}`);
  const data = JSON.stringify(payload);
  const client = urlObj.protocol === 'https:' ? https : http;

  const req = client.request(
    urlObj,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
      timeout: 3000,
    },
    (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // Success
        } else {
          // Normal during gateway fallback / partial mock
        }
      });
    }
  );

  req.on('error', (_err) => {
    // Graceful silence on network drop
  });

  req.write(data);
  req.end();
}

function simulateTick() {
  tick++;
  const cam = CAMERA_PROFILES[tick % CAMERA_PROFILES.length];
  const objClass = SAMPLE_CLASSES[tick % SAMPLE_CLASSES.length];
  const isVehicle = objClass === 'car' || objClass === 'truck';
  const plate = isVehicle ? SAMPLE_PLATES[tick % SAMPLE_PLATES.length] : undefined;

  const eventPayload = {
    timestamp: Date.now(),
    cameraId: cam.id,
    cameraName: cam.name,
    location: cam.location,
    eventType: isVehicle ? 'Vehicle Boundary Telemetry' : 'Perimeter Entity Detection',
    entity: {
      id: 1000 + (tick % 50),
      class: objClass,
      confidence: 85 + Math.floor(Math.random() * 14),
      speed: `${12 + Math.floor(Math.random() * 25)} px/s`,
      direction: tick % 2 === 0 ? 'North-East' : 'Inbound',
      anprPlate: plate,
      bbox: {
        x: 0.2 + (Math.sin(tick * 0.2) * 0.2),
        y: 0.3 + (Math.cos(tick * 0.2) * 0.2),
        width: isVehicle ? 0.25 : 0.08,
        height: isVehicle ? 0.18 : 0.22,
      },
    },
  };

  console.log(
    `[T+${tick * (INTERVAL_MS / 1000)}s] [${cam.id}] Detected ${objClass.toUpperCase()}` +
    `${plate ? ` [Plate: ${plate}]` : ''} at ${cam.location}`
  );

  sendEvent('/api/core/events', eventPayload);
}

// Start simulation loop
setInterval(simulateTick, INTERVAL_MS);
simulateTick();
