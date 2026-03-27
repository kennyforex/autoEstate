/**
 * Read optional config keys from a skill SKILL.md YAML frontmatter (file is source of truth — not DB).
 */

export function parseOrderSheetIdFromSkillMarkdown(content: string): string | undefined {
  const fm = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fm) return undefined;
  for (const line of fm[1].split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const ci = line.indexOf(':');
    if (ci <= 0) continue;
    const key = line.substring(0, ci).trim();
    if (key === 'orderSheetId') {
      const v = line.substring(ci + 1).trim();
      return v || undefined;
    }
  }
  return undefined;
}
