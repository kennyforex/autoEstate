import { Skill, type ISkillDocument } from '../models/Skill.js';
import { Assistant } from '../models/index.js';
import { skillStorage, type SkillDirectoryStructure } from './skillStorage.service.js';

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
  triggerHints?: string[];
  requiredTools?: string[];
  status?: 'active' | 'inactive';
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
export function parseSkillFrontmatter(content: string): {
  name: string;
  description: string;
  triggerHints: string[];
  scriptsMeta: Record<string, string>;
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

  // Parse scripts section if present (simple key: description format)
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

  return {
    name: meta.name,
    description: meta.description,
    triggerHints: meta.triggerHints ? meta.triggerHints.split(',').map((s) => s.trim()).filter(Boolean) : [],
    scriptsMeta,
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
    const { instructions, ...dbFields } = input;

    // If instructions are being updated, save to SKILL.md file
    if (instructions !== undefined) {
      const skill = await Skill.findById(id).lean();
      if (skill?.storagePath) {
        try {
          const fs = await import('fs/promises');
          const path = await import('path');
          const skillMdPath = path.join(skill.storagePath, 'SKILL.md');
          // Read existing SKILL.md to preserve frontmatter
          let existingContent = '';
          try {
            existingContent = await fs.readFile(skillMdPath, 'utf-8');
          } catch { /* file may not exist */ }

          // Rebuild SKILL.md: keep frontmatter, replace body
          const frontmatterMatch = existingContent.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
          if (frontmatterMatch) {
            const newContent = `${frontmatterMatch[0]}\n${instructions}`;
            await fs.writeFile(skillMdPath, newContent, 'utf-8');
          } else {
            // No existing frontmatter — write full file
            await fs.writeFile(skillMdPath, instructions, 'utf-8');
          }
        } catch (err: any) {
          console.error('[SkillService] Failed to update SKILL.md:', err.message);
        }
      }
      // Also store in DB legacy field for easy retrieval
      (dbFields as any).instructions = instructions;
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

    // Remove from all assistants that reference this skill
    await Assistant.updateMany(
      { skills: id },
      { $pull: { skills: id } },
    );
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
    const slug = parsed.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

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
      // Update existing
      existing.name = parsed.name;
      existing.description = parsed.description;
      existing.triggerHints = parsed.triggerHints;
      existing.hasReferences = finalStructure.hasReferenceMd;
      existing.hasExamples = finalStructure.hasExamplesDir;
      existing.scripts = finalStructure.scripts;
      existing.storagePath = storagePath;
      await existing.save();
      return existing;
    }

    // Create new
    return this.create({
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
    const slug = parsed.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

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
      existing.instructions = instructionsBody; // store in DB for easy editing
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
    // Store instructions in DB legacy field
    skill.instructions = instructionsBody;
    await skill.save();
    return skill;
  }

  /**
   * Bind a skill to an assistant
   */
  async bindToAssistant(skillId: string, assistantId: string): Promise<boolean> {
    const result = await Assistant.findByIdAndUpdate(
      assistantId,
      { $addToSet: { skills: skillId } },
      { new: true },
    );
    return !!result;
  }

  /**
   * Unbind a skill from an assistant
   */
  async unbindFromAssistant(skillId: string, assistantId: string): Promise<boolean> {
    const result = await Assistant.findByIdAndUpdate(
      assistantId,
      { $pull: { skills: skillId } },
      { new: true },
    );
    return !!result;
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
