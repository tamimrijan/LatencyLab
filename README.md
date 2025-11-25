# LatencyLab

LatencyLab is an advanced Network Latency Analyzer for gamers. It streams realtime ping data and traceroute insights over WebSockets with a React + Tailwind dashboard.

> Coming soon: richer analytics, historical reports, and saved test profiles.

## Project Structure
- **backend/** Node.js + Express + WebSockets server for ping and traceroute
- **frontend/** React + Tailwind UI built with Vite

## Setup

### Backend
1. `cd backend`
2. `npm install`
3. `npm start`

The backend listens on `http://localhost:4000` and exposes WebSocket upgrades at the same port.

### Frontend
1. `cd frontend`
2. `npm install`
3. `npm run dev`
4. Open the URL printed by Vite (default `http://localhost:5173`).

## Usage
1. Start the backend server.
2. Start the frontend dev server.
3. Enter a target host/IP (e.g., `8.8.8.8`).
4. Click **Start** to stream ping data, **Stop** to halt, and **Run** under Traceroute to capture route hops.

## Planned Features
- Persistent test profiles and history
- Exportable latency reports
- Multi-target comparison view
- Authentication for shared workspaces
- Cloud relay for NAT-restricted clients
