export type OpenPR = {
  number: number;
  headRefName: string;
  title: string;
  assignees: string[];
};

export type OpenIssue = {
  number: number;
  title: string;
  body: string | null;
  state: string;
  labels: string[];
  assignees: string[];
};

export type InFlightIssue = {
  number: number;
  reason: string;
};

export type CandidateInput = {
  number: number;
  title: string;
  files: string[];
  blockedBy: number[];
};

export type BlockedEntry = {
  number: number;
  title: string;
  waitsOn: number[];
};

export type ReadyEntry = {
  number: number;
  title: string;
  highRisk: boolean;
  filesDetected: boolean;
};

export type Pick = {
  number: number;
  title: string;
  files: string[];
  unblocks: number[];
  highRisk: boolean;
  filesDetected: boolean;
};

export type PicksResult = {
  blocked: BlockedEntry[];
  inFlight: InFlightIssue[];
  ready: ReadyEntry[];
  picks: Pick[];
};

export type SpawnRecord = {
  issue: number;
  agent: string;
  worktree: string;
  branch: string;
  pane: string;
  gate: boolean;
  spawnedAt: string;
};

export type CheckRow = {
  issue: number;
  agent: string | null;
  status: string | null;
  pane: string | null;
  worktree: string | null;
  branch: string | null;
  pr: number | null;
};