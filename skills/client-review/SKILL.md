---
name: client-review
description: The client-facing version of dev-review. Turns the cards in "Needs Client Review" on a GitHub project board into one plain, non-technical "What's new" page for the CLIENT, with a before and after screenshot of every changed screen, what they asked for, what changed, and how to try it. The owner sends the link or uses the page's Walk-through mode to take the client through it live; the client does not leave feedback on the page. Afterwards the owner tells you what the client said and you record it on the board. Use when the owner says "/client-review", "client review", "make the client update", "show the client what's new", "before and after for the client", "prepare the client walkthrough", or "what can I show the client".
---

# Client review

The client is not technical. They want to know three things per change: **what did I ask for, what does it look like
now compared to before, and where do I go to use it.** Nothing else goes on the page.

```
1 gather     cards in Needs Client Review + their PRs + review packs
2 write      each card in the client's words (title, asked, changed, where, steps)
3 shoot      a BEFORE and AFTER screenshot of every changed screen, same record, same size
4 page       render, owner reads it, publish a new page for this round
5 present    owner sends the link or walks the client through (Walk-through button)
6 record     owner says what the client thought -> comments on the cards; changes go back to Needs Building
```

## Decisions the owner already made (do not re-ask)

- **The page is a pack the owner sends or presents.** No feedback form, no comment box, no approve buttons on it.
- **Client-facing means:** no PR or issue numbers, no branch, merge, migration, database, deploy, code, risk, reviewer
  or agent notes. `render.mjs` refuses to render if any of that slips in.
- **The owner reads the page before the client sees it.** You never send it to the client yourself.

## Project settings

Same `projects.json` as `github-board-to-pr` (`~/.claude/skills/github-board-to-pr/projects.json`), same matching. It
reuses `devReview` (`reviewRoot`, `devCommand`, `portRange`, `login`) and adds a `clientReview` block:

```json
"clientReview": {
  "appName": "the product name the client knows",
  "clientName": "who the page is for (shown as 'Prepared for ...')",
  "appUrl": "the live address the client signs in at",
  "sender": "how the page signs off, a role or company name, never a person unless the owner says so",
  "rounds": [ { "date": "2026-11-23", "url": "<artifact url>", "cards": [141, 150] } ]
}
```

If it is missing, work out what you can from the repo (README, app metadata, the production domain), ask the owner for
the rest in ONE question, and save it.

## 1. Gather

```bash
GH="/c/Program Files/GitHub CLI/gh.exe"
"$GH" project item-list <n> --owner <owner> --limit 500 --format json > "$S/board.json"   # once per run
```

Cards in scope: status = `status.clientReview`. For each, find its PR (`Closes #<issue>`, else branch `build/<slug>`,
else title; merged PRs too: `gh pr list --state all`). Load the review pack `<reviewRoot>/<slug>/review.json` if there
is one (format: `~/.claude/skills/github-board-to-pr/review-pack.md`). Read the card body and its comments: the
client's own words are usually there.

If the owner names cards (`/client-review #141 #150`), do only those. If the column is empty, say so and stop.

**Is it live for the client?** A change is `live` only if its PR is merged into the production branch AND production
has been updated (some projects stage builds and need a manual promote; check the project's memory or docs). If you
cannot tell, ask the owner once for the whole round. Anything not live shows as "Coming soon" and gets no "Try it"
steps that would fail.

**Leave off the page:** cards with nothing the client can see or feel (refactors, speed work they did not ask about,
internal tools). List them to the owner in one line; the owner can ask for a "behind the scenes" line instead.

## 2. Write each card for the client

Write `<reviewRoot>/client/<date>/page-data.json` (shape at the top of `render.mjs`). Per card:

- `title`: what they can do now, in their words. "Record which floor each unit is on", not "Units: add floor field".
- `asked`: one sentence of what they asked for, from the card or their message.
- `changed`: one to three short lines, each something they will see or do differently.
- `where`: the menu path in the words on the screen ("Units, then open any unit").
- `steps`: two to five clicks to try it, on a real kind of record ("Open any unit. Type the floor. Press Save.").
- `note` (optional): one line they need to know ("Units you already have start with no floor; fill it in as you go").

Language rules (the same bar as the build-with-the-user-in-mind skill's staff-language rule):
- The words on their screen, not ours. Say "box", "button", "page", "list"; never "field", "component", "modal",
  "endpoint", "toggle state".
- Short sentences. No jargon, no abbreviations they did not use first, no em dashes.
- A fix is told as what now works: "Saving a lease now keeps the signed date" (not "fixed a bug where...").
- No person's name unless it is the client's own word for a role.

## 3. Before and after screenshots

Every changed screen gets a pair. **Same screen, same record, same window size, same scroll.** That is what makes the
pair readable; a before of one record and an after of another is worse than none.

**After.** Reuse the pack's screenshots only if they show the finished state on a record you can also open in the
before version, at 1440x900 (desktop) or 390x844 (phone), with nothing technical on screen. Otherwise take it fresh from
the code that is now live (or will be: the merged branch).

**Before.** Use the pack's `before` screenshots if it has them (github-board-to-pr takes them at build start). If not:
1. Find the code just before the change: merged PR -> `git rev-parse <mergeCommit>^1`; unmerged -> `git merge-base
   origin/<base> origin/<head>`.
2. `git -C <repoRoot> worktree add --detach "<buildsRoot>/_before/<slug>" <sha>`, plus the node_modules junction
   github-board-to-pr uses. If `package.json` differs from the repo root's, run `npm ci` there instead.
3. Start `devCommand` there on a free port in `portRange` (`netstat -ano | grep :<port>` must be empty), sign in per
   `devReview.login` (read the code from YOUR server's output, never print credentials).

**Taking each shot** (chrome-devtools MCP, the browser-verification skill):
- Open the exact screen and record from the card's `check`. Set the size with `resize_page` (1440x900 desktop; 390x844
  phone, only for screens the client uses on a phone or when the change was about phones).
- Hide anything that is not the product before shooting: the framework's dev badge and error overlay, test banners,
  your own cursor highlights. For Next.js: `document.querySelectorAll('nextjs-portal').forEach(e=>e.remove())`.
- Do the job the card is about in the AFTER shot (the floor typed and saved, the new button visible), so the change is
  actually on screen. The BEFORE shot shows the same spot with the old behaviour.
- A brand-new page has no before. Take the before of the place the client used to go for that job (where the new
  button now is), and set `beforeNote` to one line like "There was no Floor box here before."
- If a before cannot be taken honestly (the old screen will not run, the bug cannot be shown), set `before: null` and a
  plain `beforeNote`. Never stage or fake one.
- Check each shot for other customers' data or internal notes. Re-shoot on another record, or crop, if it has any.
- Save shots to `<reviewRoot>/client/<date>/shots/<slug>-<screen>-<before|after>-<desktop|phone>.png`.

Stop every server you started and remove the `_before` worktrees when the shots are done
(`git worktree remove <path>`). Never stop a server you did not start.

**Lessons from the first real round (2026-11-23), follow them:**
- **One shared "before" per round is fine and often clearer.** When many cards landed over a few days, use ONE
  before version (the production branch just before the first card's work merged) and ONE after version (the branch
  that holds all of it). Two servers total, not one per card. Say in the intro that "before" is the app before this
  round.
- **Match production's settings.** Feature switches that production turns on (YourApp: `PACKETS_V2=1`) must be in the
  worktrees' `.env.local` before the servers start, or screens differ from what the client sees. Check the project's
  flags file before shooting.
- **Sign in without seeing the password:** write a small fill script from `.env` into the scratchpad and run it with
  `evaluate_script` `sourcePath`. Both servers share one database, so a fresh code from one server can cancel the
  other's; ask for a new code if one says "No code is waiting".
- **Wait for real content, not for "Loading" text to vanish.** Spinners and grey placeholder bars have no text. Use
  `wait_for` on a value you expect (a total, a name), then shoot.
- **Menus built on pointer events** do not open with `.click()`; dispatch `pointerdown`/`pointerup`, or use the
  `click` tool with a snapshot uid.
- **Save shots inside the scratchpad.** The browser tool and the Artifact upload can only read the session folder;
  copy to `<reviewRoot>` afterwards for keeping.
- **Phone width:** the browser window may not go below about 500px; that still shows the phone layout. Fine.
- **If a screen needs something only production has** (a key, a live connection), do not fake it: move that change
  to the `behind` list ("Also done") in one plain line.
- **Removing worktrees:** first unlink the `node_modules` junction with `cmd /c rmdir <path>` (PowerShell
  `Remove-Item` can follow it and delete the real folder), confirm the real `node_modules` is still there, then
  `git worktree remove --force`.

## 4. Render and publish

1. Read each screenshot with the Read tool once, to check it shows what the caption says.
2. Render a first time with local paths to proof it:
   ```bash
   node ~/.claude/skills/client-review/render.mjs "<round>/page-data.json" "<round>/client-review.html"
   ```
   It fails on banned words, numbers like "#141", em dashes, missing after shots, and missing before notes. Fix the
   words, never the check.
3. **Publish a new page each round** (the client gets one clear page per update, not a growing list). Publish the
   html with `icon: "sparkle"`, `capabilities: {assets: {}}`, and a description like "What's new in <appName>,
   <date>". Upload the screenshots to it (`asset: true`, `file_paths`, up to 25 per call), put each returned `url` in
   `page-data.json`, re-render, republish to the same file path. Save the round in `clientReview.rounds`.
4. Show the owner, in chat:
```
Client update ready: <link>  (private until you share it)
  4 changes, 7 before/after pairs. 3 live now, 1 coming soon.
  Left off (nothing the client sees): speed-up of the home page.
Read it first. Then share the link, or open it and press "Walk through" to present it.
```
   Also show each pair inline (Read the images) so the owner can approve the shots without opening the page.

## 5. Present

The page has a **Walk through** button: one change per screen, big before/after, arrow keys or Next/Back. Offer to open
it in the owner's Chrome (claude-in-chrome) for a live call. Sharing the link is the owner's job; artifacts start
private, and the owner chooses who sees it.

## 6. Record what the client said

When the owner reports back ("they loved 1 and 3, want the floor on the list too"), for each card:
- **Happy:** comment on the issue `**Client review (<date>):** approved.` plus their words if any. Then ask once for the
  whole round: "Move the N approved cards to Done?" and move only on yes.
- **Wants changes:** comment on the issue with the client's words, verbatim, under
  `**Client asked for changes (client-review, <date>):**`, and move the card to `status.queue` (Needs Building). Say in
  one line that the PR is already merged, so the next build run starts a new branch from the card.
- **Not shown / no answer:** write nothing; it stays in Needs Client Review.

## Rules

- Never send, share or email the page to the client yourself. The owner does.
- Never put anything technical on the page; if render.mjs rejects a word, rewrite the sentence.
- Never fake, mock up or edit a screenshot to show something the app does not do. Cropping to hide data is fine.
- Never write to the live database to set up a shot beyond the normal job the card is about, and never press a button
  that reaches a real person (send, sign, confirm, email, SMS). If the after shot needs that, shoot the screen just
  before the final press and say so in the caption.
- Never print secrets; refer to env vars by name.
- Never move a card except as step 6 says.
