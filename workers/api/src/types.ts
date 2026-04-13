export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  NETWORK: string;
  FACILITATOR_URL: string;
  SERVER_ADDRESS: string;
  SERVER_PRIVATE_KEY: string;
  NANSEN_API_KEY: string;
  HIRO_API_KEY?: string;
  DEMO_MODE?: string;
}

export interface QueryRow {
  id: number;
  feed_id: string;
  payer: string | null;
  tx_hash: string | null;
  response_ms: number;
  response_data: string | null;
  created_at: number;
}

export interface FeedStatRow {
  feed_id: string;
  total_queries: number;
  total_errors: number;
  avg_response_ms: number;
  last_query_at: number | null;
}

export interface LeaderboardRow {
  address: string;
  total_queries: number;
  whale_queries: number;
  sentiment_queries: number;
  defi_queries: number;
  avg_response_ms: number;
  first_seen: number;
  last_seen: number;
}
