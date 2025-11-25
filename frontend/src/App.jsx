import React, { useEffect, useMemo, useRef, useState } from 'react';

const WS_URL = 'ws://localhost:4000';

function formatNumber(value) {
  if (value === null || Number.isNaN(value)) return '—';
  return `${value.toFixed(2)} ms`;
}

function computeJitter(samples) {
  if (!samples.length) return null;
  const mean = samples.reduce((acc, n) => acc + n, 0) / samples.length;
  const variance = samples.reduce((acc, n) => acc + (n - mean) ** 2, 0) / samples.length;
  return Math.sqrt(variance);
}

function Sparkline({ data, width = 320, height = 64 }) {
  if (!data.length) {
    return <div className="text-sm text-slate-400">No samples yet</div>;
  }
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const step = width / Math.max(data.length - 1, 1);
  const points = data
    .map((d, i) => {
      const x = i * step;
      const y = height - ((d - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline points={points} fill="none" stroke="#6366f1" strokeWidth="2" />
    </svg>
  );
}

export default function App() {
  const [target, setTarget] = useState('8.8.8.8');
  const [lastPing, setLastPing] = useState(null);
  const [avgPing, setAvgPing] = useState(null);
  const [packetLoss, setPacketLoss] = useState(null);
  const [history, setHistory] = useState([]);
  const [traceroute, setTraceroute] = useState([]);
  const [rawTraceroute, setRawTraceroute] = useState('');
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    socketRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === 'ping') {
        if (typeof payload.rtt === 'number') {
          setLastPing(payload.rtt);
          setHistory((prev) => [...prev.slice(-49), payload.rtt]);
        }
        if (typeof payload.avg === 'number') setAvgPing(payload.avg);
        if (typeof payload.packetLoss === 'number') setPacketLoss(payload.packetLoss);
      }

      if (payload.type === 'traceroute') {
        setTraceroute(payload.hops || []);
        setRawTraceroute(payload.raw || '');
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  const jitter = useMemo(() => computeJitter(history.slice(-20)), [history]);

  const sendMessage = (message) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
    }
  };

  const handleStart = () => {
    sendMessage({ type: 'start', target, interval: 1000 });
  };

  const handleStop = () => {
    sendMessage({ type: 'stop' });
  };

  const handleTraceroute = () => {
    sendMessage({ type: 'traceroute', target });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm text-indigo-300">Network Latency Analyzer</p>
            <h1 className="text-2xl font-bold">LatencyLab</h1>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span
              className={`inline-flex h-2 w-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-rose-500'}`}
            />
            {connected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 px-6 py-6 lg:grid-cols-3">
        <section className="card lg:col-span-2 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <label className="flex-1 text-sm text-slate-300">
              Target IP / Host
              <input
                className="input mt-1"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="8.8.8.8"
              />
            </label>
            <div className="flex gap-2">
              <button className="button" onClick={handleStart} disabled={!connected || !target}>
                Start
              </button>
              <button className="button border-slate-600 bg-slate-800 text-slate-100" onClick={handleStop} disabled={!connected}>
                Stop
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-slate-300">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Last Ping</p>
              <p className="text-xl font-semibold text-indigo-300">{formatNumber(lastPing)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Average</p>
              <p className="text-xl font-semibold text-indigo-300">{formatNumber(avgPing)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Jitter</p>
              <p className="text-xl font-semibold text-indigo-300">{formatNumber(jitter)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Packet Loss</p>
              <p className="text-xl font-semibold text-indigo-300">
                {packetLoss === null || Number.isNaN(packetLoss) ? '—' : `${packetLoss.toFixed(2)}%`}
              </p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <h3 className="section-title">Realtime Ping</h3>
              <p className="text-xs text-slate-500">Last {history.length} samples</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3">
              <Sparkline data={history} />
            </div>
          </div>
        </section>

        <section className="card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="section-title mb-0">Traceroute</h3>
            <button className="button" onClick={handleTraceroute} disabled={!connected || !target}>
              Run
            </button>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="px-3 py-2 text-left">Hop</th>
                  <th className="px-3 py-2 text-left">IP</th>
                  <th className="px-3 py-2 text-left">RTT</th>
                </tr>
              </thead>
              <tbody>
                {traceroute.length === 0 && (
                  <tr>
                    <td colSpan="3" className="px-3 py-4 text-center text-slate-500">
                      No traceroute data yet.
                    </td>
                  </tr>
                )}
                {traceroute.map((hop) => (
                  <tr key={hop.hop} className="border-b border-slate-800 last:border-0">
                    <td className="px-3 py-2 font-semibold text-slate-100">{hop.hop}</td>
                    <td className="px-3 py-2 font-mono text-slate-200">{hop.ip}</td>
                    <td className="px-3 py-2 text-indigo-300">{formatNumber(hop.rtt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rawTraceroute && (
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Raw Output</p>
              <pre className="mono mt-2 max-h-48 overflow-auto rounded-md border border-slate-800 bg-slate-950 p-3 text-xs text-slate-200 whitespace-pre-wrap">
                {rawTraceroute}
              </pre>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
