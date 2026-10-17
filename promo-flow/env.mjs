import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let loaded = false;

function manualParseEnv(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8');
    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx > 0) {
        const key = line.slice(0, eqIdx).trim();
        let val = line.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (process.env[key] === undefined) {
          process.env[key] = val;
        }
      }
    }
  } catch {}
}

export function loadEnv() {
  if (loaded) return;
  loaded = true;

  const candidatePaths = [
    resolve(process.cwd(), '.env'),
    resolve(__dirname, '.env'),
    resolve(__dirname, '..', '.env'),
    resolve(process.cwd(), '.env.local'),
    resolve(__dirname, '.env.local'),
    resolve(__dirname, '..', '.env.local')
  ];

  const processed = new Set();
  for (const envPath of candidatePaths) {
    if (existsSync(envPath) && !processed.has(envPath)) {
      processed.add(envPath);
      if (typeof process.loadEnvFile === 'function') {
        try {
          process.loadEnvFile(envPath);
        } catch {
          manualParseEnv(envPath);
        }
      } else {
        manualParseEnv(envPath);
      }
    }
  }
}

// Auto-run on module import
loadEnv();
