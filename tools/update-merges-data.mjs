// Rewrite the MERGES and ORCH_COMMITS exports in data.js from Orchestrate's git history.
//   node tools/update-merges-data.mjs <data.js> [orchestrate repo]
// Without a repo path, keeps a bare clone in .cache/orchestrate.git and fetches it.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const REMOTE = 'https://github.com/devontheriault/Orchestrate.git';
const [dataFile, repoArg] = process.argv.slice(2);
if (!dataFile) throw new Error('Usage: node tools/update-merges-data.mjs <data.js> [orchestrate repo]');

let repo = repoArg;
if (!repo) {
  repo = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '.cache', 'orchestrate.git');
  if (fs.existsSync(repo)) execFileSync('git', ['-C', repo, 'fetch', '-q', '--prune', REMOTE, '+refs/heads/*:refs/heads/*']);
  else execFileSync('git', ['clone', '-q', '--bare', REMOTE, repo]);
}
const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 64 << 20 }).trim();
const added = (...range) => Number(git('diff', '--shortstat', ...range).match(/(\d+) insertion/)?.[1] ?? 0);

// every branch merged into main, oldest first; agent branches go by their short id
const rows = [];
for (const line of git('log', '--merges', '--first-parent', '--reverse', '--format=%H %ct %s', 'main').split('\n')) {
  const [sha, merged, ...subject] = line.split(' ');
  const id = subject.join(' ').match(/^Merge branch '([^']+)'/)?.[1].replace(/^cw\/agent-/, '');
  if (!id) continue;
  const base = git('merge-base', `${sha}^1`, `${sha}^2`);
  // the branch's own commits, skipping any merges of main into it: [commitUnix, linesAdded]
  const commits = git('log', '--no-merges', '--reverse', '--format=%H %ct', `${sha}^1..${sha}^2`)
    .split('\n').filter(Boolean)
    .map((c) => { const [h, t] = c.split(' '); return [Number(t), added(`${h}^`, h)]; });
  rows.push([Number(git('log', '-1', '--format=%ct', base)), Number(merged), added(`${sha}^1`, sha), id, commits,
    Number(git('rev-list', '--count', sha))]);
}
if (!rows.length) throw new Error(`No branch merges found in ${repo}`);
// every commit on main, merges included, which is the total GitHub shows
const total = Number(git('rev-list', '--count', 'main'));

const data = fs.readFileSync(dataFile, 'utf8');
const line = /^export const MERGES = .*;$/m;
if (!line.test(data)) throw new Error(`No MERGES export in ${dataFile}`);
const totalLine = /^export const ORCH_COMMITS = .*;\n/m;
fs.writeFileSync(dataFile, data
  .replace(totalLine, '')
  .replace(/^\/\/ \[forkUnix, mergeUnix, linesAdded, branchId.*$/m,
    '// [forkUnix, mergeUnix, linesAdded, branchId, [[commitUnix, linesAdded], ...], commitsOnMainAfterMerge]')
  .replace(line, () => `export const MERGES = ${JSON.stringify(rows)};\nexport const ORCH_COMMITS = ${total};`));
console.log(`Updated ${rows.length} merges and ${total} commits on main in ${dataFile}`);
