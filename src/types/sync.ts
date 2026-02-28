export interface GitHubPushEvent {
  ref: string;
  after: string;
  before: string;
  commits: Array<{
    id: string;
    message: string;
    added: string[];
    modified: string[];
    removed: string[];
  }>;
  repository: {
    full_name: string;
  };
}
