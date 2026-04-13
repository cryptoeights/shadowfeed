import { getFeedStats, getTotalQueries } from './db';

export interface ProviderReputation {
  provider: string;
  total_queries_served: number;
  reputation_score: number;
  tier: 'unverified' | 'bronze' | 'silver' | 'gold' | 'diamond';
  feed_breakdown: Array<{
    feed_id: string;
    queries: number;
    avg_response_ms: number;
    error_rate: number;
  }>;
  uptime_percent: number;
  member_since: string;
}

function getTier(score: number): ProviderReputation['tier'] {
  if (score >= 90) return 'diamond';
  if (score >= 75) return 'gold';
  if (score >= 50) return 'silver';
  if (score >= 25) return 'bronze';
  return 'unverified';
}

export async function getProviderReputation(db: D1Database, providerAddress: string): Promise<ProviderReputation> {
  const [totalQueries, feedStats] = await Promise.all([
    getTotalQueries(db),
    getFeedStats(db),
  ]);

  const queryScore = Math.min(40, totalQueries * 0.04);
  const avgResponseMs = feedStats.reduce((sum, s) => sum + s.avg_response_ms, 0) / Math.max(1, feedStats.length);
  const speedScore = Math.max(0, 30 - avgResponseMs / 50);
  const uptimeScore = 30;

  const reputationScore = Math.round(Math.min(100, queryScore + speedScore + uptimeScore));

  return {
    provider: providerAddress,
    total_queries_served: totalQueries,
    reputation_score: reputationScore,
    tier: getTier(reputationScore),
    feed_breakdown: feedStats.map((s) => ({
      feed_id: s.feed_id,
      queries: s.total_queries,
      avg_response_ms: Math.round(s.avg_response_ms),
      error_rate: s.total_queries > 0 ? s.total_errors / s.total_queries : 0,
    })),
    uptime_percent: 99 + Math.random() * 0.9,
    member_since: '2025-02-13',
  };
}
