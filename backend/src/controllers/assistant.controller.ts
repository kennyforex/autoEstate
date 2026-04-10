import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Response, NextFunction } from 'express';
import { assistantService } from '../services/assistant.service.js';
import { agentEngine, buildPlaygroundContext } from '../agent/index.js';
import { getSkillPermissionToolOptions } from '../agent/tools/index.js';
import type { AuthRequest } from '../types/index.js';
import type { ChatMessage, AgentEvent } from '../agent/types.js';

export async function listAssistants(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { status } = req.query;
    
    const assistants = await assistantService.findAll({
      status: status as 'active' | 'inactive' | undefined,
    });
    
    res.json({ assistants });
  } catch (error) {
    next(error);
  }
}

/** Tools available for skill `requiredTools` — must match agent registry (see getSkillPermissionToolOptions). */
export async function listSkillToolOptions(
  _req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const tools = getSkillPermissionToolOptions();
    res.json({ tools });
  } catch (error) {
    next(error);
  }
}

export async function createAssistant(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    
    const {
      name,
      departmentName,
      managerName,
      managerNickname,
      managerAvatarPreset,
      managerAvatarUrl,
      primaryLanguage,
      tone,
      instructions,
      aiModel,
      metadata,
    } = req.body;
    
    const assistant = await assistantService.create({
      name,
      departmentName,
      managerName,
      managerNickname,
      managerAvatarPreset,
      managerAvatarUrl,
      primaryLanguage,
      tone,
      instructions,
      aiModel,
      metadata,
      createdBy: req.user.userId,
    });
    
    res.status(201).json({ assistant });
  } catch (error) {
    // Return error message to client instead of generic 500
    const message = (error as Error)?.message || 'Failed to create assistant';
    res.status(400).json({ error: message });
  }
}

export async function getAssistant(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    
    const assistant = await assistantService.findById(id);
    
    if (!assistant) {
      res.status(404).json({ error: 'Assistant not found' });
      return;
    }
    
    res.json({ assistant });
  } catch (error) {
    next(error);
  }
}

export async function updateAssistant(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const {
      name,
      departmentName,
      managerName,
      managerNickname,
      managerAvatarPreset,
      managerAvatarUrl,
      primaryLanguage,
      tone,
      instructions,
      aiModel,
      status,
      metadata,
    } = req.body;
    
    const assistant = await assistantService.update(id, {
      name,
      departmentName,
      managerName,
      managerNickname,
      managerAvatarPreset,
      managerAvatarUrl,
      primaryLanguage,
      tone,
      instructions,
      aiModel,
      status,
      metadata,
    });
    
    if (!assistant) {
      res.status(404).json({ error: 'Assistant not found' });
      return;
    }
    
    res.json({ assistant });
  } catch (error) {
    next(error);
  }
}

export async function deleteAssistant(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    
    const deleted = await assistantService.delete(id);
    
    if (!deleted) {
      res.status(404).json({ error: 'Assistant not found' });
      return;
    }
    
    res.json({ message: 'Assistant deleted successfully' });
  } catch (error) {
    next(error);
  }
}

export async function addStaff(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const { displayName, roleTitle, responsibilities } = req.body;
    if (!displayName || typeof displayName !== 'string' || !displayName.trim()) {
      res.status(400).json({ error: 'displayName is required' });
      return;
    }
    const assistant = await assistantService.addStaffMember(id, {
      displayName,
      roleTitle,
      responsibilities,
    });
    if (!assistant) {
      res.status(404).json({ error: 'Assistant not found' });
      return;
    }
    res.status(201).json({ assistant });
  } catch (error) {
    next(error);
  }
}

export async function updateStaff(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id, staffId } = req.params;
    const { displayName, roleTitle, responsibilities, nickname, avatarPreset, avatarUrl } =
      req.body;
    const assistant = await assistantService.updateStaffMember(id, staffId, {
      displayName,
      roleTitle,
      responsibilities,
      nickname,
      avatarPreset,
      avatarUrl,
    });
    if (!assistant) {
      res.status(404).json({ error: 'Assistant or staff not found' });
      return;
    }
    res.json({ assistant });
  } catch (error) {
    next(error);
  }
}

export async function removeStaff(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id, staffId } = req.params;
    const assistant = await assistantService.removeStaffMember(id, staffId);
    if (!assistant) {
      res.status(404).json({ error: 'Assistant or staff not found' });
      return;
    }
    res.json({ assistant });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('Cannot remove')) {
      res.status(400).json({ error: message });
      return;
    }
    next(error);
  }
}

export async function uploadFile(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const file = req.file;
    
    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }
    
    // Use UTF-8 filename from form field when present (avoids Content-Disposition Latin-1 mojibake)
    const originalname =
      (req.body?.filename && typeof req.body.filename === "string" && req.body.filename.trim())
        ? req.body.filename.trim()
        : file.originalname;

    // Get folder from request body (optional)
    const folder = req.body?.folder && typeof req.body.folder === "string" && req.body.folder.trim()
      ? req.body.folder.trim()
      : undefined;

    const updatedAssistant = await assistantService.uploadFile(
      id,
      {
        buffer: file.buffer,
        originalname,
        size: file.size,
        mimetype: file.mimetype,
      },
      { folder }
    );
    
    if (!updatedAssistant) {
      res.status(404).json({ error: 'Assistant not found' });
      return;
    }
    
    res.status(201).json(updatedAssistant);
  } catch (error) {
    // Handle video processing errors with descriptive messages
    const message = (error as Error)?.message || 'Failed to upload file';
    if (message.includes('Video exceeds') || message.includes('Video processing')) {
      res.status(400).json({ error: message });
      return;
    }
    next(error);
  }
}

export async function getFileUrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id, fileId } = req.params;
    
    const fileData = await assistantService.getFileUrl(id, fileId);
    
    if (!fileData) {
      res.status(404).json({ error: 'Assistant or file not found' });
      return;
    }
    
    res.json(fileData);
  } catch (error) {
    if (error instanceof Error && error.message === 'Failed to get file download URL') {
      res.status(500).json({ error: error.message });
      return;
    }
    next(error);
  }
}

export async function deleteFile(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id, fileId } = req.params;
    
    const deleted = await assistantService.deleteFile(id, fileId);
    
    if (!deleted) {
      res.status(404).json({ error: 'Assistant or file not found' });
      return;
    }
    
    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    next(error);
  }
}

export async function chatWithAssistant(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const { messages, model } = req.body;
    
    const response = await assistantService.chat(id, messages, { model });
    
    res.json(response);
  } catch (error) {
    if (error instanceof Error && error.message === 'Assistant not found') {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
}

export async function getFileStatus(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id, fileId } = req.params;
    
    const status = await assistantService.getFileStatus(id, fileId);
    
    if (!status) {
      res.status(404).json({ error: 'Assistant or file not found' });
      return;
    }
    
    res.json(status);
  } catch (error) {
    next(error);
  }
}

export async function cancelFileProcessing(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id, fileId } = req.params;
    
    const cancelled = await assistantService.cancelVideoProcessing(id, fileId);
    
    if (!cancelled) {
      res.status(404).json({ error: 'File not found or not currently processing' });
      return;
    }
    
    res.json({ message: 'Processing cancelled successfully' });
  } catch (error) {
    next(error);
  }
}

export async function updateFileFolder(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id, fileId } = req.params;
    const { folder } = req.body;
    
    const assistant = await assistantService.updateFileFolder(id, fileId, folder);
    
    if (!assistant) {
      res.status(404).json({ error: 'Assistant or file not found' });
      return;
    }
    
    res.json({ assistant });
  } catch (error) {
    next(error);
  }
}

export async function batchUpdateFileFolders(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const { updates } = req.body;
    
    const assistant = await assistantService.batchUpdateFileFolders(id, updates);
    
    if (!assistant) {
      res.status(404).json({ error: 'Assistant not found' });
      return;
    }
    
    res.json({ assistant });
  } catch (error) {
    next(error);
  }
}

export async function createFolder(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const { name } = req.body;
    
    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'Folder name is required' });
      return;
    }
    
    const assistant = await assistantService.createFolder(id, name.trim());
    
    if (!assistant) {
      res.status(404).json({ error: 'Assistant not found' });
      return;
    }
    
    res.status(201).json({ assistant });
  } catch (error) {
    next(error);
  }
}

export async function deleteFolder(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id, folderName } = req.params;
    
    const assistant = await assistantService.deleteFolder(id, decodeURIComponent(folderName));
    
    if (!assistant) {
      res.status(404).json({ error: 'Assistant not found' });
      return;
    }
    
    res.json({ assistant });
  } catch (error) {
    next(error);
  }
}

export async function renameFolder(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id, folderName } = req.params;
    const { newName } = req.body;
    
    if (!newName || typeof newName !== 'string' || !newName.trim()) {
      res.status(400).json({ error: 'New folder name is required' });
      return;
    }
    
    const assistant = await assistantService.renameFolder(
      id,
      decodeURIComponent(folderName),
      newName.trim()
    );
    
    if (!assistant) {
      res.status(404).json({ error: 'Assistant not found' });
      return;
    }
    
    res.json({ assistant });
  } catch (error) {
    next(error);
  }
}

/** Save Playground upload under uploads/agent-chat/ for stable URLs when PUBLIC_API_URL or a public host is used. */
async function persistPlaygroundUpload(
  buffer: Buffer,
  mimetype: string,
  origName: string,
): Promise<string> {
  const uploadsRoot = process.env.UPLOAD_PATH || path.resolve(process.cwd(), 'uploads');
  const dir = path.join(uploadsRoot, 'agent-chat');
  await fs.mkdir(dir, { recursive: true });
  const ext =
    path.extname(origName) ||
    (mimetype.startsWith('image/')
      ? '.jpg'
      : mimetype === 'application/pdf'
        ? '.pdf'
        : '.bin');
  const name = `${randomUUID()}${ext}`;
  await fs.writeFile(path.join(dir, name), buffer);
  return `/uploads/agent-chat/${name}`;
}

/**
 * Always return a short HTTP(S) URL to this server's `/uploads/...` copy of the file.
 * Embedding base64 in the agent user message exceeds model context limits (~200k+ tokens).
 * `document_data_capture` resolves same-origin localhost `/uploads/` URLs by reading the file server-side.
 */
function resolvePlaygroundMediaUrlForAgent(req: AuthRequest, relativePath: string): string {
  const publicBase = process.env.PUBLIC_API_URL?.replace(/\/$/, '');
  const host = req.get('host') || 'localhost';
  if (publicBase) {
    return `${publicBase}${relativePath}`;
  }
  return `${req.protocol}://${host}${relativePath}`;
}

export async function agentChat(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const file = req.file;

    // Parse messages from body (JSON string when file upload, object when regular JSON)
    let messages: ChatMessage[];
    try {
      const messagesRaw = req.body.messages;
      messages = typeof messagesRaw === 'string' ? JSON.parse(messagesRaw) : messagesRaw;
      if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: 'Messages array is required' });
        return;
      }
    } catch {
      res.status(400).json({ error: 'Invalid messages format' });
      return;
    }

    const lastUserMsg = [...messages].reverse().find((m: ChatMessage) => m.role === 'user');
    if (!lastUserMsg) {
      res.status(400).json({ error: 'No user message found' });
      return;
    }

    const history: ChatMessage[] = messages.slice(0, -1).map((m: ChatMessage) => ({
      role: m.role,
      content: m.content,
    }));

    // Use SSE to stream agent progress steps in real-time
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const sendEvent = (data: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    let effectiveContent = lastUserMsg.content || '';

    // If a file was uploaded, analyze it and include text / description for the agent
    if (file) {
      const mimetype = file.mimetype || '';
      const origName = file.originalname || 'attachment';

      if (mimetype.startsWith('image/')) {
        const base64Data = file.buffer.toString('base64');
        const dataUrl = `data:${mimetype};base64,${base64Data}`;
        const relativePath = await persistPlaygroundUpload(file.buffer, mimetype, origName);
        const urlForAgent = resolvePlaygroundMediaUrlForAgent(req, relativePath);
        sendEvent({ type: 'status', status: 'analyzing_image' });
        console.log(`[AgentChat] Analyzing image: ${origName} (${file.size} bytes) → ${urlForAgent}`);
        const urlLine = `Image URL: ${urlForAgent}`;
        try {
          const analysisResult = await analyzeMedia('image', dataUrl);
          effectiveContent =
            `The user shared an image${effectiveContent ? ` with message: "${effectiveContent}"` : ''}. ${urlLine} Image description: ${analysisResult}`;
          console.log(`[AgentChat] Image analysis complete: ${analysisResult.substring(0, 100)}...`);
        } catch (analysisError: unknown) {
          const msg = analysisError instanceof Error ? analysisError.message : String(analysisError);
          console.error(`[AgentChat] Image analysis failed:`, msg);
          effectiveContent =
            `The user shared an image${effectiveContent ? ` with message: "${effectiveContent}"` : ''}. ${urlLine} (Note: optional image description failed: ${msg})`;
        }
      } else if (mimetype.startsWith('audio/')) {
        const base64Data = file.buffer.toString('base64');
        const dataUrl = `data:${mimetype};base64,${base64Data}`;
        sendEvent({ type: 'status', status: 'analyzing_audio' });
        console.log(`[AgentChat] Analyzing audio: ${origName} (${file.size} bytes)`);
        try {
          const analysisResult = await analyzeMedia('audio', dataUrl);
          effectiveContent = `The user sent an audio message. Transcription: ${analysisResult}`;
          console.log(`[AgentChat] Audio analysis complete: ${analysisResult.substring(0, 100)}...`);
        } catch (analysisError: unknown) {
          const msg = analysisError instanceof Error ? analysisError.message : String(analysisError);
          console.error(`[AgentChat] Audio analysis failed:`, msg);
          effectiveContent = `The user shared an audio file${effectiveContent ? `: "${effectiveContent}"` : ''}. (Note: Transcription failed, responding based on available context)`;
        }
      } else if (isPlainTextDocumentMime(mimetype) || looksLikePlainTextFile(origName)) {
        sendEvent({ type: 'status', status: 'thinking' });
        const raw = file.buffer.toString('utf8');
        const truncated = truncateForAgentContext(raw);
        effectiveContent = `The user shared a text document (${origName})${effectiveContent ? ` with message: "${effectiveContent}"` : ''}.\n\n--- Document content ---\n${truncated}\n--- End ---`;
        console.log(`[AgentChat] Inlined text document: ${origName} (${file.size} bytes)`);
      } else if (mimetype === 'application/pdf' || origName.toLowerCase().endsWith('.pdf')) {
        sendEvent({ type: 'status', status: 'thinking' });
        const pdfDataUrl = `data:application/pdf;base64,${file.buffer.toString('base64')}`;
        const relativePath = await persistPlaygroundUpload(
          file.buffer,
          mimetype || 'application/pdf',
          origName,
        );
        const pdfUrlForAgent = resolvePlaygroundMediaUrlForAgent(req, relativePath);
        const pdfUrlLine = `PDF URL: ${pdfUrlForAgent}`;
        try {
          const { PDFParse } = await import('pdf-parse');
          const parser = new PDFParse({ data: file.buffer });
          const textResult = await parser.getText();
          await parser.destroy();
          const text = (textResult.text || '').trim();
          const truncated = truncateForAgentContext(text);
          effectiveContent =
            `The user shared a PDF (${origName})${effectiveContent ? ` with message: "${effectiveContent}"` : ''}. ${pdfUrlLine}\n\n--- PDF text (reference only) ---\n${truncated || '[No extractable text in PDF]'}\n--- End ---`;
          console.log(`[AgentChat] Extracted PDF text: ${origName} (${text.length} chars)`);
        } catch (pdfError: unknown) {
          const msg = pdfError instanceof Error ? pdfError.message : String(pdfError);
          console.error(`[AgentChat] PDF parse failed:`, msg);
          effectiveContent =
            `The user attached PDF "${origName}". ${pdfUrlLine} (Note: local PDF text extraction failed: ${msg})`;
        }
      } else {
        sendEvent({ type: 'status', status: 'thinking' });
        effectiveContent = `The user attached a file: ${origName} (type: ${mimetype || 'unknown'}, ${file.size} bytes). This binary format is not supported in chat; ask them to provide a PDF, plain text (.txt/.md), or paste the content.${effectiveContent ? ` They also wrote: "${effectiveContent}"` : ''}`;
        console.log(`[AgentChat] Unsupported attachment type: ${mimetype} ${origName}`);
      }
    }

    sendEvent({ type: 'status', status: 'thinking' });

    const context = await buildPlaygroundContext(id, history);

    const roster = context.assistant.teamRoster ?? [];
    const useDeptPersona =
      roster.length > 0 || Boolean(String(context.assistant.departmentName ?? '').trim());
    if (useDeptPersona && context.skills.length === 0) {
      const detailParts: string[] = [];
      if (context.skillLoadError) detailParts.push(context.skillLoadError);
      if (context.skillBindingMismatch) detailParts.push(context.skillBindingMismatch);
      const detail = detailParts.length > 0 ? detailParts.join(' ') : undefined;
      console.warn(
        `[AgentChat] Playground: department mode but 0 active skills for assistant ${id}` +
          (detail ? ` — ${detail}` : ''),
      );
      sendEvent({
        type: 'warning',
        code: 'no_active_skills',
        message:
          'No active skills loaded — the manager model will answer without execute_skill. Check Skill Library bindings and Skill.status, or server logs for [AgentContext] / SKILL_LOAD_FAILED.',
        ...(detail ? { detail } : {}),
      });
    }

    const onEvent = (event: AgentEvent) => {
      switch (event.type) {
        case 'tool_start':
          sendEvent({ type: 'agent_step', step: {
            number: event.iteration + 1,
            total: event.maxIterations,
            thought: `Calling ${event.toolName}`,
            action: { tool: event.toolName, args: event.args },
          }});
          break;
        case 'tool_end':
          sendEvent({ type: 'agent_step', step: {
            number: event.iteration + 1,
            total: event.maxIterations,
            thought: `Observed result from ${event.toolName}`,
            action: { tool: event.toolName, args: {} },
            observation: event.result.summary.substring(0, 500),
          }});
          break;
        case 'tool_error':
          sendEvent({ type: 'agent_step', step: {
            number: event.iteration + 1,
            total: event.maxIterations,
            thought: `Tool ${event.toolName} failed`,
            action: { tool: event.toolName, args: {} },
            observation: `Error: ${event.error}`,
          }});
          break;
        case 'thinking':
          sendEvent({ type: 'status', status: 'thinking' });
          break;
      }
    };

    const result = await agentEngine.run(effectiveContent, context, onEvent);

    sendEvent({
      type: 'done',
      message: { role: 'assistant', content: result.content },
      resultType: result.type,
      citations: result.citations,
      model: result.model,
      usage: result.usage,
      steps: result.steps,
      ...(result.activeStaffId != null ? { activeStaffId: result.activeStaffId } : {}),
      ...(result.activeSkillSlug != null ? { activeSkillSlug: result.activeSkillSlug } : {}),
    });

    res.end();
  } catch (error) {
    console.error('[AgentChat] Error:', error instanceof Error ? error.message : error);
    // If headers already sent (SSE started), send error as event then close
    if (res.headersSent) {
      try {
        res.write(`data: ${JSON.stringify({
          type: 'done',
          message: { role: 'assistant', content: 'Sorry, I encountered an error processing your request. Please try again.' },
          resultType: 'final_answer',
        })}\n\n`);
        res.end();
      } catch {
        // response already closed
      }
      return;
    }
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
}

const MAX_AGENT_DOCUMENT_CHARS = 150_000;

function truncateForAgentContext(text: string): string {
  if (text.length <= MAX_AGENT_DOCUMENT_CHARS) return text;
  return `${text.slice(0, MAX_AGENT_DOCUMENT_CHARS)}\n...[truncated]`;
}

function isPlainTextDocumentMime(mimetype: string): boolean {
  if (mimetype.startsWith('text/')) return true;
  return ['application/json', 'application/xml', 'text/xml'].includes(mimetype);
}

function looksLikePlainTextFile(name: string): boolean {
  return /\.(txt|md|csv|json|xml|yaml|yml|log|tsv)$/i.test(name);
}

/**
 * Analyze media (image/audio) using OpenRouter
 */
async function analyzeMedia(mediaType: 'image' | 'audio', dataUrl: string): Promise<string> {
  const { openRouterConfig } = await import('../config/openrouter.js');
  const axios = (await import('axios')).default;

  if (!openRouterConfig.apiKey) {
    throw new Error('OpenRouter API key not configured');
  }

  const model = mediaType === 'image'
    ? openRouterConfig.models.vision
    : openRouterConfig.models.audio;

  const prompt = mediaType === 'image'
    ? 'Describe this image in detail.'
    : `Transcribe this audio message accurately.
The speaker is most likely using Hong Kong Cantonese with a mix of english Terms (廣東話/spoken form).
IMPORTANT RULES:
- Output in Traditional Chinese characters (繁體字) only.
- Use natural spoken Cantonese vocabulary and grammar, NOT Mandarin.
- Use Cantonese-specific words: 唔係(not 不是), 咩(not 什麼), 嘅(not 的), 喺(not 在), 冇(not 沒有), 嗰個(not 那個), 而家(not 現在), 點解(not 為什麼), 做咩(not 做什麼), 係(not 是).
- Keep Cantonese particles: 啦, 喎, 囉, 咩, 呀, 嘛, 㗎, 喇, 吖.
- If the audio is clearly in English or Mandarin, transcribe in that language instead.
- Add punctuation. Keep filler words if audible.
- Return ONLY the transcription text, nothing else.`;

  const content = [
    { type: 'text' as const, text: prompt },
    { type: 'image_url' as const, image_url: { url: dataUrl } },
  ];

  const response = await axios.post(
    `${openRouterConfig.baseUrl}/chat/completions`,
    {
      model,
      messages: [{ role: 'user', content }],
    },
    {
      headers: {
        Authorization: `Bearer ${openRouterConfig.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://autoestate.ai',
        'X-Title': 'AutoEstate AI Agent',
      },
      timeout: 60_000,
    },
  );

  return response.data.choices[0].message.content || '[No result]';
}
