import axios from 'axios';
import { AGENT_FETCH_MAX_BYTES } from '../config/agentToolsSandbox.js';

export async function fetchUrlToBuffer(
  url: string,
  maxBytes: number = AGENT_FETCH_MAX_BYTES,
  signal?: AbortSignal,
): Promise<{ ok: true; buffer: Buffer; contentType?: string } | { ok: false; error: string }> {
  const trimmed = url.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return { ok: false, error: 'URL must start with http:// or https://' };
  }
  try {
    const response = await axios.get<ArrayBuffer>(trimmed, {
      responseType: 'arraybuffer',
      maxContentLength: maxBytes,
      maxBodyLength: maxBytes,
      timeout: 120_000,
      signal,
      validateStatus: (s) => s >= 200 && s < 300,
    });
    const buf = Buffer.from(response.data);
    if (buf.length > maxBytes) {
      return { ok: false, error: `Response exceeds max size (${maxBytes} bytes)` };
    }
    const ct = response.headers['content-type'];
    return {
      ok: true,
      buffer: buf,
      contentType: typeof ct === 'string' ? ct.split(';')[0].trim() : undefined,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
