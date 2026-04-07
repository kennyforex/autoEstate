import mongoose from 'mongoose';
import { Skill, type ISkillDocument } from '../models/Skill.js';
import { Assistant } from '../models/index.js';
import { assistantService } from './assistant.service.js';
import {
  skillStorage,
  type SkillAssetFileInfo,
  type SkillDirectoryStructure,
} from './skillStorage.service.js';
import {
  replaceSkillMdFrontmatter,
  skillMdBodyAfterFrontmatter,
} from '../utils/skillMdConfig.js';

export interface CreateSkillInput {
  name: string;
  slug: string;
  description: string;
  triggerHints?: string[];
  isBuiltIn?: boolean;
  createdBy: string;
  // Storage and structure
  storagePath: string;
  hasReferences: boolean;
  hasExamples: boolean;
  scripts: string[];
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  instructions?: string;
  /** YAML between --- delimiters (no --- lines). Merged into SKILL.md on disk. */
  frontmatterYaml?: string;
  triggerHints?: string[];
  requiredTools?: string[];
  reminderDelay?: number;
  maxReminders?: number;
  scheduleEnabled?: boolean;
  scheduleCron?: string;
  status?: 'active' | 'inactive';
  nickname?: string;
  staffRole?: string;
  avatarPreset?: string;
  customAvatarUrl?: string;
}

/**
 * Parse SKILL.md frontmatter for metadata only.
 * Content is stored in file, not loaded here.
 *
 * Expected format:
 * ```
 * ---
 * name: Booking Handler
 * description: Handles appointment booking requests
 * triggerHints: book, appointment, schedule, 預約
 * scripts:
 *   check_availability: Check if time slot is free
 *   validate: Validate booking parameters
 * ---
 * ```
 */
export interface ParsedSkillStep {
  id: string;
  label: string;
  collects?: string;
}

/** Latin slug from display name (empty if name is only non-Latin). */
function slugifyFromSkillName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Install path / DB slug: optional explicit `slug` in frontmatter (required when name is non-Latin).
 */
export function resolveInstallSlug(name: string, explicitSlug?: string): string {
  const explicit = explicitSlug
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-|-$/g, '');
  if (explicit) return explicit;
  const fromName = slugifyFromSkillName(name);
  if (fromName) return fromName;
  throw new Error(
    'Skill slug cannot be derived from name. Add `slug: your-english-slug` to SKILL.md frontmatter (required for non-Latin names).',
  );
}

export function parseSkillFrontmatter(content: string): {
  name: string;
  slug?: string;
  description: string;
  triggerHints: string[];
  scriptsMeta: Record<string, string>;
  steps: ParsedSkillStep[];
  reminderDelay: number;
  maxReminders: number;
  scheduleEnabled: boolean;
  scheduleCron: string;
} {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);

  if (!frontmatterMatch) {
    throw new Error('Invalid skill file: missing YAML frontmatter (--- ... ---)');
  }

  const frontmatter = frontmatterMatch[1];

  const meta: Record<string, string> = {};
  for (const line of frontmatter.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.substring(0, colonIdx).trim();
      const value = line.substring(colonIdx + 1).trim();
      meta[key] = value;
    }
  }

  if (!meta.name) throw new Error('Skill file missing required field: name');
  if (!meta.description) throw new Error('Skill file missing required field: description');

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

  // Parse steps section: YAML list items with id, label, collects
  const steps: ParsedSkillStep[] = [];
  const stepsMatch = frontmatter.match(/steps:\n((?:\s+-[\s\S]*?)?)(?=\n[a-zA-Z]|\s*$)/);
  if (stepsMatch) {
    const stepsSection = stepsMatch[1];
    let currentStep: Partial<ParsedSkillStep> = {};
    for (const line of stepsSection.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('- id:')) {
        if (currentStep.id) {
          steps.push({ id: currentStep.id, label: currentStep.label || currentStep.id, collects: currentStep.collects });
        }
        currentStep = { id: trimmed.substring(5).trim() };
      } else if (trimmed.startsWith('label:')) {
        currentStep.label = trimmed.substring(6).trim();
      } else if (trimmed.startsWith('collects:')) {
        currentStep.collects = trimmed.substring(9).trim();
      }
    }
    if (currentStep.id) {
      steps.push({ id: currentStep.id, label: currentStep.label || currentStep.id, collects: currentStep.collects });
    }
  }

  const se = meta.scheduleEnabled?.trim().toLowerCase();
  const scheduleEnabled = se === 'true' || se === '1' || se === 'yes';

  return {
    name: meta.name,
    slug: meta.slug?.trim() || undefined,
    description: meta.description,
    triggerHints: meta.triggerHints ? meta.triggerHints.split(',').map((s) => s.trim()).filter(Boolean) : [],
    scriptsMeta,
    steps,
    reminderDelay: meta.reminderDelay ? parseInt(meta.reminderDelay, 10) || 0 : 0,
    maxReminders: meta.maxReminders ? parseInt(meta.maxReminders, 10) || 0 : 0,
    scheduleEnabled,
    scheduleCron: meta.scheduleCron?.trim() || '',
  };
}

class SkillService {
  async create(input: CreateSkillInput): Promise<ISkillDocument> {
    const existing = await Skill.findOne({ slug: input.slug });
    if (existing) {
      throw new Error(`Skill with slug "${input.slug}" already exists`);
    }

    return Skill.create({
      name: input.name,
      slug: input.slug,
      description: input.description,
      triggerHints: input.triggerHints || [],
      isBuiltIn: input.isBuiltIn || false,
      status: 'active',
      storagePath: input.storagePath,
      hasReferences: input.hasReferences,
      hasExamples: input.hasExamples,
      scripts: input.scripts,
      createdBy: input.createdBy,
    });
  }

  async findAll(filters?: { status?: string }): Promise<ISkillDocument[]> {
    const query: Record<string, unknown> = {};
    if (filters?.status) query.status = filters.status;
    return Skill.find(query).sort({ name: 1 });
  }

  async findById(id: string): Promise<ISkillDocument | null> {
    return Skill.findById(id);
  }

  async update(id: string, input: UpdateSkillInput): Promise<ISkillDocument | null> {
    const { instructions, frontmatterYaml, ...dbFields } = input;

    const touchFile = instructions !== undefined || frontmatterYaml !== undefined;

    if (touchFile) {
      const skill = await Skill.findById(id).lean();
      if (skill?.storagePath) {
        try {
          const fs = await import('fs/promises');
          const path = await import('path');
          const skillMdPath = path.join(skill.storagePath, 'SKILL.md');
          let existingContent = '';
          try {
            existingContent = await fs.readFile(skillMdPath, 'utf-8');
          } catch {
            /* file may not exist */
          }

          let newContent = existingContent;
          if (frontmatterYaml !== undefined) {
            newContent = replaceSkillMdFrontmatter(newContent, frontmatterYaml);
          }
          if (instructions !== undefined) {
            const fm = newContent.match(/^---\s*\n[\s\S]*?\n---\s*\n?/);
            if (fm) {
              newContent = `${fm[0]}${instructions}`;
            } else {
              newContent = instructions;
            }
          }

          await fs.writeFile(skillMdPath, newContent, 'utf-8');
          (dbFields as any).instructions = skillMdBodyAfterFrontmatter(newContent);
        } catch (err: any) {
          console.error('[SkillService] Failed to update SKILL.md:', err.message);
        }
      } else if (instructions !== undefined) {
        (dbFields as any).instructions = instructions;
      }
    }

    return Skill.findByIdAndUpdate(id, { $set: dbFields }, { new: true });
  }

  async delete(id: string): Promise<boolean> {
    const result = await Skill.findByIdAndDelete(id);
    if (!result) return false;

    // Delete from storage
    if (result.storagePath) {
      await skillStorage.deleteSkillDirectory(result.storagePath);
    }

    const assistants = await Assistant.find({
      $or: [{ skills: id }, { 'staff.skillIds': id }],
    });
    for (const a of assistants) {
      a.skills = (a.skills || []).filter((s) => s.toString() !== id);
      for (const st of a.staff || []) {
        st.skillIds = (st.skillIds || []).filter((s) => s.toString() !== id);
      }
      assistantService.rebuildSkillsUnion(a);
      await a.save();
    }
    return true;
  }

  /**
   * Install a skill from a zip file containing full skill directory.
   * Creates or updates (upsert by slug).
   */
  async installFromZip(
    zipBuffer: Buffer,
    createdBy: string,
  ): Promise<ISkillDocument> {
    // Extract zip to temporary location to analyze structure
    const tempId = `temp-${Date.now()}`;
    const tempPath = skillStorage.getSkillPath(tempId, 'temp');

    // Save and analyze
    const { structure } = await skillStorage.saveFromZip(tempId, 'temp', zipBuffer);

    if (!structure.hasSkillMd) {
      throw new Error('Skill zip must contain SKILL.md file');
    }

    // Load SKILL.md to parse frontmatter
    const skillMdContent = await skillStorage.loadSkillMd(tempPath);
    const parsed = parseSkillFrontmatter(skillMdContent);
    const slug = resolveInstallSlug(parsed.name, parsed.slug);

    // Check existing
    const existing = await Skill.findOne({ slug });

    // Determine final storage path
    const storagePath = skillStorage.getSkillPath(createdBy, slug);

    // Move to final location (or overwrite)
    await skillStorage.deleteSkillDirectory(storagePath); // Clean if exists
    await skillStorage.saveFromZip(createdBy, slug, zipBuffer);

    // Get final structure
    const finalStructure = await skillStorage.analyzeStructure(storagePath);

    if (existing) {
      existing.name = parsed.name;
      existing.description = parsed.description;
      existing.triggerHints = parsed.triggerHints;
      existing.hasReferences = finalStructure.hasReferenceMd;
      existing.hasExamples = finalStructure.hasExamplesDir;
      existing.scripts = finalStructure.scripts;
      existing.storagePath = storagePath;
      existing.steps = parsed.steps;
      existing.reminderDelay = parsed.reminderDelay;
      existing.maxReminders = parsed.maxReminders;
      existing.scheduleEnabled = parsed.scheduleEnabled;
      existing.scheduleCron = parsed.scheduleCron;
      await existing.save();
      return existing;
    }

    const skill = await this.create({
      name: parsed.name,
      slug,
      description: parsed.description,
      triggerHints: parsed.triggerHints,
      createdBy,
      storagePath,
      hasReferences: finalStructure.hasReferenceMd,
      hasExamples: finalStructure.hasExamplesDir,
      scripts: finalStructure.scripts,
    });
    skill.steps = parsed.steps;
    skill.reminderDelay = parsed.reminderDelay;
    skill.maxReminders = parsed.maxReminders;
    skill.scheduleEnabled = parsed.scheduleEnabled;
    skill.scheduleCron = parsed.scheduleCron;
    await skill.save();
    return skill;
  }

  /**
   * Legacy: Install a skill from a parsed markdown file (single file, no directory).
   * Creates simple skill with just SKILL.md content in storage.
   */
  async installFromMarkdown(
    content: string,
    createdBy: string,
  ): Promise<ISkillDocument> {
    const parsed = parseSkillFrontmatter(content);
    const slug = resolveInstallSlug(parsed.name, parsed.slug);

    // Create storage directory with just SKILL.md
    const storagePath = skillStorage.getSkillPath(createdBy, slug);

    // Write SKILL.md to storage
    const fs = await import('fs/promises');
    const path = await import('path');
    await fs.mkdir(storagePath, { recursive: true });
    await fs.writeFile(path.join(storagePath, 'SKILL.md'), content, 'utf-8');

    // Extract instructions body (everything after frontmatter)
    const frontmatterEnd = content.match(/^---\s*\n[\s\S]*?\n---\s*\n/);
    const instructionsBody = frontmatterEnd
      ? content.substring(frontmatterEnd[0].length).trim()
      : '';

    const existing = await Skill.findOne({ slug });
    if (existing) {
      existing.name = parsed.name;
      existing.description = parsed.description;
      existing.triggerHints = parsed.triggerHints;
      existing.hasReferences = false;
      existing.hasExamples = false;
      existing.scripts = Object.keys(parsed.scriptsMeta);
      existing.storagePath = storagePath;
      existing.steps = parsed.steps;
      existing.instructions = instructionsBody;
      existing.reminderDelay = parsed.reminderDelay;
      existing.maxReminders = parsed.maxReminders;
      existing.scheduleEnabled = parsed.scheduleEnabled;
      existing.scheduleCron = parsed.scheduleCron;
      await existing.save();
      return existing;
    }

    const skill = await this.create({
      name: parsed.name,
      slug,
      description: parsed.description,
      triggerHints: parsed.triggerHints,
      createdBy,
      storagePath,
      hasReferences: false,
      hasExamples: false,
      scripts: Object.keys(parsed.scriptsMeta),
    });
    skill.instructions = instructionsBody;
    skill.steps = parsed.steps;
    skill.reminderDelay = parsed.reminderDelay;
    skill.maxReminders = parsed.maxReminders;
    skill.scheduleEnabled = parsed.scheduleEnabled;
    skill.scheduleCron = parsed.scheduleCron;
    await skill.save();
    return skill;
  }

  /**
   * Bind a skill to a specific staff member (unique per department).
   */
  async bindToStaff(skillId: string, assistantId: string, staffId: string): Promise<boolean> {
    const assistant = await Assistant.findById(assistantId);
    if (!assistant) return false;
    await assistantService.ensureStaffHasManager(assistant);
    const skillOid = new mongoose.Types.ObjectId(skillId);
    for (const st of assistant.staff || []) {
      if (st._id.toString() === staffId) continue;
      if (st.skillIds?.some((x) => x.toString() === skillId)) {
        throw new Error(
          'This skill is already assigned to another team member in this department',
        );
      }
    }
    const target = (
      assistant.staff as mongoose.Types.DocumentArray<import('../models/Assistant.js').IStaffMember>
    ).id(staffId);
    if (!target) return false;
    if (!target.skillIds.some((x: mongoose.Types.ObjectId) => x.toString() === skillId)) {
      target.skillIds.push(skillOid);
    }
    assistantService.rebuildSkillsUnion(assistant);
    await assistant.save();
    return true;
  }

  /**
   * Unbind a skill from a specific staff member.
   */
  async unbindFromStaff(skillId: string, assistantId: string, staffId: string): Promise<boolean> {
    const assistant = await Assistant.findById(assistantId);
    if (!assistant) return false;
    const target = (
      assistant.staff as mongoose.Types.DocumentArray<import('../models/Assistant.js').IStaffMember>
    ).id(staffId);
    if (!target) return false;
    target.skillIds = (target.skillIds || []).filter(
      (x: mongoose.Types.ObjectId) => x.toString() !== skillId,
    );
    assistantService.rebuildSkillsUnion(assistant);
    await assistant.save();
    return true;
  }

  /**
   * Bind a skill to the department manager (backward-compatible entry point).
   */
  async bindToAssistant(skillId: string, assistantId: string): Promise<boolean> {
    const assistant = await Assistant.findById(assistantId);
    if (!assistant) return false;
    await assistantService.ensureStaffHasManager(assistant);
    const mgr = assistantService.getManagerStaff(assistant);
    if (!mgr) return false;
    return this.bindToStaff(skillId, assistantId, mgr._id.toString());
  }

  /**
   * Unbind a skill from the department manager (backward-compatible).
   */
  async unbindFromAssistant(skillId: string, assistantId: string): Promise<boolean> {
    const assistant = await Assistant.findById(assistantId);
    if (!assistant) return false;
    await assistantService.ensureStaffHasManager(assistant);
    const mgr = assistantService.getManagerStaff(assistant);
    if (!mgr) return false;
    return this.unbindFromStaff(skillId, assistantId, mgr._id.toString());
  }

  async saveReference(skillId: string, content: string): Promise<ISkillDocument | null> {
    const skill = await Skill.findById(skillId);
    if (!skill || !skill.storagePath) return null;

    const fs = await import('fs/promises');
    const path = await import('path');
    await fs.mkdir(skill.storagePath, { recursive: true });
    await fs.writeFile(path.join(skill.storagePath, 'reference.md'), content, 'utf-8');

    skill.hasReferences = true;
    await skill.save();
    return skill;
  }

  async getReference(skillId: string): Promise<string | null> {
    const skill = await Skill.findById(skillId);
    if (!skill || !skill.storagePath) return null;
    return skillStorage.loadReference(skill.storagePath);
  }

  async deleteReference(skillId: string): Promise<ISkillDocument | null> {
    const skill = await Skill.findById(skillId);
    if (!skill || !skill.storagePath) return null;

    const fs = await import('fs/promises');
    const path = await import('path');
    try {
      await fs.unlink(path.join(skill.storagePath, 'reference.md'));
    } catch { /* file may not exist */ }

    skill.hasReferences = false;
    await skill.save();
    return skill;
  }

  async addScript(skillId: string, filename: string, content: Buffer | string): Promise<ISkillDocument | null> {
    const skill = await Skill.findById(skillId);
    if (!skill || !skill.storagePath) return null;

    const fs = await import('fs/promises');
    const path = await import('path');
    const scriptsDir = path.join(skill.storagePath, 'scripts');
    await fs.mkdir(scriptsDir, { recursive: true });
    await fs.writeFile(path.join(scriptsDir, filename), content);

    const scriptFiles = await skillStorage.listScripts(skill.storagePath);
    skill.scripts = scriptFiles;
    await skill.save();
    return skill;
  }

  async getScriptContent(skillId: string, filename: string): Promise<string | null> {
    const skill = await Skill.findById(skillId);
    if (!skill || !skill.storagePath) return null;

    const fs = await import('fs/promises');
    const path = await import('path');
    const scriptPath = path.join(skill.storagePath, 'scripts', filename);

    const resolved = path.resolve(scriptPath);
    const scriptsDir = path.resolve(path.join(skill.storagePath, 'scripts'));
    if (!resolved.startsWith(scriptsDir)) return null;

    try {
      return await fs.readFile(scriptPath, 'utf-8');
    } catch {
      return null;
    }
  }

  async deleteScript(skillId: string, filename: string): Promise<ISkillDocument | null> {
    const skill = await Skill.findById(skillId);
    if (!skill || !skill.storagePath) return null;

    const fs = await import('fs/promises');
    const path = await import('path');
    const scriptPath = path.join(skill.storagePath, 'scripts', filename);

    const resolved = path.resolve(scriptPath);
    const scriptsDir = path.resolve(path.join(skill.storagePath, 'scripts'));
    if (!resolved.startsWith(scriptsDir)) return null;

    try {
      await fs.unlink(scriptPath);
    } catch { /* file may not exist */ }

    const scriptFiles = await skillStorage.listScripts(skill.storagePath);
    skill.scripts = scriptFiles;
    await skill.save();
    return skill;
  }

  async listScripts(skillId: string): Promise<string[]> {
    const skill = await Skill.findById(skillId);
    if (!skill || !skill.storagePath) return [];
    return skillStorage.listScripts(skill.storagePath);
  }

  async listAssetFiles(skillId: string): Promise<SkillAssetFileInfo[]> {
    const skill = await Skill.findById(skillId);
    if (!skill || !skill.storagePath) return [];
    return skillStorage.listAssetFiles(skill.storagePath);
  }

  async uploadAssetFile(
    skillId: string,
    filename: string,
    buffer: Buffer,
  ): Promise<SkillAssetFileInfo[] | null> {
    const skill = await Skill.findById(skillId);
    if (!skill || !skill.storagePath) return null;
    await skillStorage.writeAssetFile(skill.storagePath, filename, buffer);
    return skillStorage.listAssetFiles(skill.storagePath);
  }

  async deleteAssetFile(skillId: string, filename: string): Promise<SkillAssetFileInfo[] | null> {
    const skill = await Skill.findById(skillId);
    if (!skill || !skill.storagePath) return null;
    await skillStorage.deleteAssetFile(skill.storagePath, filename);
    return skillStorage.listAssetFiles(skill.storagePath);
  }

  async renameAssetFile(
    skillId: string,
    fromName: string,
    toName: string,
  ): Promise<SkillAssetFileInfo[] | null> {
    const skill = await Skill.findById(skillId);
    if (!skill || !skill.storagePath) return null;
    await skillStorage.renameAssetFile(skill.storagePath, fromName, toName);
    return skillStorage.listAssetFiles(skill.storagePath);
  }

  /**
   * Load skill content from storage for execution
   */
  async loadSkillContent(skillId: string): Promise<{
    instructions: string;
    reference: string | null;
    examples: string[];
    scripts: string[];
    storagePath: string;
  } | null> {
    const skill = await Skill.findById(skillId);
    if (!skill) return null;

    const instructions = await skillStorage.loadSkillMd(skill.storagePath);
    const reference = skill.hasReferences
      ? await skillStorage.loadReference(skill.storagePath)
      : null;
    const examples = skill.hasExamples
      ? await skillStorage.listExamples(skill.storagePath)
      : [];

    return {
      instructions,
      reference,
      examples,
      scripts: skill.scripts,
      storagePath: skill.storagePath,
    };
  }
}

export const skillService = new SkillService();
