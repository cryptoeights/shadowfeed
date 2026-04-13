const CACHE_KEY = 'feed:security_alerts:result';
const CACHE_TTL = 900;

interface ProtocolRisk {
  name: string;
  chain: string;
  category: string;
  tvl_usd: number;
  audits: number;
  audit_note: string;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  risk_factors: readonly string[];
}

interface SecurityAlertsResult {
  summary: {
    protocols_analyzed: number;
    high_risk_count: number;
    critical_risk_count: number;
    unaudited_tvl_usd: number;
    overall_risk: 'low' | 'moderate' | 'elevated' | 'high';
  };
  high_risk_protocols: readonly ProtocolRisk[];
  recently_listed: readonly {
    name: string;
    chain: string;
    category: string;
    tvl_usd: number;
    listed_at: string;
    age_days: number;
  }[];
  chain_risk_summary: readonly {
    chain: string;
    protocol_count: number;
    unaudited_count: number;
    total_tvl: number;
  }[];
  advisory: string;
  data_source: string;
  generated_at: number;
}

interface LlamaProtocol {
  name: string;
  chain: string;
  chains: string[];
  category: string;
  tvl: number;
  audit_links: string[];
  listedAt: number;
  slug: string;
}

function assessProtocolRisk(p: LlamaProtocol): ProtocolRisk {
  const riskFactors: string[] = [];
  const hasAudit = Array.isArray(p.audit_links) && p.audit_links.length > 0;
  const ageMs = Date.now() - (p.listedAt ?? 0) * 1000;
  const ageDays = Math.floor(ageMs / (86400 * 1000));
  const tvl = p.tvl ?? 0;

  if (!hasAudit) riskFactors.push('No audit found');
  if (ageDays < 30) riskFactors.push(`Very new protocol (${ageDays} days)`);
  else if (ageDays < 90) riskFactors.push(`Recently launched (${ageDays} days)`);
  if (tvl > 0 && tvl < 1_000_000) riskFactors.push('Low TVL (<$1M)');

  let riskLevel: ProtocolRisk['risk_level'] = 'low';
  if (riskFactors.length >= 3) riskLevel = 'critical';
  else if (riskFactors.length === 2) riskLevel = 'high';
  else if (riskFactors.length === 1) riskLevel = 'medium';

  return {
    name: p.name,
    chain: p.chain ?? (p.chains?.[0] ?? 'unknown'),
    category: p.category ?? 'Other',
    tvl_usd: Math.round(tvl),
    audits: hasAudit ? p.audit_links.length : 0,
    audit_note: hasAudit ? `${p.audit_links.length} audit(s) on record` : 'No audits found',
    risk_level: riskLevel,
    risk_factors: Object.freeze(riskFactors),
  };
}

export async function generateSecurityAlerts(kv: KVNamespace): Promise<SecurityAlertsResult> {
  const cached = await kv.get(CACHE_KEY, 'json') as SecurityAlertsResult | null;
  if (cached) return cached;

  try {
    const res = await fetch('https://api.llama.fi/protocols');
    if (!res.ok) throw new Error(`DeFiLlama API error: ${res.status}`);

    const protocols = await res.json() as LlamaProtocol[];
    if (!Array.isArray(protocols)) throw new Error('Invalid protocol data');

    // Focus on protocols with meaningful TVL
    const relevant = protocols.filter(p => (p.tvl ?? 0) > 100_000);

    const assessed = relevant.map(assessProtocolRisk);

    const highRisk = assessed.filter(p => p.risk_level === 'high' || p.risk_level === 'critical');
    const criticalCount = assessed.filter(p => p.risk_level === 'critical').length;
    const highCount = highRisk.length;

    const unauditedTvl = assessed
      .filter(p => p.audits === 0)
      .reduce((sum, p) => sum + p.tvl_usd, 0);

    // Recently listed (last 30 days) with TVL > $100K
    const thirtyDaysAgo = (Date.now() / 1000) - (30 * 86400);
    const recentlyListed = protocols
      .filter(p => (p.listedAt ?? 0) > thirtyDaysAgo && (p.tvl ?? 0) > 100_000)
      .sort((a, b) => (b.listedAt ?? 0) - (a.listedAt ?? 0))
      .slice(0, 10)
      .map(p => ({
        name: p.name,
        chain: p.chain ?? (p.chains?.[0] ?? 'unknown'),
        category: p.category ?? 'Other',
        tvl_usd: Math.round(p.tvl ?? 0),
        listed_at: new Date((p.listedAt ?? 0) * 1000).toISOString().split('T')[0],
        age_days: Math.floor((Date.now() / 1000 - (p.listedAt ?? 0)) / 86400),
      }));

    // Chain risk summary
    const chainMap = new Map<string, { count: number; unaudited: number; tvl: number }>();
    for (const p of assessed) {
      const existing = chainMap.get(p.chain) ?? { count: 0, unaudited: 0, tvl: 0 };
      chainMap.set(p.chain, {
        count: existing.count + 1,
        unaudited: existing.unaudited + (p.audits === 0 ? 1 : 0),
        tvl: existing.tvl + p.tvl_usd,
      });
    }

    const chainRisk = [...chainMap.entries()]
      .map(([chain, data]) => ({
        chain,
        protocol_count: data.count,
        unaudited_count: data.unaudited,
        total_tvl: Math.round(data.tvl),
      }))
      .sort((a, b) => b.total_tvl - a.total_tvl)
      .slice(0, 10);

    const overallRisk = criticalCount > 10 ? 'high' as const :
                        highCount > 30 ? 'elevated' as const :
                        highCount > 10 ? 'moderate' as const : 'low' as const;

    const result: SecurityAlertsResult = {
      summary: {
        protocols_analyzed: assessed.length,
        high_risk_count: highCount,
        critical_risk_count: criticalCount,
        unaudited_tvl_usd: Math.round(unauditedTvl),
        overall_risk: overallRisk,
      },
      high_risk_protocols: Object.freeze(
        highRisk
          .sort((a, b) => b.tvl_usd - a.tvl_usd)
          .slice(0, 15)
      ),
      recently_listed: Object.freeze(recentlyListed),
      chain_risk_summary: Object.freeze(chainRisk),
      advisory: `${assessed.length} protocols analyzed. ${highCount} flagged as high/critical risk. $${Math.round(unauditedTvl / 1e6)}M in unaudited protocol TVL. Exercise caution with new or unaudited protocols.`,
      data_source: 'DeFiLlama (protocol registry + audit data)',
      generated_at: Date.now(),
    };

    await kv.put(CACHE_KEY, JSON.stringify(result), { expirationTtl: CACHE_TTL });
    return result;
  } catch (err: any) {
    return {
      summary: {
        protocols_analyzed: 0,
        high_risk_count: 0,
        critical_risk_count: 0,
        unaudited_tvl_usd: 0,
        overall_risk: 'low',
      },
      high_risk_protocols: [],
      recently_listed: [],
      chain_risk_summary: [],
      advisory: `Error: ${err.message}`,
      data_source: 'error',
      generated_at: Date.now(),
    };
  }
}
