import path from 'node:path';
import { isLimitReached } from '../types.js';
import { getContextPercent, getModelName } from '../stdin.js';
import { coloredBar, cyan, dim, magenta, red, yellow, getContextColor, RESET } from './colors.js';
export function renderSessionLine(ctx) {
    const model = getModelName(ctx.stdin);
    const percent = getContextPercent(ctx.stdin);
    const bar = coloredBar(percent);
    const parts = [];
    // Model display with optional plan name: [Opus 4.5] or [Opus 4.5 | Max]
    const planName = ctx.usageData?.planName;
    const modelDisplay = planName ? `${model} | ${planName}` : model;
    parts.push(`${cyan(`[${modelDisplay}]`)} ${bar} ${getContextColor(percent)}${percent}%${RESET}`);
    // Usage limits display: 5h: X% | 7d: Y%
    if (ctx.usageData?.planName) {
        if (ctx.usageData.apiUnavailable) {
            // API failed - show warning so user knows to check DEBUG logs
            parts.push(yellow(`usage: ⚠`));
        }
        else if (isLimitReached(ctx.usageData)) {
            // Show "Limit reached" with reset time (use whichever window hit 100%)
            const resetTime = ctx.usageData.fiveHour === 100
                ? formatResetTime(ctx.usageData.fiveHourResetAt)
                : formatResetTime(ctx.usageData.sevenDayResetAt);
            parts.push(red(`⚠ Limit reached${resetTime ? ` (resets ${resetTime})` : ''}`));
        }
        else {
            // Always show 5hr with reset countdown
            const fiveHourDisplay = formatUsagePercent(ctx.usageData.fiveHour);
            const fiveHourReset = formatResetTime(ctx.usageData.fiveHourResetAt);
            const fiveHourPart = fiveHourReset
                ? `5h: ${fiveHourDisplay} (${fiveHourReset})`
                : `5h: ${fiveHourDisplay}`;
            // Only show 7d when approaching limit (≥80%)
            const sevenDay = ctx.usageData.sevenDay;
            if (sevenDay !== null && sevenDay >= 80) {
                const sevenDayDisplay = formatUsagePercent(sevenDay);
                parts.push(`${fiveHourPart} | 7d: ${sevenDayDisplay}`);
            }
            else {
                parts.push(fiveHourPart);
            }
        }
    }
    if (ctx.sessionDuration) {
        parts.push(dim(`⏱️  ${ctx.sessionDuration}`));
    }
    let line = parts.join(' | ');
    if (percent >= 85) {
        const usage = ctx.stdin.context_window?.current_usage;
        if (usage) {
            const input = formatTokens(usage.input_tokens ?? 0);
            const cache = formatTokens((usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0));
            line += dim(` (in: ${input}, cache: ${cache})`);
        }
    }
    return line;
}
function formatTokens(n) {
    if (n >= 1000000) {
        return `${(n / 1000000).toFixed(1)}M`;
    }
    if (n >= 1000) {
        return `${(n / 1000).toFixed(0)}k`;
    }
    return n.toString();
}
function formatUsagePercent(percent) {
    if (percent === null) {
        return dim('--');
    }
    // Color based on threshold: <70% green, 70-84% yellow, ≥85% red
    const color = getContextColor(percent);
    return `${color}${percent}%${RESET}`;
}
function formatResetTime(resetAt) {
    if (!resetAt)
        return '';
    const now = new Date();
    const diffMs = resetAt.getTime() - now.getTime();
    if (diffMs <= 0)
        return '';
    const diffMins = Math.ceil(diffMs / 60000);
    if (diffMins < 60)
        return `${diffMins}m`;
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}
// Full session line (default layout) - includes project, branch, and config counts
export function renderSessionLineFull(ctx) {
    const model = getModelName(ctx.stdin);
    const percent = getContextPercent(ctx.stdin);
    const bar = coloredBar(percent);
    const parts = [];
    // Model display with optional plan name: [Opus 4.5] or [Opus 4.5 | Max]
    const planName = ctx.usageData?.planName;
    const modelDisplay = planName ? `${model} | ${planName}` : model;
    parts.push(`${cyan(`[${modelDisplay}]`)} ${bar} ${getContextColor(percent)}${percent}%${RESET}`);
    // Project name and git branch
    if (ctx.stdin.cwd) {
        const projectName = path.basename(ctx.stdin.cwd) || ctx.stdin.cwd;
        const branchPart = ctx.gitBranch ? ` ${magenta('git:(')}${cyan(ctx.gitBranch)}${magenta(')')}` : '';
        parts.push(`${yellow(projectName)}${branchPart}`);
    }
    // Config counts
    if (ctx.claudeMdCount > 0) {
        parts.push(dim(`${ctx.claudeMdCount} CLAUDE.md`));
    }
    if (ctx.rulesCount > 0) {
        parts.push(dim(`${ctx.rulesCount} rules`));
    }
    if (ctx.mcpCount > 0) {
        parts.push(dim(`${ctx.mcpCount} MCPs`));
    }
    if (ctx.hooksCount > 0) {
        parts.push(dim(`${ctx.hooksCount} hooks`));
    }
    // Usage limits display
    if (ctx.usageData?.planName) {
        if (ctx.usageData.apiUnavailable) {
            parts.push(yellow(`usage: ⚠`));
        }
        else if (isLimitReached(ctx.usageData)) {
            const resetTime = ctx.usageData.fiveHour === 100
                ? formatResetTime(ctx.usageData.fiveHourResetAt)
                : formatResetTime(ctx.usageData.sevenDayResetAt);
            parts.push(red(`⚠ Limit reached${resetTime ? ` (resets ${resetTime})` : ''}`));
        }
        else {
            const fiveHourDisplay = formatUsagePercent(ctx.usageData.fiveHour);
            const fiveHourReset = formatResetTime(ctx.usageData.fiveHourResetAt);
            const fiveHourPart = fiveHourReset
                ? `5h: ${fiveHourDisplay} (${fiveHourReset})`
                : `5h: ${fiveHourDisplay}`;
            const sevenDay = ctx.usageData.sevenDay;
            if (sevenDay !== null && sevenDay >= 80) {
                const sevenDayDisplay = formatUsagePercent(sevenDay);
                parts.push(`${fiveHourPart} | 7d: ${sevenDayDisplay}`);
            }
            else {
                parts.push(fiveHourPart);
            }
        }
    }
    if (ctx.sessionDuration) {
        parts.push(dim(`⏱️  ${ctx.sessionDuration}`));
    }
    let line = parts.join(' | ');
    if (percent >= 85) {
        const usage = ctx.stdin.context_window?.current_usage;
        if (usage) {
            const input = formatTokens(usage.input_tokens ?? 0);
            const cache = formatTokens((usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0));
            line += dim(` (in: ${input}, cache: ${cache})`);
        }
    }
    return line;
}
//# sourceMappingURL=session-line.js.map