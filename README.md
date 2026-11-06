# KEYRUSH Backend 🚀

The high-performance, real-time backend engine for **KEYRUSH** — Global Multiplayer Typing Esports & Competition Platform.

Built with **NestJS 10**, **TypeScript**, **Socket.IO (WebSocket Gateway)**, **MongoDB / Mongoose**, and **Redis**.

---

## ⚡ Features

- 🎮 **Authoritative Tick Engine**: High-frequency room state broadcasting (20–60Hz updates), sub-millisecond keystroke cadence validation, and anti-cheat packet verification.
- 🌐 **Real-Time Multiplayer Hub**: Public matchmaking queues, private match lobbies with invite codes, practice solo modes, and live spectator streams.
- 🛡️ **Security & Rate Limiting**: NestJS `@nestjs/throttler` (180 req/min), Helmet security headers, CORS origin whitelist, and JWT authentication with refresh token rotation.
- 🏆 **Elo & Tier Progression Engine**: Dynamic Rating changes (K-factor 32), tier rankings (Iron, Bronze, Silver, Gold, Platinum, Diamond, Master, Grandmaster), and weekly leaderboard snapshots.
- 🏢 **Multi-Tenant Organization Hub**: Custom sub-communities for colleges, companies, and esports leagues with admin controls and private leaderboards.
- 🗄️ **Zero-Friction Fallback**: Automated in-memory fallback adapter for development environments without running local MongoDB/Redis instances.

---

## 🛠️ Tech Stack

- **Framework**: NestJS 10 (Fastify / Express foundation)
- **Language**: TypeScript
- **WebSockets**: Socket.IO Gateway with Redis Pub/Sub adapter
- **Database**: MongoDB (via `@nestjs/mongoose` & Mongoose ODM)
- **Caching & Ephemeral State**: Redis / ioredis
- **Authentication**: Passport.js + JWT (JSON Web Tokens) + Bcrypt
- **Deployment**: Railway, Render, Fly.io, Docker

---

## 📦 Getting Started

### 1. Prerequisites
- Node.js (v18.x or v20.x recommended)
- npm or yarn
- MongoDB (or allow automatic in-memory fallback in dev mode)
- Redis (optional for single-instance local dev)

### 2. Installation
```bash
npm install
```

### 3. Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Update configuration parameters according to your local or cloud setup.

### 4. Running the Server
```bash
# Development mode with hot-reload
npm run start:dev

# Production build
npm run build
npm run start:prod
```

### 5. Running Tests
```bash
# Unit tests
npm run test

# End-to-end tests
npm run test:e2e
```

---

## 📡 REST API & WebSocket Events

- **Health Check**: `GET /api/v1/health`
- **Auth**: `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`
- **Leaderboards**: `GET /api/v1/leaderboard/global`, `GET /api/v1/leaderboard/tier/:tier`
- **Tournaments**: `GET /api/v1/tournaments`, `POST /api/v1/tournaments`
- **Organizations**: `GET /api/v1/organizations`, `POST /api/v1/organizations/join`
- **WebSockets**:
  - Outgoing: `room_created`, `player_joined`, `race_countdown`, `race_started`, `game_tick`, `player_finished`, `race_ended`
  - Incoming: `create_room`, `join_room`, `leave_room`, `send_keystroke`, `spectate_room`

---

## 🐳 Docker Support

Build and run using Docker:
```bash
docker build -t keyrush-backend .
docker run -p 4000:4000 keyrush-backend
```

---

## 📄 License
MIT License.
