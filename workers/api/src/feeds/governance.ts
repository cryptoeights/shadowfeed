const SNAPSHOT_API = 'https://hub.snapshot.org/graphql';

const TRACKED_SPACES = [
  'aave.eth',
  'uniswap',
  'compound-governance.eth',
  'ens.eth',
  'gitcoindao.eth',
  'arbitrumfoundation.eth',
  'optimism-grants.eth',
];

interface SnapshotProposal {
  id: string;
  title: string;
  body: string;
  choices: ReadonlyArray<string>;
  start: number;
  end: number;
  state: string;
  scores: ReadonlyArray<number>;
  scores_total: number;
  votes: number;
  space: {
    id: string;
    name: string;
  };
}

interface SnapshotResponse {
  data?: {
    proposals?: ReadonlyArray<SnapshotProposal>;
  };
}

interface ProcessedProposal {
  readonly id: string;
  readonly title: string;
  readonly body_preview: string;
  readonly space_id: string;
  readonly space_name: string;
  readonly state: string;
  readonly choices: ReadonlyArray<string>;
  readonly scores: ReadonlyArray<number>;
  readonly scores_total: number;
  readonly votes: number;
  readonly start_timestamp: number;
  readonly end_timestamp: number;
  readonly leading_choice: string | null;
  readonly leading_percentage: number | null;
}

interface ParticipationMetric {
  readonly space_id: string;
  readonly space_name: string;
  readonly proposal_count: number;
  readonly total_votes: number;
  readonly avg_votes_per_proposal: number;
}

const PROPOSALS_QUERY = `
  query RecentProposals($spaces: [String!]) {
    proposals(
      first: 20,
      orderBy: "created",
      orderDirection: desc,
      where: { space_in: $spaces }
    ) {
      id
      title
      body
      choices
      start
      end
      state
      scores
      scores_total
      votes
      space {
        id
        name
      }
    }
  }
`;

async function fetchProposals(): Promise<ReadonlyArray<SnapshotProposal>> {
  try {
    const res = await fetch(SNAPSHOT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: PROPOSALS_QUERY,
        variables: { spaces: TRACKED_SPACES },
      }),
    });

    if (!res.ok) return [];

    const data = await res.json() as SnapshotResponse;
    return data?.data?.proposals ?? [];
  } catch {
    return [];
  }
}

function truncateBody(body: string, maxLength: number): string {
  if (body.length <= maxLength) return body;
  return body.slice(0, maxLength).trim() + '...';
}

function processProposal(proposal: SnapshotProposal): ProcessedProposal {
  const scores = proposal.scores ?? [];
  const maxScoreIndex = scores.length > 0
    ? scores.reduce((maxIdx, score, idx, arr) => score > arr[maxIdx] ? idx : maxIdx, 0)
    : -1;

  const leadingChoice = maxScoreIndex >= 0 && proposal.choices[maxScoreIndex]
    ? proposal.choices[maxScoreIndex]
    : null;

  const leadingPercentage = maxScoreIndex >= 0 && proposal.scores_total > 0
    ? Math.round((scores[maxScoreIndex] / proposal.scores_total) * 10000) / 100
    : null;

  return {
    id: proposal.id,
    title: proposal.title,
    body_preview: truncateBody(proposal.body ?? '', 200),
    space_id: proposal.space.id,
    space_name: proposal.space.name,
    state: proposal.state,
    choices: proposal.choices,
    scores: scores.map(s => Math.round(s * 100) / 100),
    scores_total: Math.round(proposal.scores_total * 100) / 100,
    votes: proposal.votes,
    start_timestamp: proposal.start,
    end_timestamp: proposal.end,
    leading_choice: leadingChoice,
    leading_percentage: leadingPercentage,
  };
}

function categorizeByState(proposals: ReadonlyArray<ProcessedProposal>): {
  readonly active: ReadonlyArray<ProcessedProposal>;
  readonly closed: ReadonlyArray<ProcessedProposal>;
  readonly pending: ReadonlyArray<ProcessedProposal>;
} {
  return {
    active: proposals.filter(p => p.state === 'active'),
    closed: proposals.filter(p => p.state === 'closed'),
    pending: proposals.filter(p => p.state === 'pending'),
  };
}

function calculateParticipationMetrics(
  proposals: ReadonlyArray<ProcessedProposal>
): ReadonlyArray<ParticipationMetric> {
  const bySpace = proposals.reduce<Record<string, {
    space_name: string;
    count: number;
    total_votes: number;
  }>>((acc, p) => {
    const prev = acc[p.space_id] ?? { space_name: p.space_name, count: 0, total_votes: 0 };
    return {
      ...acc,
      [p.space_id]: {
        space_name: p.space_name,
        count: prev.count + 1,
        total_votes: prev.total_votes + p.votes,
      },
    };
  }, {});

  return Object.entries(bySpace)
    .map(([spaceId, data]) => ({
      space_id: spaceId,
      space_name: data.space_name,
      proposal_count: data.count,
      total_votes: data.total_votes,
      avg_votes_per_proposal: data.count > 0
        ? Math.round(data.total_votes / data.count)
        : 0,
    }))
    .sort((a, b) => b.total_votes - a.total_votes);
}

export async function generateGovernanceActivity(kv: KVNamespace) {
  const cacheKey = 'governance_activity';
  const cached = await kv.get(cacheKey, 'json');
  if (cached) return cached;

  try {
    const rawProposals = await fetchProposals();

    const processed = rawProposals.map(processProposal);
    const categorized = categorizeByState(processed);
    const participationMetrics = calculateParticipationMetrics(processed);

    const totalVotes = processed.reduce((sum, p) => sum + p.votes, 0);

    const result = {
      summary: {
        total_proposals: processed.length,
        active_count: categorized.active.length,
        closed_count: categorized.closed.length,
        pending_count: categorized.pending.length,
        total_votes: totalVotes,
        spaces_tracked: TRACKED_SPACES.length,
      },
      active_proposals: categorized.active,
      recent_closed: categorized.closed.slice(0, 10),
      upcoming: categorized.pending,
      participation_metrics: participationMetrics,
      data_source: rawProposals.length > 0
        ? 'Snapshot.org GraphQL API'
        : 'no data available',
      generated_at: Date.now(),
    };

    await kv.put(cacheKey, JSON.stringify(result), { expirationTtl: 600 });
    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      summary: { error: 'Failed to fetch governance data', detail: message },
      active_proposals: [],
      recent_closed: [],
      upcoming: [],
      participation_metrics: [],
      data_source: 'error',
      generated_at: Date.now(),
    };
  }
}
