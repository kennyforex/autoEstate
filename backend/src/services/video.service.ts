import axios from "axios";
import path from "path";
import {
  videoAnalysisPrompt,
  supportedVideoFormats,
  videoLimits,
  type VideoProcessingStatus,
} from "../config/video.config.js";
import { openRouterConfig } from "../config/openrouter.js";

/**
 * Result of video analysis
 */
export interface VideoAnalysisResult {
  success: boolean;
  content: string;
  error?: string;
  tokensUsed?: number;
}

/**
 * Video metadata
 */
export interface VideoMetadata {
  originalSize: number;
  format?: string;
  filename?: string;
}

class VideoService {
  // Store active analysis jobs for cancellation support
  private activeAnalysis = new Map<string, AbortController>();

  /**
   * Check if an analysis is currently running for a file
   */
  isAnalyzing(fileId: string): boolean {
    return this.activeAnalysis.has(fileId);
  }

  /**
   * Cancel an active video analysis
   */
  cancelAnalysis(fileId: string): boolean {
    const controller = this.activeAnalysis.get(fileId);
    if (controller) {
      controller.abort();
      this.activeAnalysis.delete(fileId);
      console.log(`[VideoService] Analysis cancelled for file: ${fileId}`);
      return true;
    }
    return false;
  }
  /**
   * Check if a file is a video based on its mimetype
   */
  isVideoFile(mimetype: string): boolean {
    return supportedVideoFormats.includes(mimetype);
  }

  /**
   * Validate video file before processing
   */
  validateVideo(
    buffer: Buffer,
    mimetype: string,
  ): { valid: boolean; error?: string } {
    // Check format
    if (!this.isVideoFile(mimetype)) {
      return {
        valid: false,
        error: `Unsupported video format: ${mimetype}. Supported: mp4, webm, mov, mpeg`,
      };
    }

    // Check file size (upload limit)
    if (buffer.length > videoLimits.maxFileSize) {
      const maxMB = Math.round(videoLimits.maxFileSize / (1024 * 1024));
      const actualMB = Math.round(buffer.length / (1024 * 1024));
      return {
        valid: false,
        error: `Video too large (${actualMB}MB). Maximum upload: ${maxMB}MB`,
      };
    }

    // Check analysis size limit for OpenRouter
    if (buffer.length > videoLimits.maxAnalysisSize) {
      const maxMB = Math.round(videoLimits.maxAnalysisSize / (1024 * 1024));
      const actualMB = Math.round(buffer.length / (1024 * 1024));
      return {
        valid: false,
        error: `Video is ${actualMB}MB. Maximum for analysis: ${maxMB}MB. Use a shorter clip or compress the file.`,
      };
    }

    return { valid: true };
  }

  /**
   * Normalize MIME type for API compatibility
   */
  private normalizeMimeType(mimetype: string): string {
    const mimeMap: Record<string, string> = {
      "video/quicktime": "video/mp4",
      "video/x-m4v": "video/mp4",
      "video/mov": "video/mp4",
    };
    return mimeMap[mimetype] || mimetype;
  }

  /**
   * Analyze video using OpenRouter API with Qwen VL model.
   * Uses base64-encoded data URL since Qwen VL on OpenRouter doesn't support video URLs.
   * https://openrouter.ai/docs/features/multimodal/videos
   * @param fileId - Used to track and allow cancellation of the analysis
   */
  async analyzeVideoWithOpenRouter(
    buffer: Buffer,
    mimetype: string,
    filename: string,
    fileId?: string,
  ): Promise<VideoAnalysisResult> {
    // Check API key
    if (!openRouterConfig.apiKey) {
      return {
        success: false,
        content: "",
        error:
          "OPENROUTER_API_KEY not configured. Please add it to your .env file.",
      };
    }

    // Create AbortController for cancellation support
    const controller = new AbortController();
    if (fileId) {
      this.activeAnalysis.set(fileId, controller);
    }

    try {
      // Convert buffer to base64 data URL
      const normalizedMime = this.normalizeMimeType(mimetype);
      const base64Video = buffer.toString("base64");
      const dataUrl = `data:${normalizedMime};base64,${base64Video}`;

      console.log(
        `[VideoService] Analyzing video via OpenRouter (base64): ${filename} (${Math.round(buffer.length / 1024 / 1024)}MB)`,
      );
      console.log(
        `[VideoService] Using model: ${openRouterConfig.models.video}`,
      );

      const response = await axios.post(
        `${openRouterConfig.baseUrl}/chat/completions`,
        {
          model: openRouterConfig.models.video,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: videoAnalysisPrompt,
                },
                {
                  type: "video_url",
                  video_url: {
                    url: dataUrl,
                  },
                },
              ],
            },
          ],
          max_tokens: openRouterConfig.videoMaxTokens,
        },
        {
          headers: {
            Authorization: `Bearer ${openRouterConfig.apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://ffcs.ai",
            "X-Title": "FFCS AI",
          },
          timeout: openRouterConfig.videoTimeout,
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          signal: controller.signal,
        },
      );

      // OpenRouter returns standard OpenAI-compatible response
      const content = response.data.choices?.[0]?.message?.content || "";
      const usage = response.data.usage;
      const tokensUsed =
        usage?.total_tokens ??
        (usage?.prompt_tokens != null && usage?.completion_tokens != null
          ? usage.prompt_tokens + usage.completion_tokens
          : undefined);

      if (!content) {
        return {
          success: false,
          content: "",
          error: "No response content from OpenRouter API",
        };
      }

      console.log(
        `[VideoService] Analysis complete. Tokens used: ${tokensUsed || "unknown"}`,
      );

      // Format the final output
      const formattedContent = this.formatAnalysisOutput(filename, content);

      return {
        success: true,
        content: formattedContent,
        tokensUsed,
      };
    } catch (error: unknown) {
      // Check if this was a cancellation
      if (axios.isCancel(error) || (error instanceof Error && error.name === 'AbortError')) {
        console.log(`[VideoService] Analysis cancelled for: ${filename}`);
        return {
          success: false,
          content: "",
          error: "Analysis cancelled by user",
        };
      }

      console.error("[VideoService] Video analysis failed:", error);

      // Log the actual API error response for debugging
      if (axios.isAxiosError(error) && error.response?.data) {
        console.error("[VideoService] API error response:", JSON.stringify(error.response.data, null, 2));
      }

      // Extract error message from API or network
      let errorMessage = "Video analysis failed";
      if (axios.isAxiosError(error)) {
        const data = error.response?.data;
        const msg =
          data?.error?.message ??
          (typeof data?.error === "string" ? data.error : null) ??
          data?.message;
        if (msg) {
          errorMessage = String(msg);
        }
        // User-friendly messages for known cases
        if (error.code === "ECONNABORTED") {
          errorMessage =
            "Analysis timed out. Try a shorter video.";
        } else if (error.response?.status === 401) {
          errorMessage = "Invalid OPENROUTER_API_KEY. Please check your API key.";
        } else if (error.response?.status === 429) {
          errorMessage = "Rate limit exceeded. Please try again later.";
        } else if (error.response?.status === 413) {
          errorMessage = "Video too large for API. Please compress the video.";
        } else if (error.response?.status === 400) {
          // Check for specific error messages
          if (errorMessage.includes("No endpoints found")) {
            errorMessage = "The selected model doesn't support video. Try a different model.";
          } else if (!msg) {
            errorMessage = "Bad request to video API. Check video format (MP4 recommended).";
          }
        } else if (error.response?.status === 404) {
          // Model not found or doesn't support video
          if (errorMessage.includes("No endpoints found")) {
            errorMessage = "The selected model doesn't support video input. Try google/gemini-2.0-flash-001 or another video-capable model.";
          } else {
            errorMessage = "Model not found or doesn't support video. Check OPENROUTER_VIDEO_MODEL.";
          }
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      return {
        success: false,
        content: "",
        error: errorMessage,
      };
    } finally {
      // Clean up the controller reference
      if (fileId) {
        this.activeAnalysis.delete(fileId);
      }
    }
  }

  /**
   * Format the analysis output with metadata
   */
  private formatAnalysisOutput(filename: string, content: string): string {
    const timestamp = new Date().toISOString();

    return `# Video Analysis Report

**File:** ${filename}
**Analyzed:** ${timestamp}
**Model:** ${openRouterConfig.models.video}

---

${content}

---
*This analysis was generated via OpenRouter.*`;
  }

  /**
   * Save video to local storage
   */
  async saveVideoToStorage(
    buffer: Buffer,
    assistantId: string,
    originalFilename: string,
  ): Promise<string> {
    const fs = await import("fs/promises");

    // Create directory if it doesn't exist
    const storageDir = path.isAbsolute(videoLimits.storageDirectory)
      ? videoLimits.storageDirectory
      : path.join(process.cwd(), videoLimits.storageDirectory);
    await fs.default.mkdir(storageDir, { recursive: true });

    // Use ASCII-only filename for storage so the public URL is always simple (no Unicode, no encoding).
    // Normalize extension to .mp4 for M4V/MOV for better compatibility.
    const timestamp = Date.now();
    const rawExt = (originalFilename.split(".").pop() || "mp4").toLowerCase();
    const extSanitized = rawExt.replace(/[^a-zA-Z0-9]/g, "") || "mp4";
    const ext =
      extSanitized === "m4v" || extSanitized === "mov" ? "mp4" : extSanitized;
    const filename = `${assistantId}-${timestamp}.${ext}`;
    const filePath = path.join(storageDir, filename);

    // Write file
    await fs.default.writeFile(filePath, buffer);

    console.log(`[VideoService] Video saved to: ${filePath}`);

    return filePath;
  }

  /**
   * Delete video from storage
   */
  async deleteVideoFromStorage(filePath: string): Promise<void> {
    try {
      const fs = await import("fs/promises");
      await fs.default.unlink(filePath);
      console.log(`[VideoService] Video deleted: ${filePath}`);
    } catch (error) {
      console.error(`[VideoService] Failed to delete video: ${filePath}`, error);
    }
  }

  /**
   * Process video: save, analyze via OpenRouter (base64), and return content for Pinecone
   * @param fileId - Used to track and allow cancellation of the analysis
   */
  async processVideo(
    buffer: Buffer,
    filename: string,
    mimetype: string,
    assistantId: string,
    onStatusChange?: (status: VideoProcessingStatus) => void,
    fileId?: string,
  ): Promise<{
    success: boolean;
    content: string;
    videoPath?: string;
    error?: string;
  }> {
    try {
      // Validate
      onStatusChange?.("pending");
      const validation = this.validateVideo(buffer, mimetype);
      if (!validation.valid) {
        onStatusChange?.("failed");
        return {
          success: false,
          content: "",
          error: validation.error,
        };
      }

      // Save video locally for storage/reference
      const videoPath = await this.saveVideoToStorage(
        buffer,
        assistantId,
        filename,
      );

      // Analyze with OpenRouter using base64 (Qwen VL doesn't support video URLs)
      onStatusChange?.("analyzing");
      const result = await this.analyzeVideoWithOpenRouter(buffer, mimetype, filename, fileId);

      if (result.success) {
        onStatusChange?.("completed");
        return {
          success: true,
          content: result.content,
          videoPath,
        };
      } else {
        onStatusChange?.("failed");
        // Keep video file for retry
        return {
          success: false,
          content: "",
          videoPath,
          error: result.error,
        };
      }
    } catch (error: unknown) {
      onStatusChange?.("failed");
      const msg = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        content: "",
        error: msg,
      };
    }
  }
}

export const videoService = new VideoService();
