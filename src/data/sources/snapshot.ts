/**
 * Snapshot data source — proposals and activity log.
 *
 * Queries the Snapshot GraphQL API for the superbenefit.eth space.
 * Results cached in KV under 'daoip2:proposals' and 'daoip2:activity'.
 */

const SNAPSHOT_API = 'https://hub.snapshot.org/graphql';

const PROPOSALS_QUERY = `
  query GetProposals($space: String!, $first: Int!, $state: String) {
    proposals(
      first: $first,
      where: { space: $space, state: $state }
      orderBy: "created"
      orderDirection: desc
    ) {
      id
      title
      body
      state
      author
      created
      start
      end
      scores_total
      scores
      choices
      votes
      quorum
      discussion
      type
      ipfs
    }
  }
`;

const SINGLE_PROPOSAL_QUERY = `
  query GetProposal($id: String!) {
    proposal(id: $id) {
      id
      title
      body
      state
      author
      created
      start
      end
      scores_total
      scores
      choices
      votes
      quorum
      discussion
      type
      ipfs
    }
  }
`;

export interface SnapshotProposal {
  id: string;
  title: string;
  body: string;
  state: string;
  author: string;
  created: number;
  start: number;
  end: number;
  scores_total: number;
  scores: number[];
  choices: string[];
  votes: number;
  quorum: number;
  discussion: string;
  type: string;
  ipfs: string;
}

export interface Daoip2Proposal {
  '@type': 'proposal';
  id: string;
  title: string;
  contentURI: string;
  discussionURI?: string;
  proposalType?: string;
  status: string;
  author: string;
  createdAt: string;
  startTime: string;
  endTime: string;
  scores: { choice: string; score: number }[];
  totalScore: number;
}

export async function fetchProposals(
  env: Env,
  params: { status?: string; type?: string },
): Promise<Daoip2Proposal[]> {
  const cached = await env.GOVERNANCE_CACHE.get('daoip2:proposals');
  let proposals: Daoip2Proposal[];

  if (cached) {
    proposals = JSON.parse(cached);
  } else {
    proposals = await fetchFromSnapshot(env);
    await env.GOVERNANCE_CACHE.put('daoip2:proposals', JSON.stringify(proposals), { expirationTtl: 15 * 60 });
  }

  if (params.status) {
    proposals = proposals.filter((p) => p.status === params.status);
  }
  if (params.type) {
    proposals = proposals.filter((p) => p.proposalType === params.type);
  }

  return proposals;
}

export async function fetchProposalDetail(id: string, env: Env): Promise<Daoip2Proposal | null> {
  const response = await snapshotQuery(SINGLE_PROPOSAL_QUERY, { id });
  const raw = response?.proposal as SnapshotProposal | null;
  if (!raw) return null;
  return toProposal(raw, env.SNAPSHOT_SPACE);
}

export async function fetchActivity(
  env: Env,
  params: { member?: string; proposalId?: string },
): Promise<unknown[]> {
  const cached = await env.GOVERNANCE_CACHE.get('daoip2:activity');
  let activity: unknown[];

  if (cached) {
    activity = JSON.parse(cached);
  } else {
    // Activity is derived from proposal vote events
    // TODO: fetch votes from Snapshot and build activity log
    activity = [];
    await env.GOVERNANCE_CACHE.put('daoip2:activity', JSON.stringify(activity), { expirationTtl: 15 * 60 });
  }

  return activity;
}

async function fetchFromSnapshot(env: Env): Promise<Daoip2Proposal[]> {
  const space = env.SNAPSHOT_SPACE;
  const data = await snapshotQuery(PROPOSALS_QUERY, { space, first: 100 });
  const proposals = (data?.proposals ?? []) as SnapshotProposal[];
  return proposals.map((p) => toProposal(p, space));
}

function toProposal(p: SnapshotProposal, space: string): Daoip2Proposal {
  return {
    '@type': 'proposal',
    // DAOIP-2 off-chain proposal ID convention
    id: `daoip-2:${space}:proposal:${p.id}`,
    title: p.title,
    contentURI: `https://snapshot.org/#/${space}/proposal/${p.id}`,
    discussionURI: p.discussion || undefined,
    proposalType: p.type || undefined,
    status: p.state,
    author: p.author,
    createdAt: new Date(p.created * 1000).toISOString(),
    startTime: new Date(p.start * 1000).toISOString(),
    endTime: new Date(p.end * 1000).toISOString(),
    scores: p.choices.map((choice, i) => ({ choice, score: p.scores[i] ?? 0 })),
    totalScore: p.scores_total,
  };
}

async function snapshotQuery(query: string, variables: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const response = await fetch(SNAPSHOT_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) throw new Error(`Snapshot API error: ${response.status}`);

  const json = await response.json() as { data?: Record<string, unknown>; errors?: unknown[] };
  if (json.errors?.length) throw new Error(`Snapshot GraphQL error: ${JSON.stringify(json.errors)}`);
  return json.data ?? null;
}
