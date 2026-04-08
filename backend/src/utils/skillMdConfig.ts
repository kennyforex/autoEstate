/**
 * Read optional config keys from a skill SKILL.md YAML frontmatter (file is source of truth — not DB).
 */
import YAML from 'yaml';

/** Sheet / Drive config: nested metadata + legacy top-level camelCase keys. */
export interface SkillYamlFlatConfig {
  orderSheetId?: string;
  orderSheetTab?: string;
  sheetFields?: string[];
  paymentPendingFolderId?: string;
}

function flatPickStr(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t || undefined;
}

function flatPickStrList(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.map((x) => String(x).trim()).filter(Boolean);
  return out.length ? out : undefined;
}

function legacyFlatConfigFromLines(frontmatter: string): SkillYamlFlatConfig {
  const out: SkillYamlFlatConfig = {};
  for (const line of frontmatter.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const ci = line.indexOf(':');
    if (ci <= 0) continue;
    const key = line.substring(0, ci).trim();
    const rawVal = line.substring(ci + 1).trim();
    if (key === 'orderSheetId') out.orderSheetId = normalizeScalar(rawVal);
    if (key === 'orderSheetTab') out.orderSheetTab = normalizeScalar(rawVal);
    if (key === 'paymentPendingFolderId')
      out.paymentPendingFolderId = normalizeScalar(rawVal);
  }
  const sf = parseSheetFieldsLegacyBlock(frontmatter);
  if (sf.length) out.sheetFields = sf;
  return out;
}

function normalizeScalar(raw: string): string | undefined {
  let v = raw.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v || undefined;
}

function parseSheetFieldsLegacyBlock(frontmatter: string): string[] {
  const lines = frontmatter.split('\n');
  let inSheetFields = false;
  const fields: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) {
      if (inSheetFields) continue;
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
        break;
      }
    }
  }
  return fields;
}

export function getSkillYamlFlatConfig(content: string): SkillYamlFlatConfig {
  const inner = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/)?.[1];
  if (!inner) return {};

  let doc: Record<string, unknown>;
  try {
    const parsed = YAML.parse(inner);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    doc = parsed as Record<string, unknown>;
  } catch {
    return legacyFlatConfigFromLines(inner);
  }

  const meta =
    doc.metadata && typeof doc.metadata === 'object' && !Array.isArray(doc.metadata)
      ? (doc.metadata as Record<string, unknown>)
      : {};

  const orderSheetId =
    flatPickStr(meta.order_sheet_id) ??
    flatPickStr(meta.orderSheetId) ??
    flatPickStr(doc.orderSheetId);

  const orderSheetTab =
    flatPickStr(meta.order_sheet_tab) ??
    flatPickStr(meta.orderSheetTab) ??
    flatPickStr(doc.orderSheetTab);

  let sheetFields: string[] | undefined =
    flatPickStrList(meta.sheet_fields) ?? flatPickStrList(meta.sheetFields);
  if (!sheetFields?.length) sheetFields = flatPickStrList(doc.sheetFields);

  const paymentPendingFolderId =
    flatPickStr(meta.payment_pending_folder_id) ??
    flatPickStr(meta.paymentPendingFolderId) ??
    flatPickStr(doc.paymentPendingFolderId);

  return {
    orderSheetId: orderSheetId || undefined,
    orderSheetTab: orderSheetTab || undefined,
    sheetFields: sheetFields?.length ? sheetFields : undefined,
    paymentPendingFolderId: paymentPendingFolderId || undefined,
  };
}

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

/** Fields edited from Basic / Other tabs — written into YAML so SKILL.md matches the DB. */
export interface SkillFormYamlOverlay {
  displayName: string;
  description: string;
  reminderDelay: number;
  maxReminders: number;
  scheduleEnabled: boolean;
  scheduleCron: string;
  requiredTools: string[];
  triggerHints: string[];
  /** Top-level `argument-hint` in YAML */
  argumentHint: string;
  /** Top-level `user-invocable` in YAML */
  userInvocable: boolean;
}

/**
 * Merge Basic settings and tool allowlist into frontmatter inner text.
 * Preserves kebab `name`, `steps`, `trigger_hints`, sheet ids, and other keys.
 */
export function mergeSkillFormIntoFrontmatterInner(
  innerYaml: string,
  overlay: SkillFormYamlOverlay,
): string {
  let doc: Record<string, unknown>;
  try {
    const p = YAML.parse(innerYaml);
    if (!p || typeof p !== 'object' || Array.isArray(p)) {
      doc = {};
    } else {
      doc = p as Record<string, unknown>;
    }
  } catch {
    return innerYaml;
  }

  const meta =
    doc.metadata && typeof doc.metadata === 'object' && !Array.isArray(doc.metadata)
      ? { ...(doc.metadata as Record<string, unknown>) }
      : {};

  meta.display_name = overlay.displayName;
  meta.reminder_delay = overlay.reminderDelay;
  meta.max_reminders = overlay.maxReminders;
  meta.schedule_enabled = overlay.scheduleEnabled;
  meta.schedule_cron = overlay.scheduleCron;
  meta.required_tools = [...overlay.requiredTools];
  meta.trigger_hints = [...overlay.triggerHints];

  doc.metadata = meta;
  doc.description = overlay.description;

  doc['user-invocable'] = overlay.userInvocable;

  delete doc['argument-hint'];
  delete doc.argument_hint;
  const hint = overlay.argumentHint?.trim();
  if (hint) {
    doc['argument-hint'] = hint;
  }

  return YAML.stringify(doc, { lineWidth: 0 }).trimEnd();
}

export function parseOrderSheetIdFromSkillMarkdown(content: string): string | undefined {
  return getSkillYamlFlatConfig(content).orderSheetId;
}

/** Worksheet tab title for order spreadsheets (must match the tab used by append_row / booking). */
export function parseOrderSheetTabFromSkillMarkdown(content: string): string | undefined {
  return getSkillYamlFlatConfig(content).orderSheetTab;
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
  return getSkillYamlFlatConfig(content).sheetFields;
}

/** Google Drive folder ID for receipt uploads (e.g. the "Pending" folder). */
export function parsePaymentPendingFolderIdFromSkillMarkdown(content: string): string | undefined {
  return getSkillYamlFlatConfig(content).paymentPendingFolderId;
}
