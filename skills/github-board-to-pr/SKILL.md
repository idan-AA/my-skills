---
name: github-board-to-pr
description: Turn every card the owner queued in "Needs Building" on a GitHub project board into a reviewed PR, then move the card to "Needs Dev Review". This session is the Opus manager. Fresh sonnet-builder agents build each card in its own worktree, a fresh Opus reviewer checks it, and the owner approves each commit. Use when the owner says "/github-board-to-pr", "build the board", "work the Needs Building column", "turn the board cards into PRs", or names a board (`/github-board-to-pr yourapp`). If nothing is queued, it also picks up stale In progress cards. It never merges.
---

# GitHub board to PR

The owner drags cards into **Needs Building** on a project board. This skill turns each one into a reviewed PR and moves the card
to **Needs Dev Review**. The flow of a card across the board:

```
Needs Building ─► In progress ─► Needs Dev Review ─► Needs Client Review ─► Done
  (owner queues)   (this skill)    (PR open; owner      (owner moves it once     (owner)
                                    reviews the code)    the client should check)
```

This skill only ever moves a card into `working`, `review` (Needs Dev Review) or `blocked`. Needs Client Review and Done are the
owner's moves. Nothing in this skill ever merges.

```
this session (Opus manager, following sub-agent-manager)
  1 gather     Needs Building cards; if none, stale In progress cards
  2 assess     read docs + code, build or blocked, per card
  3 build      per card: worktree, plan, slices → fresh sonnet-builder agents (parallel waves), review each return, integrate
  4 review     fresh Opus reviewer agent → fresh sonnet-builder fixers → re-review, ≤2 rounds
  3b check     you: visual check with screenshots, write the review pack (review-pack.md) for dev-review
  5 ship       commit (owner approves each), push, issue, PR, card → Needs Dev Review
  6 report
```

Invoking this skill is the owner's opt-in to spawn the builder and reviewer agents. It is NOT standing permission to commit or push:
agents never do either, and this session commits only in step 5, one card at a time, with the owner approving each.

## Projects

`projects.json` (next to this file) lists each board: its repo, local checkout, worktree folder, the Status names to use
(`queue` / `working` / `review` / `clientReview` / `blocked`), the check commands, the authority docs, the project rules, and
whether the repo has commit gates.

Pick the project:
1. If the owner named one (`/github-board-to-pr yourapp`), use it (match `name`, case-insensitive).
2. Otherwise use the entry whose `repoRoot` is the current working directory (or the git toplevel containing it).
3. Otherwise, if the current directory is a git repo with a GitHub remote, set it up as a new board (below).
4. Otherwise ask which board.

### Setting up a new board (first run in a repo that isn't in projects.json)

1. **Find the board.** `git remote get-url origin` gives `<owner>/<repo>`. List boards for both the repo owner and `idan-AA`
   (`gh project list --owner <x> --format json`) and pick the one whose items' `content.repository` is this repo. If several match,
   or none, ask the owner (offer to create one with `gh project create` if none).
2. **Map the Status columns** from `gh project field-list`: `working` = the in-progress column, `blocked` = the column just before
   the queue (Ready / Todo / Backlog). Ask if a mapping is unclear.
3. **Add the missing columns** to the Status field: `Needs Building` just before the working column, and `Needs Dev Review` +
   `Needs Client Review` just after it (rename an existing "In review"-style column to `Needs Dev Review` rather than adding a
   second one). Use one `updateProjectV2Field` mutation and **keep every existing option's `id`**, or GitHub resets every card's
   status. Snapshot `item-list` before and after and confirm zero cards changed column; if any did, stop and tell the owner.
4. **Work out the rest from the repo:** `checks` from `package.json` scripts (prefer typecheck, lint, build, test, in that order,
   only scripts that exist and need no secrets or database; for non-Node repos use the equivalent the CLAUDE.md names);
   `authorityDocs` = CLAUDE.md / AGENTS.md plus any spec, decisions or design docs it points to; `projectRules` = a dense
   summary of the CLAUDE.md non-negotiables; `hasCommitGates` = true if `.claude/hooks` or `.claude/settings.json` gate git;
   `baseBranch` from `git symbolic-ref refs/remotes/origin/HEAD`; `buildsRoot` = `<repo parent>/<repo folder>-builds`.
5. **Show the owner the new entry** in a few lines, append it to `projects.json`, and continue with step 1 below.

Run `/github-board-to-pr` from inside the target repo when you can, so this session's CLAUDE.md is the target repo's.

## Fixed values

- gh: `"/c/Program Files/GitHub CLI/gh.exe"` (not on PATH), logged in as idan-AA. Node: `node` on PATH (if missing, find it with `where node`).
- Look up the Status field id and option ids by NAME each run (`gh project field-list <n> --owner <owner> --format json`), and the
  project node id from `gh project view <n> --owner <owner> --format json`. Don't hard-code ids.
- `gh project item-list` is GraphQL-heavy and hits GitHub's secondary rate limit if called in quick succession. Fetch each board once
  per step and reuse the JSON; on "API rate limit exceeded", wait a minute and retry rather than hammering.
- **The owner watches the agents in the editor's agent map.** Spawn every builder, fixer and reviewer with the Agent tool from this
  session, never through the Workflow tool (agents inside a workflow only show in `/workflows`). Give each a `description` that
  starts with the card's slug, so the map reads by card: `<slug> s2: estimate loader`, `<slug> fix1: detail.tsx`,
  `<slug> review r1`.
- Builders are the `sonnet-builder` agent type (`~/.claude/agents/sonnet-builder.md`). If it is missing from the Agent tool's agent
  types, restore it from the sub-agent-manager skill folder's `sonnet-builder.agent.md` and use `general-purpose` with
  `model: "sonnet"` for this run.

## Steps

### 1. Gather the cards

```bash
"$GH" project item-list <number> --owner <owner> --limit 500 --format json
```

For each card keep `itemId` (item `id`), `title`, `body` (`content.body`), `area`, `kind`, `priority`, `size`, and
`content.type` / `content.number` / `content.id`.

**a. The queue.** Cards whose `status` is `status.queue`. If there are any, build those (and only those) this run.

A queued card that carries a `**Changes requested (dev-review, <date>):**` comment and still has an open PR is a
**send-back**: the owner reviewed it and wants changes. It is NOT a new card. Build it on its existing branch and
worktree (step 3, "Send-back cards"), treat the owner's words as the definition of done for this round, and push to
the same PR.

**b. If the queue is empty, check `status.working`.** For each In progress card, look for signs that someone is on it:
- an open PR in the repo that mentions it (`gh pr list --repo <repo> --state open --json number,title,body,headRefName`; match the
  issue number `#n`, the slug, or the title);
- a remote or local branch `build/<slug-of-title>`, or a worktree for it (`git -C <repoRoot> worktree list`, `<buildsRoot>/*`);
- another Claude session on this machine working on it (`ListAgents`; match the card title or topic in the session name/summary);
- for Issue cards, an assignee other than idan-AA or a linked PR.

A card with any sign is **active**: leave it alone. A card with none is **stale**: it joins this run's cards, no question asked.
Skip a stale card whose body already contains a `**Blocked (github-board-to-pr` line: it was assessed before and is waiting on the
owner (they delete that line to have it picked up again).

If there is nothing to build after (a) and (b), say so in one or two lines (how many In progress cards are active vs. waiting on a
blocked answer) and stop.

Otherwise print the titles in a short list (marking which came from In progress) and continue. Don't ask for confirmation, since
invoking the skill is the request. More than ~6 cards: build them all, but warn that it will take a while.

Then:
- `git -C "<repoRoot>" fetch origin`. Agents may not fetch. This may prompt the owner; that's expected.
- Move every queued card to `status.working` (stale cards are already there).

### 2. Assess (you)

Read the target repo's CLAUDE.md and the `authorityDocs`, and the code each card would touch (an `Explore` agent is fine for a broad
read). For each card decide **build** or **blocked**. Be strict: a wrong guess at a business rule costs more than a blocked card.

Blocked when: the business rule is ambiguous or marked unresolved, it belongs to a later phase, it depends on something not built yet,
it needs credentials/infrastructure/data an agent can't get, or the card is too broad or vague to define "done" (a goal or an epic
like "Goal 1: One system for the whole job" is blocked, with a suggestion to split it into buildable cards). Write the exact
question for the owner.

Build: give it a slug, a plain-words definition of done, concrete acceptance points, the approach (files/areas), and note any other
card in this run that touches the same files (build those one after the other, and say so in both PRs).

Handle blocked cards now (step 4b below) so the owner sees them early.

### 3. Build each card (you, as the sub-agent-manager)

Load the **sub-agent-manager** skill (Skill tool) once and follow it for every card, with these additions:

- **One worktree per card, never the main checkout** (it may hold unrelated work):
  ```bash
  git -C "<repoRoot>" worktree add -b build/<slug> "<buildsRoot>/<slug>" origin/<baseBranch>
  cmd //c mklink /J "<buildsRoot>\<slug>\node_modules" "<repoRoot>\node_modules"
  ```
  If the branch or worktree already exists from an earlier run, don't delete or reuse it: mark the card needs-attention with that
  reason and move on. The one exception is a **send-back card** (below).
- **Send-back cards** (owner requested changes through dev-review): reuse `<buildsRoot>/<slug>` if it exists and is clean;
  otherwise `git -C "<repoRoot>" worktree add "<buildsRoot>/<slug>" build/<slug>` (after `git fetch`, tracking
  `origin/build/<slug>`). If the worktree has uncommitted changes you did not make, stop and mark it needs-attention. Commit on
  top of the existing branch; never rebase or force-push. The briefs quote the owner's change request verbatim. Steps 4 and 5 run
  as usual, except step 5 adds a commit to the same branch (no new issue, no new PR), comments on the PR with what changed in
  this round, removes the `changes-requested` label, and moves the card back to Needs Dev Review.
- **The plan file goes in the scratchpad** (`PLAN-<slug>.md`), not in the repo, so it never ends up in the PR.
- **Every builder brief** names the worktree as the only place it may edit, gives absolute paths inside it, tells it to run checks
  with `npm --prefix "<worktree>" run <script>` (no `cd`), repeats `projectRules`, and repeats: no git writes at all, no fetch,
  no migrations or database writes, no `.env` reads, never touch `<repoRoot>`, never invent a business rule (report BLOCKED instead).
- Cards go one at a time; slices within a card run in parallel waves, as the sub-agent-manager skill says. Two cards that overlap
  never build at the same time.
- After integrating, run the project's `checks` yourself in the worktree. Up to 3 fix rounds (fresh builders each time). If it still
  isn't done, the card is **needs-attention** with a plain note on what's missing.
- **Visual check and review pack (you, not a builder).** The owner reviews dozens of these later through the `dev-review` skill, and
  the pack is what makes that fast. For every card with a screen: start a dev server from the worktree on a free port (the project's
  `devReview.devCommand` / `portRange`), sign in per `devReview.login`, do the card's job on a real record, and take screenshots at
  desktop width and about 390px of every screen it touches, after the action. Then write the pack exactly as
  `review-pack.md` (next to this file) describes, in `<buildsRoot>/_review/<slug>/`, never inside the worktree. Stop the server.
  No screen at all, or the check was impossible: still write the pack, with `visualCheck: "not-possible: <reason>"`. Update the
  pack again after step 4 with the reviewer verdict.

### 4. Review each card

**a. Fresh Opus reviewer.** Spawn one `general-purpose` agent with `model: "opus"`. Give it the worktree, branch, base, the card text,
your definition of done and acceptance points, the authority docs and `projectRules`. Do **not** give it your own opinion of the
code. Tell it to:
review `git -C <worktree> diff origin/<baseBranch>` plus untracked files; check, in order, (1) the card is fully done, (2) correctness
bugs with a concrete failing scenario, (3) every CLAUDE.md / project rule, (4) business rules match the docs with nothing invented;
run the checks itself; report only findings verified in the code, each with file, line, severity (blocking / should-fix / nit),
problem and fix; verdict `approve` only with no blocking or should-fix findings; edit nothing; no git writes.

If it asks for changes, fix them: small ones yourself, the rest through new sonnet-builders (one per file, with the findings as the
brief). Then a **new** reviewer agent re-reviews. At most 2 fix rounds. Approved → **ready**; otherwise **needs-attention**.

**b. Blocked cards.** Append `**Blocked (github-board-to-pr, <date>):** <question>` to the card. Draft cards:
`"$GH" project item-edit --id <content.id (DI_...)> --title "<same title>" --body "<old body + line>"`. Issue cards:
`gh issue comment <n> --repo <repo>`. Cards from Needs Building move to `status.blocked`; stale cards from In progress stay in
In progress (the line keeps them out of later runs). Never guess the answer to a blocked question yourself.

### 5. Ship each ready or needs-attention card (one PR per card)

For each, using `git -C "<worktree>"`:

1. **Stage:** `add -A -- . ":(exclude)node_modules"`, then check `diff --cached --name-only` has nothing under `node_modules`.
2. **Issue:** if the card is a DraftIssue, convert it so the PR can close it:
   ```bash
   REPO_ID=$("$GH" api repos/<repo> --jq .node_id)
   "$GH" api graphql -f query='mutation($i:ID!,$r:ID!){convertProjectV2DraftIssueItemToIssue(input:{itemId:$i,repositoryId:$r}){item{content{... on Issue{number}}}}}' -f i=<itemId> -f r=$REPO_ID
   ```
   If it is already an Issue, use its number.
3. **Commit** with a conventional commit message, ending with the Co-Authored-By line from the system attribution.
   - Repos with `hasCommitGates: true` refuse a commit until the owner has OK'd it. Before committing, show the owner the card,
     the diff stat and the reviewer verdict, and ask whether to commit this one. Only after a yes for this specific commit, follow
     the repo hook's own instructions for an owner-approved commit. A yes for one card is not a yes for the next.
   - If a review hook (AirTight's commit-review) denies the commit, show the owner its reasons, leave the worktree as it is, count
     the card as needs-attention, and move on. Never work around a hook.
4. **Push**: `git -C "<worktree>" push -u origin build/<slug>` (may ask the owner). Never force-push.
5. **PR**: `gh pr create --repo <repo> --base <baseBranch> --head build/<slug> --title "<conventional title, under 70 chars>"
   --body-file <file>`. Body sections: **Review at a glance** (first, as a fixed block, below); What this card asked for; What
   changed (by area, plain words); How to check it (the exact screen path, the real record, the clicks, plus anything
   `projectRules` says every PR must state); Agent review (verdict and summary); Open items (remaining findings or unmet
   acceptance points, or "None"); overlapping PRs to merge first, if any; `Closes #<issue>`; then the Claude Code attribution line.
   Add `--draft` for needs-attention, and start its body with a bold line saying what isn't finished.

   The fixed block, values copied from the review pack (dev-review falls back to parsing it when a pack is missing):
   ```
   ## Review at a glance
   - Risk: migration, auth            (or: none)
   - Setup to review: migration       (screenshots | preview | local | migration | backend | diff)
   - Check at: /units/<id> on "Unit 4B, 12 Main St"
   - Visual check: done, 4 screenshots (desktop + phone)   (or: not possible, <reason>)
   - Depends on: #158                 (or: nothing)
   ```
   Then set the pack's `pr` number.
6. **Card** → `status.review` (Needs Dev Review).

### 6. Report to the owner

One table: card, where it came from (queue / stale In progress), outcome, PR link (or blocked question), reviewer verdict, open
findings count. Then one line per draft PR on what is unfinished. Point them to `/dev-review` to go through everything waiting
(it publishes the triage page). Remind them that after merging they move the card to Needs Client Review themselves. Don't remove worktrees; clean them up with `git worktree remove <path>` after the PR merges.

## Rules

- Never merge, never approve a PR, never force-push, never commit in the owner's main checkout.
- One card → one branch → one worktree → one PR.
- Never move a card to Needs Client Review or Done.
- Changing how cards are built means editing this file (and the sub-agent-manager skill for the builder method); changing a board's
  settings means editing `projects.json`. `legacy/github-board-to-pr.js` is the old background-workflow version, kept for reference
  only; it is not run.
