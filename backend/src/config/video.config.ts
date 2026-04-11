import path from "path";
import dotenv from "dotenv";
import { getUploadsRoot } from "../utils/uploadsPath.js";

dotenv.config();

/**
 * Video analysis prompt for forex/EA training content
 * This prompt instructs the model to create comprehensive notes
 */
export const videoAnalysisPrompt = `You are an expert note-taker specializing in technical training content, particularly in forex trading and algorithmic systems like Expert Advisors (EAs). Your task is to watch and analyze the provided training video in its entirety, then create comprehensive, highly detailed notes that capture every key aspect of the content. Aim for maximum detail—break down concepts, steps, explanations, examples, and visuals frame by frame where relevant. Structure the notes logically (e.g., by timestamps, sections, or topics) for easy reference.

**IMPORTANT LANGUAGE INSTRUCTIONS:**
- The video may be in Traditional Chinese (繁體中文), Cantonese (廣東話/粵語), Mandarin, or English.
- Transcribe and write your notes in the SAME language as the video's spoken content.
- If the video is in Cantonese or Traditional Chinese, write your notes in Traditional Chinese (繁體中文).
- Preserve any technical terms, platform names, or trading jargon in their original form.

Key guidelines for your notes:

1. **Timestamp everything**: Reference exact timestamps (e.g., 00:05:23) for all major points, transitions, demonstrations, and visuals.

2. **Summarize spoken content**: Transcribe or paraphrase all dialogue, instructions, tips, warnings, and explanations verbatim where possible, expanding on implications or context. For Cantonese content, capture the spoken words accurately in Traditional Chinese characters.

3. **Describe visuals in depth**: Pay extreme attention to any screenshots, diagrams, charts, or UI elements shown. For UI of EAs (forex trading algorithms), describe every button, menu, setting, parameter, indicator, graph, input field, output log, error message, or customization option in exhaustive detail—including labels, icons, colors, layouts, hover effects, and how they interact. If a screenshot shows a trading platform (e.g., MetaTrader 4/5), note exact configurations, backtest results, live trade examples, risk settings, or code snippets.

4. **Include examples and demos**: Detail any live demonstrations, simulations, or case studies, including input values, outputs, outcomes, and any anomalies.

5. **Highlight key takeaways**: End each section with bullet points on practical applications, best practices, common pitfalls, and advanced tips.

6. **Be exhaustive**: No detail is too small—cover background info, speaker's emphasis, subtle animations, tooltips, or even environmental sounds if they add context. If the video has multiple parts or modules, organize notes accordingly.

7. **Length and format**: Make the notes as long and detailed as needed (aim for 5-10x the video length in text equivalent). Use markdown for clarity: headings, subheadings, bullets, numbered lists, bold/italics for emphasis, and code blocks for any scripts or settings shown.

Now analyze the video and provide your comprehensive notes:`;

/**
 * Supported video formats for upload
 */
export const supportedVideoFormats = [
  "video/mp4",
  "video/x-m4v",
  "video/mpeg",
  "video/webm",
  "video/quicktime",
  "video/mov",
];

/**
 * Video upload and analysis limits
 * OpenRouter does not have the same 10MB restriction as DashScope
 */
export const videoLimits = {
  // Maximum file size for upload/storage (100MB)
  maxFileSize: 100 * 1024 * 1024,

  // Max size for video analysis via OpenRouter with base64 encoding
  // Base64 increases size by ~33%, so 20MB video becomes ~27MB payload
  maxAnalysisSize: 20 * 1024 * 1024,

  // Same root as express /uploads and logo uploads (UPLOAD_PATH or backend/uploads)
  storageDirectory: path.join(getUploadsRoot(), "videos"),

  // Analysis timeout (10 minutes)
  analysisTimeout: 10 * 60 * 1000,
};

/**
 * Base URL of this backend (no trailing slash).
 * OpenRouter fetches video from this URL; must be reachable from the internet.
 * e.g. https://api.example.com or http://localhost:3001
 */
export const backendPublicUrl =
  process.env.BACKEND_PUBLIC_URL ||
  process.env.WEBHOOK_BASE_URL ||
  `http://localhost:${process.env.PORT || 3001}`;

export type VideoProcessingStatus =
  | "pending"
  | "analyzing"
  | "completed"
  | "failed";
