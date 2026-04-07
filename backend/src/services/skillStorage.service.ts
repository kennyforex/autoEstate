import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import AdmZip from 'adm-zip';

const SKILLS_BASE_PATH = process.env.SKILLS_STORAGE_PATH || './uploads/skills';

export interface SkillDirectoryStructure {
  hasSkillMd: boolean;
  hasReferenceMd: boolean;
  hasExamplesDir: boolean;
  examples: string[];
  scripts: string[];
}

/** Allowed extensions for skill `assets/` (templates, docs, images). */
export const SKILL_ASSET_ALLOWED_EXTENSIONS = new Set([
  '.docx',
  '.doc',
  '.xlsx',
  '.xls',
  '.pdf',
  '.csv',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.txt',
  '.md',
]);

export interface SkillAssetFileInfo {
  name: string;
  sizeBytes: number;
}

export interface ScriptExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Service for managing skill directory storage and operations.
 * Skills are stored as directories with:
 * - SKILL.md (required, main instructions)
 * - reference.md (optional, detailed docs)
 * - examples/ (optional, usage examples)
 * - scripts/ (optional, executable scripts)
 * - assets/ (optional, templates and binary files managed via API)
 */
class SkillStorageService {
  private basePath: string;

  constructor() {
    this.basePath = SKILLS_BASE_PATH;
    this.ensureBaseDirectory();
  }

  private async ensureBaseDirectory(): Promise<void> {
    try {
      await fs.access(this.basePath);
    } catch {
      await fs.mkdir(this.basePath, { recursive: true });
    }
  }

  /**
   * Get full storage path for a skill
   */
  getSkillPath(userId: string, slug: string): string {
    return path.join(this.basePath, userId, slug);
  }

  /**
   * Save skill from zip file upload
   */
  async saveFromZip(
    userId: string,
    slug: string,
    zipBuffer: Buffer,
  ): Promise<{ storagePath: string; structure: SkillDirectoryStructure }> {
    const skillPath = this.getSkillPath(userId, slug);

    // Clean up any existing directory
    try {
      await fs.rm(skillPath, { recursive: true, force: true });
    } catch {
      // Directory didn't exist, that's fine
    }

    // Create directory and extract zip
    await fs.mkdir(skillPath, { recursive: true });

    const zip = new AdmZip(zipBuffer);
    zip.extractAllTo(skillPath, true);

    // Analyze directory structure
    const structure = await this.analyzeStructure(skillPath);

    if (!structure.hasSkillMd) {
      // Clean up if invalid
      await fs.rm(skillPath, { recursive: true, force: true });
      throw new Error('Skill must contain SKILL.md file');
    }

    return {
      storagePath: skillPath,
      structure,
    };
  }

  /**
   * Analyze skill directory structure
   */
  async analyzeStructure(skillPath: string): Promise<SkillDirectoryStructure> {
    const structure: SkillDirectoryStructure = {
      hasSkillMd: false,
      hasReferenceMd: false,
      hasExamplesDir: false,
      examples: [],
      scripts: [],
    };

    try {
      const entries = await fs.readdir(skillPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile()) {
          if (entry.name.toLowerCase() === 'skill.md') {
            structure.hasSkillMd = true;
          } else if (entry.name.toLowerCase() === 'reference.md') {
            structure.hasReferenceMd = true;
          }
        } else if (entry.isDirectory()) {
          const dirName = entry.name.toLowerCase();

          if (dirName === 'examples') {
            structure.hasExamplesDir = true;
            const examplesPath = path.join(skillPath, 'examples');
            const exampleFiles = await fs.readdir(examplesPath);
            structure.examples = exampleFiles.filter((f) => f.endsWith('.md'));
          } else if (dirName === 'scripts') {
            const scriptsPath = path.join(skillPath, 'scripts');
            const scriptFiles = await fs.readdir(scriptsPath);
            structure.scripts = scriptFiles.filter((f) => {
              // Common script extensions
              const ext = path.extname(f).toLowerCase();
              return ['.js', '.ts', '.py', '.sh', '.bash', '.rb', '.php'].includes(ext);
            });
          }
        }
      }
    } catch (error) {
      console.error('[SkillStorage] Error analyzing structure:', error);
    }

    return structure;
  }

  /**
   * Load SKILL.md content (on-demand during execution)
   */
  async loadSkillMd(skillPath: string): Promise<string> {
    const filePath = path.join(skillPath, 'SKILL.md');
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    } catch {
      throw new Error(`SKILL.md not found in ${skillPath}`);
    }
  }

  /**
   * Load reference.md content (on-demand)
   */
  async loadReference(skillPath: string): Promise<string | null> {
    const filePath = path.join(skillPath, 'reference.md');
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    } catch {
      return null;
    }
  }

  /**
   * List available examples
   */
  async listExamples(skillPath: string): Promise<string[]> {
    const examplesPath = path.join(skillPath, 'examples');
    try {
      const files = await fs.readdir(examplesPath);
      return files.filter((f) => f.endsWith('.md'));
    } catch {
      return [];
    }
  }

  /**
   * Load specific example content
   */
  async loadExample(skillPath: string, filename: string): Promise<string | null> {
    const filePath = path.join(skillPath, 'examples', filename);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    } catch {
      return null;
    }
  }

  /**
   * List available scripts
   */
  async listScripts(skillPath: string): Promise<string[]> {
    const scriptsPath = path.join(skillPath, 'scripts');
    try {
      const files = await fs.readdir(scriptsPath);
      return files.filter((f) => {
        const ext = path.extname(f).toLowerCase();
        return ['.js', '.ts', '.py', '.sh', '.bash', '.rb', '.php'].includes(ext);
      });
    } catch {
      return [];
    }
  }

  /**
   * Resolve a single basename under skill `assets/`. Throws if invalid or escapes directory.
   */
  resolveAssetAbsolutePath(skillPath: string, filename: string, requireAllowedExt: boolean): string {
    const base = path.basename(filename.trim());
    if (!base || base !== filename.trim() || base.includes('..') || /[/\\]/.test(base)) {
      throw new Error('Invalid filename');
    }
    const ext = path.extname(base).toLowerCase();
    if (requireAllowedExt && !SKILL_ASSET_ALLOWED_EXTENSIONS.has(ext)) {
      throw new Error(`File type not allowed: ${ext || '(none)'}`);
    }
    const skillRoot = path.resolve(skillPath);
    const assetsDir = path.join(skillRoot, 'assets');
    const abs = path.resolve(path.join(assetsDir, base));
    const assetsResolved = path.resolve(assetsDir);
    const sep = path.sep;
    if (abs !== assetsResolved && !abs.startsWith(assetsResolved + sep)) {
      throw new Error('Path escapes assets directory');
    }
    return abs;
  }

  /**
   * List files in assets/ with sizes (only allowed extensions).
   */
  async listAssetFiles(skillPath: string): Promise<SkillAssetFileInfo[]> {
    const skillRoot = path.resolve(skillPath);
    const assetsDir = path.join(skillRoot, 'assets');
    let entries;
    try {
      entries = await fs.readdir(assetsDir, { withFileTypes: true });
    } catch {
      return [];
    }
    const out: SkillAssetFileInfo[] = [];
    for (const ent of entries) {
      if (!ent.isFile()) continue;
      const ext = path.extname(ent.name).toLowerCase();
      if (!SKILL_ASSET_ALLOWED_EXTENSIONS.has(ext)) continue;
      const abs = path.join(assetsDir, ent.name);
      try {
        const st = await fs.stat(abs);
        out.push({ name: ent.name, sizeBytes: st.size });
      } catch {
        /* skip */
      }
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }

  async writeAssetFile(skillPath: string, filename: string, buffer: Buffer): Promise<void> {
    const abs = this.resolveAssetAbsolutePath(skillPath, filename, true);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, buffer);
  }

  async deleteAssetFile(skillPath: string, filename: string): Promise<void> {
    const abs = this.resolveAssetAbsolutePath(skillPath, filename, false);
    const ext = path.extname(abs).toLowerCase();
    if (!SKILL_ASSET_ALLOWED_EXTENSIONS.has(ext)) {
      throw new Error('File type not allowed');
    }
    try {
      await fs.unlink(abs);
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (err?.code === 'ENOENT') {
        throw new Error('File not found');
      }
      throw e;
    }
  }

  async renameAssetFile(skillPath: string, fromName: string, toName: string): Promise<void> {
    const fromAbs = this.resolveAssetAbsolutePath(skillPath, fromName, false);
    const toAbs = this.resolveAssetAbsolutePath(skillPath, toName, true);
    const extFrom = path.extname(fromAbs).toLowerCase();
    if (!SKILL_ASSET_ALLOWED_EXTENSIONS.has(extFrom)) {
      throw new Error('Source file type not allowed');
    }
    try {
      await fs.stat(fromAbs);
    } catch {
      throw new Error('Source file not found');
    }
    try {
      await fs.stat(toAbs);
      throw new Error('A file with that name already exists');
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (e instanceof Error && e.message === 'A file with that name already exists') throw e;
      if (err?.code !== 'ENOENT') throw e;
    }
    await fs.rename(fromAbs, toAbs);
  }

  /**
   * Execute a script with arguments
   * Runs in subprocess with timeout and limited environment
   */
  async executeScript(
    skillPath: string,
    scriptName: string,
    args: string[] = [],
    timeoutMs: number = 30000,
  ): Promise<ScriptExecutionResult> {
    const resolvedSkillPath = path.resolve(skillPath);
    const scriptsPath = path.join(resolvedSkillPath, 'scripts');
    const scriptPath = path.join(scriptsPath, scriptName);

    // Verify script exists and is within scripts directory (security)
    const resolvedPath = path.resolve(scriptPath);
    const resolvedScriptsDir = path.resolve(scriptsPath);
    if (!resolvedPath.startsWith(resolvedScriptsDir)) {
      throw new Error('Script path is outside scripts directory');
    }

    // Determine interpreter based on extension
    const ext = path.extname(scriptName).toLowerCase();
    let command: string;
    let commandArgs: string[];

    switch (ext) {
      case '.js':
        command = 'node';
        commandArgs = [scriptPath, ...args];
        break;
      case '.ts':
        command = 'npx';
        commandArgs = ['ts-node', scriptPath, ...args];
        break;
      case '.py':
        command = 'python3';
        commandArgs = [scriptPath, ...args];
        break;
      case '.sh':
      case '.bash':
        command = 'bash';
        commandArgs = [scriptPath, ...args];
        break;
      case '.rb':
        command = 'ruby';
        commandArgs = [scriptPath, ...args];
        break;
      case '.php':
        command = 'php';
        commandArgs = [scriptPath, ...args];
        break;
      default:
        throw new Error(`Unsupported script extension: ${ext}`);
    }

    return new Promise((resolve, reject) => {
      const child = spawn(command, commandArgs, {
        cwd: resolvedSkillPath,
        env: {
          PATH: process.env.PATH,
          NODE_ENV: process.env.NODE_ENV,
          HOME: process.env.HOME,
          GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE: process.env.GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE,
          GOOGLE_WORKSPACE_CLI_CONFIG_DIR: process.env.GOOGLE_WORKSPACE_CLI_CONFIG_DIR,
        },
        timeout: timeoutMs,
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (exitCode) => {
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: exitCode ?? 0,
        });
      });

      child.on('error', (error) => {
        reject(new Error(`Failed to execute script: ${error.message}`));
      });
    });
  }

  /**
   * Delete skill directory
   */
  async deleteSkillDirectory(skillPath: string): Promise<void> {
    try {
      await fs.rm(skillPath, { recursive: true, force: true });
    } catch (error) {
      console.error('[SkillStorage] Error deleting directory:', error);
    }
  }

  /**
   * Check if skill directory exists
   */
  async exists(skillPath: string): Promise<boolean> {
    try {
      await fs.access(skillPath);
      return true;
    } catch {
      return false;
    }
  }
}

export const skillStorage = new SkillStorageService();
