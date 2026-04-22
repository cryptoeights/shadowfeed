import { callGeminiJson, isGeminiError, type GeminiError } from './gemini';

// Structured output we return alongside the raw feed data.
// Matches the JSON schema we enforce via Gemini responseSchema.
export interface AiInsights {
  readonly tldr: string;
  readonly insights: readonly string[];
  readonly signal: {
    readonly type: 'bullish' | 'bearish' | 'neutral' | 'warning';
    readonly confidence: 'low' | 'medium' | 'high';
    readonly timeframe: string;
  };
  readonly generated_by: string;
  readonly generated_at: number;
  readonly cache_hit: boolean;
}

// JSON schema to constrain Gemini's output to exactly the shape we want.
const INSIGHTS_SCHEMA = {
  type: 'object',
  properties: {
    tldr: { type: 'string', description: 'One-sentence market takeaway (max 140 chars)' },
    insights: {
      type: 'array',
      items: { type: 'string' },
      minItems: 2,
      maxItems: 5,
      description: 'Specific, actionable bullet points with numbers',
    },
    signal: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['bullish', 'bearish', 'neutral', 'warning'] },
        confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        timeframe: { type: 'string', description: 'e.g. "short-term", "24h", "1w"' },
      },
      required: ['type', 'confidence', 'timeframe'],
    },
  },
  required: ['tldr', 'insights', 'signal'],
} as const;

// Category-specific framing so Gemini produces the right kind of analysis
// for each feed's domain (on-chain vs social vs infrastructure etc.).
const CATEGORY_FRAMES: Record<string, string> = {
  'on-chain': 'Focus on whale behavior, wallet clustering, flow direction, and institutional positioning.',
  'social': 'Focus on sentiment shifts, narrative momentum, and crowd psychology divergence.',
  'analytics': 'Focus on protocol health indicators, risk-adjusted opportunities, and comparative metrics.',
  'derivatives': 'Focus on liquidation cascades, funding rate anomalies, and leverage risk.',
  'infrastructure': 'Focus on cost implications for agents, congestion signals, and timing recommendations.',
  'discovery': 'Focus on launch quality, rug-pull red flags, and alpha worth tracking.',
  'governance': 'Focus on proposals that impact protocol economics, voter concentration, and timeline urgency.',
  'security': 'Focus on contagion risk, affected user exposure, and defensive actions.',
  'development': 'Focus on commit velocity, contributor diversity, and roadmap signal vs noise.',
  'cross-chain': 'Focus on capital rotation, ecosystem momentum, and bridge reliability.',
  'stacks-defi': 'Focus on Stacks ecosystem health, DEX liquidity shifts, and opportunities for AI agents.',
};

const SYSTEM_INSTRUCTION = `You are a crypto intelligence analyst writing for autonomous AI trading agents.
Your readers are AI agents that make split-second decisions — they need specific numbers, clear signals, and actionable insights. Skip generic observations. Be precise.

Output format rules:
- tldr: ONE sentence, 140 chars max, lead with the most important takeaway
- insights: 2-5 bullets, each MUST include a specific number, time window, or named entity
- signal.type: pick ONE — bullish/bearish/neutral/warning
- signal.confidence: be honest — only say "high" when data is unambiguous
- signal.timeframe: when this matters — "short-term" (hours) / "24h" / "1w" / "long-term"

NEVER:
- Offer investment advice or disclaimers
- Pad with filler like "it's important to note"
- Repeat the raw data verbatim`;

function buildPromptForFeed(feedId: string, category: string, rawData: unknown): string {
  const frame = CATEGORY_FRAMES[category] || 'Focus on the most actionable signal in this data.';

  // Compact the raw data — feed responses can be large, limit to ~8KB
  const dataStr = JSON.stringify(rawData);
  const truncatedData = dataStr.length > 8000
    ? dataStr.slice(0, 8000) + '...[truncated]'
    : dataStr;

  return `Feed: ${feedId}
Category: ${category}
Guidance: ${frame}

Raw data:
${truncatedData}

Analyze the above and return JSON matching the schema.`;
}

// Cache key strategy: hash the raw data so identical inputs reuse results.
// We use a simple hash (djb2) — deterministic and fast in Workers.
function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  // Convert to unsigned hex
  return (h >>> 0).toString(16);
}

function cacheKey(feedId: string, rawData: unknown): string {
  const dataStr = JSON.stringify(rawData);
  return `enhanced:${feedId}:${hashString(dataStr)}`;
}

export interface EnhanceResult {
  readonly insights: AiInsights | null;
  readonly error: GeminiError | null;
}

// Main entry point. Returns insights on success OR a typed error so callers
// can decide whether to charge the user or fall back to raw-only mode.
export async function enhanceFeedData(
  feedId: string,
  category: string,
  rawData: unknown,
  apiKey: string | undefined,
  kv: KVNamespace,
  ttlSeconds: number = 300
): Promise<EnhanceResult> {
  if (!apiKey) {
    return {
      insights: null,
      error: { code: 'API_KEY', message: 'GEMINI_API_KEY not configured on worker' },
    };
  }

  // 1. Try cache first (same raw data → same insights)
  const key = cacheKey(feedId, rawData);
  const cached = await kv.get<AiInsights>(key, 'json');
  if (cached) {
    return { insights: { ...cached, cache_hit: true }, error: null };
  }

  // 2. Cache miss — call Gemini
  try {
    const userPrompt = buildPromptForFeed(feedId, category, rawData);
    const parsed = await callGeminiJson<Omit<AiInsights, 'generated_by' | 'generated_at' | 'cache_hit'>>({
      apiKey,
      systemInstruction: SYSTEM_INSTRUCTION,
      userPrompt,
      responseJsonSchema: INSIGHTS_SCHEMA,
      temperature: 0.2,
      maxOutputTokens: 1024,
      timeoutMs: 20_000,
    });

    // Validate shape defensively — even with responseSchema, models can misbehave.
    if (!parsed?.tldr || !Array.isArray(parsed?.insights) || !parsed?.signal?.type) {
      return {
        insights: null,
        error: { code: 'BAD_RESPONSE', message: 'Gemini returned malformed insights' },
      };
    }

    const insights: AiInsights = {
      tldr: String(parsed.tldr).slice(0, 200),
      insights: parsed.insights.map(s => String(s)).filter(Boolean).slice(0, 5),
      signal: {
        type: parsed.signal.type,
        confidence: parsed.signal.confidence || 'medium',
        timeframe: parsed.signal.timeframe || 'short-term',
      },
      generated_by: 'gemini-2.5-flash',
      generated_at: Date.now(),
      cache_hit: false,
    };

    // 3. Write through cache (non-blocking — if it fails, we still return the result)
    try {
      await kv.put(key, JSON.stringify(insights), { expirationTtl: ttlSeconds });
    } catch {}

    return { insights, error: null };
  } catch (err) {
    if (isGeminiError(err)) {
      return { insights: null, error: err };
    }
    return {
      insights: null,
      error: { code: 'UNKNOWN', message: `enhanceFeedData error: ${(err as any)?.message ?? String(err)}` },
    };
  }
}
