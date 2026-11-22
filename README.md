# My skills

Claude Code skills, one folder per skill under `skills/`. Each has a `SKILL.md` with its full description (the
text Claude uses to decide when to load the skill) in its front matter and the instructions below it.

## Use them

Copy a skill folder into `~/.claude/skills/` (all projects) or `<repo>/.claude/skills/` (one project).

Some skills read a per-machine settings file that is not published. For example, `github-board-to-pr` and
`dev-review` read `github-board-to-pr/projects.json`; copy `projects.example.json` to that name and fill it in.

## Update this repo

```bash
node export.mjs      # copies ~/.claude/skills into skills/, minus private and third-party files
git diff --stat      # review before committing
```

`export.mjs` leaves out Anthropic's bundled skills, sync caches and per-machine config, and swaps private
details (emails, client names, local paths) for placeholders. Add any new private detail to its `REDACT` list
before pushing.
