# Flexible HUD Configuration Design

## Problem

The current config allows toggling elements on/off but not:
- Repositioning elements between lines
- Reordering elements within a line
- Customizing separators between elements

Users want control over WHERE things appear, not just IF they appear.

## Current State

```
Line 1 (session):  📁 project git:(main*) | [Opus] ████░░ 45% | 2 rules | 5h: 23% | ⏱️ 5m
Line 2 (tools):    ◐ Edit: auth.ts | ✓ Read ×3
Line 3 (agents):   ◐ explore [haiku]: Finding code (2s)
Line 4 (todos):    ▸ Fix authentication bug (2/5)
```

Current config only toggles visibility:
```json
{
  "display": {
    "showModel": true,
    "showTools": true,
    ...
  }
}
```

---

## Proposal A: Slot-Based Layout

Define named slots, users assign elements to slots.

### Config Schema

```json
{
  "layout": {
    "line1": ["project", "git", "model", "context", "usage", "duration"],
    "line2": ["configCounts"],
    "separator": true,
    "activityLines": ["tools", "agents", "todos"],
    "bottomLine": []
  },
  "elements": {
    "project": { "pathLevels": 1 },
    "git": { "showDirty": true, "showAheadBehind": false },
    "context": { "showBar": true, "showPercent": true },
    "usage": { "show5h": true, "show7d": "auto" }
  }
}
```

### Available Elements

| Element | Description | Example Output |
|---------|-------------|----------------|
| `project` | Project folder name | `📁 my-project` |
| `git` | Git branch + status | `git:(main*)` |
| `model` | Model name + plan | `[Opus \| Max]` |
| `context` | Context bar + percent | `████░░ 45%` |
| `usage` | Usage limits | `5h: 23% (2h)` |
| `duration` | Session time | `⏱️ 5m` |
| `configCounts` | Rules, MCPs, hooks | `2 rules \| 5 MCPs` |
| `tokens` | Token breakdown | `(in: 45k, cache: 10k)` |

### Pros
- Very flexible
- Users control exact layout
- Easy to add new elements

### Cons
- More complex config
- Harder to configure via AskUserQuestion
- Easy to create broken layouts

---

## Proposal B: Preset + Overrides

Offer preset layouts, allow element-level overrides.

### Config Schema

```json
{
  "preset": "two-line",
  "overrides": {
    "usage": { "line": 1 },
    "configCounts": { "line": 2 },
    "duration": { "visible": false }
  }
}
```

### Presets

**`compact`** (current default)
```
[Opus] ████░░ 45% | my-project git:(main*) | 2 rules | 5h: 23% | ⏱️ 5m
◐ Edit: auth.ts | ✓ Read ×3
```

**`two-line`** (split status/project)
```
[Opus | Max] ████░░ 45% | 5h: 23% (2h) | ⏱️ 5m
📁 my-project git:(main*) | 2 rules | 5 MCPs | 3 hooks
◐ Edit: auth.ts | ✓ Read ×3
```

**`minimal`** (context-focused)
```
████░░ 45% | 5h: 23%
◐ Edit: auth.ts
```

**`full`** (everything visible)
```
[Opus | Max] ████░░ 45% | 5h: 23% (2h 15m) | 7d: 12% | ⏱️ 5m
📁 apps/my-project git:(main*↑2↓1) | 2 CLAUDE.md | 3 rules | 5 MCPs | 3 hooks
───────────────────────────────────────────────────
◐ Edit: src/auth.ts | ✓ Read ×3 | ✓ Grep ×2
◐ explore [haiku]: Finding auth code (2s)
▸ Fix authentication bug (2/5)
───────────────────────────────────────────────────
```

### Pros
- Simple to understand
- Easy to configure via questions
- Safe defaults, hard to break

### Cons
- Less flexible than Proposal A
- Overrides can get complex

---

## Proposal C: Component Blocks (Hybrid)

Define blocks, each block is a line. Elements assigned to blocks.

### Config Schema

```json
{
  "blocks": [
    {
      "name": "status",
      "elements": ["model", "context", "usage", "duration"],
      "separator": false
    },
    {
      "name": "project",
      "elements": ["project", "git", "configCounts"],
      "separator": false
    },
    {
      "name": "activity",
      "elements": ["tools", "agents", "todos"],
      "separator": true,
      "collapsible": true
    }
  ],
  "elementConfig": {
    "git": { "showDirty": true },
    "project": { "pathLevels": 2 }
  }
}
```

### Pros
- Clear mental model (blocks = lines)
- Separators per-block
- Future: collapsible blocks

### Cons
- More complex than presets
- Requires understanding block concept

---

## AskUserQuestion Flow

For any proposal, the configuration flow would be:

### Question 1: Start with preset
```
"Which layout do you prefer?"
- Compact (all on one line)
- Two-line (status top, project bottom)
- Minimal (just context + activity)
- Full (everything visible)
- Custom (build your own)
```

### Question 2: If Custom, pick elements for Line 1
```
"What should appear on the top line?"
[multiSelect: true]
- Model name [Opus]
- Context bar ████░░
- Usage limits (5h: 23%)
- Session duration (⏱️ 5m)
- Project name (📁 my-project)
- Git status (main*)
```

### Question 3: Pick elements for Line 2
```
"What should appear on the second line?"
[multiSelect: true]
- Project name
- Git status
- Config counts (rules, MCPs, hooks)
- Nothing (skip this line)
```

### Question 4: Activity preferences
```
"Which activity lines do you want?"
[multiSelect: true]
- Tools (Edit, Read, Grep...)
- Agents (explore, plan...)
- Todos (task progress)
```

### Question 5: Separators
```
"Add separator lines around activity?"
- Yes (───────────)
- No
```

---

## Recommendation

**Start with Proposal B (Presets + Overrides)** because:

1. Easiest to implement
2. Works well with AskUserQuestion (pick a preset)
3. Power users can still customize via JSON overrides
4. Safer - presets are tested layouts
5. Can evolve to Proposal A/C later if needed

### Implementation Order

1. Define 4-5 presets in code
2. Add `preset` field to config, default to current layout
3. Add AskUserQuestion flow for preset selection
4. Add override support for power users
5. Document all options in README

---

## Questions for Review

1. Which proposal direction feels right?
2. Are the proposed presets useful, or would you change them?
3. Should "Custom" mode use AskUserQuestion multi-step, or just tell users to edit JSON?
4. Any elements missing that you'd want to position?
