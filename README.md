# Claude HUD

A Claude Code plugin that shows what's happening — context usage, active tools, running agents, and todo progress. Always visible below your input.

[![License](https://img.shields.io/github/license/jarrodwatts/claude-hud?v=2)](LICENSE)
[![Stars](https://img.shields.io/github/stars/jarrodwatts/claude-hud)](https://github.com/jarrodwatts/claude-hud/stargazers)

![Claude HUD in action](claude-hud-preview-5-2.png)

## Install

Inside a Claude Code instance, run the following commands:

**Step 1: Add the marketplace**
```
/plugin marketplace add jarrodwatts/claude-hud
```

**Step 2: Install the plugin**
```
/plugin install claude-hud
```

**Step 3: Configure the statusline**
```
/claude-hud:setup
```

Done! The HUD appears immediately — no restart needed.

---

## What is Claude HUD?

Claude HUD gives you better insights into what's happening in your Claude Code session.

| What You See | Why It Matters |
|--------------|----------------|
| **Project name** | Always know which project you're working in |
| **Context health** | Know exactly how full your context window is before it's too late |
| **Usage limits** | Track your Pro/Max rate limit usage (5-hour and 7-day windows) |
| **Tool activity** | Watch Claude read, edit, and search files as it happens |
| **Agent tracking** | See which subagents are running and what they're doing |
| **Todo progress** | Track task completion in real-time |

## What Each Line Shows

### Session Info
```
📁 my-project git:(main) | [Opus 4.5 | Max] ████░░░░░░ 19% | 2 CLAUDE.md | 5h: 12% | 7d: 17% | ⏱️ 1m
```
- **Project + Branch** — Current working directory and git branch
- **Model + Plan** — Current model and subscription tier (Pro/Max/Team)
- **Context bar** — Visual meter with color coding (green → yellow → red as it fills)
- **Config counts** — CLAUDE.md files, rules, MCPs, hooks loaded
- **Usage limits** — 5-hour and 7-day rate limit consumption (opt-in, see below)
- **Duration** — How long the session has been running

### Tool Activity
```
✓ TaskOutput ×2 | ✓ mcp_context7 ×1 | ✓ Glob ×1 | ✓ Skill ×1
```
- **Running tools** show a spinner with the target file
- **Completed tools** aggregate by type with counts

### Agent Status
```
✓ Explore: Explore home directory structure (5s)
✓ open-source-librarian: Research React hooks patterns (2s)
```
- **Agent type** and what it's working on
- **Elapsed time** for each agent

### Todo Progress
```
✓ All todos complete (5/5)
```
- **Current task** or completion status
- **Progress counter** (completed/total)

---

## How It Works

Claude HUD uses Claude Code's native **statusline API** — no separate window, no tmux required, works in any terminal.

```
Claude Code → stdin JSON → claude-hud → stdout → displayed in your terminal
           ↘ transcript JSONL (tools, agents, todos)
```

**Key features:**
- Native token data from Claude Code (not estimated)
- Parses the transcript for tool/agent activity
- Updates every ~300ms

---

## Usage Limits (Pro/Max/Team)

Track your rate limit usage directly in the statusline.

```
📁 my-project git:(main) | [Opus 4.5 | Max] ████░░ 45% | 5h: 23% | 7d: 45%
```

When you hit 100%:
```
📁 my-project git:(main) | [Opus 4.5 | Max] ████░░ 45% | ⚠ Limit reached (resets 2h 15m)
```

### Enabling Usage Display

Usage limits are **opt-in**. Add to your shell profile (`.bashrc`, `.zshrc`, etc.):

```bash
export CLAUDE_HUD_SHOW_USAGE=1
```

### Limitations

| Limitation | Details |
|------------|---------|
| **Pro/Max/Team only** | API users don't have rate limits to display |
| **60-second cache** | Data refreshes every 60 seconds, not real-time |
| **Undocumented API** | Uses Claude Code's OAuth endpoint (may change) |

### API Cost

**None.** This checks your usage via Claude Code's existing OAuth token — no additional API calls or tokens consumed.

### Troubleshooting

If you see `usage: ⚠` (yellow warning):
- The API call failed — enable `DEBUG=claude-hud` to see the error
- This can happen if the undocumented API changes or is temporarily unavailable

If usage doesn't appear at all:
1. Verify `CLAUDE_HUD_SHOW_USAGE=1` is set in your environment
2. Confirm you're logged in with Pro/Max/Team (not API key)
3. Enable debug logging: `DEBUG=claude-hud` to see errors

### Security

This feature reads your existing Claude Code OAuth token from `~/.claude/.credentials.json`. The token is:
- **Only sent to** `api.anthropic.com` (hardcoded, not configurable)
- **Never logged** in debug output or error messages
- **Read-only** — no modifications to your credentials

The same token Claude Code already uses for authentication.

---

## Layout Options

Customize the statusline layout with `CLAUDE_HUD_LAYOUT`:

```bash
export CLAUDE_HUD_LAYOUT=default     # Everything on line 1 (original)
export CLAUDE_HUD_LAYOUT=condensed   # Split: model/usage top, project bottom
export CLAUDE_HUD_LAYOUT=separators  # Split with separator lines
```

### Default Layout
```
[Opus 4.5 | Max] ████░░ 45% | my-project git:(main) | 1 CLAUDE.md | 2 hooks | 5h: 23% (2h 15m) | ⏱️ 12m
✓ Read ×3 | ✓ Edit ×1
```

### Condensed Layout
```
[Opus 4.5 | Max] ████░░ 45% | 5h: 23% (2h 15m) | ⏱️ 12m
✓ Read ×3 | ✓ Edit ×1
📁 my-project git:(main) | 1 CLAUDE.md | 2 hooks
```

### Separators Layout
```
[Opus 4.5 | Max] ████░░ 45% | 5h: 23% (2h 15m) | ⏱️ 12m
──────────────────────────────────────────────────────────
✓ Read ×3 | ✓ Edit ×1
──────────────────────────────────────────────────────────
📁 my-project git:(main) | 1 CLAUDE.md | 2 hooks
```

---

## Requirements

- Claude Code v1.0.80+
- Node.js 18+ or Bun

---

## Development

```bash
git clone https://github.com/jarrodwatts/claude-hud
cd claude-hud
npm ci && npm run build
npm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

MIT — see [LICENSE](LICENSE)