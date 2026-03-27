import dotenv from "dotenv";

dotenv.config();

export const openRouterConfig = {
  apiKey: process.env.OPENROUTER_API_KEY || "",
  baseUrl: "https://openrouter.ai/api/v1",
  models: {
    // Vision model for image analysis
    vision:
      process.env.OPENROUTER_VISION_MODEL || "qwen/qwen2.5-vl-72b-instruct",
    // Video model for video analysis (Z.AI GLM supports video via base64)
    video: process.env.OPENROUTER_VIDEO_MODEL || "z-ai/glm-4.6v",
    audio: process.env.OPENROUTER_AUDIO_MODEL || "google/gemini-2.0-flash-001",
    // Fast text (classification, simple reply)
    fast: "google/gemini-2.0-flash-001",
    // Reasoning model for the ReAct agent engine (configured via env, independent of Pinecone's chat model)
    agent: process.env.OPENROUTER_AGENT_MODEL || "deepseek/deepseek-v3.2",
  },
  // Max tokens for video analysis response
  videoMaxTokens: 16384,
  // Request timeout for video analysis (10 minutes)
  videoTimeout: 10 * 60 * 1000,
};
