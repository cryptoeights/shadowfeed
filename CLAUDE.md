# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ShadowFeed is a decentralized data marketplace where AI agents pay for real-time crypto intelligence via x402 micropayments on Stacks (Bitcoin L2). Built with Node.js/TypeScript, Express, and SQLite.

## Commands

- `npm run dev` — Start dev server with tsx (hot reload, port from .env or 3000)
- `npm run build` — Compile TypeScript (`tsc`)
- `npm start` — Run compiled server (`node dist/src/server.js`)
- `npm run smart-agent` — Run the autonomous agent with conditional buying logic
- `npm run client` — Run the basic agent demo (buys all feeds)
- `npm run simulate` — Run 10-agent simulation
- `npm run demo` — Start server in demo mode (enables `/demo/feeds/*` endpoints that bypass x402 payment)
- `npm run deploy` — Deploy Clarity smart contract to Stacks testnet
- `npm run keygen` — Generate a new Stacks keypair

## Architecture

### Server (src/server.ts)
Single Express server that serves three roles:
1. **Data marketplace** — Paid feed endpoints protected by `paymentMiddleware` from `x402-stacks`
2. **Embedded facilitator** — x402 payment verification/settlement endpoints (`/supported`, `/verify`, `/settle`) that deserialize Stacks transactions, validate amounts, broadcast to chain, and poll for confirmation
3. **Dashboard API** — Free endpoints for activity feed, leaderboard, stats, and serving the static frontend from `public/`

The facilitator is also available as a standalone server in `src/facilitator.ts` (same logic, separate Express app on its own port).

### Data Feeds (src/feeds/)
Three feeds that fetch from external APIs and compute analytics:
- `whale-alerts.ts` — CoinGecko + Blockchain.info → whale movement analysis
- `btc-sentiment.ts` — Alternative.me + CoinGecko → Fear & Greed + sentiment scoring
- `defi-scores.ts` — DeFiLlama (10 protocols) → risk/opportunity scores

Each feed is priced in STX and protected by `paymentMiddleware`. Prices are defined inline in `server.ts` using `STXtoMicroSTX()`.

### Database (src/db.ts)
SQLite via `better-sqlite3` with WAL mode. Two tables: `queries` (per-request log with response data) and `feed_stats` (aggregated per-feed metrics). DB path configurable via `DATABASE_PATH` env var (defaults to `shadowfeed.db` in project root).

### Client Agents (client/)
- `smart-agent.ts` — Conditionally purchases feeds based on market conditions (the main demo agent)
- `agent-demo.ts` — Simple agent that buys all feeds
- `simulate-agents.ts` — Multi-agent simulation for populating activity data
- `auto-agent.ts`, `multi-agent.ts` — Additional agent variants

Agents use `wrapAxiosWithPayment` and `privateKeyToAccount` from `x402-stacks` to auto-handle HTTP 402 payment flows.

### Smart Contracts (contracts/)
Clarity contracts for on-chain provider registry. Three versions with increasing simplification; `v3` is the deployed version (registry only, no staking/slashing).

## Environment Variables

Copy `.env.example` to `.env`. Key variables:
- `SERVER_ADDRESS` — Stacks testnet address for the data provider
- `SERVER_PRIVATE_KEY` — Provider's private key (hex)
- `AGENT_PRIVATE_KEY` — AI agent's private key (used by client scripts)
- `NETWORK` — `testnet` or `mainnet`
- `FACILITATOR_URL` — URL for x402 facilitator (defaults to self/embedded)
- `PORT` — Server port (default 3000, .env.example uses 4002)
- `DEMO_MODE` — Set to `true` to enable payment-free demo endpoints

## Key Dependencies

- `x402-stacks` (v2) — x402 payment protocol SDK for Stacks; provides `paymentMiddleware`, `getPayment`, `wrapAxiosWithPayment`, `privateKeyToAccount`, `STXtoMicroSTX`
- `@stacks/transactions` (v7) — Transaction deserialization and broadcasting
- `@stacks/network` (v7) — Stacks network constants
- `better-sqlite3` — Synchronous SQLite driver

## TypeScript Config

- Target: ES2022, Module: CommonJS
- Strict mode enabled
- Source includes `src/**/*` and `client/**/*`, output to `dist/`
- Dev uses `tsx` for direct TS execution; production uses compiled JS
