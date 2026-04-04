import { Response, NextFunction } from 'express';
import type { AuthRequest } from '../types/index.js';
import { skillService } from '../services/skill.service.js';
import { skillStorage } from '../services/skillStorage.service.js';
import {
  skillMdBodyAfterFrontmatter,
  skillMdFrontmatterInner,
} from '../utils/skillMdConfig.js';
import { reloadSkillSchedules } from '../services/skillSchedule.scheduler.js';

export async function listSkills(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const status = req.query.status as string | undefined;
    const skills = await skillService.findAll(status ? { status } : undefined);
    res.json({ skills });
  } catch (error) {
    next(error);
  }
}

export async function getSkill(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const skill = await skillService.findById(req.params.id);
    if (!skill) {
      res.status(404).json({ error: 'Skill not found' });
      return;
    }
    const payload = skill.toObject();
    if (skill.storagePath) {
      try {
        const raw = await skillStorage.loadSkillMd(skill.storagePath);
        const body = skillMdBodyAfterFrontmatter(raw);
        if (body.trim()) {
          payload.instructions = body;
        }
        const fm = skillMdFrontmatterInner(raw);
        (payload as Record<string, unknown>).frontmatterYaml =
          fm !== undefined ? fm : '';
      } catch {
        /* keep DB instructions */
      }
    }
    res.json({ skill: payload });
  } catch (error) {
    next(error);
  }
}

export async function createSkill(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { name, slug, description, triggerHints, storagePath, hasReferences, hasExamples, scripts } = req.body;
    const skill = await skillService.create({
      name,
      slug,
      description,
      triggerHints,
      storagePath,
      hasReferences: hasReferences || false,
      hasExamples: hasExamples || false,
      scripts: scripts || [],
      createdBy: req.user!.userId,
    });
    res.status(201).json({ skill });
  } catch (error: any) {
    if (error.message?.includes('already exists')) {
      res.status(409).json({ error: error.message });
      return;
    }
    next(error);
  }
}

export async function updateSkill(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const {
      name,
      description,
      instructions,
      frontmatterYaml,
      triggerHints,
      status,
      requiredTools,
      reminderDelay,
      maxReminders,
      scheduleEnabled,
      scheduleCron,
      nickname,
      staffRole,
      avatarPreset,
      customAvatarUrl,
    } = req.body;
    const skill = await skillService.update(req.params.id, {
      name,
      description,
      instructions,
      frontmatterYaml,
      triggerHints,
      status,
      requiredTools,
      reminderDelay,
      maxReminders,
      scheduleEnabled,
      scheduleCron,
      nickname,
      staffRole,
      avatarPreset,
      customAvatarUrl,
    });
    if (!skill) {
      res.status(404).json({ error: 'Skill not found' });
      return;
    }
    reloadSkillSchedules();
    res.json({ skill });
  } catch (error) {
    next(error);
  }
}

export async function deleteSkill(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const deleted = await skillService.delete(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Skill not found' });
      return;
    }
    reloadSkillSchedules();
    res.json({ message: 'Skill deleted successfully' });
  } catch (error) {
    next(error);
  }
}

export async function installSkill(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const file = (req as any).file;
    if (!file) {
      res.status(400).json({ error: 'No file uploaded. Upload a skill.md file.' });
      return;
    }

    const content = file.buffer.toString('utf-8');
    const skill = await skillService.installFromMarkdown(content, req.user!.userId);
    reloadSkillSchedules();
    res.status(201).json({ skill, installed: true });
  } catch (error: any) {
    if (error.message?.includes('missing') || error.message?.includes('Invalid')) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
}

export async function installSkillZip(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const file = (req as any).file;
    if (!file) {
      res.status(400).json({ error: 'No file uploaded. Upload a skill directory as zip file.' });
      return;
    }

    // Validate zip file extension
    if (!file.originalname?.toLowerCase().endsWith('.zip')) {
      res.status(400).json({ error: 'File must be a .zip archive' });
      return;
    }

    const skill = await skillService.installFromZip(file.buffer, req.user!.userId);
    reloadSkillSchedules();
    res.status(201).json({ skill, installed: true });
  } catch (error: any) {
    if (error.message?.includes('SKILL.md') || error.message?.includes('Invalid') || error.message?.includes('missing')) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
}

export async function bindSkill(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { skillId, assistantId, staffId } = req.body;
    let result: boolean;
    if (staffId && typeof staffId === 'string') {
      result = await skillService.bindToStaff(skillId, assistantId, staffId);
    } else {
      result = await skillService.bindToAssistant(skillId, assistantId);
    }
    if (!result) {
      res.status(404).json({ error: 'Assistant or staff not found' });
      return;
    }
    res.json({ message: 'Skill bound' });
  } catch (error: any) {
    if (error.message?.includes('already assigned')) {
      res.status(409).json({ error: error.message });
      return;
    }
    next(error);
  }
}

export async function unbindSkill(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { skillId, assistantId, staffId } = req.body;
    let result: boolean;
    if (staffId && typeof staffId === 'string') {
      result = await skillService.unbindFromStaff(skillId, assistantId, staffId);
    } else {
      result = await skillService.unbindFromAssistant(skillId, assistantId);
    }
    if (!result) {
      res.status(404).json({ error: 'Assistant or staff not found' });
      return;
    }
    res.json({ message: 'Skill unbound' });
  } catch (error) {
    next(error);
  }
}

export async function getReference(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const content = await skillService.getReference(req.params.id);
    if (content === null) {
      res.status(404).json({ error: 'No reference found' });
      return;
    }
    res.json({ content });
  } catch (error) {
    next(error);
  }
}

export async function saveReference(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { content } = req.body;
    if (!content) {
      res.status(400).json({ error: 'Content is required' });
      return;
    }
    const skill = await skillService.saveReference(req.params.id, content);
    if (!skill) {
      res.status(404).json({ error: 'Skill not found' });
      return;
    }
    res.json({ skill });
  } catch (error) {
    next(error);
  }
}

export async function uploadReference(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const file = (req as any).file;
    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }
    const content = file.buffer.toString('utf-8');
    const skill = await skillService.saveReference(req.params.id, content);
    if (!skill) {
      res.status(404).json({ error: 'Skill not found' });
      return;
    }
    res.json({ skill });
  } catch (error) {
    next(error);
  }
}

export async function deleteReference(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const skill = await skillService.deleteReference(req.params.id);
    if (!skill) {
      res.status(404).json({ error: 'Skill not found' });
      return;
    }
    res.json({ skill });
  } catch (error) {
    next(error);
  }
}

export async function listScripts(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const scripts = await skillService.listScripts(req.params.id);
    res.json({ scripts });
  } catch (error) {
    next(error);
  }
}

export async function getScript(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const content = await skillService.getScriptContent(req.params.id, req.params.filename);
    if (content === null) {
      res.status(404).json({ error: 'Script not found' });
      return;
    }
    res.json({ filename: req.params.filename, content });
  } catch (error) {
    next(error);
  }
}

export async function uploadScript(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const file = (req as any).file;
    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }
    const filename = file.originalname;
    const ext = filename.split('.').pop()?.toLowerCase();
    const allowedExts = ['js', 'ts', 'py', 'sh', 'bash', 'rb', 'php'];
    if (!ext || !allowedExts.includes(ext)) {
      res.status(400).json({ error: `Unsupported script type. Allowed: ${allowedExts.join(', ')}` });
      return;
    }
    const skill = await skillService.addScript(req.params.id, filename, file.buffer);
    if (!skill) {
      res.status(404).json({ error: 'Skill not found' });
      return;
    }
    res.json({ skill });
  } catch (error) {
    next(error);
  }
}

export async function createScript(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { filename, content } = req.body;
    if (!filename || !content) {
      res.status(400).json({ error: 'Filename and content are required' });
      return;
    }
    const ext = filename.split('.').pop()?.toLowerCase();
    const allowedExts = ['js', 'ts', 'py', 'sh', 'bash', 'rb', 'php'];
    if (!ext || !allowedExts.includes(ext)) {
      res.status(400).json({ error: `Unsupported script type. Allowed: ${allowedExts.join(', ')}` });
      return;
    }
    const skill = await skillService.addScript(req.params.id, filename, content);
    if (!skill) {
      res.status(404).json({ error: 'Skill not found' });
      return;
    }
    res.json({ skill });
  } catch (error) {
    next(error);
  }
}

export async function deleteScript(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const skill = await skillService.deleteScript(req.params.id, req.params.filename);
    if (!skill) {
      res.status(404).json({ error: 'Skill not found' });
      return;
    }
    res.json({ skill });
  } catch (error) {
    next(error);
  }
}
