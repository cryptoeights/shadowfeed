export interface CommitRecord {
  repo: string;
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

export interface RepoActivity {
  repo: string;
  ecosystem: string;
  commit_count: number;
  latest_commit_date: string;
  top_contributors: readonly string[];
}

export interface DevActivityResult {
  summary: {
    total_commits: number;
    most_active_repo: string;
    stacks_commits: number;
    other_chain_commits: number;
  };
  stacks_ecosystem: readonly RepoActivity[];
  other_chains: readonly RepoActivity[];
  recent_notable_commits: readonly CommitRecord[];
  data_source: string;
  generated_at: number;
}

interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      date: string;
    };
  };
  html_url: string;
}

interface RepoConfig {
  readonly owner: string;
  readonly repo: string;
  readonly ecosystem: string;
  readonly perPage: number;
}

const STACKS_REPOS: readonly RepoConfig[] = Object.freeze([
  { owner: 'stacks-network', repo: 'stacks-core', ecosystem: 'Stacks', perPage: 10 },
  { owner: 'hirosystems', repo: 'stacks.js', ecosystem: 'Stacks', perPage: 10 },
  { owner: 'stacks-network', repo: 'sbtc', ecosystem: 'Stacks', perPage: 10 },
]);

const OTHER_REPOS: readonly RepoConfig[] = Object.freeze([
  { owner: 'ethereum', repo: 'go-ethereum', ecosystem: 'Ethereum', perPage: 5 },
  { owner: 'solana-labs', repo: 'solana', ecosystem: 'Solana', perPage: 5 },
]);

const ALL_REPOS: readonly RepoConfig[] = Object.freeze([...STACKS_REPOS, ...OTHER_REPOS]);

const CACHE_KEY_PREFIX = 'feed:dev_activity:repo:';
const CACHE_KEY_RESULT = 'feed:dev_activity:result';
const CACHE_TTL = 1800;

async function fetchRepoCommits(
  kv: KVNamespace,
  config: RepoConfig,
): Promise<readonly GitHubCommit[]> {
  const cacheKey = `${CACHE_KEY_PREFIX}${config.owner}/${config.repo}`;
  const cached = await kv.get(cacheKey, 'json') as GitHubCommit[] | null;
  if (cached) return cached;

  try {
    const url = `https://api.github.com/repos/${config.owner}/${config.repo}/commits?per_page=${config.perPage}`;
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'ShadowFeed-DevActivity/1.0',
      },
    });

    if (!res.ok) return [];

    const commits = await res.json() as GitHubCommit[];
    if (!Array.isArray(commits)) return [];

    await kv.put(cacheKey, JSON.stringify(commits), { expirationTtl: CACHE_TTL });
    return commits;
  } catch {
    return [];
  }
}

function extractRepoName(config: RepoConfig): string {
  return `${config.owner}/${config.repo}`;
}

function processRepoCommits(
  config: RepoConfig,
  commits: readonly GitHubCommit[],
): RepoActivity {
  const contributors = new Map<string, number>();
  let latestDate = '';

  for (const commit of commits) {
    const author = commit.commit.author.name;
    contributors.set(author, (contributors.get(author) ?? 0) + 1);

    const commitDate = commit.commit.author.date;
    if (!latestDate || commitDate > latestDate) {
      latestDate = commitDate;
    }
  }

  const topContributors = [...contributors.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);

  return {
    repo: extractRepoName(config),
    ecosystem: config.ecosystem,
    commit_count: commits.length,
    latest_commit_date: latestDate,
    top_contributors: Object.freeze(topContributors),
  };
}

function toCommitRecord(config: RepoConfig, commit: GitHubCommit): CommitRecord {
  return {
    repo: extractRepoName(config),
    sha: commit.sha.slice(0, 7),
    message: commit.commit.message.split('\n')[0].slice(0, 120),
    author: commit.commit.author.name,
    date: commit.commit.author.date,
    url: commit.html_url,
  };
}

function isNotableCommit(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  const notableKeywords = [
    'feat:', 'fix:', 'breaking', 'release', 'merge', 'upgrade',
    'security', 'critical', 'major', 'v2', 'v3', 'v4',
    'nakamoto', 'sbtc', 'stacking', 'clarity',
  ];
  return notableKeywords.some((keyword) => lowerMessage.includes(keyword));
}

export async function generateDevActivity(kv: KVNamespace): Promise<DevActivityResult> {
  const cachedResult = await kv.get(CACHE_KEY_RESULT, 'json') as DevActivityResult | null;
  if (cachedResult) return cachedResult;

  const commitResults = await Promise.all(
    ALL_REPOS.map(async (config) => {
      const commits = await fetchRepoCommits(kv, config);
      return { config, commits };
    }),
  );

  const sources: string[] = [];
  let totalFetched = 0;

  const repoActivities = commitResults.map(({ config, commits }) => {
    totalFetched += commits.length;
    return processRepoCommits(config, commits);
  });

  if (totalFetched > 0) {
    sources.push('GitHub API (public commit data)');
  } else {
    sources.push('error: unable to fetch commit data from GitHub');
  }

  const stacksEcosystem = Object.freeze(
    repoActivities.filter((r) => r.ecosystem === 'Stacks'),
  );
  const otherChains = Object.freeze(
    repoActivities.filter((r) => r.ecosystem !== 'Stacks'),
  );

  const stacksCommits = stacksEcosystem.reduce((sum, r) => sum + r.commit_count, 0);
  const otherCommits = otherChains.reduce((sum, r) => sum + r.commit_count, 0);

  const mostActiveRepo = [...repoActivities]
    .sort((a, b) => b.commit_count - a.commit_count)[0]?.repo ?? 'N/A';

  const allNotableCommits: CommitRecord[] = [];
  for (const { config, commits } of commitResults) {
    for (const commit of commits) {
      if (isNotableCommit(commit.commit.message)) {
        allNotableCommits.push(toCommitRecord(config, commit));
      }
    }
  }

  const recentNotable = Object.freeze(
    allNotableCommits
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10),
  );

  const result: DevActivityResult = {
    summary: {
      total_commits: totalFetched,
      most_active_repo: mostActiveRepo,
      stacks_commits: stacksCommits,
      other_chain_commits: otherCommits,
    },
    stacks_ecosystem: stacksEcosystem,
    other_chains: otherChains,
    recent_notable_commits: recentNotable,
    data_source: sources.join(' + '),
    generated_at: Date.now(),
  };

  await kv.put(CACHE_KEY_RESULT, JSON.stringify(result), { expirationTtl: CACHE_TTL });
  return result;
}
