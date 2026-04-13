/**
 * SKILL.md YAML frontmatter parsing (Claude-style + Foodflow metadata).
 */
import YAML from 'yaml';
import { getSkillPermissionToolOptions } from '../agent/tools/index.js';

export interface ParsedSkillStep {
  id: string;
  label: string;
  collects?: string;
}

const KEBAB_SKILL_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const RESERVED_NAMES = new Set(['anthropic', 'claude']);
const MAX_NAME_LEN = 64;
const MAX_DESC_LEN = 1024;

let _registryIds: Set<string> | null = null;
function registryToolIds(): Set<string> {
  if (!_registryIds) {
    _registryIds = new Set(getSkillPermissionToolOptions().map((o) => o.id));
  }
  return _registryIds;
}

function humanizeKebab(id: string): string {
  return id
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/** Latin slug from display name (empty if name is only non-Latin). */
export function slugifyFromSkillName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function isValidKebabSkillId(raw: string): boolean {
  if (!raw || raw.length > MAX_NAME_LEN) return false;
  if (!KEBAB_SKILL_NAME.test(raw)) return false;
  if (RESERVED_NAMES.has(raw)) return false;
  return true;
}

function asStringRecord(v: unknown): Record<string, string> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === 'string') out[k] = val;
    else if (val != null) out[k] = String(val);
  }
  return out;
}

function normalizeSteps(raw: unknown): ParsedSkillStep[] {
  if (!Array.isArray(raw)) return [];
  const steps: ParsedSkillStep[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id.trim() : '';
    if (!id) continue;
    const label =
      typeof o.label === 'string' && o.label.trim()
        ? o.label.trim()
        : id;
    const collects =
      typeof o.collects === 'string' && o.collects.trim()
        ? o.collects.trim()
        : undefined;
    steps.push({ id, label, collects });
  }
  return steps;
}

function coalesceTriggerHints(doc: Record<string, unknown>, meta: Record<string, unknown>): string[] {
  const th = meta.trigger_hints ?? meta.triggerHints;
  if (Array.isArray(th)) {
    return th.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof th === 'string') {
    return th.split(',').map((s) => s.trim()).filter(Boolean);
  }
  const legacy = doc.triggerHints;
  if (typeof legacy === 'string') {
    return legacy.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function num(
  v: unknown,
  legacy: unknown,
): number {
  const tryParse = (x: unknown) => {
    if (typeof x === 'number' && Number.isFinite(x)) return Math.max(0, Math.floor(x));
    if (typeof x === 'string' && x.trim()) {
      const n = parseInt(x, 10);
      return Number.isFinite(n) ? Math.max(0, n) : 0;
    }
    return 0;
  };
  const a = tryParse(v);
  if (a) return a;
  return tryParse(legacy);
}

function strOpt(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t || undefined;
}

export interface ParsedSkillFrontmatterResult {
  /** Canonical kebab-case id from YAML `name` (or derived for legacy). */
  skillId: string;
  /** Shown in Skill Library / MongoDB `name`. */
  displayName: string;
  slug?: string;
  description: string;
  triggerHints: string[];
  scriptsMeta: Record<string, string>;
  steps: ParsedSkillStep[];
  reminderDelay: number;
  maxReminders: number;
  scheduleEnabled: boolean;
  scheduleCron: string;
  /** Merged registry tool ids from metadata.required_tools + allowed-tools matches. */
  requiredTools: string[];
  /** If false, callers may preserve existing DB requiredTools on update. */
  toolConfigExplicit: boolean;
}

function parseStepsFromLegacyFrontmatterText(frontmatter: string): ParsedSkillStep[] {
  const steps: ParsedSkillStep[] = [];
  const stepsMatch = frontmatter.match(/steps:\n((?:\s+-[\s\S]*?)?)(?=\n[a-zA-Z_]|\s*$)/);
  if (!stepsMatch) return steps;
  const stepsSection = stepsMatch[1];
  let currentStep: Partial<ParsedSkillStep> = {};
  for (const line of stepsSection.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- id:')) {
      if (currentStep.id) {
        steps.push({
          id: currentStep.id,
          label: currentStep.label || currentStep.id,
          collects: currentStep.collects,
        });
      }
      currentStep = { id: trimmed.substring(5).trim() };
    } else if (trimmed.startsWith('label:')) {
      currentStep.label = trimmed.substring(6).trim();
    } else if (trimmed.startsWith('collects:')) {
      currentStep.collects = trimmed.substring(9).trim();
    }
  }
  if (currentStep.id) {
    steps.push({
      id: currentStep.id,
      label: currentStep.label || currentStep.id,
      collects: currentStep.collects,
    });
  }
  return steps;
}

function legacyLineParse(frontmatter: string): ParsedSkillFrontmatterResult | null {
  const meta: Record<string, string> = {};
  for (const line of frontmatter.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.substring(0, colonIdx).trim();
      const value = line.substring(colonIdx + 1).trim();
      meta[key] = value;
    }
  }
  if (!meta.name || !meta.description) return null;

  const scriptsMeta: Record<string, string> = {};
  const scriptsMatch = frontmatter.match(/scripts:\n(([\s\S]*?))(?=\n\w|$)/);
  if (scriptsMatch) {
    const scriptsSection = scriptsMatch[1];
    for (const line of scriptsSection.split('\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const key = line.substring(0, colonIdx).trim();
        const value = line.substring(colonIdx + 1).trim();
        if (key) scriptsMeta[key] = value;
      }
    }
  }

  const rawName = meta.name;
  const slugOpt = meta.slug?.trim() || undefined;
  let skillId: string;
  let displayName: string;

  if (isValidKebabSkillId(rawName)) {
    skillId = rawName;
    displayName = humanizeKebab(rawName);
  } else {
    const fromSlug = slugOpt
      ?.toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-|-$/g, '');
    skillId =
      fromSlug && isValidKebabSkillId(fromSlug)
        ? fromSlug
        : slugifyFromSkillName(rawName) || 'skill';
    displayName = rawName;
  }

  const se = meta.scheduleEnabled?.trim().toLowerCase();
  const scheduleEnabled = se === 'true' || se === '1' || se === 'yes';

  return {
    skillId,
    displayName,
    slug: slugOpt,
    description: meta.description,
    triggerHints: meta.triggerHints
      ? meta.triggerHints.split(',').map((s) => s.trim()).filter(Boolean)
      : [],
    scriptsMeta,
    steps: parseStepsFromLegacyFrontmatterText(frontmatter),
    reminderDelay: meta.reminderDelay ? parseInt(meta.reminderDelay, 10) || 0 : 0,
    maxReminders: meta.maxReminders ? parseInt(meta.maxReminders, 10) || 0 : 0,
    scheduleEnabled,
    scheduleCron: meta.scheduleCron?.trim() || '',
    requiredTools: [],
    toolConfigExplicit: false,
  };
}

/**
 * Parse SKILL.md frontmatter into structured fields + merged requiredTools.
 */
export function parseSkillFrontmatterFromYaml(content: string): ParsedSkillFrontmatterResult {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    throw new Error('Invalid skill file: missing YAML frontmatter (--- ... ---)');
  }
  const frontmatter = frontmatterMatch[1];

  let doc: Record<string, unknown>;
  try {
    const parsed = YAML.parse(frontmatter);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('YAML frontmatter must be a mapping');
    }
    doc = parsed as Record<string, unknown>;
  } catch {
    const leg = legacyLineParse(frontmatter);
    if (leg) return leg;
    throw new Error('Invalid skill file: could not parse YAML frontmatter');
  }

  const meta =
    doc.metadata && typeof doc.metadata === 'object' && !Array.isArray(doc.metadata)
      ? (doc.metadata as Record<string, unknown>)
      : {};

  const rawName = doc.name;
  if (typeof rawName !== 'string' || !rawName.trim()) {
    throw new Error('Skill file missing required field: name');
  }
  const nameTrim = rawName.trim();

  const rawDesc = doc.description;
  if (typeof rawDesc !== 'string' || !rawDesc.trim()) {
    throw new Error('Skill file missing required field: description');
  }
  const description = rawDesc.trim();
  if (description.length > MAX_DESC_LEN) {
    throw new Error(`Skill description exceeds ${MAX_DESC_LEN} characters`);
  }

  const slugFromMeta = strOpt(meta.slug);

  let skillId: string;
  let displayName: string;

  if (isValidKebabSkillId(nameTrim)) {
    skillId = nameTrim;
    const dn = strOpt(meta.display_name) ?? strOpt(meta.displayName);
    displayName = dn ?? humanizeKebab(nameTrim);
  } else {
    const explicit =
      slugFromMeta
        ?.toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-|-$/g, '') ?? '';
    skillId =
      explicit && isValidKebabSkillId(explicit)
        ? explicit
        : slugifyFromSkillName(nameTrim) || 'skill';
    displayName =
      strOpt(meta.display_name) ?? strOpt(meta.displayName) ?? nameTrim;
  }

  if (!isValidKebabSkillId(skillId)) {
    throw new Error(
      `Invalid skill id "${skillId}". Use kebab-case (a-z, 0-9, hyphens), max ${MAX_NAME_LEN} chars, not reserved words.`,
    );
  }

  const steps =
    normalizeSteps(doc.steps).length > 0
      ? normalizeSteps(doc.steps)
      : normalizeSteps(meta.steps);

  const reg = registryToolIds();
  const fromMetaTools = meta.required_tools ?? meta.requiredTools;
  const fromAllowed = doc['allowed-tools'] ?? doc.allowed_tools;
  const mergedTools = new Set<string>();
  if (Array.isArray(fromMetaTools)) {
    for (const x of fromMetaTools) {
      if (typeof x === 'string' && reg.has(x)) mergedTools.add(x);
    }
  }
  if (Array.isArray(fromAllowed)) {
    for (const x of fromAllowed) {
      if (typeof x === 'string' && reg.has(x)) mergedTools.add(x);
    }
  }
  const toolConfigExplicit =
    'required_tools' in meta ||
    'requiredTools' in meta ||
    'allowed-tools' in doc ||
    'allowed_tools' in doc;

  const scriptsMeta = asStringRecord(doc.scripts);

  const se =
    meta.schedule_enabled ?? meta.scheduleEnabled ?? doc.scheduleEnabled;
  const seStr = typeof se === 'string' ? se.trim().toLowerCase() : '';
  const scheduleEnabled =
    se === true ||
    seStr === 'true' ||
    seStr === '1' ||
    seStr === 'yes';

  const scheduleCron = strOpt(
    meta.schedule_cron ?? meta.scheduleCron ?? doc.scheduleCron,
  ) ?? '';

  return {
    skillId,
    displayName,
    slug: slugFromMeta,
    description,
    triggerHints: coalesceTriggerHints(doc, meta),
    scriptsMeta,
    steps,
    reminderDelay: num(
      meta.reminder_delay ?? meta.reminderDelay,
      doc.reminderDelay,
    ),
    maxReminders: num(meta.max_reminders ?? meta.maxReminders, doc.maxReminders),
    scheduleEnabled,
    scheduleCron,
    requiredTools: [...mergedTools],
    toolConfigExplicit,
  };
}
