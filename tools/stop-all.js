/**
 * IBVAP One-Command All-Services Stop Script (npm run stop)
 * Cleanly terminates all services running on Ports 3000 (Gateway), 8000 (AI-Service), and 8080 (Core-Service).
 */

const { execSync } = require('child_process');

console.log('====================================================');
console.log('       STOPPING ALL RUNNING IBVAP SERVICES          ');
console.log('====================================================\n');

const ports = [3000, 8000, 8001, 8080];

if (process.platform === 'win32') {
  for (const port of ports) {
    try {
      const output = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: 'utf8' }).trim();
      const lines = output.split('\n').filter(Boolean);
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0') {
          console.log(`Killing process on port ${port} (PID: ${pid})...`);
          try {
            execSync(`taskkill /F /PID ${pid} 2>nul`);
            console.log(`  ✓ Port ${port} (PID ${pid}) stopped.`);
          } catch {
            // Process may already have terminated
          }
        }
      }
    } catch {
      // Port not in use, skip
    }
  }
} else {
  for (const port of ports) {
    try {
      execSync(`lsof -ti :${port} | xargs kill -9 2>/dev/null`);
      console.log(`  ✓ Port ${port} stopped.`);
    } catch {
      // Port not in use
    }
  }
}

console.log('\nAll IBVAP services stopped.');
