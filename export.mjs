#!/usr/bin/env node
// Copies the owner's own skills from ~/.claude/skills into this repo, leaving out what must not be public
// and replacing private details with placeholders. Run it, review `git diff`, then commit and push.
//   node export.mjs [sourceDir]
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = process.argv[2] || join(homedir(), ".claude", "skills");
const DEST = fileURLToPath(new URL("./skills/", import.meta.url));

// Anthropic's own skills (licensed, not ours to republish) and sync caches.
const SKIP_DIRS = new Set([
  "synced",
  "docs", "built-in-browser", "computer-use", "morning", "deep-research", "chrome-browser", "import-memory",
  "skill-creator", "setup-writing-style", "google-workspace",
  "pdf", "xlsx", "pptx", "docx",
]);
const SKIP_PREFIXES = [".bucket-"];
// Per-machine or per-client files: never published. An example file is written instead where useful.
const SKIP_FILES = new Set(["github-board-to-pr/projects.json"]);
const SKIP_NAMES = new Set([".env", ".env.local", "node_modules", ".DS_Store", "Thumbs.db"]);

// Private details -> placeholders. The list itself is private, so it lives OUTSIDE this public repo:
//   ~/.claude/my-skills-redact.json  =  [{ "find": "text" | { "regex": "...", "flags": "gi" }, "replace": "<placeholder>" }]
// Order matters (longer first). The export refuses to run without it.
const REDACT_FILE = join(homedir(), ".claude", "my-skills-redact.json");
if (!existsSync(REDACT_FILE)) {
  console.error(`Missing ${REDACT_FILE}; refusing to export without the private-details list.`);
  process.exit(1);
}
const REDACT = JSON.parse(readFileSync(REDACT_FILE, "utf8")).map(({ find, replace }) => [
  typeof find === "string" ? find : new RegExp(find.regex, find.flags),
  replace,
]);
const TEXT = /\.(md|mjs|js|cjs|ts|tsx|json|sql|html|css|ya?ml|txt|sh|ps1|py|toml)$/i;

function skipped(rel, name) {
  const top = rel.split(/[\\/]/)[0];
  return SKIP_DIRS.has(top) || SKIP_PREFIXES.some((p) => top.startsWith(p)) ||
    SKIP_FILES.has(rel.replace(/\\/g, "/")) || SKIP_NAMES.has(name);
}

rmSync(DEST, { recursive: true, force: true });
cpSync(SRC, DEST, {
  recursive: true,
  filter: (from) => {
    const rel = relative(SRC, from);
    if (!rel) return true;
    return !skipped(rel, from.split(/[\\/]/).pop());
  },
});

let changed = 0;
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!TEXT.test(name)) continue;
    const before = readFileSync(p, "utf8");
    let after = before;
    for (const [re, to] of REDACT) after = after.replace(re, to);
    if (after !== before) { writeFileSync(p, after); changed++; }
  }
})(DEST);

// Example board config in place of the private projects.json.
const board = join(DEST, "github-board-to-pr");
if (existsSync(board)) {
  writeFileSync(join(board, "projects.example.json"), JSON.stringify([{
    name: "yourapp", repo: "your-org/your-app", repoRoot: "C:/Users/you/Desktop/your-app",
    buildsRoot: "C:/Users/you/Desktop/your-app-builds", board: { owner: "your-github-user", number: 1 }, baseBranch: "dev",
    status: { queue: "Needs Building", working: "In progress", review: "Needs Dev Review", clientReview: "Needs Client Review", blocked: "Todo" },
    checks: ["typecheck", "lint"], authorityDocs: ["CLAUDE.md"],
    projectRules: "A dense summary of the repo's CLAUDE.md non-negotiables.", hasCommitGates: false,
    devReview: {
      reviewRoot: "C:/Users/you/Desktop/your-app-builds/_review", pageUrl: null, devCommand: "npm run dev -- -p {port}",
      portRange: [4100, 4199], login: "How to sign in (env var NAMES only) and where the sign-in code appears.",
      preview: "vercel-deployments", previewSharesProdDb: true,
      riskPaths: { migration: ["supabase/migrations/"], access: ["middleware.ts"], outbound: ["lib/email"], cron: ["app/api/cron/"] },
    },
  }], null, 2) + "\n");
}

const count = readdirSync(DEST).filter((n) => statSync(join(DEST, n)).isDirectory()).length;
console.log(`exported ${count} skills to ${DEST}; placeholders applied in ${changed} files`);
