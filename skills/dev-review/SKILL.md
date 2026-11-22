---
name: dev-review
description: The owner's review desk for autonomous work. Reads every card waiting on the owner on a GitHub project board (Needs Dev Review, plus blocked cards with an open question), sorts them into buckets (ready low risk, needs your eyes, not finished, blocked, conflicts), publishes one triage page with screenshots and plain-words summaries, then walks the owner through one card at a time - setting up exactly what that card needs (screenshots only, the Vercel preview, a local dev server in the card's worktree, a migration check, or a diff walk-through), opening it in the owner's Chrome, and recording the decision back on GitHub so the next build run sees it. Use when the owner says "/dev-review", "review the board", "what's waiting for me", "what did the agents do", "what's done and what isn't", "review #142", or comes back after a long autonomous run. It never merges and never moves a card to Needs Client Review or Done.
---

# Dev review

After an autonomous run there may be 30+ PRs waiting. This skill answers three questions fast: **what is done, what
is not, and what needs me**, and then makes each review a few minutes by setting everything up for the owner.

```
1 gather     board + open PRs + review packs (one fetch each)
2 assess     per card: pack, PR state, CI, conflicts, overlaps, risk, setup  ->  bucket
3 page       render the triage page, upload new screenshots, publish (same URL every run)
4 review     owner picks a card (or takes the suggested order); set it up; show the evidence; owner decides
5 record     decision -> GitHub (label + comment, card move on "send back"); republish the page
6 wrap up    stop servers you started, close tabs you opened, one-line summary
```

Invoking the skill runs 1 to 3 and then offers step 4. `/dev-review #142` (or a card title) skips straight to step 4
for that card after a quick 1 to 2 for it alone.

## Decisions the owner already made (do not re-ask)

- **Approve means "ready to merge", not a merge.** The skill labels the PR and says so. The owner merges.
- **The owner moves cards to Needs Client Review and Done.** This skill never does.
- **Setup depends on the card.** Pick it from what the change needs (table in step 2). Not every project is the same.
- **Triage lives on a page; the per-card review happens in chat.**

## Project settings

Uses the same `projects.json` as `github-board-to-pr` (`~/.claude/skills/github-board-to-pr/projects.json`), matched
the same way (named, else the entry whose `repoRoot` is the cwd). It reads these fields, plus a `devReview` block:

```json
"devReview": {
  "reviewRoot": "<buildsRoot>/_review",          // review packs + screenshots + page state live here
  "pageUrl": null,                                // filled in after the first publish; reuse every run
  "devCommand": "npm run dev -- -p {port}",       // run inside the worktree
  "portRange": [4100, 4199],                      // never the owner's usual port
  "login": "how to sign in (env var NAMES only, never values) and where the code appears",
  "preview": "vercel-deployments" | "none",       // how to find a per-branch preview link
  "previewSharesProdDb": true,                    // previews talk to the live database
  "riskPaths": { "migration": ["supabase/migrations/"], "money": ["..."], "auth": ["..."], ... }
}
```

If the block is missing, work it out from the repo (CLAUDE.md, package.json `dev` script, `.env*` key NAMES, vercel
config, the folder layout for `riskPaths`), show the owner the new block in a few lines, and save it.

## Fixed values

- gh: `"/c/Program Files/GitHub CLI/gh.exe"`, logged in as idan-AA. Node: `node` on PATH (if missing, find it with `where node`).
- `gh project item-list` is GraphQL-heavy: fetch the board ONCE per run and reuse the JSON. On a rate-limit error wait
  a minute, then retry.
- Page files: `template.html` and `render.mjs` next to this file. Never hand-write the page; always render it.
- Labels this skill uses on PRs: `ready-to-merge`, `changes-requested`, `parked`. Create one with
  `gh label create <name> --repo <repo> --color <hex>` the first time it is needed, and say so in one line.

## 1. Gather

```bash
"$GH" project item-list <n> --owner <owner> --limit 500 --format json        > "$S/board.json"
"$GH" pr list --repo <repo> --state open --limit 200 \
  --json number,title,body,headRefName,headRefOid,isDraft,labels,mergeable,mergeStateStatus,files,additions,deletions,updatedAt,url \
  > "$S/prs.json"
git -C "<repoRoot>" fetch origin
```

`$S` is the scratchpad. Cards in scope:
- **status = `status.review`** (Needs Dev Review): the main queue.
- **Blocked cards**: any card whose body or latest issue comment has a `**Blocked (github-board-to-pr` line with no
  later answer. These show in the Blocked bucket so the owner sees every open question in one place.
- **Orphan PRs**: open PRs from `build/*` branches whose card is in another column, or has no card. Show them under
  Conflicts with the reason "PR open, card is in <column>".

Match card to PR by `Closes #<issue>` in the PR body, else by branch `build/<slug>`, else by title.

Load the **review pack** for each card: `<reviewRoot>/<slug>/review.json` (format in
`~/.claude/skills/github-board-to-pr/review-pack.md`). If there is none (older PR, or one made by hand), build a
minimal one yourself from the PR: `asked` / `built` / `check` / `openItems` from the PR body's sections, risk from
`riskPaths` against the PR's files, `setup` from step 2's table, and no screenshots. Mark it `"packSource": "pr"`, so
the page shows "no screenshots from the builder".

## 2. Assess each card

Work these out from the data you already have (no extra fetches per card unless noted):

- **PR state:** draft, `mergeable` / `mergeStateStatus` (CONFLICTING, BEHIND, BLOCKED, CLEAN), and CI
  (`gh pr checks <n> --repo <repo> --json name,state` - one call per PR; skip if the repo has no checks).
- **Already decided:** labels `ready-to-merge` / `changes-requested` / `parked` from an earlier run. If the PR got new
  commits after the label (compare `updatedAt` with the label comment), the label is stale: treat it as undecided.
- **Overlaps:** two open PRs that change the same file. Record the pair on both, and suggest an order (the smaller or
  the one others build on first). Two PRs that both add a migration are always an overlap.
- **Risk:** the pack's `risk`, or `riskPaths` matched against the PR's files. Any of migration, money, auth,
  portal/tenant access, outbound email/SMS, cron/webhook, or deleting data = **needs your eyes**.
- **Setup** - what the owner needs to actually see it:

| The change | Setup | What you prepare |
|---|---|---|
| Text, styling, small UI, and the pack has screenshots | `screenshots` | Nothing starts. Show the screenshots. |
| A UI flow, no migration, and a preview exists | `preview` | The Vercel preview link for the PR's head commit |
| A UI flow, no preview (or the preview failed) | `local` | Dev server in the card's worktree, signed in |
| Adds or changes a migration | `migration` | Check whether it is already applied. Never apply it here. See step 4. |
| Cron, webhook, extraction, other backend only | `backend` | Run it locally or read its logs, then open the staff screen that shows the result |
| No screen at all (helpers, refactors, types) | `diff` | A plain walk-through of the diff plus the check results |

  Finding the preview (`preview: "vercel-deployments"`):
  ```bash
  ID=$("$GH" api "repos/<repo>/deployments?sha=<headRefOid>&per_page=5" --jq '[.[]|select(.environment=="Preview")][0].id')
  "$GH" api "repos/<repo>/deployments/$ID/statuses" --jq '[.[]|select(.state=="success")][0].environment_url'
  ```
  No result means there is no ready preview: fall back to `local`. If `previewSharesProdDb` is true, say on the card
  that anything saved on the preview hits the live database.

- **Bucket** (first match wins):
  1. `blocked` - the open question from github-board-to-pr.
  2. `conflict` - CONFLICTING, an orphan PR, or an overlap that needs a merge order picked.
  3. `unfinished` - draft PR, the pack says needs-attention, unmet acceptance points, failing CI, or reviewer verdict
     is not `approve`.
  4. `eyes` - ready, but carries any risk above.
  5. `ready` - ready, low risk.
  Decided cards keep their bucket but show the decision chip (Ready to merge / Sent back / Parked).

- **Suggested order:** `blocked` (answers unblock the next build run), then `conflict`, then `eyes`, then `ready`
  (fast), then `unfinished`. Within a bucket, cards that others depend on go first.

## 3. Publish the triage page

1. Write `<reviewRoot>/page-data.json` in the shape `render.mjs` documents at its top (project, generatedAt, the
   suggested order, and one record per card).
2. **Screenshots:** the page shows them from its asset store. `<reviewRoot>/assets.json` maps local file path to
   uploaded `url`. Upload only files not in that map (`Artifact` publish with `url`, `asset: true`, `file_paths`, up to
   25 per call), add the returned urls to the map, and put the url on each screenshot in `page-data.json`.
3. Render and publish:
   ```bash
   node ~/.claude/skills/dev-review/render.mjs "<reviewRoot>/page-data.json" "<reviewRoot>/dev-review.html"
   ```
   - **First run** (`pageUrl` is null): publish `<reviewRoot>/dev-review.html` with `icon: "checklist"`,
     `capabilities: {assets: {}}`, and a description like "What the agents built and what is waiting on you". Save
     the returned URL into `projects.json` as `devReview.pageUrl`. Then upload screenshots (step 2) and republish.
   - **Later runs:** read the page once (`action: "read"`, `url: pageUrl`) if this session has not published it yet,
     then publish the new render to the same `url`. Omit `icon` and `capabilities` so both are kept.
4. Tell the owner, in chat, in this shape:

```
Dev review: 31 cards waiting. <page link>
  3 blocked (questions for you) · 2 conflicts · 6 need your eyes · 14 ready, low risk · 6 not finished
Suggested next: #142 HPD signed PDF wait (migration, needs your eyes).
Say "next" to start, "review #n" for a specific card, or "show ready" to go through the quick ones.
```

## 4. Review one card

Before anything else, say what you are about to set up in one line ("Starting a local server for #142 on port 4107,
it has a migration"), then do it.

**a. Get the code.** Use the card's worktree from `github-board-to-pr` (`<buildsRoot>/<slug>`). If it is gone, make a
new one from the PR branch: `git -C <repoRoot> worktree add <buildsRoot>/<slug> origin/build/<slug>` plus the
node_modules junction from github-board-to-pr. If the worktree has uncommitted changes, stop and tell the owner; do
not touch them. Never review in the owner's main checkout.

**b. Set it up by `setup`:**
- `screenshots` - nothing to start.
- `preview` - the preview link. Open it in the owner's Chrome (claude-in-chrome: `tabs_context_mcp`, then
  `tabs_create_mcp` + `navigate` to the exact screen from the pack's `check[0].url`). If it hits a Vercel or app login,
  sign in with the project's `login` rule (the owner's Chrome is usually already signed in to Vercel).
- `local` - pick a free port in `portRange` (`netstat -ano | grep :<port>` must be empty), run `devCommand` in the
  worktree in the background, wait for "Ready", sign in per `login` (read the code from YOUR server's output; never
  print credentials), then open the exact screen in the owner's Chrome as above. Record the port and shell id so step
  6 can stop it. Never stop a server you did not start.
- `migration` - list the PR's migration files and say in plain words what each does and that it changes the **live**
  database (follow the target repo's rules for explaining DB changes). Check whether each is already applied (the
  repo's own way, for example its migrations table). If it is NOT applied: the screens that need it will not work
  locally or on the preview. Ask the owner whether to (i) review the code and screenshots only, or (ii) have it
  applied first through the repo's normal process. Never apply a migration from this skill without an explicit yes
  for that file, and then use the repo's documented process (dry run first).
- `backend` - run the job locally only if it is safe (no outbound email, SMS, payments, or writes to the live DB);
  otherwise show its last real logs. Then open the staff screen where its result shows.
- `diff` - nothing to start.

**c. Show the evidence, short and in this order:**
1. **The card** in one line, and what it asked for.
2. **What got built**, by area, in plain words (from the pack or PR body, not your guesses).
3. **Screenshots** (desktop and phone) from the pack, with their captions. Read them with the Read tool so the owner
   sees them in chat.
4. **Where to look**: the exact screen, record and clicks (`check` steps), already open in their Chrome if a screen
   exists.
5. **Risk**: each risk flag with one plain line (for example "adds a column to units; changes the live database").
6. **Reviewer verdict** and any open items or unmet acceptance points.
7. **Size and overlaps**: files and lines changed, other PRs touching the same files, suggested merge order.

If the owner asks to see code, show the relevant hunks, not the whole diff.

**d. Ask for the decision** (AskUserQuestion, one question):
- **Ready to merge** - it does what the card asked and is safe.
- **Send back with changes** - then ask what to change, in their words.
- **Park** - leave it, come back later.
- **Skip for now** - no decision, go to the next card.

## 5. Record the decision

Write it to GitHub, so the board stays the truth and the next run of github-board-to-pr sees it:

- **Ready to merge:** add label `ready-to-merge` (remove `changes-requested` / `parked`), and comment on the PR:
  `**Owner review (dev-review, <date>):** ready to merge.` plus any merge-order note. The card stays in Needs Dev
  Review; the owner merges and moves it. Tell the owner the merge order if it overlaps with another PR.
- **Send back with changes:** comment on the **issue** with the owner's words, verbatim, under
  `**Changes requested (dev-review, <date>):**`, and the same comment on the PR. Add label `changes-requested`.
  Move the card to `status.queue` (Needs Building). Leave the PR open and the branch and worktree in place: the next
  github-board-to-pr run continues on that branch and pushes to the same PR.
- **Park:** label `parked`, one PR comment with the reason if the owner gave one. Card stays put.
- **Skip:** write nothing.

Update that card's record in `page-data.json`, re-render, and republish (same URL). Then offer the next card in the
suggested order. Stop the server for this card before starting the next one unless the next card shares the worktree.

## 6. Wrap up

When the owner stops (or the queue is empty): stop every dev server this session started, close the Chrome tabs this
session opened, leave worktrees in place, republish the page one last time, and reply with one line per decision
made this session plus what is still waiting.

## Rules

- Never merge, approve a GitHub review, force-push, or push any code. This skill only labels, comments, and moves a
  card back to the build queue.
- Never move a card to Needs Client Review or Done.
- Never apply a migration or write to a live database without an explicit yes for that specific change.
- Never print secrets; refer to env vars by name.
- Never edit code in this skill. If the owner wants a quick fix during review, that is a "Send back" with their
  words, or the owner explicitly asks you to fix it in the worktree, in which case follow the repo's commit rules.
- The page is for the owner. It carries PR numbers, risk and agent notes; it is not for the client (that is the
  separate client-review skill, still to be built).
