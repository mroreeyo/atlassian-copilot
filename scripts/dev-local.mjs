import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';

const defaultBrokerPort = 8787;
const defaultWebPorts = [5173, 5174, 5180, 5181, 5182, 5183, 5184, 5185];
const defaultBrokerPorts = [8787, 8788, 8789, 8790, 8791, 8792];
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const isWsl = Boolean(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP);
const children = [];
let shuttingDown = false;

function parsePort(value, fallback, label) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`${label} must be a TCP port number, received "${value}".`);
  }
  return parsed;
}

function withPreferredPort(preferred, candidates) {
  return [preferred, ...candidates.filter((candidate) => candidate !== preferred)];
}

function canBindPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen({ host: '0.0.0.0', port }, () => {
      server.close(() => resolve(true));
    });
  });
}

function windowsHasListener(port) {
  if (!isWsl) return false;
  const result = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `$listener = netstat -ano | Select-String ':${port}\\s+.*LISTENING'; if ($listener) { exit 1 } else { exit 0 }`
    ],
    { stdio: 'ignore' }
  );
  return result.status === 1;
}

async function isFreeForBrowser(port) {
  return (await canBindPort(port)) && !windowsHasListener(port);
}

async function brokerStatusOk(port) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1000);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/settings/status`, { signal: controller.signal });
    if (!response.ok) return false;
    const payload = await response.json();
    return typeof payload?.mode === 'string' && typeof payload?.sandboxWriteEnabled === 'boolean';
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function chooseBrokerPort() {
  const requested = parsePort(process.env.BROKER_PORT ?? process.env.PORT, defaultBrokerPort, 'BROKER_PORT');
  for (const port of withPreferredPort(requested, defaultBrokerPorts)) {
    if (await brokerStatusOk(port)) return { port, reuse: true };
    if (await isFreeForBrowser(port)) return { port, reuse: false };
  }
  throw new Error(`No browser-reachable Broker port available. Tried: ${withPreferredPort(requested, defaultBrokerPorts).join(', ')}`);
}

async function chooseWebPort() {
  const requested = parsePort(process.env.WEB_PORT ?? process.env.VITE_DEV_PORT, defaultWebPorts[0], 'WEB_PORT');
  const candidates = process.env.WEB_PORT || process.env.VITE_DEV_PORT
    ? [requested]
    : withPreferredPort(requested, defaultWebPorts);
  for (const port of candidates) {
    if (await isFreeForBrowser(port)) return port;
  }
  throw new Error(`No browser-reachable Web port available. Tried: ${candidates.join(', ')}`);
}

function startProcess(label, args, env) {
  const child = spawn(npmCommand, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: 'inherit'
  });
  children.push(child);
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.error(`[dev] ${label} exited (${signal ?? code ?? 0}); stopping local dev.`);
    shutdown(code ?? 1);
  });
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 300).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

try {
  const broker = await chooseBrokerPort();
  const webPort = await chooseWebPort();
  const brokerTarget = `http://localhost:${broker.port}`;

  console.info('[dev] AX Knowledge Copilot local dev');
  console.info(`[dev] Web URL:    http://localhost:${webPort}/copilot`);
  console.info(`[dev] Broker URL: ${brokerTarget}`);
  if (isWsl) {
    console.info('[dev] WSL detected: selected a port that is free on both WSL and Windows localhost.');
  }

  if (!broker.reuse) {
    startProcess('broker', ['run', 'dev', '-w', '@akc/broker'], { HOST: '0.0.0.0', PORT: String(broker.port) });
  } else {
    console.info(`[dev] Reusing existing AX Broker on ${brokerTarget}.`);
  }

  startProcess(
    'web',
    ['run', 'dev', '-w', '@akc/web', '--', '--host', '0.0.0.0', '--port', String(webPort), '--strictPort'],
    { VITE_DEV_PORT: String(webPort), VITE_BROKER_PROXY_TARGET: brokerTarget }
  );

  process.stdin.resume();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
