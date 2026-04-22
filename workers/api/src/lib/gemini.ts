// Thin wrapper around Google's Gemini generateContent endpoint.
// We use gemini-2.5-flash for a good speed/cost balance — ~$0.0001/call
// at our typical payload size (500 input + 300 output tokens).

// gemini-2.5-flash — current generation. 2.0-flash is no longer available to
// new users. Billing must be enabled for production throughput.
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
// Retry 503 (overloaded) up to this many times with exponential backoff.
const GEMINI_MAX_RETRIES = 3;

export interface GeminiCallOptions {
  readonly apiKey: string;
  readonly systemInstruction?: string;
  readonly userPrompt: string;
  readonly responseJsonSchema?: Record<string, unknown>;
  readonly temperature?: number;
  readonly maxOutputTokens?: number;
  readonly timeoutMs?: number;
  // Gemini 2.5 models ship with "thinking" mode on by default and thinking
  // tokens are billed against maxOutputTokens. For structured JSON output we
  // usually want thinking disabled (budget=0) to save both latency and tokens.
  readonly thinkingBudget?: number;
}

export interface GeminiError {
  readonly code: 'API_KEY' | 'RATE_LIMIT' | 'TIMEOUT' | 'BAD_RESPONSE' | 'UNKNOWN';
  readonly message: string;
  readonly status?: number;
}

// Parse raw Gemini API error response into a structured error.
function mapGeminiError(status: number, body: string): GeminiError {
  const preview = body.slice(0, 200);
  if (status === 400 && /api.?key/i.test(body)) {
    return { code: 'API_KEY', message: 'Gemini API key invalid or expired', status };
  }
  if (status === 429) {
    return { code: 'RATE_LIMIT', message: 'Gemini rate limit exceeded', status };
  }
  return { code: 'UNKNOWN', message: `Gemini ${status}: ${preview}`, status };
}

// Core Gemini call. Returns the model's text output on success, or throws a
// GeminiError on failure so callers can branch on .code.
export async function callGemini(opts: GeminiCallOptions): Promise<string> {
  const {
    apiKey,
    systemInstruction,
    userPrompt,
    responseJsonSchema,
    temperature = 0.2,
    maxOutputTokens = 1024,
    timeoutMs = 15_000,
    thinkingBudget = 0, // Default: no thinking tokens — we want fast deterministic output
  } = opts;

  if (!apiKey) {
    const err: GeminiError = { code: 'API_KEY', message: 'GEMINI_API_KEY not configured' };
    throw err;
  }

  const body: Record<string, unknown> = {
    contents: [
      { role: 'user', parts: [{ text: userPrompt }] },
    ],
    generationConfig: {
      temperature,
      maxOutputTokens,
      // Disable thinking mode (saves tokens + latency for structured JSON output).
      thinkingConfig: { thinkingBudget },
      // Request JSON output when a schema is provided. Gemini 2.5 enforces this.
      ...(responseJsonSchema ? {
        responseMimeType: 'application/json',
        responseSchema: responseJsonSchema,
      } : {}),
    },
  };

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  // Retry on 503 (model overloaded) with short exponential backoff.
  // These 503s are usually transient spikes — 2-3 tries almost always succeed.
  let response: Response | null = null;
  let lastError: any = null;

  for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      response = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timeout);
      if (err?.name === 'AbortError') {
        const ge: GeminiError = { code: 'TIMEOUT', message: `Gemini timed out after ${timeoutMs}ms` };
        throw ge;
      }
      lastError = err;
      if (attempt < GEMINI_MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      const ge: GeminiError = { code: 'UNKNOWN', message: `Gemini fetch error: ${err?.message ?? String(err)}` };
      throw ge;
    }
    clearTimeout(timeout);

    if ((response.status === 503 || response.status === 429) && attempt < GEMINI_MAX_RETRIES) {
      // Overloaded or rate-limited — back off and retry
      // 429 gets longer backoff because rate-limit windows are usually ~60s
      const delayMs = response.status === 429
        ? 3000 * (attempt + 1)   // 3s, 6s, 9s for rate limits
        : 800 * (attempt + 1);    // 800ms, 1.6s, 2.4s for 503s
      await new Promise(r => setTimeout(r, delayMs));
      continue;
    }
    break;
  }

  if (!response) {
    const ge: GeminiError = { code: 'UNKNOWN', message: `Gemini never returned a response: ${lastError?.message ?? 'unknown'}` };
    throw ge;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw mapGeminiError(response.status, text);
  }

  let data: any;
  try {
    data = await response.json();
  } catch {
    const ge: GeminiError = { code: 'BAD_RESPONSE', message: 'Gemini returned non-JSON' };
    throw ge;
  }

  const candidate = data?.candidates?.[0];
  const parts = candidate?.content?.parts;
  if (!Array.isArray(parts) || parts.length === 0) {
    const ge: GeminiError = { code: 'BAD_RESPONSE', message: 'Gemini response missing content parts' };
    throw ge;
  }

  // Concatenate all text parts (Gemini may chunk)
  const text = parts
    .map((p: any) => typeof p?.text === 'string' ? p.text : '')
    .filter(Boolean)
    .join('')
    .trim();

  if (!text) {
    const ge: GeminiError = { code: 'BAD_RESPONSE', message: 'Gemini returned empty text' };
    throw ge;
  }

  return text;
}

// Convenience wrapper: call Gemini expecting structured JSON back.
// If the model ignores the schema, we still try JSON.parse and throw if invalid.
export async function callGeminiJson<T = unknown>(opts: GeminiCallOptions): Promise<T> {
  const raw = await callGemini(opts);
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Sometimes the model wraps JSON in markdown fences — strip and retry once.
    const stripped = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();
    try {
      return JSON.parse(stripped) as T;
    } catch (err: any) {
      // Include FULL raw text in the error so we can diagnose truncation vs. malformed output.
      const ge: GeminiError = {
        code: 'BAD_RESPONSE',
        message: `Gemini returned non-JSON text (len=${raw.length}, parseErr=${err?.message ?? 'unknown'}): ${raw.slice(0, 500)}`,
      };
      throw ge;
    }
  }
}

export function isGeminiError(err: unknown): err is GeminiError {
  return !!err && typeof err === 'object' && 'code' in (err as any) && 'message' in (err as any);
}
