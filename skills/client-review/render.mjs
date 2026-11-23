#!/usr/bin/env node
// Renders the client "What's new" page from page-data.json.
//   node render.mjs <page-data.json> <out.html>
//
// page-data.json shape:
// {
//   "appName": "Acme Leasing", "clientName": "Acme Property Group", "sender": "Your build team",
//   "date": "2026-11-23", "appUrl": "https://app.example.com",
//   "intro": "optional one or two plain sentences from the owner",
//   "behind": ["optional: changes with nothing to see, one plain line each (shown as 'Also done')"],
//   "items": [{
//     "key": "floor-field",                       // unique, never shown
//     "title": "Record which floor each unit is on",
//     "status": "live" | "soon",
//     "asked": "You asked to keep track of which floor each unit is on.",
//     "changed": ["A new Floor box on every unit.", "The units list can be sorted by floor."],
//     "where": "Units, then open any unit",
//     "steps": ["Open any unit.", "Type the floor in the Floor box.", "Press Save."],
//     "note": "optional one line",
//     "pairs": [{
//       "screen": "Unit page",                    // what screen this is, shown as the caption
//       "size": "desktop" | "tablet" | "phone",
//       "before": "<image url or local path>" | null,
//       "beforeNote": "required when before is null; optional otherwise",
//       "after": "<image url or local path>",
//       "afterNote": "optional, what to look at"
//     }]
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

// Words that mean the page is talking to engineers, not the client.
const BANNED = [
  /\bPRs?\b/, /pull request/i, /\bbranch(es)?\b/i, /\bmerg(e|ed|es|ing)\b/i, /\bmigrations?\b/i,
  /\bdatabase\b/i, /\bdeploy(ed|ment|s)?\b/i, /\bcommits?\b/i, /\bAPIs?\b/, /\bendpoints?\b/i, /\bcron\b/i,
  /\bwebhooks?\b/i, /\bschema\b/i, /\bSupabase\b/i, /\bVercel\b/i, /\bGitHub\b/i, /\bbackend\b/i,
  /\bfrontend\b/i, /\brefactor/i, /\bcomponents?\b/i, /\bmodal\b/i, /\bbugs?\b/i, /\bAI agents?\b/i,
  /\breviewer\b/i, /\bstaging\b/i, /\bdev server\b/i, /\blocalhost\b/i, /\bRLS\b/, /\bSQL\b/,
  /\bticket\b/i, /#\d+/, /—/,
];
const problems = [];
const lint = (where, text) => {
  if (typeof text !== "string") return;
  for (const re of BANNED) {
    const m = text.match(re);
    if (m) problems.push(`${where}: "${m[0] === "—" ? "em dash" : m[0]}" in "${text}"`);
  }
};
for (const k of ["appName", "clientName", "sender", "intro"]) lint(k, data[k]);
(data.behind ?? []).forEach((t, i) => lint(`behind ${i + 1}`, t));
if (!data.appName) problems.push("appName is missing");
if (!Array.isArray(data.items) || data.items.length === 0) problems.push("no items");
const keys = new Set();
for (const [i, it] of (data.items ?? []).entries()) {
  const at = `item ${i + 1} (${it.key ?? "no key"})`;
  if (!it.key || keys.has(it.key)) problems.push(`${at}: missing or duplicate key`);
  keys.add(it.key);
  if (!it.title) problems.push(`${at}: no title`);
  if (!["live", "soon"].includes(it.status)) problems.push(`${at}: status must be live or soon`);
  if (!it.asked) problems.push(`${at}: no "asked"`);
  if (!it.changed?.length) problems.push(`${at}: no "changed" lines`);
  if (it.status === "live" && !it.steps?.length) problems.push(`${at}: live but no "steps" to try it`);
  for (const f of ["title", "asked", "where", "note"]) lint(`${at} ${f}`, it[f]);
  for (const f of ["changed", "steps"]) (it[f] ?? []).forEach((t) => lint(`${at} ${f}`, t));
  if (!it.pairs?.length) problems.push(`${at}: no before/after pairs`);
  for (const [j, p] of (it.pairs ?? []).entries()) {
    const pa = `${at} pair ${j + 1}`;
    if (!p.screen) problems.push(`${pa}: no screen name`);
    if (!["desktop", "tablet", "phone"].includes(p.size)) problems.push(`${pa}: size must be desktop, tablet or phone`);
    if (!p.after) problems.push(`${pa}: no after screenshot`);
    if (!p.before && !p.beforeNote) problems.push(`${pa}: no before screenshot and no beforeNote saying why`);
    for (const f of ["screen", "beforeNote", "afterNote"]) lint(`${pa} ${f}`, p[f]);
  }
}
if (problems.length) {
  console.error("Not rendered. Fix these first:\n- " + problems.join("\n- "));
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const template = readFileSync(join(here, "template.html"), "utf8");
if (!template.includes("__CLIENT_DATA__")) {
  console.error("template.html is missing the __CLIENT_DATA__ marker");
  process.exit(1);
}
// JSON inside a <script> tag: escape "<" so "</script>" in any text can't close it.
const LT_ESCAPE = String.fromCharCode(92) + "u003c";
const json = JSON.stringify(data).replace(/</g, () => LT_ESCAPE);
const title = `What's new in ${data.appName}`.replace(/[<&]/g, (c) => (c === "<" ? "&lt;" : "&amp;"));
writeFileSync(outPath, template.replace("__PAGE_TITLE__", () => title).replace("__CLIENT_DATA__", () => json));
const pairs = data.items.reduce((n, it) => n + it.pairs.length, 0);
const live = data.items.filter((it) => it.status === "live").length;
console.log(`rendered ${data.items.length} changes, ${pairs} before/after pairs (${live} live) -> ${outPath}`);
