import path from 'node:path';
import type { RenderContext } from '../types.js';
import { cyan, dim, magenta, yellow } from './colors.js';

export function renderProjectLine(ctx: RenderContext): string {
  const parts: string[] = [];

  if (ctx.stdin.cwd) {
    const projectName = path.basename(ctx.stdin.cwd) || ctx.stdin.cwd;
    const branchPart = ctx.gitBranch ? ` ${magenta('git:(')}${cyan(ctx.gitBranch)}${magenta(')')}` : '';
    parts.push(`📁 ${yellow(projectName)}${branchPart}`);
  }

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

  return parts.join(' | ');
}
