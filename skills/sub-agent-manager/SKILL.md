---
name: sub-agent-manager
description: "Run a build as the OPUS MANAGER over fresh SONNET BUILDER sub-agents. Opus does all the thinking (research, design, the plan, slicing, briefs, review, integration); every piece of actual building goes to a brand-new `sonnet-builder` sub-agent (Sonnet, 200K context, auto-compacts) that builds exactly one small slice and stops. Use when the owner says \"sub-agent-manager\", \"manage this with sub-agents\", \"spin up builders\", \"use sonnet agents to build this\", \"you plan, they build\", or hands over any sizable job (a UI overhaul, a backend feature, a refactor, a migration, a sweep) and wants it split up and built by sub-agents. Not for one-line fixes: do those yourself."
---

# Sub-Agent Manager

You (Opus) are the manager. You think; Sonnet builders type. The point of the split: your
context stays clean for judgment across the whole job, and every slice of building gets a fresh,
focused worker with nothing in its head but that slice.

## The roles, in one table

| | Opus manager (you) | Sonnet builder (sub-agent) |
|---|---|---|
| Model | Opus, the session model | `sonnet-builder` agent: Sonnet, 200K context, auto-compacts |
| Does | research, decisions, plan, slicing, briefs, review, integration, verification, talking to the owner | builds ONE slice to its brief, runs its gates, reports |
| Never does | bulk building (only tiny fixes, see below) | planning beyond its slice, touching files outside its slice, git writes, DB writes, talking to the owner |
| Lifetime | the whole job | one slice. Then it is done forever |

## Hard rules

1. **One builder per slice, always fresh.** Every slice, and every fix round, is a NEW `Agent`
   call with `subagent_type: "sonnet-builder"`. Never `SendMessage` a finished builder to give it
   the next task, never "reuse" one, never use `subagent_type: "fork"` for building (a fork is
   Opus and inherits your whole context, which defeats the point). If a slice comes back wrong,
   spawn a new builder whose brief includes what was wrong.
2. **You do the thinking up front.** A builder should never have to make a product or
   architecture decision. If your brief leaves one open, the brief is not finished. Answer it
   yourself (Self-Answer Test from the repo's CLAUDE.md), or ask the owner one multiple-choice
   question, before spawning.
3. **Slices are small and disjoint.** One slice = one coherent change a Sonnet agent can finish
   comfortably inside 200K tokens (rule of thumb: touches 1 to 6 files, under roughly 400 lines
   of change, one clear "done" test). Two builders running at the same time never own the same
   file. If a slice feels big, split it again.
4. **You review everything that comes back.** "Done" from a builder is a claim, not a fact. See
   Review below.
5. **The repo's rules bind the builders too.** Every brief tells the builder to obey the repo's
   CLAUDE.md, and repeats the rules that matter most for its slice (see the brief template).
   Builders never commit, push, stash, or run any write git command, and never write to a
   database. Those stay with you and the owner's gates.
6. **Small fixes are yours.** If review finds something you can fix correctly in a couple of
   edits, fix it yourself instead of spawning a builder for it. Anything bigger goes to a new
   builder.

## The workflow

### 1. Understand (you, Opus)
- Read the request, the repo's CLAUDE.md, the spec / decision log it names, and the code the job
  touches. For a broad read across many files, an `Explore` agent is fine; it is read-only and
  returns a summary.
- Run the repo's "before you build" checks (for example `git status`, `git log --all` on the
  files) so you do not rebuild something that exists.
- Read the skills the job needs (UI skills for a UI job, the database gate for DB work). You read
  them in full; builders get the parts that apply, named in their brief.
- Settle every open decision now.

### 2. Plan and slice (you)
Write the plan to a file (in this repository: `docs/manager/PLAN-<job>.md`; elsewhere: the
scratchpad). It is for you, not the owner. It holds:
- The goal and the "done" test for the whole job, from the user's seat.
- The slice list as a live ledger:

```
| # | Slice | Files owned | Depends on | Status | Builder result |
|---|-------|-------------|------------|--------|----------------|
| 1 | Schema + migration for X | db/schema.ts, db/migrations/* | none | DONE | ok, 2 nits fixed by manager |
| 2 | Server loader/action for X | app/routes/app/x/*.tsx (server part) | 1 | DOING | |
| 3 | UI for X list | app/routes/app/x/index.tsx | 2 | TODO | |
```

- Status values: TODO / DOING / REVIEW / DONE / BLOCKED. Update the row the moment it changes.

How to slice:
- **By layer, then by area.** Data model first, then server logic, then UI, then wiring/docs.
  Within a layer, by feature area or screen.
- **Shared hotspots get exactly one owner.** Route registries (`app/routes.ts`), permission
  catalogs, schema files, migration folders, shared UI component files, translation files. Either
  one slice owns the hotspot, or you make those edits yourself after the parallel slices land.
- **Interfaces before parallelism.** When two slices meet (a server function the UI calls), you
  decide the exact signature / type / prop shape in the plan and put it in both briefs, so they
  can run in parallel without guessing.
- **Mark which slices can run in parallel** (no shared files, no dependency) and which must wait.

### 3. Dispatch (you)
- Independent slices: spawn them all in ONE message (several `Agent` calls in the same response)
  so they run concurrently. Keep a wave to a sensible size (about 3 to 6 builders) so review keeps
  up and nothing collides.
- Dependent slices: spawn after the slice they depend on is reviewed and DONE.
- Every call: `subagent_type: "sonnet-builder"`, a 3 to 5 word `description` like
  "Slice 3: X list UI", and the full brief as `prompt`.
- Builders run in the background. You are notified when each finishes. Do not poll, do not
  predict their results, do not start building their slice yourself while they work. Use the
  wait to prepare the next wave's briefs or review earlier returns.

### 4. Review each return (you)
For every builder that reports back:
1. Read its report. Then check the claims against reality: `git diff` on exactly the files it
   owned, and confirm it touched nothing else (`git status`).
2. Read the actual code. Does it do what the brief said, follow the repo's rules (permissions in
   the loader, design tokens not raw colors, no em dashes, no hard deletes, and so on), and
   handle the empty / null / error cases?
3. Run the gates yourself (in this repository: `npm run typecheck`, and `npm run build` before
   the job is called done). Do not trust "typecheck passed" from the builder.
4. Verdict:
   - Good: mark DONE in the ledger.
   - Small problem: fix it yourself, mark DONE, note "fixed by manager".
   - Real problem: mark the row TODO again and spawn a NEW builder with a fix brief: the original
     brief, what the last builder produced, exactly what is wrong, and what right looks like.
5. If a builder reports BLOCKED (a decision it could not make, a file outside its slice it needed),
   resolve it yourself, adjust the plan, and spawn a new builder. Never let a builder widen its
   own scope.

### 5. Integrate and verify the whole (you)
When every row is DONE:
- Do the cross-slice wiring and hotspot edits you held back.
- Run the cold gates the deploy runs (here: `npm run typecheck` and `npm run build`).
- Verify end to end the way a user would (for UI: the real browser per the repo's browser rule,
  desktop and phone width). This is yours; builders do not do the final live check.
- Run the repo's after-build steps (updates file, help docs) or give them to a final builder slice.
- Report to the owner in chat: what was built, what you verified and how, what you fixed in
  review, what you did not verify, and anything that needs their decision. Never send them to read
  the plan file.

## The builder brief template

A builder knows only what the brief says. Write it so a capable engineer with zero context could
do the slice without asking anything.

```
You are a BUILDER for slice <N> of <job>. Build only this slice, then stop and report.

## Context
<2 to 5 sentences: what the overall job is, what this slice is for, what already exists
(slices already DONE and what they produced: exact function names, types, files).>

## Your slice
<Exact behavior to build. Exact files to create or change. Exact signatures/props/types you must
match (copied from the plan). Edge cases: empty, null, error, permission-denied, mobile width.>

## Files you own
<list>. You may READ anything. You may EDIT only these. If you find you need to change any
other file, do not change it: stop and say so in your report under BLOCKED.

## Rules
- Obey the repo's CLAUDE.md (read it first). The ones that matter most here: <3 to 8 bullets
  picked for this slice, e.g. permission gating in the loader, design tokens from app/app.css and
  components from app/components/ui.tsx, no em or en dashes anywhere, no hard deletes,
  register routes in app/routes.ts>.
- Read these skills before you start: <only the relevant ones, e.g. build-with-the-user-in-mind,
  ui-ux-pro-max, mobile-view-optimization>.
- No git write commands of any kind. No database writes. Do not cd into subdirectories.
- Do not make product decisions. If something is ambiguous, pick nothing: report it under BLOCKED.
- Other builders are editing other files in this same checkout right now. Leave every change you
  did not make exactly as it is.

## Done means
<the concrete test for this slice, e.g. "npm run typecheck passes with no errors in your files",
"the loader returns null for costPerUnit when the account lacks X", "the list renders as cards
below 640px">

## Report (your final message, in this shape)
- STATUS: DONE or BLOCKED
- FILES CHANGED: each path, one line on what changed
- GATES: the exact commands you ran and their result
- DECISIONS: any small implementation choices you made and why
- BLOCKED / OPEN: anything you could not do or were unsure of
```

## Sizing and context

- The `sonnet-builder` agent runs Sonnet (`model: sonnet`) with `autoCompactWindow: 200000` in its
  frontmatter. Sonnet 5 would otherwise get a 1M window by default; this field caps the working
  window at 200K and auto-compacts there, so a long slice will not crash. (Needs Claude Code
  2.1.296 or later. The env var `CLAUDE_CODE_AUTO_COMPACT_WINDOW`, if set, overrides it: keep it
  unset.) But compaction loses detail, so a slice that needs to compact is
  a slice that was too big. Aim for slices a builder finishes well inside its window, and point it
  at exact files and line ranges instead of "explore the codebase".
- Your own context is the scarce one. Do not read builders' whole diffs into your context when a
  targeted `git diff -- <file>` or a Grep answers the question. Keep the plan file as your memory
  so you survive your own compaction.

## Setup this skill relies on

The builder is defined in `~/.claude/agents/sonnet-builder.md` (global, works in every repo). If
`sonnet-builder` is missing from the Agent tool's list of agent types, recreate that file (see the
copy in this skill folder: `sonnet-builder.agent.md`) and restart the session. Fallback for this
session only: `subagent_type: "general-purpose"` with `model: "sonnet"`.
