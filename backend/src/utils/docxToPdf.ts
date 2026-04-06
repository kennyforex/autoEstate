import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const execFileAsync = promisify(execFile);

const SOFFICE_TIMEOUT_MS = Math.min(
  parseInt(process.env.LIBREOFFICE_CONVERT_TIMEOUT_MS || '120000', 10) || 120000,
  300000,
);

function sofficeBinaryCandidates(): string[] {
  const fromEnv = process.env.LIBREOFFICE_SOFFICE_PATH?.trim();
  if (fromEnv) return [fromEnv];
  if (process.platform === 'darwin') {
    return ['soffice', '/Applications/LibreOffice.app/Contents/MacOS/soffice'];
  }
  return ['soffice'];
}

/**
 * Convert a .docx on disk to PDF using LibreOffice headless (soffice).
 * Requires LibreOffice installed on the server, or LIBREOFFICE_SOFFICE_PATH set.
 */
export async function convertDocxFileToPdf(docxAbsPath: string, pdfAbsPath: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'docx-pdf-'));
  let lastError = '';

  try {
    const base = path.basename(docxAbsPath);
    if (!/\.docx$/i.test(base)) {
      return { ok: false, error: 'Source must be a .docx file' };
    }
    const tmpDocx = path.join(tmpDir, base);
    await fs.copyFile(docxAbsPath, tmpDocx);

    const candidates = sofficeBinaryCandidates();
    let converted = false;
    for (const soffice of candidates) {
      try {
        await execFileAsync(
          soffice,
          ['--headless', '--nologo', '--nofirststartwizard', '--convert-to', 'pdf', '--outdir', tmpDir, tmpDocx],
          { timeout: SOFFICE_TIMEOUT_MS, maxBuffer: 20 * 1024 * 1024 },
        );
        converted = true;
        break;
      } catch (e: unknown) {
        lastError = e instanceof Error ? e.message : String(e);
      }
    }

    if (!converted) {
      return {
        ok: false,
        error:
          `${lastError || 'soffice failed'}. Install LibreOffice and ensure \`soffice\` is on PATH, ` +
          'or set LIBREOFFICE_SOFFICE_PATH to the soffice binary.',
      };
    }

    const pdfName = base.replace(/\.docx$/i, '.pdf');
    const generated = path.join(tmpDir, pdfName);
    await fs.mkdir(path.dirname(pdfAbsPath), { recursive: true });
    await fs.copyFile(generated, pdfAbsPath);
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
