import mongoose from 'mongoose';
import { Skill, type ISkillDocument } from '../models/Skill.js';
import { Assistant } from '../models/index.js';
import { assistantService } from './assistant.service.js';
import {
  skillStorage,
  type SkillAssetFileInfo,
  type SkillDirectoryStructure,
  type SkillReferenceListResult,
} from './skillStorage.service.js';
import {
  mergeSkillFormIntoFrontmatterInner,
  type SkillFormYamlOverlay,
  replaceSkillMdFrontmatter,
  skillMdBodyAfterFrontmatter,
  skillMdFrontmatterInner,
} from '../utils/skillMdConfig.js';
import {
  parseSkillFrontmatterFromYaml,
  type ParsedSkillStep as ParsedSkillStepImported,
} from '../utils/skillFrontmatterParse.js';

export type ParsedSkillStep = ParsedSkillStepImported;

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
  argumentHint?: string;
  userInvocable?: boolean;
  status?: 'active' | 'inactive';
  nickname?: string;
  staffRole?: string;
  avatarPreset?: string;
  customAvatarUrl?: string;
}

function skillFormOverlayFromUpdateFields(dbFields: UpdateSkillInput): SkillFormYamlOverlay {
  return {
    displayName: typeof dbFields.name === 'string' ? dbFields.name : '',
    description: typeof dbFields.description === 'string' ? dbFields.description : '',
    reminderDelay:
      typeof dbFields.reminderDelay === 'number' ? dbFields.reminderDelay : 0,
    maxReminders:
      typeof dbFields.maxReminders === 'number' ? dbFields.maxReminders : 0,
    scheduleEnabled: Boolean(dbFields.scheduleEnabled),
    scheduleCron:
      typeof dbFields.scheduleCron === 'string' ? dbFields.scheduleCron : '',
    requiredTools: Array.isArray(dbFields.requiredTools)
      ? (dbFields.requiredTools as string[])
      : [],
    triggerHints: Array.isArray(dbFields.triggerHints)
      ? [...dbFields.triggerHints]
      : [],
    argumentHint: typeof dbFields.argumentHint === 'string' ? dbFields.argumentHint : '',
    userInvocable: Boolean(dbFields.userInvocable),
  };
}

/** Latin slug from display name (empty if name is only non-Latin). */
function slugifyFromSkillName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Install path / DB slug: YAML `name` is kebab-case id; optional `metadata.slug` overrides.
 */
export function resolveInstallSlug(skillId: string, explicitSlug?: string): string {
  const explicit = explicitSlug
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-|-$/g, '');
  if (explicit) return explicit;
  const kebab = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  if (skillId.length > 0 && skillId.length <= 64 && kebab.test(skillId)) return skillId;
  const fromName = slugifyFromSkillName(skillId);
  if (fromName) return fromName;
  throw new Error(
    'Skill slug cannot be derived from name. Add `metadata.slug: your-english-slug` to SKILL.md frontmatter (required for non-Latin names).',
  );
}

/** Parsed SKILL.md frontmatter for DB + install (name = display title). */
export function parseSkillFrontmatter(content: string): {
  name: string;
  skillId: string;
  slug?: string;
  description: string;
  triggerHints: string[];
  scriptsMeta: Record<string, string>;
  steps: ParsedSkillStep[];
  reminderDelay: number;
  maxReminders: number;
  scheduleEnabled: boolean;
  scheduleCron: string;
  requiredTools: string[];
  toolConfigExplicit: boolean;
} {
  const r = parseSkillFrontmatterFromYaml(content);
  return {
    name: r.displayName,
    skillId: r.skillId,
    slug: r.slug,
    description: r.description,
    triggerHints: r.triggerHints,
    scriptsMeta: r.scriptsMeta,
    steps: r.steps,
    reminderDelay: r.reminderDelay,
    maxReminders: r.maxReminders,
    scheduleEnabled: r.scheduleEnabled,
    scheduleCron: r.scheduleCron,
    requiredTools: r.requiredTools,
    toolConfigExplicit: r.toolConfigExplicit,
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

    let fileSync: Record<string, unknown> | null = null;

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
            let inner = frontmatterYaml;
            if (
              typeof dbFields.name === 'string' &&
              typeof dbFields.description === 'string'
            ) {
              inner = mergeSkillFormIntoFrontmatterInner(
                inner,
                skillFormOverlayFromUpdateFields(dbFields),
              );
            }
            newContent = replaceSkillMdFrontmatter(newContent, inner);
          } else if (
            instructions !== undefined &&
            typeof dbFields.name === 'string' &&
            typeof dbFields.description === 'string'
          ) {
            const prevInner = skillMdFrontmatterInner(existingContent) ?? '';
            const inner = mergeSkillFormIntoFrontmatterInner(
              prevInner,
              skillFormOverlayFromUpdateFields(dbFields),
            );
            newContent = replaceSkillMdFrontmatter(existingContent, inner);
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
          const parsed = parseSkillFrontmatter(newContent);
          fileSync = {
            name: parsed.name,
            description: parsed.description,
            triggerHints: parsed.triggerHints,
            steps: parsed.steps,
            reminderDelay: parsed.reminderDelay,
            maxReminders: parsed.maxReminders,
            scheduleEnabled: parsed.scheduleEnabled,
            scheduleCron: parsed.scheduleCron,
            instructions: skillMdBodyAfterFrontmatter(newContent),
          };
          if (parsed.toolConfigExplicit) {
            fileSync.requiredTools = parsed.requiredTools;
          }
        } catch (err: any) {
          console.error('[SkillService] Failed to update SKILL.md:', err.message);
        }
      } else if (instructions !== undefined) {
        (dbFields as any).instructions = instructions;
      }
    }

    const yamlOnlyFormKeys = new Set(['argumentHint', 'userInvocable']);
    const cleanedDb = Object.fromEntries(
      Object.entries(dbFields).filter(
        ([k, v]) => v !== undefined && !yamlOnlyFormKeys.has(k),
      ),
    );
    const setPayload = { ...(fileSync || {}), ...cleanedDb };
    return Skill.findByIdAndUpdate(id, { $set: setPayload }, { new: true });
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
    const slug = resolveInstallSlug(parsed.skillId, parsed.slug);

    // Check existing
    const existing = await Skill.findOne({ slug });

    // Determine final storage path
    const storagePath = skillStorage.getSkillPath(createdBy, slug);

    // Move to final location (or overwrite)
    await skillStorage.deleteSkillDirectory(storagePath); // Clean if exists
    await skillStorage.saveFromZip(createdBy, slug, zipBuffer);

    // Re-parse from final SKILL.md (zip may differ slightly)
    const finalMd = await skillStorage.loadSkillMd(storagePath);
    const finalParsed = parseSkillFrontmatter(finalMd);

    // Get final structure
    const finalStructure = await skillStorage.analyzeStructure(storagePath);

    const requiredTools =
      finalParsed.toolConfigExplicit ? finalParsed.requiredTools : [];

    if (existing) {
      existing.name = finalParsed.name;
      existing.description = finalParsed.description;
      existing.triggerHints = finalParsed.triggerHints;
      existing.hasReferences = finalStructure.hasReferenceMd;
      existing.hasExamples = finalStructure.hasExamplesDir;
      existing.scripts = finalStructure.scripts;
      existing.storagePath = storagePath;
      existing.steps = finalParsed.steps;
      existing.reminderDelay = finalParsed.reminderDelay;
      existing.maxReminders = finalParsed.maxReminders;
      existing.scheduleEnabled = finalParsed.scheduleEnabled;
      existing.scheduleCron = finalParsed.scheduleCron;
      if (finalParsed.toolConfigExplicit) {
        existing.requiredTools = requiredTools;
      }
      await existing.save();
      return existing;
    }

    const skill = await this.create({
      name: finalParsed.name,
      slug,
      description: finalParsed.description,
      triggerHints: finalParsed.triggerHints,
      createdBy,
      storagePath,
      hasReferences: finalStructure.hasReferenceMd,
      hasExamples: finalStructure.hasExamplesDir,
      scripts: finalStructure.scripts,
    });
    skill.steps = finalParsed.steps;
    skill.reminderDelay = finalParsed.reminderDelay;
    skill.maxReminders = finalParsed.maxReminders;
    skill.scheduleEnabled = finalParsed.scheduleEnabled;
    skill.scheduleCron = finalParsed.scheduleCron;
    skill.requiredTools = requiredTools;
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
    const slug = resolveInstallSlug(parsed.skillId, parsed.slug);

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

    const requiredTools = parsed.toolConfigExplicit ? parsed.requiredTools : [];

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
      if (parsed.toolConfigExplicit) {
        existing.requiredTools = requiredTools;
      }
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
    skill.requiredTools = requiredTools;
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

  /** Recompute hasReferences from disk (references/ + optional legacy root reference.md). */
  async refreshHasReferences(skillId: string): Promise<ISkillDocument | null> {
    const skill = await Skill.findById(skillId);
    if (!skill || !skill.storagePath) return null;
    const { files } = await skillStorage.listReferenceDocuments(skill.storagePath);
    skill.hasReferences = files.length > 0;
    await skill.save();
    return skill;
  }

  async saveReference(skillId: string, content: string): Promise<ISkillDocument | null> {
    const skill = await Skill.findById(skillId);
    if (!skill || !skill.storagePath) return null;
    await skillStorage.writeReferenceDocument(skill.storagePath, 'reference.md', content);
    return this.refreshHasReferences(skillId);
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
    const skillRoot = path.resolve(skill.storagePath);
    const refsDir = path.join(skillRoot, 'references');
    try {
      const names = await fs.readdir(refsDir);
      for (const n of names) {
        try {
          await fs.unlink(path.join(refsDir, n));
        } catch {
          /* ignore */
        }
      }
      await fs.rm(refsDir, { recursive: true, force: true });
    } catch {
      /* no dir */
    }
    try {
      await fs.unlink(path.join(skillRoot, 'reference.md'));
    } catch {
      /* no legacy file */
    }

    skill.hasReferences = false;
    await skill.save();
    return skill;
  }

  async listReferenceDocuments(skillId: string): Promise<SkillReferenceListResult | null> {
    const skill = await Skill.findById(skillId);
    if (!skill || !skill.storagePath) return null;
    return skillStorage.listReferenceDocuments(skill.storagePath);
  }

  async getReferenceDocument(skillId: string, filename: string): Promise<{ filename: string; content: string } | null> {
    const skill = await Skill.findById(skillId);
    if (!skill || !skill.storagePath) return null;
    const content = await skillStorage.loadReferenceDocument(skill.storagePath, filename);
    if (content === null) return null;
    return { filename, content };
  }

  async saveReferenceDocument(
    skillId: string,
    filename: string,
    content: string,
  ): Promise<ISkillDocument | null> {
    const skill = await Skill.findById(skillId);
    if (!skill || !skill.storagePath) return null;
    await skillStorage.writeReferenceDocument(skill.storagePath, filename, content);
    return this.refreshHasReferences(skillId);
  }

  async uploadReferenceDocument(
    skillId: string,
    filename: string,
    buffer: Buffer,
  ): Promise<ISkillDocument | null> {
    const skill = await Skill.findById(skillId);
    if (!skill || !skill.storagePath) return null;
    const text = buffer.toString('utf-8');
    await skillStorage.writeReferenceDocument(skill.storagePath, filename, text);
    return this.refreshHasReferences(skillId);
  }

  async deleteReferenceDocument(skillId: string, filename: string): Promise<ISkillDocument | null> {
    const skill = await Skill.findById(skillId);
    if (!skill || !skill.storagePath) return null;
    await skillStorage.deleteReferenceDocument(skill.storagePath, filename);
    return this.refreshHasReferences(skillId);
  }

  async renameReferenceDocument(
    skillId: string,
    fromName: string,
    toName: string,
  ): Promise<ISkillDocument | null> {
    const skill = await Skill.findById(skillId);
    if (!skill || !skill.storagePath) return null;
    await skillStorage.renameReferenceDocument(skill.storagePath, fromName, toName);
    return this.refreshHasReferences(skillId);
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
