# Claude Code Changelog Generator

A Product Ops tool that generates user-friendly changelogs from merged PRs in anthropics/claude-code.

## What It Does

- Fetches last 7 days of merged PRs from the Claude Code repo
- Filters out internal changes (tests, CI, refactors)
- Rewrites technical PR titles into plain-English explanations
- Groups changes by category (New Features, Improvements, Bug Fixes)
- Outputs a changelog that non-technical stakeholders can understand

## Usage
```bash
node changelog-generator.js
```

Output is written to `changelog.md`.

## Sample Output

See [sample_changelog.md](sample_changelog.md) for an example output.

## Built With

Built using Claude Code in ~1 hour.
cp changelog.md sample_changelog.md
