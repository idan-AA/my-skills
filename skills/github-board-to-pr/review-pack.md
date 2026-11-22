# Review pack

Every card github-board-to-pr ships leaves a review pack, so the owner can review it later without re-reading
the code (the `dev-review` skill reads it). It lives OUTSIDE the worktree, so it is never committed:

```
<buildsRoot>/_review/<slug>/
  review.json
  shots/01-desktop-units-list.png
  shots/02-phone-units-list.png
  ...
```

## review.json

```json
{
  "slug": "units-floor-field",
  "title": "Units: add a floor field",
  "issue": 141,
  "pr": 162,
  "branch": "build/units-floor-field",
  "worktree": "C:/Users/you/Desktop/your-app-builds/units-floor-field",
  "outcome": "ready",
  "asked": "One or two plain sentences: what the card asked for, in the card's own terms.",
  "built": [
    "Units table: new Floor column, sortable.",
    "Unit page: Floor is editable next to Apartment."
  ],
  "risk": ["migration"],
  "migrations": [
    { "file": "supabase/migrations/20261122100000_units_floor.sql",
      "plain": "Adds an optional floor number to every unit. Existing units get none. Changes the live database." }
  ],
  "setup": "migration",
  "check": [
    { "url": "/units/4b1c...", "record": "Unit 4B, 12 Main St",
      "steps": ["Open the unit", "Set Floor to 4, Save", "Reload: Floor still reads 4", "Units list shows 4 in the Floor column"] }
  ],
  "screenshots": [
    { "file": "shots/01-desktop-unit-page.png", "caption": "Unit page, Floor saved as 4", "width": "desktop" },
    { "file": "shots/02-phone-unit-page.png",  "caption": "Same at 390px", "width": "phone" }
  ],
  "visualCheck": "done",
  "reviewer": { "verdict": "approve", "blocking": 0, "shouldFix": 0, "summary": "One line." },
  "openItems": ["Anything not done or worth knowing, plain words. Empty list if none."],
  "touches": ["app/(dashboard)/units/[id]/page.tsx", "supabase/migrations/20261122100000_units_floor.sql"],
  "dependsOn": [158],
  "updatedAt": "2026-11-22T14:05:00Z"
}
```

Field rules:
- `outcome`: `ready` | `needs-attention`.
- `risk`: zero or more of `migration`, `money`, `auth`, `access` (tenant/portal/role rules), `outbound` (email, SMS,
  calls, anything that reaches a real person), `cron`, `webhook`, `data-delete`. Empty = low risk. Set it from what the
  change actually does, then also check the project's `devReview.riskPaths` against the changed files and add any hit.
- `setup`: `screenshots` | `preview` | `local` | `migration` | `backend` | `diff`. The way a reviewer can SEE it
  (table in the dev-review skill, step 2). A migration always means `migration`.
- `check`: the exact screen (path relative to the app root), the real record used, and the clicks. Not "go to the
  units page".
- `screenshots`: one per screen checked, desktop and phone (about 390px), named in check order. Real data, after the
  action, not the empty page before it. Paths are relative to the pack folder.
- `visualCheck`: `done` | `not-possible: <plain reason>`. Never `done` without the screenshots.
- `touches`: every file the PR changes (`git diff --name-only origin/<base>`).
- `dependsOn`: PR numbers that must merge first.

On a "send back" round, update the same pack (new screenshots replace old ones with the same name; bump `updatedAt`).
