import fs from 'fs/promises';
import path from 'path';

/**
 * Default uploads directory next to `dist/` (same resolution as express.static in app.ts).
 * When UPLOAD_PATH is unset, avoids cwd vs dist mismatch under PM2/Docker.
 */
function resolveUploadsRoot(): string {
  if (process.env.UPLOAD_PATH) {
    return path.resolve(process.env.UPLOAD_PATH);
  }
  return path.resolve(__dirname, '..', '..', 'uploads');
}

/**
 * Resolve a path relative to the uploads root. Rejects ".." and absolute paths.
 */
export function resolveUploadsRelativePath(relative: string): { ok: true; abs: string } | { ok: false; error: string } {
  const root = getUploadsRoot();
  const trimmed = relative.trim().replace(/^\/+/, '');
  if (!trimmed || trimmed.includes('..')) {
    return { ok: false, error: 'Invalid path (empty or contains "..")' };
  }
  const abs = path.resolve(root, trimmed);
  const normalizedRoot = path.resolve(root);
  if (!abs.startsWith(normalizedRoot + path.sep) && abs !== normalizedRoot) {
    return { ok: false, error: 'Path escapes uploads directory' };
  }
  return { ok: true, abs };
}

export function getUploadsRoot(): string {
  return resolveUploadsRoot();
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

/**
 * Write a file under the uploads root (creates parent directories).
 */
export async function writeUploadsFile(
  relative: string,
  buffer: Buffer,
): Promise<{ ok: true; uploadsRelative: string } | { ok: false; error: string }> {
  const resolved = resolveUploadsRelativePath(relative);
  if (!resolved.ok) return resolved;
  try {
    await fs.mkdir(path.dirname(resolved.abs), { recursive: true });
    await fs.writeFile(resolved.abs, buffer);
    const trimmed = relative.trim().replace(/^\/+/, '');
    return { ok: true, uploadsRelative: trimmed };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

/**
 * Public URL for a file under uploads/ (same convention as browser-capture helpers).
 */
export function getPublicUploadsUrl(relativeUnderUploads: string): string {
  const rel = relativeUnderUploads.startsWith('/') ? relativeUnderUploads : `/${relativeUnderUploads}`;
  const base =
    process.env.PUBLIC_API_URL?.replace(/\/$/, '') ||
    process.env.BACKEND_PUBLIC_URL?.replace(/\/$/, '') ||
    '';
  return base ? `${base}/uploads${rel}` : `/uploads${rel}`;
}
