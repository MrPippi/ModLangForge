import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const REPO = resolve(import.meta.dirname, '..', '..', '..', '..');
const text = (path: string): string => readFileSync(resolve(REPO, path), 'utf8');

interface Step {
  readonly name?: string;
  readonly uses?: string;
  readonly run?: string;
  readonly if?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly with?: Readonly<Record<string, unknown>>;
}

interface Workflow {
  readonly on: Readonly<Record<string, unknown>>;
  readonly permissions: Readonly<Record<string, string>>;
  readonly concurrency: Readonly<Record<string, unknown>>;
  readonly env?: unknown;
  readonly jobs: Readonly<Record<string, { readonly env?: unknown; readonly steps: readonly Step[] }>>;
}

const workflow = (path: string): Workflow => parse(text(path)) as Workflow;
const steps = (wf: Workflow): readonly Step[] => wf.jobs.track?.steps ?? [];
const indexOf = (list: readonly Step[], run: string): number => list.findIndex((s) => s.run?.includes(run) === true);
const PR_RUN = 'bash scripts/ci/open-tracking-pr.sh "$RUNNER_TEMP/summary.md"';

describe('track-modpacks.yml', () => {
  const wf = workflow('.github/workflows/track-modpacks.yml');
  const list = steps(wf);

  it('runs every Monday 03:00 UTC and on demand', () => {
    expect(wf.on.schedule).toEqual([{ cron: '0 3 * * 1' }]);
    expect(Object.keys(wf.on)).toEqual(['schedule', 'workflow_dispatch']);
  });

  it('only writes contents and pull requests, one run at a time', () => {
    expect(wf.permissions).toEqual({ contents: 'write', 'pull-requests': 'write' });
    expect(wf.concurrency).toEqual({ group: 'track-modpacks', 'cancel-in-progress': false });
  });

  it('checks out the default branch without persisted credentials and installs on Node 24', () => {
    expect(list[0]).toMatchObject({ uses: 'actions/checkout@v7', with: { ref: '${{ github.event.repository.default_branch }}', 'persist-credentials': false } });
    expect(list[1]).toMatchObject({ uses: 'actions/setup-node@v7', with: { 'node-version': 24 } });
    expect(list[2]?.run).toBe('npm ci');
  });

  it('tracks, shows the summary, validates and then opens the PR on auto/track-modpacks', () => {
    const order = ['npm run track:modpacks', '$GITHUB_STEP_SUMMARY', 'npm run validate:data', PR_RUN].map((run) => indexOf(list, run));
    expect(order.every((i, n) => i > (n === 0 ? 2 : order[n - 1]!))).toBe(true);
    expect(list[order[0]!]?.run).toBe('npm run track:modpacks -- --summary "$RUNNER_TEMP/summary.md"');
    expect(list[order[1]!]?.if).toBe('always()');
    expect(list[order[3]!]?.env).toEqual({
      GH_TOKEN: '${{ secrets.TRACKER_TOKEN || github.token }}',
      HAS_TRACKER_TOKEN: "${{ secrets.TRACKER_TOKEN != '' }}",
      BASE_BRANCH: '${{ github.event.repository.default_branch }}',
      TRACK_BRANCH: 'auto/track-modpacks',
      TRACK_TITLE: 'chore(data): 追蹤整合包新版本',
    });
  });

  it('passes CURSEFORGE_API_KEY only to the track step, as an environment variable', () => {
    expect(list[indexOf(list, 'npm run track:modpacks')]?.env).toEqual({ CURSEFORGE_API_KEY: '${{ secrets.CURSEFORGE_API_KEY }}' });
    expect(list.filter((s) => JSON.stringify(s).includes('CURSEFORGE_API_KEY'))).toHaveLength(1);
    expect(wf.env).toBeUndefined();
    expect(wf.jobs.track?.env).toBeUndefined();
  });
});

describe('open-tracking-pr.sh', () => {
  const sh = text('scripts/ci/open-tracking-pr.sh');

  it('keeps track-versions on the default branch and title', () => {
    expect(sh).toContain('BRANCH="${TRACK_BRANCH:-auto/track-versions}"');
    expect(sh).toContain('TITLE_PREFIX="${TRACK_TITLE:-chore(data): 追蹤模組新版本}"');
    expect(sh).toContain('TITLE="${TITLE_PREFIX}（$(date -u +%F)）"');
    const versions = workflow('.github/workflows/track-versions.yml');
    expect(versions.on.schedule).toEqual([{ cron: '0 2 * * 1' }]);
    const pr = steps(versions).find((s) => s.run === PR_RUN);
    expect(Object.keys(pr?.env ?? {}).sort()).toEqual(['BASE_BRANCH', 'GH_TOKEN', 'HAS_TRACKER_TOKEN']);
  });

  it('only force-pushes auto/ branches', () => {
    expect(sh).toMatch(/case "\$BRANCH" in\s+auto\/\*\) ;;\s+\*\) echo "TRACK_BRANCH 必須以 auto\/ 開頭/);
    expect(sh.indexOf('case "$BRANCH" in')).toBeLessThan(sh.indexOf('git checkout -B'));
  });
});

describe('npm run track:modpacks', () => {
  it('runs scripts/track-modpacks.ts with tsx', () => {
    const pkg = JSON.parse(text('package.json')) as { readonly scripts: Readonly<Record<string, string>> };
    expect(pkg.scripts['track:modpacks']).toBe('tsx scripts/track-modpacks.ts');
    expect(existsSync(resolve(REPO, 'scripts/track-modpacks.ts'))).toBe(true);
  });
});
