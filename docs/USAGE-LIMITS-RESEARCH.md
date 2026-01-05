# Usage Limits Research

Research notes for implementing usage limit display in claude-hud statusline.

**Last Updated:** 2026-01-05

---

## 🚨 Critical Issues & Blockers

### Summary

| Feature | Status | Reason |
|---------|--------|--------|
| **Session cost (API users)** | ❌ BLOCKED | No `output_tokens` in stdin |
| **Usage limits (Pro/Max)** | ✅ VIABLE | Undocumented API, but works with disclaimer |

---

### 1. Session Cost - BLOCKED

**Problem:** Cannot calculate accurate session cost for API users.

**Actual stdin structure** (from `src/types.ts`):
```typescript
current_usage?: {
  input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  // NO output_tokens!
};
```

**Why this blocks us:**
- Output tokens are 3-5x more expensive than input
- Showing input-only cost = ~20-30% of actual cost
- Would be **misleading** to users

**Verdict:** Don't implement session cost display. Would cause more confusion than value.

---

### 2. OAuth Usage API - VIABLE (with caveats)

The `https://api.anthropic.com/api/oauth/usage` endpoint is **undocumented but functional**.

| Concern | Severity | Mitigation |
|---------|----------|------------|
| API could change/break | ⚠️ Medium | Graceful degradation, show "unavailable" |
| Possible ToS grey area | ⚠️ Low | Using same auth as Claude Code itself |
| Stability not guaranteed | ⚠️ Medium | Cache results, handle errors gracefully |

**What it's NOT:**
- ❌ Not a security risk - reading same creds Claude Code uses
- ❌ Not exposing new data - just reading existing credentials
- ❌ Not sending data externally - only to Anthropic's own API

**Requirements for implementation:**
1. User opt-in (explicit consent)
2. Disclaimer in docs that API is undocumented
3. Graceful handling if API changes or fails

---

### 3. macOS Keychain Behavior

```bash
security find-generic-password -s "Claude Code-credentials" -w
```

**Note:** May trigger system permission dialog on macOS.

**Mitigation:** Document this behavior, handle denial gracefully, show "credentials unavailable" if access denied.

---

### 4. Upstream Status

**Issue #5621** - Community request for usage data in stdin.

| Status | Details |
|--------|---------|
| State | OPEN, no Anthropic response |
| Community | 10+ "+1" comments |
| Risk | Marked for auto-close due to inactivity |
| Partial win | `cost.total_cost_usd` added in v1.0.85, but NOT usage limits |

**Best solution:** Anthropic exposes usage data directly in stdin.

This would:
- Eliminate need for separate API calls
- Remove undocumented API dependency
- Work for all users automatically

---

### 5. Existing Implementations

Others have implemented this workaround:

| Repo/Tool | Approach |
|-----------|----------|
| **TylerGallenbeck/claude-code-limit-tracker** | Parses local JSONL logs, estimates usage (no API call) |
| **eddmann/ClaudeMeter** | macOS menu bar app, calls OAuth API |
| **Melvynx's script** | Calls OAuth API directly (source of reverse-engineering) |

Multiple tools use the OAuth API successfully - it works, just undocumented.

---

### 6. Token Security Clarification

For users concerned about credential access:

**What an attacker COULD do with the token:**
- Make API calls as you (inference)
- See your profile info

**What an attacker COULD NOT do:**
- Access billing/payment info
- Make purchases
- Change account settings
- Access other Anthropic services

**Why exposure is limited:**
- Token is short-lived (8-24h)
- Scopes are restricted: `user:inference`, `user:profile`, `user:sessions:claude_code`
- VS Code has no sandboxing (platform limitation, not our fault)

---

### 7. Recommended User Disclaimer

If implemented, show this warning to users:

> ⚠️ **Undocumented API Notice**
>
> This feature uses an undocumented Anthropic API discovered via reverse-engineering.
> It may stop working without notice if Anthropic changes their internal APIs.
> Your usage data is only sent to Anthropic's servers - no third parties.

---

## ⚠️ Additional Considerations

### Display/UX

| Issue | Recommendation |
|-------|----------------|
| **Terminal truncation** | Define priority: Model > Context > Most-limiting usage > Reset times |
| **Colorblind users** | Add text indicators `[OK]` `[WARN]` `[CRIT]` alongside colors |
| **Disable option** | Essential - add config to hide usage info entirely |
| **Show one limit only** | Config option to show only 5h OR 7d, not both |

### Authentication Edge Cases

| Scenario | Recommendation |
|----------|----------------|
| Both API key + OAuth present | Detect what Claude Code is **actually using**, not just env var existence |
| Team/Enterprise plans | Need research - may have different `subscriptionType` values |
| User switches auth mid-session | May need to re-detect on each render cycle |

### Cost Calculation (if implemented)

| Issue | Recommendation |
|-------|----------------|
| Hardcoded pricing | Add "estimate" label + last-updated date |
| New models | Graceful fallback to "unknown" rate |
| Currency | Always USD with label, or allow config |

### Performance

| Concern | Recommendation |
|---------|----------------|
| Credential file reads | Cache file content, re-read only when modified (file watcher) |
| API call latency | Must be fully async, never block statusline render |

### Testing Requirements

| Need | Solution |
|------|----------|
| Test without real creds | Mock credential files in test fixtures |
| Test expired tokens | Mock API responses |
| Test API failures | Mock network errors |

---

## Table of Contents

1. [User Types & Billing Models](#user-types--billing-models)
2. [OAuth Usage API](#oauth-usage-api)
3. [Platform-Specific Credential Access](#platform-specific-credential-access)
4. [🚨 Security Considerations](#-security-considerations)
5. [Error Handling & Edge Cases](#error-handling--edge-cases)
6. [Token Lifecycle](#token-lifecycle)
7. [API Users (Pay-per-Token)](#api-users-pay-per-token)
8. [Implementation Recommendations](#implementation-recommendations)
9. [Privacy & Consent](#privacy--consent)
10. [Open Questions](#open-questions)
11. [References](#references)

---

## User Types & Billing Models

### Subscription Tiers

| Tier | Price | Usage Limits | Claude Code Access | Opus Access |
|------|-------|--------------|-------------------|-------------|
| **Free** | $0 | ~40 msgs/day, 5hr reset | ❌ No | ❌ No |
| **Pro** | $20/mo | ~45 msgs/5hr, weekly cap | ✅ Yes | ❌ No |
| **Max 100** | $100/mo | 5x Pro limits | ✅ Yes | ✅ Yes |
| **Max 200** | $200/mo | 20x Pro limits | ✅ Yes | ✅ Full |

**Key Insight:** Free tier users do NOT have Claude Code access, so this feature only applies to Pro/Max/API users.

### Authentication Precedence

Claude Code checks authentication in this order:
1. `ANTHROPIC_API_KEY` environment variable (API pay-per-use)
2. OAuth token (Pro/Max subscription)
3. Subscription credentials

If `ANTHROPIC_API_KEY` is set, it takes precedence over subscription OAuth.

---

## OAuth Usage API

### Endpoint

```
GET https://api.anthropic.com/api/oauth/usage
```

### Required Headers

```http
Authorization: Bearer <oauth-access-token>
anthropic-beta: oauth-2025-04-20
User-Agent: claude-code/2.0.32
```

### Response Format

```json
{
  "five_hour": {
    "utilization": 6.0,
    "resets_at": "2026-01-05T09:59:59.950981+00:00"
  },
  "seven_day": {
    "utilization": 13.0,
    "resets_at": "2026-01-11T02:59:59.951006+00:00"
  },
  "seven_day_oauth_apps": null,
  "seven_day_opus": null,
  "seven_day_sonnet": {
    "utilization": 1.0,
    "resets_at": "2026-01-11T02:59:59.951016+00:00"
  },
  "iguana_necktie": null,
  "extra_usage": {
    "is_enabled": false,
    "monthly_limit": null,
    "used_credits": null,
    "utilization": null
  }
}
```

### Available Fields

| Field | Type | Description |
|-------|------|-------------|
| `five_hour.utilization` | number | % of 5-hour rolling limit used (0-100) |
| `five_hour.resets_at` | ISO string | When the 5-hour window resets |
| `seven_day.utilization` | number | % of weekly limit used (0-100) |
| `seven_day.resets_at` | ISO string | When the weekly limit resets |
| `seven_day_sonnet.utilization` | number \| null | Sonnet-specific weekly usage |
| `seven_day_opus.utilization` | number \| null | Opus-specific (null on some plans) |
| `extra_usage.is_enabled` | boolean | Whether extra credits are enabled |
| `extra_usage.used_credits` | number \| null | Credits used if enabled |

---

## Platform-Specific Credential Access

### macOS

Credentials stored in **encrypted Keychain**.

```bash
# Access credentials
security find-generic-password -s "Claude Code-credentials" -w
```

Returns JSON with `claudeAiOauth` object.

### Linux / WSL

Credentials stored in **plain JSON file**.

```bash
# File location
~/.claude/.credentials.json

# Extract token
jq -r '.claudeAiOauth.accessToken' ~/.claude/.credentials.json
```

### Windows (Native)

Same as Linux - JSON file in user home:

```
C:\Users\<username>\.claude\.credentials.json
```

Or via WSL path: `/mnt/c/Users/<username>/.claude/.credentials.json`

**Important:** WSL and Windows native Claude Code have **separate** credential files with **different** tokens and expiry times!

### Credential File Structure

```json
{
  "claudeAiOauth": {
    "accessToken": "sk-ant-oat01-...",
    "refreshToken": "sk-ant-ort01-...",
    "expiresAt": 1767625128924,
    "subscriptionType": "max",
    "rateLimitTier": "default_claude_max_20x",
    "scopes": [
      "user:inference",
      "user:profile",
      "user:sessions:claude_code"
    ]
  }
}
```

### Useful Metadata from Credentials

| Field | Value | Use Case |
|-------|-------|----------|
| `subscriptionType` | "pro", "max" | Determine user tier |
| `rateLimitTier` | "default_claude_max_20x" | Understand limit multiplier |
| `expiresAt` | Unix timestamp (ms) | Check if token expired locally |

---

## 🚨 Security Considerations

### Important Context

**This plugin does NOT introduce credential storage vulnerabilities.** Claude Code itself stores credentials in these locations. We are only *reading* existing credentials that Anthropic's tooling already manages.

However, implementers should be aware of the security landscape:

### Platform Security Matrix

| Platform | Storage Method | Security Level | Notes |
|----------|---------------|----------------|-------|
| **macOS** | Keychain (encrypted) | ✅ Secure | OS-level encryption, biometric unlock |
| **Linux** | JSON file (`~/.claude/`) | ⚠️ Plaintext | File permissions only protection |
| **WSL** | JSON file (`~/.claude/`) | ⚠️ Plaintext | Same as Linux |
| **Windows** | JSON file (`%USERPROFILE%\.claude\`) | ⚠️ Plaintext | File permissions weaker on Windows |

### Required Permission Validation

Before reading credentials, validate file permissions:

```javascript
const fs = require('fs');
const path = require('path');

function validateCredentialSecurity(credPath) {
  try {
    const stats = fs.statSync(credPath);
    const mode = stats.mode & 0o777;

    // Check if file is readable only by owner (600 or stricter)
    if (mode > 0o600) {
      console.warn(`⚠️ Credentials file has loose permissions: ${mode.toString(8)}`);
      console.warn(`   Recommended: chmod 600 ${credPath}`);
    }

    return { valid: true, permissions: mode };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}
```

### Security Best Practices for Implementation

1. **Never log or expose tokens** - Even in error messages
2. **Validate permissions first** - Warn users about loose file permissions
3. **Use HTTPS only** - All API calls must use HTTPS (already enforced)
4. **Clear tokens from memory** - Don't hold tokens longer than needed
5. **No token caching to disk** - Only cache the *results* (utilization %), not tokens

### What We Cannot Control

These are Anthropic/Claude Code's responsibility, not the plugin's:

| Issue | Owner | Status |
|-------|-------|--------|
| Plaintext credential storage on Linux/Windows | Anthropic | Known limitation |
| Token refresh mechanism | Claude Code | [Issue #12447](https://github.com/anthropics/claude-code/issues/12447) |
| Secure storage migration | Anthropic | Not announced |

### Recommendation

For users concerned about credential security on Linux/Windows:
- Use `claude setup-token` for long-lived tokens (reduces refresh exposure)
- Ensure `~/.claude/.credentials.json` has `600` permissions
- Consider running Claude Code in a sandboxed environment

---

## Error Handling & Edge Cases

### API Error Responses

| Scenario | Error Type | Error Code | Message |
|----------|------------|------------|---------|
| **Expired token** | `authentication_error` | `token_expired` | "OAuth token has expired. Please obtain a new token or refresh your existing token." |
| **Invalid token** | `authentication_error` | - | "Invalid bearer token" |
| **Empty bearer** | `authentication_error` | - | "Invalid bearer token" |
| **No auth header** | `authentication_error` | - | "x-api-key header is required" |

### Edge Cases to Handle

#### 1. No Credentials File

```javascript
// Check if file exists before reading
if (!fs.existsSync(credentialsPath)) {
  return { error: 'not_logged_in', message: 'No credentials found' };
}
```

#### 2. No OAuth in Credentials (API-only user)

```javascript
const creds = JSON.parse(fs.readFileSync(credentialsPath));
if (!creds.claudeAiOauth) {
  return { error: 'api_only', message: 'User authenticated via API key only' };
}
```

#### 3. Token Expired (check locally before API call)

```javascript
const now = Date.now();
if (creds.claudeAiOauth.expiresAt < now) {
  return { error: 'token_expired', message: 'Token expired, needs refresh' };
}
```

#### 4. Network Failure

```javascript
try {
  const response = await fetch(endpoint);
} catch (e) {
  return { error: 'network_error', message: 'Failed to reach API' };
}
```

#### 5. Free Tier User (no Claude Code access)

Free tier users won't have OAuth credentials for Claude Code since they don't have access. Handle gracefully if `subscriptionType` is missing or invalid.

#### 6. WSL vs Windows Token Mismatch

Users running Claude Code in both WSL and Windows native will have **different tokens**. The statusline should use the token matching the Claude Code instance's platform.

**Tested Example:**
- WSL token: expires Jan 6, 2026
- Windows token: expired Jan 3, 2026 (already invalid)

---

## Token Lifecycle

### Token Duration

| Token Type | Duration | Notes |
|------------|----------|-------|
| Access Token | ~8-24 hours | Short-lived, needs refresh |
| Refresh Token | Longer-lived | Used to get new access tokens |
| Setup Token | ~1 year | Via `claude setup-token` CLI command |

### Known Issues (from GitHub)

1. **Token expires mid-task** - [Issue #12447](https://github.com/anthropics/claude-code/issues/12447)
   - Tokens expire during long-running tasks
   - Requires manual `/login` to recover
   - No automatic refresh implemented

2. **Workaround: Long-lived token**
   ```bash
   claude setup-token
   # Creates "Long-lived authentication token (valid for 1 year)"
   ```

3. **Manual token refresh** (if needed)
   ```bash
   POST https://console.anthropic.com/api/oauth/token
   Content-Type: application/x-www-form-urlencoded

   grant_type=refresh_token&refresh_token=<refresh-token>
   ```

### Recommendations for Plugin

1. **Check `expiresAt` before API call** - Avoid unnecessary failed requests
2. **Cache results** - Don't call API every 300ms (statusline update rate)
3. **Graceful degradation** - If token expired, show "⚠️ Login required" not crash
4. **Don't auto-refresh** - Let Claude Code handle token refresh, just detect failure

---

## API Users (Pay-per-Token)

API users (`ANTHROPIC_API_KEY`) don't have weekly limits - they pay per token.

### What's Available via stdin

```typescript
interface StdinData {
  context_window: {
    current_usage: {
      input_tokens: number;
      output_tokens: number;
      cache_read_tokens: number;
      cache_write_tokens: number;
    };
    context_window_size: number;
  };
  model: {
    display_name: string;  // "Opus", "Sonnet", etc.
  };
}
```

### Cost Calculation (Session-level)

| Model | Input (per 1M) | Output (per 1M) | Cache Read | Cache Write |
|-------|----------------|-----------------|------------|-------------|
| Claude Sonnet 4 | $3.00 | $15.00 | $0.30 | $3.75 |
| Claude Haiku 3.5 | $0.80 | $4.00 | $0.08 | $1.00 |
| Claude Opus 4 | $15.00 | $75.00 | $1.50 | $18.75 |

```javascript
const sessionCost =
  (input_tokens * inputRate / 1_000_000) +
  (output_tokens * outputRate / 1_000_000) +
  (cache_read_tokens * cacheReadRate / 1_000_000) +
  (cache_write_tokens * cacheWriteRate / 1_000_000);
```

### Limitations for API Users

| Feature | Possible? | Notes |
|---------|-----------|-------|
| Session token count | ✅ | Via stdin |
| Session cost estimate | ✅ | Calculate from tokens + pricing |
| Billing period total | ❌ | No API access |
| Rate limit status | ⚠️ | Only via response headers |

---

## Implementation Recommendations

### 🎯 Phased Implementation Approach

Based on security analysis, implement in phases to deliver value safely:

#### Phase 1: API Users - Session Cost (SAFE, ship first)

**Zero external API calls. Uses existing stdin data only.**

```
[Opus] ████░░░░░░ 45% | 💰 $0.42 session
```

**Why ship first:**
- ✅ No privacy concerns (no external calls)
- ✅ No security concerns (no credential access)
- ✅ Works immediately for all API users
- ✅ Data already available via stdin

---

#### Phase 2: Pro/Max Users - Usage Limits (Requires consent)

**External API call to Anthropic. Requires explicit opt-in.**

```
[Opus] ████░░░░░░ 45% | ⏱️ 6% 5h | 📊 13% 7d (cached 30s)
```

**Prerequisites before implementation:**
1. ✅ Explicit opt-in setting in plugin config
2. ✅ Permission validation before credential access
3. ✅ Token expiration check before API call
4. ✅ Caching with freshness indicator
5. ✅ Exponential backoff on failures

---

### Polling Strategy (Phase 2)

| Event | Action |
|-------|--------|
| Statusline update (~300ms) | Use cached data |
| Cache expired (30-60s) | Fetch fresh data |
| Network error | Show stale + warning, retry in 5min |
| 429 rate limit | Exponential backoff (30s → 60s → 120s) |
| Token expired | Show warning, don't retry until `/login` |

---

### User Type Auto-Detection

The plugin automatically detects user type and adjusts display:

```javascript
function detectUserType() {
  // API key takes precedence (pay-per-token)
  if (process.env.ANTHROPIC_API_KEY) {
    return { type: 'api', plan: null };
  }

  // Check OAuth credentials (subscription)
  const creds = loadCredentials();
  if (creds?.claudeAiOauth?.subscriptionType) {
    return {
      type: 'subscription',
      plan: creds.claudeAiOauth.subscriptionType // 'pro' or 'max'
    };
  }

  return { type: 'unknown', plan: null };
}
```

| Detection | Result |
|-----------|--------|
| `ANTHROPIC_API_KEY` env var set | API user (pay-per-token) |
| OAuth + `subscriptionType: "max"` | Max subscriber |
| OAuth + `subscriptionType: "pro"` | Pro subscriber |
| Neither found | Unknown (minimal display) |

---

### Display Formats by User Type

#### API Users (Pay-per-token)

**Data available:** Session tokens only (via stdin)
**Cannot access:** Daily totals, billing period, rate limit status

```
[Opus] ████░░░░░░ 45% | 💰 $1.23 session | ⏱️ 12m
```

Note: "session" label clarifies this is current session only, not total spend.

---

#### Pro/Max Subscribers

**Data available:** 5h/7d utilization via OAuth API (requires opt-in)

**Normal state:**
```
[Opus • Max] ████░░░░░░ 45% | 5h: 23% | 7d: 45% | ⏱️ 12m
```

**Warning (>70%):**
```
[Opus • Max] ████░░░░░░ 45% | 5h: 23% | 7d: 75% ⚠️ | ⏱️ 12m
```

**Critical (>85%):**
```
[Opus • Max] ████░░░░░░ 45% | 5h: 88% ⚠️ (resets 1h 23m) | 7d: 45% | ⏱️ 12m
```

**Limit reached (100%):**
```
[Opus • Max] ████░░░░░░ 45% | 🔴 Limit reached (resets 2h 15m) | ⏱️ 12m
```

**Token expired:**
```
[Opus • Max] ████░░░░░░ 45% | ⚠️ /login required | ⏱️ 12m
```

**Stale cache (network error):**
```
[Opus • Max] ████░░░░░░ 45% | 5h: 23% | 7d: 45% (stale) | ⏱️ 12m
```

---

#### Unknown User Type

Minimal display - no usage info:

```
[Opus] ████░░░░░░ 45% | ⏱️ 12m
```

---

## Privacy & Consent

### Why Opt-in is Required

The OAuth usage endpoint reveals:
- When you're using Claude Code
- How heavily you're using it (utilization %)
- Your subscription type

This data could be considered behavioral tracking. Users must explicitly consent.

### First-time Consent Prompt

Via `/claude-hud:setup`:

```
📊 Usage Limits Feature

This feature displays your Pro/Max plan usage on the statusline.

To enable this, the plugin will:
• Read your OAuth token from ~/.claude/.credentials.json
• Make periodic API calls to api.anthropic.com/api/oauth/usage
• Cache results locally (no data sent elsewhere)

Enable usage limits display? [y/N]
```

### Data Handling

| Data | Stored? | Where | Duration |
|------|---------|-------|----------|
| OAuth token | Read only | Memory | Duration of API call |
| Utilization % | Cached | Memory | 30-60 seconds |
| Reset timestamps | Cached | Memory | 30-60 seconds |

**We do NOT:**
- Store tokens to disk
- Send data to third parties
- Log API call history
- Track usage patterns over time

### Platform Detection

```javascript
function getCredentialsPath() {
  if (process.platform === 'darwin') {
    // macOS - use Keychain
    return 'keychain';
  } else if (process.platform === 'win32') {
    // Windows native
    return path.join(os.homedir(), '.claude', '.credentials.json');
  } else {
    // Linux/WSL
    return path.join(os.homedir(), '.claude', '.credentials.json');
  }
}
```

---

## Open Questions

### Resolved ✅

| Question | Resolution |
|----------|------------|
| Should this be opt-in? | **Yes** - Privacy requires explicit consent |
| Handle token refresh? | **No** - Detect and prompt user to `/login` |
| Rate limits on usage API? | **Unknown** - 5 rapid calls OK, implement backoff anyway |

### Resolved ✅ (Continued)

| Question | Resolution |
|----------|------------|
| Model-specific display? | **Yes** - Show usage for the model currently in use (Opus/Sonnet) |
| Extra credits display? | **No** - Just show "Limit reached" + time until reset |
| Reset time format? | **Yes** - Show human-readable "resets in 2h 15m" |

### Resolved ✅ (Color Thresholds)

| Threshold | Color | Action |
|-----------|-------|--------|
| < 70% | 🟢 Green | Normal |
| 70-84% | 🟡 Yellow | Warning |
| ≥ 85% | 🔴 Red | Critical - show reset time prominently |
| 100% | 🔴 Red | "Limit reached" + reset countdown |

**Note:** Matches existing claude-hud context thresholds in `src/render/colors.ts:35-36`

---

## References

### Official Documentation
- [Identity and Access Management - Claude Code Docs](https://code.claude.com/docs/en/iam)
- [Rate limits - Claude Docs](https://docs.claude.com/en/api/rate-limits)
- [Using Claude Code with Pro/Max plan](https://support.claude.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan)

### Implementation Examples
- [How to Show Claude Code Usage Limits in Your Statusline](https://codelynx.dev/posts/claude-code-usage-limits-statusline)

### Known Issues
- [OAuth token expiration disrupts workflows - #12447](https://github.com/anthropics/claude-code/issues/12447)
- [OAuth Login Blocked - #1746](https://github.com/anthropics/claude-code/issues/1746)
- [OAuth Token Refresh Failure - #2633](https://github.com/anthropics/claude-code/issues/2633)

### Pricing
- [Anthropic API Pricing](https://www.anthropic.com/pricing)
- [Claude Pricing Page](https://claude.com/pricing)

---

## Testing Notes

**Tested 2026-01-05:**

| Test | Result |
|------|--------|
| OAuth endpoint with valid token | ✅ Returns usage data |
| OAuth endpoint with expired token | ✅ Returns `token_expired` error |
| OAuth endpoint with invalid token | ✅ Returns `authentication_error` |
| OAuth endpoint with no auth | ✅ Returns "x-api-key required" |
| 5 rapid sequential calls | ✅ No rate limiting observed |
| WSL credentials file | ✅ `~/.claude/.credentials.json` |
| Windows credentials file | ✅ `/mnt/c/Users/<user>/.claude/.credentials.json` |
| WSL vs Windows tokens | ⚠️ Different tokens, different expiry |
