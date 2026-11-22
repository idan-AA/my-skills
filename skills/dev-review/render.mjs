#!/usr/bin/env node
// Renders the dev-review triage page from page-data.json.
//   node render.mjs <page-data.json> <out.html>
//
// page-data.json shape:
// {
//   "project": "YourApp", "repo": "owner/repo", "boardUrl": "https://github.com/users/x/projects/1",
//   "generatedAt": "2026-11-22T14:05:00Z",
//   "suggested": ["pr-162", "pr-160"],                 // card keys in the order to review
//   "cards": [{
//     "key": "pr-162",                                  // unique; "pr-<n>" or "issue-<n>" for blocked cards
//     "title": "Units: add a floor field",
//     "issue": 141, "issueUrl": "...", "pr": 162, "prUrl": "...", "draft": false,
//     "bucket": "blocked" | "conflict" | "unfinished" | "eyes" | "ready",
//     "decision": null | "ready-to-merge" | "changes-requested" | "parked",
//     "decisionNote": "optional plain line",
//     "asked": "plain sentence", "built": ["plain line", ...],
//     "risk": ["migration", ...], "riskNotes": ["Adds a floor column to units; changes the live database."],
//     "setup": "screenshots" | "preview" | "local" | "migration" | "backend" | "diff",
//     "previewUrl": "https://... or null",
//     "check": { "url": "/units/..", "record": "Unit 4B, 12 Main St", "steps": ["..."] },
//     "screenshots": [{ "url": "<asset url>", "caption": "...", "width": "desktop" | "phone" }],
//     "visualCheck": "done" | "not-possible: reason",
//     "reviewer": { "verdict": "approve" | "changes" | "none", "blocking": 0, "shouldFix": 0, "summary": "..." },
//     "openItems": ["..."],
//     "blockedQuestion": "only for blocked cards",
//     "conflict": "plain reason, only for conflict cards",
//     "overlaps": [160], "dependsOn": [158],
//     "ci": "passing" | "failing" | "pending" | "none",
//     "size": { "files": 7, "additions": 310, "deletions": 42 },
//     "packSource": "builder" | "pr",
//     "updatedAt": "2026-11-22T13:00:00Z"
//   }]
// }
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [, , dataPath, outPath] = process.argv;
if (!dataPath || !outPath) {
  console.error("usage: node render.mjs <page-data.json> <out.html>");
  process.exit(1);
}
const data = JSON.parse(readFileSync(dataPath, "utf8"));
const BUCKETS = ["blocked", "conflict", "unfinished", "eyes", "ready"];
const problems = [];
for (const c of data.cards ?? []) {
  if (!c.key || !c.title) problems.push(`card without key/title: ${JSON.stringify(c).slice(0, 80)}`);
  if (!BUCKETS.includes(c.bucket)) problems.push(`${c.key}: bad bucket "${c.bucket}"`);
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
const here = dirname(fileURLToPath(import.meta.url));
const template = readFileSync(join(here, "template.html"), "utf8");
// JSON inside a <script> tag: escape "<" so "</script>" in any text can't close it.
const LT_ESCAPE = String.fromCharCode(92) + "u003c"; // backslash-u003c, a JSON-safe "<"
const json = JSON.stringify(data).replace(/</g, () => LT_ESCAPE);
if (!template.includes("__REVIEW_DATA__")) {
  console.error("template.html is missing the __REVIEW_DATA__ marker");
  process.exit(1);
}
writeFileSync(outPath, template.replace("__REVIEW_DATA__", () => json));
const counts = Object.fromEntries(BUCKETS.map((b) => [b, data.cards.filter((c) => c.bucket === b).length]));
console.log(`rendered ${data.cards.length} cards -> ${outPath}`, counts);
