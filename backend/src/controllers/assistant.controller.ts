import { Response, NextFunction } from 'express';
import { assistantService } from '../services/assistant.service.js';
import { agentEngine, buildPlaygroundContext } from '../agent/index.js';
import type { AuthRequest } from '../types/index.js';
import type { ChatMessage } from '../agent/types.js';

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
    
    const { name, primaryLanguage, tone, instructions, aiModel, metadata } = req.body;
    
    const assistant = await assistantService.create({
      name,
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
    const { name, primaryLanguage, tone, instructions, aiModel, status, metadata } = req.body;
    
    const assistant = await assistantService.update(id, {
      name,
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

    // If a file was uploaded, analyze it and include the description
    if (file) {
      const mediaType = file.mimetype.startsWith('image/') ? 'image' : 'audio';
      const base64Data = file.buffer.toString('base64');
      const dataUrl = `data:${file.mimetype};base64,${base64Data}`;

      sendEvent({ type: 'status', status: mediaType === 'image' ? 'analyzing_image' : 'analyzing_audio' });
      console.log(`[AgentChat] Analyzing ${mediaType} file: ${file.originalname} (${file.size} bytes)`);

      try {
        const analysisResult = await analyzeMedia(mediaType, dataUrl);
        
        if (mediaType === 'image') {
          effectiveContent = `The user shared an image${effectiveContent ? ` with message: "${effectiveContent}"` : ''}. Image description: ${analysisResult}`;
        } else {
          effectiveContent = `The user sent an audio message. Transcription: ${analysisResult}`;
        }
        
        console.log(`[AgentChat] Media analysis complete: ${analysisResult.substring(0, 100)}...`);
      } catch (analysisError: any) {
        console.error(`[AgentChat] Media analysis failed:`, analysisError.message);
        effectiveContent = `The user shared a ${mediaType} file${effectiveContent ? `: "${effectiveContent}"` : ''}. (Note: Media analysis failed, responding based on available context)`;
      }
    }

    sendEvent({ type: 'status', status: 'thinking' });

    const context = await buildPlaygroundContext(id, history);

    const onProgress = (step: {
      number: number;
      total: number;
      thought: string;
      action?: { tool: string; args: Record<string, unknown> };
      observation?: string;
    }) => {
      sendEvent({ type: 'agent_step', step });
    };

    const result = await agentEngine.run(effectiveContent, context, onProgress);

    sendEvent({
      type: 'done',
      message: { role: 'assistant', content: result.content },
      resultType: result.type,
      citations: result.citations,
      model: result.model,
      usage: result.usage,
      steps: result.steps,
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
