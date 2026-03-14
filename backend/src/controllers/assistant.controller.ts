import { Response, NextFunction } from 'express';
import { assistantService } from '../services/assistant.service.js';
import type { AuthRequest } from '../types/index.js';

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
