# ShadowFeed — Video Submission Script (5 Minutes)

---

## SETUP BEFORE RECORDING

### Software
- **Screen recorder**: OBS Studio (free) / QuickTime (Mac built-in) / Loom
- **Resolution**: 1920x1080, 30fps minimum
- **Audio**: Use a decent microphone, not laptop built-in if possible
- **Browser**: Chrome or Brave, zoom 100%, dark mode preferred

### Browser Tabs (open in order)
1. **Tab 1** — Dashboard: https://shadowfeed-production.up.railway.app
2. **Tab 2** — Dashboard scrolled to "Try It" section (for 402 demo)
3. **Tab 3** — Stacks Explorer TX: https://explorer.hiro.so/txid/0x78445f38499d186f20e766dcc223e9f66af3bb4891d8a9eedcc946464eb80891?chain=testnet
4. **Tab 4** — Smart Contract: https://explorer.hiro.so/txid/1a0ebac72aced46a07192016bda09925669ca1beb4897f72e41e216a719d282e?chain=testnet
5. **Tab 5** — GitHub: https://github.com/cryptoeights/shadowfeed

### Terminal Setup
- Open terminal app, font size 14-16 so it's readable on video
- `cd` to project folder
- Pre-type this command (don't press Enter yet):
```bash
SHADOWFEED_URL=https://shadowfeed-production.up.railway.app npx tsx client/auto-agent.ts --once
```

### Screen Layout for Demo Sections
- **Scenes 1-3**: Full-screen browser
- **Scene 4**: Split screen — terminal 50% left, browser 50% right
- **Scenes 5-7**: Full-screen browser / explorer

### Final Checks
- [ ] Dashboard loads and shows activity data
- [ ] Agent command is pre-typed in terminal
- [ ] Leather/Xverse wallet extension installed (for wallet connect demo)
- [ ] Close all notifications, Slack, email popups
- [ ] Close unnecessary tabs and apps
- [ ] Test microphone audio level

---

## SCENE 1: Hook — The Problem (0:00 - 0:50)

### What's on screen
Full-screen browser showing the ShadowFeed dashboard hero section. Slowly scroll down as you speak.

### Script (speak this)

> "Imagine you're building an AI trading agent. It needs real-time data — whale movements, market sentiment, DeFi analytics — to make decisions. Where does it get this data?"
>
> *(pause 1 second)*
>
> "CoinGecko Pro? That's 129 dollars a month — and requires a human to sign up with a credit card. Nansen? 150 dollars a month with KYC verification. Arkham? 300 dollars a month with human authentication."
>
> *(pause 1 second)*
>
> "Here's the thing — AI agents can't create accounts. They can't enter credit cards. They can't complete KYC. There are over 8 million AI agents running today, and that number is doubling every quarter. They all need data, and none of them can buy it."
>
> *(pause 1 second)*
>
> "They need a payment protocol that speaks their language — HTTP."
>
> "That's what we built. This is **ShadowFeed** — the first decentralized data marketplace where AI agents pay per-query using x402 micropayments on Stacks, Bitcoin's Layer 2."

### Actions
- 0:00 — Show dashboard hero, let it sit for 2 seconds
- 0:05 — Start speaking
- 0:20 — Slowly scroll to show the comparison table (ShadowFeed vs CoinGecko etc) if visible
- 0:40 — Scroll back to top, pause on the hero/logo

---

## SCENE 2: How x402 Works — The Technical Flow (0:50 - 1:45)

### What's on screen
Dashboard "How It Works" section, then switch to code snippet view.

### Script

> "Let me show you how this actually works under the hood."
>
> *(scroll to "How It Works" section on dashboard)*
>
> "Step one — an AI agent sends a standard GET request to our API. Just a normal HTTP call — `GET /feeds/whale-alerts`."
>
> "Step two — our server responds with HTTP 402, Payment Required. This is a real HTTP status code that's been unused for decades. The response includes the price — 5000 micro-STX — and the Stacks address to pay."
>
> "Step three — this is where x402 magic happens. The SDK on the agent's side automatically detects the 402, creates an STX transfer transaction, signs it with the agent's private key, and re-sends the original request with the signed payment embedded in the HTTP header."
>
> "Step four — our server verifies the payment signature, broadcasts the transaction to the Stacks blockchain, and returns the data. The entire flow takes about 10 seconds."
>
> *(pause, switch to code view or show in developer section)*
>
> "And from the developer's perspective? It's four lines of code."

```typescript
const account = privateKeyToAccount(PRIVATE_KEY, 'testnet');
const api = wrapAxiosWithPayment(axios.create(), account);

// Every request now auto-pays if 402 is returned
const { data } = await api.get('https://shadowfeed.../feeds/whale-alerts');
```

> "You give your agent a wallet. You wrap your HTTP client. And from that point on, every API call handles payment automatically. No subscription management. No API keys. Just data for STX."

### Actions
- 0:50 — Scroll to "How It Works" steps on dashboard
- 0:55 — Point/hover over each step as you explain it
- 1:15 — Scroll to "For Developers" section or show code snippet
- 1:30 — Highlight the 4 lines of code
- 1:45 — Pause briefly before transitioning

---

## SCENE 3: Live Demo — Dashboard Walkthrough (1:45 - 2:50)

### What's on screen
Full-screen browser, scrolling through the dashboard.

### Script

> "Now let me show you the live product. This is deployed on Railway and running right now."
>
> *(scroll to feed cards)*
>
> "We have three real data feeds, each powered by production APIs:"
>
> "**Whale Alerts** — zero point zero zero five STX per query. This pulls real Bitcoin whale data from CoinGecko and Blockchain.info, then computes significance scores, exchange flow patterns, and movement analysis."
>
> "**BTC Sentiment** — zero point zero zero three STX. This aggregates the Fear and Greed Index from Alternative.me with CoinGecko price data to produce social sentiment analysis and market trend predictions."
>
> "**DeFi Scores** — zero point zero one STX. This analyzes 10 DeFi protocols from DeFiLlama and computes risk-opportunity scores, TVL trends, and protocol recommendations."
>
> "This is all real data from real APIs — not mocked, not hardcoded."
>
> *(scroll to "Try It" section, click on a paid endpoint)*
>
> "Watch — if I call the paid endpoint directly without payment..."
>
> *(click "Try Paid" or curl the endpoint)*
>
> "I get HTTP 402 Payment Required. You can see the exact payment requirements — the amount in micro-STX, the recipient address, the network. This is the x402 protocol response that the SDK handles automatically."
>
> *(scroll to Activity Feed)*
>
> "Now here's where it gets interesting. This is the live activity feed. Every row you see is a **real on-chain transaction** — an AI agent that actually paid STX to buy data."
>
> *(click on one transaction)*
>
> "If I click on any transaction, I can see the actual data that was returned. This is the real response the agent received after payment. And this link takes you directly to the Stacks Explorer where you can verify the transaction on-chain."
>
> *(scroll to Leaderboard)*
>
> "And the leaderboard ranks all agents by query volume. We have over 20 unique agents that have bought data through ShadowFeed — each with a unique wallet address and agent name."

### Actions
- 1:45 — Show dashboard top, start scrolling
- 1:55 — Pause on each feed card as you describe it (2-3 seconds each)
- 2:15 — Click "Try Paid" button or show the 402 response section
- 2:25 — Show the 402 JSON response, hover over key fields
- 2:30 — Scroll to Activity feed
- 2:35 — Click a transaction row to open the data modal
- 2:40 — Show the response data JSON + click the explorer link
- 2:45 — Scroll to Leaderboard, let it display for a few seconds

---

## SCENE 4: Live Demo — Smart Agent in Action (2:50 - 3:55)

### What's on screen
Split screen: Terminal on left (50%), Dashboard on right (50%).

### Before this scene
- Arrange windows side-by-side
- Terminal has the command pre-typed
- Dashboard is showing the Activity section

### Script

> "Now for the best part — let me run an actual AI agent live."
>
> *(press Enter in terminal to run the command)*

```
SHADOWFEED_URL=https://shadowfeed-production.up.railway.app npx tsx client/auto-agent.ts --once
```

> *(wait for startup banner to appear — about 3 seconds)*
>
> "This is our smart agent booting up. It connects to the ShadowFeed server, checks it's online, and starts its decision loop."
>
> *(wait for Step 1 to appear)*
>
> "Step one — it buys BTC sentiment first. This is the cheapest feed and gives market context. The agent pays 0.003 STX and gets back the Fear and Greed Index."
>
> *(wait for the THINK line)*
>
> "Now watch — the agent **thinks**. It sees the Fear and Greed Index is very low — extreme fear in the market. High fear often correlates with whale accumulation. So it makes a decision..."
>
> *(wait for Step 2)*
>
> "It decides to buy whale alerts. Not because it's programmed to buy everything — but because the market conditions warrant it. It pays 0.005 STX."
>
> *(wait for Step 3)*
>
> "And now it finds significant whale activity — multiple large movements detected. So it escalates again and buys DeFi scores to assess portfolio risk. Another 0.01 STX."
>
> *(wait for summary)*
>
> "Total cost: 0.018 STX — that's about 2 cents. Compare that to CoinGecko Pro at 129 dollars per month. That's over 7,000 times cheaper."
>
> "The key insight here: this agent **conditionally purchases** data based on what it learned. x402 enables agents to make economically rational decisions in real-time."
>
> *(point to dashboard on right side)*
>
> "And if we look at the dashboard — the transactions just appeared in the activity feed. Real on-chain, verifiable."

### Actions
- 2:50 — Show split screen layout
- 2:55 — Press Enter to run agent command
- 3:00 — Wait for banner (point to server/network info)
- 3:05 — Narrate Step 1 as it appears
- 3:15 — Highlight the [THINK] line — this is the key differentiator
- 3:25 — Narrate Step 2 as whale alerts are purchased
- 3:35 — Narrate Step 3 as DeFi scores are purchased
- 3:40 — Show the run summary (queries, cost)
- 3:50 — Click refresh on dashboard to show new transactions

### If the agent is slow (blockchain settlement)
- Fill time by explaining: "The agent is waiting for the Stacks blockchain to settle the transaction — this takes a few seconds because it's a real on-chain payment, not a mock."

---

## SCENE 5: Wallet Connect — Humans Can Use It Too (3:55 - 4:20)

### What's on screen
Full-screen dashboard, focus on the nav bar wallet button.

### Script

> "ShadowFeed isn't only for AI agents — humans can use it too."
>
> *(click "Connect Wallet" button in nav)*
>
> "We integrated Leather and Xverse wallet support. Click Connect Wallet..."
>
> *(wallet popup appears — approve connection)*
>
> "...approve the connection, and now you see Buy buttons on every feed card."
>
> *(click Buy on one of the feeds)*
>
> "Click Buy on Whale Alerts — your wallet prompts you to sign an STX transfer of 0.005 STX. Approve it..."
>
> *(approve in wallet popup)*
>
> "...and the data appears right here. Same marketplace, same feeds, same on-chain payments — whether you're an AI agent or a human with a browser wallet."

### Actions
- 3:55 — Click Connect Wallet
- 4:00 — Approve wallet connection in popup
- 4:05 — Show the Buy buttons appearing on feed cards
- 4:10 — Click Buy on a feed
- 4:15 — Show wallet approval popup, approve it
- 4:18 — Show the purchase result modal with data

### If wallet is NOT installed
> "If you have a Leather or Xverse wallet, you can connect it right here and buy data with a single click. The same x402 payment flow works for both AI agents and human wallets — one protocol for everyone."
*(Just show the Connect Wallet button and the install modal that appears)*

---

## SCENE 6: On-Chain Proof + Smart Contract (4:20 - 4:45)

### What's on screen
Switch to Stacks Explorer tabs.

### Script

> "Every single payment is verifiable on-chain. Let me show you the proof."
>
> *(switch to Tab 3 — transaction on explorer)*
>
> "Here's a real transaction from one of our agents on the Stacks Explorer. You can see the STX transfer — the sender address, the recipient which is our data provider, the exact amount. This is settled on Stacks, which means it's anchored to Bitcoin."
>
> *(switch to Tab 4 — smart contract)*
>
> "We also deployed a Clarity smart contract on Stacks testnet for provider accountability. The contract handles provider registration with staking, feed registration, and query logging. Providers have skin in the game — they stake STX, and bad data can lead to stake slashing."
>
> "This creates a trust layer for machine-to-machine commerce. Not trust by reputation — trust by economics."

### Actions
- 4:20 — Switch to Stacks Explorer transaction tab
- 4:25 — Hover over key fields: sender, recipient, amount, status
- 4:30 — Scroll to show transaction is "Success"
- 4:35 — Switch to smart contract tab
- 4:38 — Show the contract deployment, source code section
- 4:45 — Transition to closing

---

## SCENE 7: Vision + Closing (4:45 - 5:00)

### What's on screen
Switch back to dashboard hero, or show GitHub repo.

### Script

> "ShadowFeed proves a new economic primitive: **machine-to-machine data commerce settled on Bitcoin**."
>
> "Today we have three feeds. Tomorrow — anyone can register as a data provider. NFT analytics, gas predictions, liquidation alerts, MEV data. All payable per-query, all on-chain."
>
> "The AI agent economy is projected to reach 47 billion dollars by 2030. Every one of those agents needs data. And x402 on Stacks is how they'll pay for it."
>
> "Thank you for watching."

### Actions
- 4:45 — Show dashboard hero or GitHub repo
- 4:55 — Pause on the screen for a clean ending
- 5:00 — Stop recording

---

## TIMING SUMMARY

| Scene | Topic | Start | End | Duration |
|-------|-------|-------|-----|----------|
| 1 | Hook — The Problem | 0:00 | 0:50 | 50s |
| 2 | How x402 Works | 0:50 | 1:45 | 55s |
| 3 | Dashboard Walkthrough | 1:45 | 2:50 | 65s |
| 4 | Smart Agent Live Demo | 2:50 | 3:55 | 65s |
| 5 | Wallet Connect | 3:55 | 4:20 | 25s |
| 6 | On-Chain Proof | 4:20 | 4:45 | 25s |
| 7 | Vision + Close | 4:45 | 5:00 | 15s |
| **Total** | | | | **5:00** |

---

## BACKUP PLANS

### If agent command is slow or fails
- Say: "The agent is waiting for blockchain settlement — real transactions take a moment. While it works, let me show you earlier transactions on the dashboard."
- Switch to dashboard and show existing activity feed

### If wallet connect fails
- Say: "Wallet connect works with Leather and Xverse wallets on Stacks testnet. Let me show you what the purchase flow looks like from the dashboard side."
- Show the buy buttons and explain the flow

### If dashboard has no data
- Before recording, run: `SHADOWFEED_URL=https://shadowfeed-production.up.railway.app npx tsx client/auto-agent.ts --once`
- This ensures fresh activity on the dashboard

### If you go over 5 minutes
- Cut Scene 5 (Wallet Connect) — it's the least critical
- Shorten Scene 2 — skip the code snippet, just explain verbally
- Scene 4 is the most important — keep this full length

---

## KEY PHRASES TO EMPHASIZE

These phrases should be spoken slightly slower and with more emphasis:

1. **"Payment as an HTTP header"** — this is the core x402 insight
2. **"The agent thinks before it spends"** — differentiator from dumb agents
3. **"Real data, real payments, real on-chain"** — proves this isn't a mockup
4. **"Four lines of code"** — shows developer simplicity
5. **"7,000 times cheaper"** — memorable stat vs traditional pricing
6. **"Machine-to-machine data commerce on Bitcoin"** — the vision statement

---

## HACKATHON CRITERIA CHECKLIST

Make sure the video demonstrates each of these:

- [x] **x402-stacks integration** — Scene 2 (explain flow) + Scene 4 (live demo)
- [x] **HTTP 402 functionality** — Scene 3 (show 402 response in Try It section)
- [x] **Real on-chain transactions** — Scene 3 (activity feed) + Scene 4 (agent) + Scene 6 (explorer)
- [x] **Smart contract on Stacks** — Scene 6 (Clarity contract on explorer)
- [x] **Working product (not just concept)** — Scene 3 + 4 (live demo on production)
- [x] **Open source code** — Mention GitHub repo (Scene 7)
- [x] **Innovation / uniqueness** — Scene 1 (problem) + Scene 7 (vision)
- [x] **Technical depth** — Scene 2 (x402 flow) + Scene 4 (conditional agent logic)
