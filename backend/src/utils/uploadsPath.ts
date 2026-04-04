import fs from 'fs/promises';
import path from 'path';

const UPLOADS_ROOT = process.env.UPLOAD_PATH || path.resolve(process.cwd(), 'uploads');

/**
 * Resolve a path relative to the uploads root. Rejects ".." and absolute paths.
 */
export function resolveUploadsRelativePath(relative: string): { ok: true; abs: string } | { ok: false; error: string } {
  const trimmed = relative.trim().replace(/^\/+/, '');
  if (!trimmed || trimmed.includes('..')) {
    return { ok: false, error: 'Invalid path (empty or contains "..")' };
  }
  const abs = path.resolve(UPLOADS_ROOT, trimmed);
  const normalizedRoot = path.resolve(UPLOADS_ROOT);
  if (!abs.startsWith(normalizedRoot + path.sep) && abs !== normalizedRoot) {
    return { ok: false, error: 'Path escapes uploads directory' };
  }
  return { ok: true, abs };
}

export function getUploadsRoot(): string {
  return UPLOADS_ROOT;
}

export async function readUploadsFile(relative: string): Promise<{ ok: true; buffer: Buffer } | { ok: false; error: string }> {
  const resolved = resolveUploadsRelativePath(relative);
  if (!resolved.ok) return resolved;
  try {
    const buffer = await fs.readFile(resolved.abs);
    return { ok: true, buffer };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
