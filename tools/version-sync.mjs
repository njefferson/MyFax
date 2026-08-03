/* Version-sync gate — Doctrine §7/§7b: one triplet, four carriers, never
   allowed to drift. The page stamp reads public/version.js; the service
   worker's cache name carries the triplet literally (so its bytes change
   every release — hub LESSONS §21); the app's patch notes lead with it in
   public/release-notes.js; CHANGELOG.md's top entry names it. This gate
   fails the build when any two disagree.
   Run from the repo root: node tools/version-sync.mjs */
import { readFileSync } from 'node:fs';

const grab = (file, re, name) => {
  const m = readFileSync(file, 'utf8').match(re);
  if (!m) { console.error(`version-sync: cannot find ${name} in ${file}`); process.exit(1); }
  return m[1];
};

const found = [
  ['public/version.js (APP_VERSION)', grab('public/version.js', /APP_VERSION\s*=\s*'(\d+\.\d+\.\d+)'/, 'APP_VERSION')],
  ['public/sw.js (cache name)', grab('public/sw.js', /fax-relay-(\d+\.\d+\.\d+)/, 'cache triplet')],
  ['public/release-notes.js (top entry)', grab('public/release-notes.js', /version:\s*'(\d+\.\d+\.\d+)'/, 'top release-notes version')],
  ['CHANGELOG.md (top heading)', grab('CHANGELOG.md', /^## (\d+\.\d+\.\d+)/m, 'top changelog heading')],
];

const versions = new Set(found.map(([, v]) => v));
for (const [where, v] of found) console.log(`  ${v}  ${where}`);
if (versions.size !== 1) {
  console.error('\nversion-sync FAILED — the carriers above disagree. Bump them together in one commit.');
  process.exit(1);
}
console.log(`\nversion-sync: all four carriers agree on ${found[0][1]}.`);
