/**
 * Read optional config keys from a skill SKILL.md YAML frontmatter (file is source of truth — not DB).
 */

/**
 * Single-line `key: value` scalars often use YAML quotes, e.g. `paymentPendingFolderId: ""`.
 * Without this, `""` is parsed as two quote characters (truthy) and is sent to Drive as a bogus parent ID → "File not found: \"\"".
 */
export function normalizeFrontmatterScalar(raw: string): string | undefined {
  let v = raw.trim();
  if (!v) return undefined;
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v || undefined;
}

/** Markdown body after the first YAML frontmatter block. */
export function skillMdBodyAfterFrontmatter(raw: string): string {
  const m = raw.match(/^---\s*\n[\s\S]*?\n---\s*\n?([\s\S]*)$/);
  return m ? m[1] : raw;
}

/** Inner YAML between the first pair of --- delimiters (no --- lines). */
export function skillMdFrontmatterInner(raw: string): string | undefined {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  return m?.[1];
}

/**
 * Replace or prepend the first frontmatter block.
 * `newInner` is YAML text without --- delimiters.
 */
export function replaceSkillMdFrontmatter(raw: string, newInner: string): string {
  const normalized = newInner.replace(/\r\n/g, '\n').trimEnd();
  const block = `---\n${normalized}\n---\n\n`;
  if (/^---\s*\n[\s\S]*?\n---\s*\n?/.test(raw)) {
    return raw.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, block);
  }
  return block + raw.trimStart();
}

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
      return normalizeFrontmatterScalar(line.substring(ci + 1));
    }
  }
  return undefined;
}

/** Worksheet tab title for order spreadsheets (must match the tab used by append_row / booking). */
export function parseOrderSheetTabFromSkillMarkdown(content: string): string | undefined {
  const fm = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fm) return undefined;
  for (const line of fm[1].split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const ci = line.indexOf(':');
    if (ci <= 0) continue;
    const key = line.substring(0, ci).trim();
    if (key === 'orderSheetTab') {
      return normalizeFrontmatterScalar(line.substring(ci + 1));
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
      return normalizeFrontmatterScalar(line.substring(ci + 1));
    }
  }
  return undefined;
}
