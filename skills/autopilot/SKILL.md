---
name: autopilot
description: "Autonomous, cycle-based development with an Opus manager orchestrating role agents: a fresh Opus PLANNER agent writes (or checks and enriches) a detailed 2 to 3 day plan, the owner approves it and signs off every decision, fresh Sonnet BUILDER agents build every slice, a fresh Opus REVIEWER agent checks it all, corrections are built and re-reviewed, a PR is opened, and a new Opus planner plans the next cycle. On first run it delivers a plan; if an approved plan exists it executes. Use when the owner says \"autopilot\", \"/autopilot\", \"/loop /autopilot\", \"run autonomously\", \"plan and build the next few days\", or \"keep the cycle going\"."
---

# Autopilot

You (the session, Opus) are the **manager**. You orchestrate; you do not plan, build or review
yourself. Every task goes to a fresh agent:

| Role | Agent | Model | One per |
|---|---|---|---|
| Planner | `opus-planner` | Opus | planning or plan-check task |
| Builder | `sonnet-builder` | Sonnet | slice, and every fix round |
| Reviewer | `opus-reviewer` | Opus | review pass |
| Manager | you | Opus | the whole run |

Never reuse a finished agent (no SendMessage for new work). If an agent type is missing from the
Agent tool's list (new agent files need a session restart), fall back for this session to
`subagent_type: "general-purpose"` with `model: "opus"` or `model: "sonnet"`, and paste the role
file from `~/.claude/agents/<name>.md` at the top of the brief.

Read the `sub-agent-manager` skill in full on the first tick and after any compaction. Its slicing,
brief template, dispatch and review-of-returns rules govern the BUILD phase.

## The cycle

```
1 PLAN      opus-planner writes the plan, or checks and enriches an existing one
2 APPROVE   owner approves the plan                                   (owner gate)
3 SIGN-OFF  owner signs off every decision in the Decisions table     (owner gate)
4 BUILD     manager runs waves of sonnet-builders until every slice is DONE
5 REVIEW    fresh opus-reviewer checks the whole cycle
6 CORRECT   sonnet-builders fix every finding, fresh opus-reviewer re-checks, repeat to PASS
7 PR        manager opens one PR for the cycle
8 NEXT      new opus-planner writes the next cycle's plan  -> back to 2
```

Nothing is built before steps 2 and 3 are both recorded. After that the owner is not needed
until the PR, because every decision is already signed.

## Files (manager's memory; never send the owner to read them)

- `docs/autopilot/STATE.md` : current cycle number, phase, branch, PR links, the wave ledger, and
  a one-line-per-tick log. Re-read it at the start of every tick and after every compaction.
- `docs/autopilot/CYCLE-<n>-PLAN.md` : the plan, written by the planner (template below). Owner
  approval and sign-offs are recorded in it by you, the moment the owner gives them in chat.

STATE.md shape:

```
# Autopilot state
Cycle: <n>   Phase: PLAN | AWAITING-APPROVAL | AWAITING-SIGNOFF | BUILD | REVIEW | CORRECT | PR | STOPPED
Branch: autopilot/cycle-<n>-<slug>   Base: <main or previous cycle branch>
PRs: cycle 1 <url> (open/merged), ...
Review rounds this cycle: <n>

## Wave ledger (current cycle)
| Wave | Slice | Files owned | Builder | Status | Result |

## Log (newest first)
<date time | phase | what happened>
```

## One tick: route by phase

Every tick: read STATE.md (create it, Cycle 1 Phase PLAN, if missing), `git status`, `git log -5`.
If the working tree has changes that are not this cycle's builders' work, touch nothing, log it,
tell the owner, and wait. Then do the phase's step:

### PLAN
Spawn ONE `opus-planner`. Its brief:
- The task: "write a new plan" (no plan for this cycle), or "check and enrich this plan" (a plan
  exists but is not yet approved, or the owner asked for changes: include their exact words).
- Paths: CLAUDE.md, the repo's plan / decision docs, STATE.md, the previous cycle plan and its PR
  outcome, and the plan file to write: `docs/autopilot/CYCLE-<n>-PLAN.md`.
- Where to look for work, in order: owner requests; broken things (failing gates, logs, advisors,
  open review findings); unfinished items in the repo's plans; gaps against the mission (stubs,
  missing empty/error/phone states, untested money or auth logic); quality.
- Horizon: 2 to 3 days of a strong developer's work, as 5 to 8 waves of 3 to 6 slices.
- The plan template below, to be filled exactly.

When it returns: read the plan yourself and send it back to a NEW planner with your notes if a
slice is vague, files collide inside a wave, an interface is missing, or a decision is hidden in a
slice. Then show the owner, in chat: the planner's summary, the waves as one line each, and the
Decisions table. Ask them to approve the plan and answer every decision (use AskUserQuestion for
up to 4 at a time when the session is interactive; otherwise list them numbered with the
recommendation first). Set Phase AWAITING-APPROVAL.

### AWAITING-APPROVAL and AWAITING-SIGNOFF
- Owner approves: write `Approved: <date> by owner` at the top of the plan.
- Owner answers decisions: write each answer in the Sign-off column. Answers that change scope go
  to a NEW planner as an "enrich" task before you continue.
- Owner asks for changes: back to PLAN with an enrich task.
- Approved AND every row signed: Phase BUILD. Until then, build nothing. If this is a /loop run,
  schedule a long heartbeat (3600s, noop) or stop the loop and tell the owner how to restart it.

### BUILD
- First BUILD tick of a cycle: create the branch `autopilot/cycle-<n>-<slug>` from `main` (or from
  the previous cycle's branch if its PR is still open; record the base in STATE.md).
- Run the next wave with the sub-agent-manager rules: all independent slices as fresh
  `sonnet-builder` agents in ONE message, briefs taken from the plan's slice entries plus the
  sub-agent-manager brief template. Wait for completion notifications; never poll (in a /loop,
  schedule a 1200 to 1800s fallback wake-up).
- Check each return the sub-agent-manager way (its report vs `git diff` of its owned files, gates
  yourself). A return that is wrong goes to a NEW builder with a fix brief. You may make a trivial
  fix (a typo, an import) yourself; anything real goes to a builder.
- A builder BLOCKED on something the plan did not settle: if it is a decision the owner signed in
  spirit, settle it and note it in the plan; if it is a genuinely new owner decision, ask the
  owner and keep building the other slices.
- After each wave is green: commit it on the cycle branch (`git add` only the wave's files, clear
  message, the attribution line). Commits on the cycle branch are part of the pre-approved
  pipeline; never commit to or push `main` directly.
- Every slice DONE: Phase REVIEW.

### REVIEW and CORRECT
- Spawn a fresh `opus-reviewer`. Brief: the plan path, the diff range (`<base>..HEAD` of the cycle
  branch), the repo's gate commands, which waves touched UI (browser check at desktop and 390px),
  which touched auth, money, data scoping or secrets (security focus). For a large cycle, spawn
  2 or 3 reviewers in one message, each owning different waves, plus one security-only reviewer.
- PASS: Phase PR.
- CHANGES NEEDED: Phase CORRECT. Turn each finding into a fix slice for a fresh `sonnet-builder`
  (disjoint files, in waves), check returns, commit, then a NEW `opus-reviewer` re-checks the
  fixes and the original findings. Repeat until PASS.
- 3 review rounds without PASS: stop, tell the owner exactly what keeps failing, and wait.

### PR
- Run the gates one last time. Push the cycle branch, open the PR with `gh pr create`: base is the
  branch recorded in STATE.md. Body: what the cycle delivered in plain words, the signed decisions,
  what was verified and how (gates, reviewer verdicts, browser checks), what was not verified,
  known follow-ups, and the PR attribution line. Never merge it yourself unless the owner says so.
- Record the PR URL in STATE.md, tell the owner (PushNotification if available, and chat).
- Cycle n+1, Phase PLAN, and run the PLAN step now (the new planner reads this cycle's PR and
  what was left over).

## The plan template (the planner fills this exactly)

```
# Cycle <n> plan: <theme>
Approved: <blank until the owner approves>

## Mission and goal of this cycle
<what the product is for; what this cycle makes better, from the user's seat>

## Done test for the cycle
<how a person verifies the whole cycle worked, step by step>

## Decisions (owner signs off every row)
| # | Question | Options (recommended first) | Who decides | Sign-off |
<"Who decides": Owner, or Planner recommends. Sign-off: blank until the owner answers>

## Waves
### Wave 1: <theme>  (parallel: yes)
#### Slice 1.1: <title>
- Files owned: <exact paths>
- Build: <exact behavior>
- Interfaces: <exact signatures/types shared with other slices>
- Edge cases: <empty, null, error, permission, 390px>
- Skills to read: <names>
- Done when: <concrete test>
...

## Risks and things out of scope
```

## Limits (always)

- No destructive SQL (`DELETE`, `DROP`, `TRUNCATE`); migrations only when the repo's standing
  approvals cover them, otherwise they are an owner decision in the plan.
- No force-push, history rewrite, `git reset --hard`, `git stash`, branch deletion, or pushing to
  `main`. Work reaches `main` only through the PR.
- Never print, commit or move a secret; never change production environment settings.
- Never touch the owner's uncommitted work.
- CLAUDE.md binds you and every agent you spawn; every brief says so and repeats the rules that
  matter for that task.
- Talk to the owner only in chat, in plain words. Plans and state files are your memory.

## Loop pacing (`/loop /autopilot`)

Pass `/autopilot` back as the ScheduleWakeup prompt each tick.
- Agents in flight: 1200 to 1800s fallback (their completion wakes you anyway).
- A wave just committed, more to build: 60 to 180s.
- Waiting on the owner (approval, sign-off, a blocker, the 3-round stop): 3600s noop heartbeat, or
  stop the loop and tell the owner to say "approved" or rerun `/loop /autopilot`.
- `/autopilot stop` or the owner says stop: Phase STOPPED, ScheduleWakeup with `stop: true`.
