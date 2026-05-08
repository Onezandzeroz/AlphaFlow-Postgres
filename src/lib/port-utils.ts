/**
 * Port Utility for Mini-Services
 * 
 * Provides automatic port selection for mini-services in the 3001-3009 range.
 * The main Next.js app uses port 3000 (required for Caddy gateway).
 * 
 * Usage in mini-services:
 *   import { findAvailablePort, PORT_RANGE } from '@/lib/port-utils';
 *   
 *   const port = await findAvailablePort();
 *   // Start your service on this port
 */

import * as net from 'net';

// Port range configuration (3000 reserved for main app)
export const PORT_RANGE = {
  START: 3001,
  END: 3009,
  MAIN_APP: 3000, // Reserved for Next.js main app
};

export interface PortInfo {
  port: number;
  available: boolean;
  pid?: number;
}

/**
 * Check if a specific port is available
 */
export async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.once('error', (err: NodeJS.ErrnoException) => {
      resolve(err.code !== 'EADDRINUSE');
    });
    
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    
    server.listen(port, '127.0.0.1');
  });
}

/**
 * Find the first available port in the mini-service range (3001-3009)
 */
export async function findAvailablePort(
  startPort: number = PORT_RANGE.START,
  endPort: number = PORT_RANGE.END
): Promise<number | null> {
  for (let port = startPort; port <= endPort; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  return null;
}

/**
 * Find an available port or throw an error
 */
export async function requireAvailablePort(
  serviceName: string = 'Mini-service'
): Promise<number> {
  const port = await findAvailablePort();
  
  if (port === null) {
    throw new Error(
      `${serviceName}: No available ports in range ${PORT_RANGE.START}-${PORT_RANGE.END}. ` +
      'Check for zombie processes or increase port range.'
    );
  }
  
  return port;
}

/**
 * Scan all ports in range and return their status
 */
export async function scanPorts(
  startPort: number = PORT_RANGE.MAIN_APP,
  endPort: number = PORT_RANGE.END
): Promise<PortInfo[]> {
  const results: PortInfo[] = [];
  
  for (let port = startPort; port <= endPort; port++) {
    const available = await isPortAvailable(port);
    results.push({ port, available });
  }
  
  return results;
}

/**
 * Print a formatted port status table (for CLI tools)
 */
export function printPortStatus(results: PortInfo[]): void {
  console.log('\n📊 Port Status:');
  console.log('┌────────┬────────────┬─────────────────────────────┐');
  console.log('│ Port   │ Status     │ Purpose                     │');
  console.log('├────────┼────────────┼─────────────────────────────┤');
  
  for (const result of results) {
    const status = result.available 
      ? '✅ Available' 
      : '❌ In Use';
    
    let purpose = '';
    if (result.port === PORT_RANGE.MAIN_APP) {
      purpose = 'Next.js Main App';
    } else if (result.available) {
      purpose = 'Mini-service available';
    } else {
      purpose = 'Mini-service running';
    }
    
    console.log(`│ ${result.port.toString().padEnd(6)} │ ${status.padEnd(10)} │ ${purpose.padEnd(27)} │`);
  }
  
  console.log('└────────┴────────────┴─────────────────────────────┘\n');
}

/**
 * Get port from environment or find available
 */
export async function getPortOrFindAvailable(
  envVar: string = 'PORT',
  preferredPort?: number
): Promise<number> {
  // Check environment variable first
  const envPort = process.env[envVar];
  if (envPort) {
    const port = parseInt(envPort, 10);
    if (!isNaN(port) && port >= 1 && port <= 65535) {
      if (await isPortAvailable(port)) {
        return port;
      }
      console.warn(`Port ${port} from ${envVar} is in use, finding alternative...`);
    }
  }
  
  // Check preferred port
  if (preferredPort !== undefined) {
    if (await isPortAvailable(preferredPort)) {
      return preferredPort;
    }
    console.warn(`Preferred port ${preferredPort} is in use, finding alternative...`);
  }
  
  // Find any available port in range
  const port = await findAvailablePort();
  
  if (port === null) {
    throw new Error(
      `No available ports in range ${PORT_RANGE.START}-${PORT_RANGE.END}`
    );
  }
  
  return port;
}
