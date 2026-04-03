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

/**
 * Parse `sheetFields` from SKILL.md frontmatter.
 * Returns an ordered list of field names (position = column A, B, C…).
 * Example frontmatter:
 *   sheetFields:
 *     - Order ID
 *     - Customer
 *     - Phone
 */
export function parseSheetFieldsFromSkillMarkdown(content: string): string[] | undefined {
  const fm = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fm) return undefined;
  const lines = fm[1].split('\n');
  let inSheetFields = false;
  const fields: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) {
      if (inSheetFields) continue; // skip blank/comment lines inside list
      continue;
    }
    if (t === 'sheetFields:' || t.startsWith('sheetFields:')) {
      inSheetFields = true;
      continue;
    }
    if (inSheetFields) {
      if (t.startsWith('- ')) {
        fields.push(t.substring(2).trim());
      } else {
        break; // next top-level key → stop
      }
    }
  }
  return fields.length > 0 ? fields : undefined;
}

/** Google Drive folder ID for receipt uploads (e.g. the "Pending" folder). */
export function parsePaymentPendingFolderIdFromSkillMarkdown(content: string): string | undefined {
  const fm = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fm) return undefined;
  for (const line of fm[1].split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const ci = line.indexOf(':');
    if (ci <= 0) continue;
    const key = line.substring(0, ci).trim();
    if (key === 'paymentPendingFolderId') {
      const v = line.substring(ci + 1).trim();
      return v || undefined;
    }
  }
  return undefined;
}
