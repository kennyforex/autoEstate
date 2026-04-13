import mongoose from 'mongoose';
import { getPineconeClient, getPineconeRegion } from '../config/pinecone.js';
import {
  Assistant,
  type IAssistantDocument,
  type IAssistantFile,
  type IStaffMember,
  type AssistantLanguage,
  type AssistantTone,
} from '../models/index.js';
import { v4 as uuidv4 } from 'uuid';
import { videoService } from './video.service.js';
import type { VideoProcessingStatus } from '../config/video.config.js';

export interface CreateAssistantInput {
  name: string;
  departmentName?: string;
  managerName?: string;
  managerNickname?: string;
  managerAvatarPreset?: string;
  managerAvatarUrl?: string;
  primaryLanguage?: AssistantLanguage;
  tone?: AssistantTone;
  instructions?: string;
  aiModel?: 'gpt-4o' | 'gpt-4.1' | 'claude-3-7-sonnet';
  metadata?: Record<string, unknown>;
  createdBy: string;
}

export interface UpdateAssistantInput {
  name?: string;
  departmentName?: string;
  managerName?: string;
  managerNickname?: string;
  managerAvatarPreset?: string;
  managerAvatarUrl?: string;
  primaryLanguage?: AssistantLanguage;
  tone?: AssistantTone;
  instructions?: string;
  aiModel?: 'gpt-4o' | 'gpt-4.1' | 'claude-3-7-sonnet';
  status?: 'active' | 'inactive';
  metadata?: Record<string, unknown>;
}

export interface AddStaffInput {
  displayName: string;
  roleTitle?: string;
  responsibilities?: string;
}

export interface UpdateStaffInput {
  displayName?: string;
  roleTitle?: string;
  responsibilities?: string;
  nickname?: string;
  avatarPreset?: string;
  avatarUrl?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  message: {
    role: string;
    content: string;
  };
  citations?: Array<{
    position: number;
    references: Array<{
      file: { id: string; name: string };
      pages: number[];
    }>;
  }>;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

class AssistantService {
  /**
   * Create a new assistant (both in DB and Pinecone)
   */
  async create(input: CreateAssistantInput): Promise<IAssistantDocument> {
    const { 
      name, 
      departmentName: deptIn,
      managerName: mgrIn,
      managerNickname,
      managerAvatarPreset,
      managerAvatarUrl,
      primaryLanguage = 'auto', 
      tone = 'professional', 
      instructions, 
      aiModel = 'gpt-4o', 
      metadata, 
      createdBy 
    } = input;

    const departmentName = (deptIn?.trim() || name.trim());
    const managerName = (mgrIn?.trim() || departmentName);
    
    // Generate unique Pinecone assistant name
    const pineconeAssistantName = `ffcs-${departmentName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${uuidv4().slice(0, 8)}`;
    
    try {
      // Create assistant in Pinecone
      const pc = getPineconeClient();
      await pc.createAssistant({
        name: pineconeAssistantName,
        region: getPineconeRegion() as 'us' | 'eu',
        metadata: {
          ...metadata,
          ffcsName: departmentName,
          createdBy,
        },
      });
      
      // Create assistant in database with default manager staff (non-deletable)
      const assistant = new Assistant({
        name: departmentName,
        departmentName,
        managerName,
        managerNickname,
        managerAvatarPreset,
        managerAvatarUrl,
        pineconeAssistantName,
        primaryLanguage,
        tone,
        instructions,
        aiModel,
        metadata,
        createdBy,
        status: 'active',
        files: [],
        staff: [
          {
            displayName: managerName,
            roleTitle: '',
            responsibilities: '',
            isManager: true,
            skillIds: [],
            nickname: managerNickname,
            avatarPreset: managerAvatarPreset,
            avatarUrl: managerAvatarUrl,
          },
        ],
      });
      
      await assistant.save();
      
      return assistant;
    } catch (error) {
      // If Pinecone creation fails, don't save to DB
      console.error('Failed to create assistant in Pinecone:', error);
      // Extract meaningful error message from Pinecone error
      const errorMessage = (error as Error)?.message || '';
      if (errorMessage.includes('RESOURCE_EXHAUSTED') || errorMessage.includes('limit reached')) {
        throw new Error('Assistant limit reached. Your plan allows a maximum number of assistants. Please delete an existing assistant or upgrade your plan.');
      }
      throw new Error('Failed to create assistant');
    }
  }
  
  /**
   * Get all assistants
   */
  async findAll(filters?: {
    status?: 'active' | 'inactive';
    createdBy?: string;
  }): Promise<IAssistantDocument[]> {
    const query: Record<string, unknown> = {};
    
    if (filters?.status) {
      query.status = filters.status;
    }
    if (filters?.createdBy) {
      query.createdBy = filters.createdBy;
    }
    
    return Assistant.find(query).sort({ createdAt: -1 });
  }
  
  /**
   * Get assistant by ID
   */
  async findById(id: string): Promise<IAssistantDocument | null> {
    return Assistant.findById(id);
  }

  /**
   * Denormalized union of all staff.skillIds (deduped).
   */
  rebuildSkillsUnion(assistant: IAssistantDocument): void {
    const staff = assistant.staff || [];
    const seen = new Set<string>();
    const out: mongoose.Types.ObjectId[] = [];
    for (const m of staff) {
      for (const sid of m.skillIds || []) {
        const oid = sid as mongoose.Types.ObjectId;
        const id = oid.toString();
        if (!seen.has(id)) {
          seen.add(id);
          out.push(oid);
        }
      }
    }
    assistant.skills = out;
  }

  getManagerStaff(assistant: IAssistantDocument): IStaffMember | undefined {
    return assistant.staff?.find((s) => s.isManager);
  }

  syncAssistantTopLevelFromManager(assistant: IAssistantDocument): void {
    const mgr = this.getManagerStaff(assistant);
    if (!mgr) return;
    assistant.managerName = mgr.displayName;
    assistant.managerNickname = mgr.nickname;
    assistant.managerAvatarPreset = mgr.avatarPreset;
    assistant.managerAvatarUrl = mgr.avatarUrl;
  }

  /**
   * Legacy / migration: ensure exactly one manager staff row exists.
   */
  async ensureStaffHasManager(assistant: IAssistantDocument): Promise<void> {
    if (!Array.isArray(assistant.staff)) {
      (assistant as { staff: IStaffMember[] }).staff = [];
    }
    if (this.getManagerStaff(assistant)) return;
    const display = (
      assistant.managerName ||
      assistant.departmentName ||
      assistant.name ||
      'Manager'
    ).trim();
    assistant.staff!.push({
      displayName: display,
      roleTitle: '',
      responsibilities: '',
      skillIds: (assistant.skills || []).map((id) =>
        id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id)),
      ),
      isManager: true,
      nickname: assistant.managerNickname,
      avatarPreset: assistant.managerAvatarPreset,
      avatarUrl: assistant.managerAvatarUrl,
    } as IStaffMember);
    this.rebuildSkillsUnion(assistant);
  }

  async addStaffMember(assistantId: string, input: AddStaffInput): Promise<IAssistantDocument | null> {
    const assistant = await Assistant.findById(assistantId);
    if (!assistant) return null;
    await this.ensureStaffHasManager(assistant);
    assistant.staff!.push({
      displayName: input.displayName.trim(),
      roleTitle: (input.roleTitle ?? '').trim(),
      responsibilities: (input.responsibilities ?? '').trim(),
      isManager: false,
      skillIds: [],
    } as unknown as IStaffMember);
    await assistant.save();
    return assistant;
  }

  async updateStaffMember(
    assistantId: string,
    staffId: string,
    input: UpdateStaffInput,
  ): Promise<IAssistantDocument | null> {
    const assistant = await Assistant.findById(assistantId);
    if (!assistant?.staff?.length) return null;
    const st = (assistant.staff as mongoose.Types.DocumentArray<IStaffMember>).id(staffId);
    if (!st) return null;
    if (input.displayName !== undefined) st.set('displayName', input.displayName.trim());
    if (input.roleTitle !== undefined) st.set('roleTitle', input.roleTitle.trim());
    if (input.responsibilities !== undefined) st.set('responsibilities', input.responsibilities);
    if (input.nickname !== undefined) st.set('nickname', input.nickname);
    if (input.avatarPreset !== undefined) st.set('avatarPreset', input.avatarPreset);
    if (input.avatarUrl !== undefined) st.set('avatarUrl', input.avatarUrl);
    if (st.isManager) this.syncAssistantTopLevelFromManager(assistant);
    await assistant.save();
    return assistant;
  }

  async removeStaffMember(assistantId: string, staffId: string): Promise<IAssistantDocument | null> {
    const assistant = await Assistant.findById(assistantId);
    if (!assistant?.staff?.length) return null;
    const st = (assistant.staff as mongoose.Types.DocumentArray<IStaffMember>).id(staffId);
    if (!st) return null;
    if (st.isManager) {
      throw new Error('Cannot remove the department manager');
    }
    st.deleteOne();
    this.rebuildSkillsUnion(assistant);
    await assistant.save();
    return assistant;
  }
  
  /**
   * Build full instructions string including language and tone context
   */
  private buildFullInstructions(
    primaryLanguage: AssistantLanguage | undefined,
    tone: AssistantTone | undefined,
    instructions: string | undefined
  ): string {
    const parts: string[] = [];
    
    // Add language instruction
    if (primaryLanguage && primaryLanguage !== 'auto') {
      parts.push(`Respond in ${this.getLanguageLabel(primaryLanguage)}.`);
    } else {
      parts.push('Respond in the same language as the user.');
    }
    
    // Add tone instruction
    if (tone) {
      parts.push(`Use a ${tone} tone.`);
    }
    
    // Add custom instructions
    if (instructions) {
      parts.push(instructions);
    }
    
    return parts.join(' ');
  }

  /**
   * Update assistant (both in DB and Pinecone)
   */
  async update(id: string, input: UpdateAssistantInput): Promise<IAssistantDocument | null> {
    const assistant = await Assistant.findById(id);
    if (!assistant) {
      return null;
    }
    
    // Update local fields
    if (input.departmentName !== undefined) {
      const d = input.departmentName.trim();
      assistant.departmentName = d;
      assistant.name = d;
    } else if (input.name) {
      assistant.name = input.name;
      assistant.departmentName = input.name;
    }
    if (input.managerName !== undefined) assistant.managerName = input.managerName.trim();
    if (input.managerNickname !== undefined) assistant.managerNickname = input.managerNickname;
    if (input.managerAvatarPreset !== undefined) assistant.managerAvatarPreset = input.managerAvatarPreset;
    if (input.managerAvatarUrl !== undefined) assistant.managerAvatarUrl = input.managerAvatarUrl;

    // Keep manager staff row in sync with top-level manager fields
    const mgr = this.getManagerStaff(assistant);
    if (mgr) {
      if (input.managerName !== undefined) mgr.displayName = assistant.managerName ?? mgr.displayName;
      if (input.managerNickname !== undefined) mgr.nickname = input.managerNickname;
      if (input.managerAvatarPreset !== undefined) mgr.avatarPreset = input.managerAvatarPreset;
      if (input.managerAvatarUrl !== undefined) mgr.avatarUrl = input.managerAvatarUrl;
    } else if (assistant.managerName) {
      await this.ensureStaffHasManager(assistant);
    }
    if (input.primaryLanguage) assistant.primaryLanguage = input.primaryLanguage;
    if (input.tone) assistant.tone = input.tone;
    if (input.instructions !== undefined) assistant.instructions = input.instructions;
    if (input.aiModel) assistant.aiModel = input.aiModel;
    if (input.status) assistant.status = input.status;
    if (input.metadata) assistant.metadata = { ...assistant.metadata, ...input.metadata };
    
    // Sync instructions to Pinecone
    try {
      const pc = getPineconeClient();
      const fullInstructions = this.buildFullInstructions(
        assistant.primaryLanguage,
        assistant.tone,
        assistant.instructions
      );
      
      await pc.updateAssistant(assistant.pineconeAssistantName, {
        instructions: fullInstructions,
      });
      
      console.log(`[AssistantService] Synced instructions to Pinecone for ${assistant.pineconeAssistantName}`);
    } catch (error) {
      console.error('[AssistantService] Failed to sync instructions to Pinecone:', error);
      // Continue with local save even if Pinecone sync fails
    }
    
    await assistant.save();
    
    return assistant;
  }
  
  /**
   * Delete assistant (both from DB and Pinecone)
   */
  async delete(id: string): Promise<boolean> {
    const assistant = await Assistant.findById(id);
    if (!assistant) {
      return false;
    }
    
    try {
      // Delete from Pinecone
      const pc = getPineconeClient();
      await pc.deleteAssistant(assistant.pineconeAssistantName);
    } catch (error) {
      console.error('Failed to delete assistant from Pinecone:', error);
      // Continue with DB deletion even if Pinecone fails
    }
    
    await Assistant.deleteOne({ _id: id });
    return true;
  }
  
  /**
   * Upload file to assistant
   * Handles both regular files and videos (with AI analysis)
   */
  async uploadFile(
    assistantId: string,
    file: { buffer: Buffer; originalname: string; size: number; mimetype?: string },
    options?: {
      folder?: string;
      onStatusChange?: (status: VideoProcessingStatus) => void;
    }
  ): Promise<IAssistantDocument | null> {
    const assistant = await Assistant.findById(assistantId);
    if (!assistant) {
      return null;
    }

    const mimetype = file.mimetype || this.getMimeType(file.originalname);
    const isVideo = videoService.isVideoFile(mimetype);
    const folder = options?.folder;

    try {
      if (isVideo) {
        // Handle video file upload
        return await this.uploadVideoFile(assistant, file, mimetype, folder, options?.onStatusChange);
      } else {
        // Handle regular file upload (existing logic)
        return await this.uploadRegularFile(assistant, file, folder);
      }
    } catch (error) {
      console.error('Failed to upload file:', error);
      throw error;
    }
  }

  /**
   * Upload regular (non-video) file to Pinecone
   */
  private async uploadRegularFile(
    assistant: IAssistantDocument,
    file: { buffer: Buffer; originalname: string; size: number },
    folder?: string
  ): Promise<IAssistantDocument> {
    const pc = getPineconeClient();
    const pcAssistant = pc.Assistant(assistant.pineconeAssistantName);
    
    // Pinecone SDK requires a file path, so we need to write the buffer to a temp file
    // Use ASCII-only temp filename to avoid file system issues with Unicode
    const fs = await import('fs/promises');
    const os = await import('os');
    const path = await import('path');
    
    const tempDir = os.default.tmpdir();
    // Get file extension from original filename
    const ext = file.originalname.split('.').pop() || 'bin';
    const tempFilePath = path.default.join(tempDir, `pinecone-upload-${Date.now()}.${ext}`);
    
    // Write buffer to temp file
    await fs.default.writeFile(tempFilePath, file.buffer);
    
    let response;
    try {
      response = await pcAssistant.uploadFile({
        path: tempFilePath,
        metadata: { originalName: file.originalname },
      });
    } finally {
      // Clean up temp file
      await fs.default.unlink(tempFilePath).catch(() => {});
    }
    
    const fileRecord: IAssistantFile = {
      fileId: response.id || uuidv4(),
      name: file.originalname,
      size: file.size,
      uploadedAt: new Date(),
      folder: folder || undefined, // Add folder if provided
    };
    
    assistant.files.push(fileRecord);
    await assistant.save();
    
    return assistant;
  }

  /**
   * Upload video file - saves file record immediately and starts background processing.
   * Returns immediately with the pending file so the frontend can show progress.
   */
  private async uploadVideoFile(
    assistant: IAssistantDocument,
    file: { buffer: Buffer; originalname: string; size: number },
    mimetype: string,
    folder?: string,
    _onStatusChange?: (status: VideoProcessingStatus) => void
  ): Promise<IAssistantDocument> {
    const fileId = uuidv4();
    const assistantIdStr = assistant._id.toString();
    
    // Create initial file record with pending status
    const fileRecord: IAssistantFile = {
      fileId,
      name: file.originalname,
      size: file.size,
      uploadedAt: new Date(),
      isVideo: true,
      processingStatus: 'pending',
      folder: folder || undefined, // Add folder if provided
    };
    
    assistant.files.push(fileRecord);
    await assistant.save();

    // Start background processing (don't await - fire and forget)
    this.processVideoInBackground(
      assistantIdStr,
      fileId,
      file,
      mimetype,
      assistant.pineconeAssistantName,
    ).catch((error) => {
      console.error(`[AssistantService] Background video processing failed for ${fileId}:`, error);
    });

    // Return immediately with the pending file
    return assistant;
  }

  /**
   * Process video in background - handles AI analysis and Pinecone upload
   */
  private async processVideoInBackground(
    assistantId: string,
    fileId: string,
    file: { buffer: Buffer; originalname: string; size: number },
    mimetype: string,
    pineconeAssistantName: string,
  ): Promise<void> {
    try {
      console.log(`[AssistantService] Starting background video processing: ${file.originalname}`);

      const result = await videoService.processVideo(
        file.buffer,
        file.originalname,
        mimetype,
        assistantId,
        async (status) => {
          // Update status in database
          await Assistant.findByIdAndUpdate(
            assistantId,
            { $set: { 'files.$[elem].processingStatus': status } },
            { arrayFilters: [{ 'elem.fileId': fileId }] },
          );
        },
        fileId, // Pass fileId for cancellation support
      );

      if (!result.success) {
        await Assistant.findByIdAndUpdate(
          assistantId,
          {
            $set: {
              'files.$[elem].processingStatus': 'failed',
              'files.$[elem].errorMessage': result.error,
            },
          },
          { arrayFilters: [{ 'elem.fileId': fileId }] },
        );
        console.error(`[AssistantService] Video processing failed: ${result.error}`);
        return;
      }
      
      // Create a text document from the video analysis
      // Use ASCII-only temp filename to avoid file system issues with Unicode
      const tempFilename = `pinecone-video-${Date.now()}-${fileId}.md`;
      
      // Upload text analysis to Pinecone
      const pc = getPineconeClient();
      const pcAssistant = pc.Assistant(pineconeAssistantName);
      
      const fs = await import('fs/promises');
      const os = await import('os');
      const path = await import('path');
      
      const tempDir = os.default.tmpdir();
      const tempFilePath = path.default.join(tempDir, tempFilename);
      
      // Add UTF-8 BOM to ensure Pinecone reads the file with correct encoding
      const contentWithBom = '\uFEFF' + result.content;
      await fs.default.writeFile(tempFilePath, contentWithBom, { encoding: 'utf-8' });
      
      let response;
      try {
        response = await pcAssistant.uploadFile({
          path: tempFilePath,
          metadata: {
            originalName: file.originalname,
            isVideoAnalysis: "true",
            videoPath: result.videoPath || "",
          },
        });
      } finally {
        await fs.default.unlink(tempFilePath).catch(() => {});
      }
      
      // Update file record with success
      await Assistant.findByIdAndUpdate(
        assistantId,
        {
          $set: {
            'files.$[elem].fileId': response.id || fileId,
            'files.$[elem].videoPath': result.videoPath,
            'files.$[elem].processedAt': new Date(),
            'files.$[elem].processingStatus': 'completed',
          },
        },
        { arrayFilters: [{ 'elem.fileId': fileId }] },
      );

      console.log(`[AssistantService] Video processed successfully: ${file.originalname}`);
    } catch (error) {
      await Assistant.findByIdAndUpdate(
        assistantId,
        {
          $set: {
            'files.$[elem].processingStatus': 'failed',
            'files.$[elem].errorMessage': (error as Error).message,
          },
        },
        { arrayFilters: [{ 'elem.fileId': fileId }] },
      );
      console.error(`[AssistantService] Video processing error:`, error);
    }
  }

  /**
   * Cancel video processing for a file
   */
  async cancelVideoProcessing(assistantId: string, fileId: string): Promise<boolean> {
    const assistant = await Assistant.findById(assistantId);
    if (!assistant) {
      return false;
    }

    const file = assistant.files.find(f => f.fileId === fileId);
    if (!file || !file.isVideo) {
      return false;
    }

    // Cancel the analysis in the video service
    const cancelled = videoService.cancelAnalysis(fileId);
    
    if (cancelled) {
      // Update status to cancelled/failed
      await Assistant.findByIdAndUpdate(
        assistantId,
        {
          $set: {
            'files.$[elem].processingStatus': 'failed',
            'files.$[elem].errorMessage': 'Cancelled by user',
          },
        },
        { arrayFilters: [{ 'elem.fileId': fileId }] },
      );
    }

    return cancelled;
  }

  /**
   * Get file processing status
   */
  async getFileStatus(assistantId: string, fileId: string): Promise<{
    status: VideoProcessingStatus | null;
    errorMessage?: string;
  } | null> {
    const assistant = await Assistant.findById(assistantId);
    if (!assistant) {
      return null;
    }

    const file = assistant.files.find(f => f.fileId === fileId);
    if (!file) {
      return null;
    }

    return {
      status: file.processingStatus || null,
      errorMessage: file.errorMessage,
    };
  }

  /**
   * Get MIME type from filename
   */
  private getMimeType(filename: string): string {
    const ext = filename.toLowerCase().split('.').pop();
    const mimeTypes: Record<string, string> = {
      // Videos
      mp4: 'video/mp4',
      m4v: 'video/x-m4v',
      webm: 'video/webm',
      mov: 'video/quicktime',
      mpeg: 'video/mpeg',
      mpg: 'video/mpeg',
      // Documents
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      txt: 'text/plain',
      // Images
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
    };
    return mimeTypes[ext || ''] || 'application/octet-stream';
  }
  
  /**
   * Get file details with signed URL for download
   */
  async getFileUrl(assistantId: string, fileId: string): Promise<{ signedUrl: string; name: string } | null> {
    const assistant = await Assistant.findById(assistantId);
    if (!assistant) {
      return null;
    }
    
    const fileRecord = assistant.files.find((f) => f.fileId === fileId);
    if (!fileRecord) {
      return null;
    }
    
    try {
      const pc = getPineconeClient();
      const pcAssistant = pc.Assistant(assistant.pineconeAssistantName);
      
      // describeFile includes the signed URL by default
      const fileDetails = await pcAssistant.describeFile(fileId);
      
      if (!fileDetails.signedUrl) {
        throw new Error('File URL not available');
      }
      
      return {
        signedUrl: fileDetails.signedUrl,
        name: fileRecord.name,
      };
    } catch (error) {
      console.error('Failed to get file URL from Pinecone:', error);
      throw new Error('Failed to get file download URL');
    }
  }
  
  /**
   * Delete file from assistant
   */
  async deleteFile(assistantId: string, fileId: string): Promise<boolean> {
    const assistant = await Assistant.findById(assistantId);
    if (!assistant) {
      return false;
    }
    
    const fileIndex = assistant.files.findIndex((f) => f.fileId === fileId);
    if (fileIndex === -1) {
      return false;
    }
    
    try {
      const pc = getPineconeClient();
      const pcAssistant = pc.Assistant(assistant.pineconeAssistantName);
      await pcAssistant.deleteFile(fileId);
    } catch (error: unknown) {
      // Handle 404 (file already deleted from Pinecone) gracefully
      const errorName = (error as { name?: string })?.name || '';
      const errorMessage = (error as Error)?.message || '';
      
      if (errorName === 'PineconeNotFoundError' || errorMessage.includes('404')) {
        console.log(`[AssistantService] File ${fileId} already deleted from Pinecone, continuing with local cleanup`);
      } else {
        console.error('[AssistantService] Failed to delete file from Pinecone:', error);
      }
      // Continue with local deletion regardless
    }
    
    assistant.files.splice(fileIndex, 1);
    await assistant.save();
    
    return true;
  }
  
  /**
   * Chat with assistant
   */
  /**
   * Get human-readable language label
   */
  private getLanguageLabel(language: AssistantLanguage): string {
    const labels: Record<AssistantLanguage, string> = {
      'zh-TW': 'Traditional Chinese',
      'zh-CN': 'Simplified Chinese',
      'en': 'English',
      'auto': 'auto',
    };
    return labels[language] || language;
  }

  async chat(
    assistantId: string,
    messages: ChatMessage[],
    options?: {
      model?: string;
      stream?: boolean;
    }
  ): Promise<ChatResponse> {
    const assistant = await Assistant.findById(assistantId);
    if (!assistant) {
      console.error(`[Assistant] Assistant not found: ${assistantId}`);
      throw new Error('Assistant not found');
    }
    
    console.log(`[Assistant] Chatting with assistant: ${assistant.name} (Pinecone: ${assistant.pineconeAssistantName})`);
    
    try {
      const pc = getPineconeClient();
      const pcAssistant = pc.Assistant(assistant.pineconeAssistantName);
      
      // Build system context with language, tone, and instructions
      const maxInstructionLength = 5000;
      const truncatedInstructions = assistant.instructions && assistant.instructions.length > maxInstructionLength
        ? assistant.instructions.substring(0, maxInstructionLength) + '...'
        : assistant.instructions;

      // Build context parts
      const contextParts: string[] = [];
      
      // Add language instruction
      if (assistant.primaryLanguage && assistant.primaryLanguage !== 'auto') {
        contextParts.push(`Respond in ${this.getLanguageLabel(assistant.primaryLanguage)}.`);
      } else {
        contextParts.push('Respond in the same language as the user.');
      }
      
      // Add tone instruction
      if (assistant.tone) {
        contextParts.push(`Use a ${assistant.tone} tone.`);
      }
      
      // Inbox/chat replies must be plain text only (no Markdown)
      contextParts.push('Reply in plain text only. Do not use Markdown: no **, ###, ```, bullet lists with -, or other formatting.');
      
      // Add custom instructions
      if (truncatedInstructions) {
        contextParts.push(truncatedInstructions);
      }
      
      const systemContext = contextParts.join(' ');

      const chatMessages = systemContext
        ? [
            { role: 'user' as const, content: `Context: ${systemContext}` },
            ...messages,
          ]
        : messages;
      
      const response = await pcAssistant.chat({
        messages: chatMessages,
        model: options?.model || assistant.aiModel,
      });
      
      return {
        message: {
          role: response.message?.role || 'assistant',
          content: response.message?.content || '',
        },
        citations: response.citations?.map((c) => ({
          position: c.position ?? 0,
          references: (c.references || []).map((r) => ({
            file: { id: r.file?.id || '', name: r.file?.name || '' },
            pages: r.pages || [],
          })),
        })),
        model: response.model || assistant.aiModel,
        usage: response.usage ? {
          prompt_tokens: response.usage.promptTokens ?? 0,
          completion_tokens: response.usage.completionTokens ?? 0,
          total_tokens: response.usage.totalTokens ?? 0,
        } : undefined,
      };
    } catch (error: any) {
      console.error('Failed to chat with assistant:', error);
      // Include the original error message for better debugging
      throw new Error(`Failed to get response from assistant: ${error.message || 'Unknown error'}`);
    }
  }
  
  /**
   * Get Pinecone assistant for direct API access
   */
  async getPineconeAssistant(assistantId: string) {
    const assistant = await Assistant.findById(assistantId);
    if (!assistant) {
      return null;
    }
    
    const pc = getPineconeClient();
    return pc.Assistant(assistant.pineconeAssistantName);
  }

  /**
   * Update file folder (Foodflow only, not synced to Pinecone)
   */
  async updateFileFolder(
    assistantId: string,
    fileId: string,
    folder: string | null
  ): Promise<IAssistantDocument | null> {
    const assistant = await Assistant.findById(assistantId);
    if (!assistant) {
      return null;
    }

    const fileIndex = assistant.files.findIndex((f) => f.fileId === fileId);
    if (fileIndex === -1) {
      return null;
    }

    // Update or remove folder
    if (folder === null || folder === '') {
      assistant.files[fileIndex].folder = undefined;
    } else {
      assistant.files[fileIndex].folder = folder;
    }

    await assistant.save();
    return assistant;
  }

  /**
   * Batch update file folders (for moving multiple files)
   */
  async batchUpdateFileFolders(
    assistantId: string,
    updates: Array<{ fileId: string; folder: string | null }>
  ): Promise<IAssistantDocument | null> {
    const assistant = await Assistant.findById(assistantId);
    if (!assistant) {
      return null;
    }

    for (const update of updates) {
      const fileIndex = assistant.files.findIndex((f) => f.fileId === update.fileId);
      if (fileIndex !== -1) {
        if (update.folder === null || update.folder === '') {
          assistant.files[fileIndex].folder = undefined;
        } else {
          assistant.files[fileIndex].folder = update.folder;
        }
      }
    }

    await assistant.save();
    return assistant;
  }

  /**
   * Create a folder for organizing files
   */
  async createFolder(
    assistantId: string,
    folderName: string
  ): Promise<IAssistantDocument | null> {
    const assistant = await Assistant.findById(assistantId);
    if (!assistant) {
      return null;
    }

    // Check if folder already exists
    if (assistant.folders.includes(folderName)) {
      return assistant; // Already exists, no-op
    }

    assistant.folders.push(folderName);
    assistant.folders.sort(); // Keep folders sorted alphabetically
    await assistant.save();
    return assistant;
  }

  /**
   * Delete a folder and optionally move files to root
   * Also handles nested folders (child folders are deleted too)
   */
  async deleteFolder(
    assistantId: string,
    folderName: string,
    moveFilesToRoot = true
  ): Promise<IAssistantDocument | null> {
    const assistant = await Assistant.findById(assistantId);
    if (!assistant) {
      return null;
    }

    // Remove folder and all child folders from list
    const folderPrefix = folderName + '/';
    assistant.folders = assistant.folders.filter(
      f => f !== folderName && !f.startsWith(folderPrefix)
    );

    // Move files in this folder (and child folders) to root if requested
    if (moveFilesToRoot) {
      for (const file of assistant.files) {
        if (file.folder === folderName || (file.folder && file.folder.startsWith(folderPrefix))) {
          file.folder = undefined;
        }
      }
    }

    await assistant.save();
    return assistant;
  }

  /**
   * Rename a folder (also updates child folders for nested folder support)
   */
  async renameFolder(
    assistantId: string,
    oldName: string,
    newName: string
  ): Promise<IAssistantDocument | null> {
    const assistant = await Assistant.findById(assistantId);
    if (!assistant) {
      return null;
    }

    // Update folder name in the folders array
    // Also update any child folders (e.g., if renaming "A" to "B", also rename "A/Child" to "B/Child")
    const oldPrefix = oldName + '/';
    for (let i = 0; i < assistant.folders.length; i++) {
      if (assistant.folders[i] === oldName) {
        assistant.folders[i] = newName;
      } else if (assistant.folders[i].startsWith(oldPrefix)) {
        // Child folder - update the prefix
        assistant.folders[i] = newName + assistant.folders[i].substring(oldName.length);
      }
    }
    assistant.folders.sort();

    // Update folder reference in all files
    // Also update files in child folders
    for (const file of assistant.files) {
      if (file.folder === oldName) {
        file.folder = newName;
      } else if (file.folder && file.folder.startsWith(oldPrefix)) {
        // File in child folder - update the prefix
        file.folder = newName + file.folder.substring(oldName.length);
      }
    }

    await assistant.save();
    return assistant;
  }
}

export const assistantService = new AssistantService();
