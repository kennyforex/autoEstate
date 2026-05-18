import dotenv from "dotenv";

dotenv.config();

/** Default vision model: image analysis, media tool, and document capture (unless overridden). */
const defaultVisionModel =
  process.env.OPENROUTER_VISION_MODEL || "qwen/qwen2.5-vl-72b-instruct";

const docCaptureStructuredEnv =
  process.env.OPENROUTER_DOCUMENT_CAPTURE_USE_STRUCTURED_OUTPUT?.toLowerCase();
const audioFallbackModelsEnv = process.env.OPENROUTER_AUDIO_FALLBACK_MODELS;
const parsedAudioFallbackModels = audioFallbackModelsEnv
  ? audioFallbackModelsEnv
      .split(",")
      .map((model) => model.trim())
      .filter(Boolean)
  : [];

export const openRouterConfig = {
  apiKey: process.env.OPENROUTER_API_KEY || "",
  baseUrl: "https://openrouter.ai/api/v1",
  /**
   * Document capture JSON: default is prompt-only (no response_format json_schema), for Qwen / regions where Gemini is blocked.
   * Set OPENROUTER_DOCUMENT_CAPTURE_USE_STRUCTURED_OUTPUT=true to use API-enforced JSON Schema on supported models.
   */
  documentCaptureUseStructuredOutput:
    docCaptureStructuredEnv === "true" || docCaptureStructuredEnv === "1",
  models: {
    // Vision model for image analysis (media tool, assistant playground, etc.)
    vision: defaultVisionModel,
    // Video model for video analysis (Z.AI GLM supports video via base64)
    video: process.env.OPENROUTER_VIDEO_MODEL || "z-ai/glm-4.6v",
    audio:
      process.env.OPENROUTER_AUDIO_MODEL || "qwen/qwen3-asr-flash-2026-02-10",
    audioFallback: parsedAudioFallbackModels,
    // Fast text (classification, simple reply)
    fast: process.env.OPENROUTER_FAST_MODEL || "google/gemini-2.0-flash-001",
    // Reasoning model for the ReAct agent engine (configured via env, independent of Pinecone's chat model)
    agent: process.env.OPENROUTER_AGENT_MODEL || "deepseek/deepseek-v3.2",
    // Image/PDF structured extraction — same default as vision; override with OPENROUTER_DOCUMENT_CAPTURE_MODEL
    documentCapture:
      process.env.OPENROUTER_DOCUMENT_CAPTURE_MODEL || defaultVisionModel,
  },
  // Max tokens for video analysis response
  videoMaxTokens: 16384,
  // Request timeout for video analysis (10 minutes)
  videoTimeout: 10 * 60 * 1000,
};
