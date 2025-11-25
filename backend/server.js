import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { spawn } from 'child_process';

const app = express();
app.use(cors());

// Basic health route for sanity checks
app.get('/', (_req, res) => {
  res.json({ status: 'LatencyLab backend running' });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Map each client to its running ping interval
const clientIntervals = new WeakMap();

const PORT = process.env.PORT || 4000;

/**
 * Build a platform-aware ping command.
 */
function buildPingCommand(target) {
  const platform = process.platform;
  if (platform === 'win32') {
    return { cmd: 'ping', args: ['-n', '1', '-w', '1000', target] };
  }
  // macOS uses -n for numeric, Linux works fine too
  return { cmd: 'ping', args: ['-n', '-c', '1', '-W', '1', target] };
}

/**
 * Build traceroute command based on platform.
 */
function buildTracerouteCommand(target) {
  const platform = process.platform;
  if (platform === 'win32') {
    return { cmd: 'tracert', args: ['-d', target] };
  }
  return { cmd: 'traceroute', args: ['-n', target] };
}

/**
 * Parse ping output to extract latency, averages, and packet loss.
 */
function parsePingOutput(output) {
  const text = output.toString();
  let rtt = null;
  let avg = null;
  let packetLoss = null;

  // Match individual RTT
  const timeMatch = text.match(/time[=<]([0-9.]+)\s*ms/i);
  if (timeMatch) {
    rtt = parseFloat(timeMatch[1]);
  }

  // Match packet loss
  const lossMatch = text.match(/(\d+\.?\d*)%\s*packet loss/i) || text.match(/Lost = \d+,\s*\(?(\d+)%\)?/i);
  if (lossMatch) {
    packetLoss = parseFloat(lossMatch[1]);
  }

  // Match average from summary
  const avgMatch = text.match(/=\s*[0-9.]+\/[0-9.]+\/([0-9.]+)/) || text.match(/Average = ([0-9.]+)ms/i);
  if (avgMatch) {
    avg = parseFloat(avgMatch[1]);
  }

  return { rtt, avg, packetLoss };
}

/**
 * Parse traceroute output into hop objects.
 */
function parseTracerouteOutput(output) {
  const lines = output.toString().split(/\r?\n/).filter(Boolean);
  const hops = [];

  lines.forEach((line) => {
    // Linux/macOS: 1  8.8.8.8  12.345 ms
    // Windows:  1    <1 ms    <1 ms    1.1.1.1
    const hopMatch = line.match(/^(\s*\d+)\s+([\d*.:-]+)\s+([<\d.]+)\s*ms?/i);
    if (hopMatch) {
      const hop = parseInt(hopMatch[1].trim(), 10);
      const ip = hopMatch[2].trim();
      const rtt = parseFloat(hopMatch[3].replace('<', ''));
      if (!Number.isNaN(hop) && !Number.isNaN(rtt)) {
        hops.push({ hop, ip, rtt });
      }
    }
  });

  return { hops, raw: output.toString() };
}

function runPing(target, ws) {
  const { cmd, args } = buildPingCommand(target);
  const child = spawn(cmd, args);
  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (data) => {
    stdout += data.toString();
  });

  child.stderr.on('data', (data) => {
    stderr += data.toString();
  });

  child.on('close', () => {
    const parsed = parsePingOutput(`${stdout}\n${stderr}`);
    ws.send(JSON.stringify({ type: 'ping', target, ...parsed, timestamp: Date.now() }));
  });
}

function runTraceroute(target, ws) {
  const { cmd, args } = buildTracerouteCommand(target);
  const child = spawn(cmd, args);
  let output = '';

  child.stdout.on('data', (data) => {
    output += data.toString();
  });

  child.stderr.on('data', (data) => {
    output += data.toString();
  });

  child.on('close', () => {
    const parsed = parseTracerouteOutput(output);
    ws.send(JSON.stringify({ type: 'traceroute', target, raw: parsed.raw, hops: parsed.hops }));
  });
}

function stopClientInterval(ws) {
  const existing = clientIntervals.get(ws);
  if (existing) {
    clearInterval(existing);
    clientIntervals.delete(ws);
  }
}

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', error: 'Invalid JSON payload' }));
      return;
    }

    const { type, target, interval } = message;

    if (type === 'start') {
      if (!target || typeof target !== 'string') {
        ws.send(JSON.stringify({ type: 'error', error: 'Target is required' }));
        return;
      }
      const pingInterval = Math.max(Number(interval) || 1000, 250);
      stopClientInterval(ws);
      // Send initial ping immediately
      runPing(target, ws);
      const id = setInterval(() => runPing(target, ws), pingInterval);
      clientIntervals.set(ws, id);
    }

    if (type === 'stop') {
      stopClientInterval(ws);
      ws.send(JSON.stringify({ type: 'stopped' }));
    }

    if (type === 'traceroute') {
      if (!target || typeof target !== 'string') {
        ws.send(JSON.stringify({ type: 'error', error: 'Target is required' }));
        return;
      }
      runTraceroute(target, ws);
    }
  });

  ws.on('close', () => {
    stopClientInterval(ws);
  });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`LatencyLab backend listening on port ${PORT}`);
});
