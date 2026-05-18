import axios from "axios";
import { openRouterConfig } from "../config/openrouter.js";
import { openRouterHeaders } from "../config/httpAttribution.js";

type AudioPayloadMethod = "image_url_data_url" | "input_audio";

export interface AudioTranscriptionAttempt {
  model: string;
  method: AudioPayloadMethod;
  success: boolean;
  status?: number;
  errorMessage?: string;
}

export interface AudioTranscriptionResult {
  text: string;
  model: string;
  method: AudioPayloadMethod;
  attempts: AudioTranscriptionAttempt[];
}

export class AudioTranscriptionError extends Error {
  readonly attempts: AudioTranscriptionAttempt[];

  constructor(message: string, attempts: AudioTranscriptionAttempt[]) {
    super(message);
    this.name = "AudioTranscriptionError";
    this.attempts = attempts;
  }
}

function normalizedModelList(primary: string, fallbacks: string[]): string[] {
  const models = [primary, ...fallbacks.map((m) => m.trim())].filter(Boolean);
  return Array.from(new Set(models));
}

function inferAudioFormat(mimetype: string): string {
  const lower = mimetype.toLowerCase();
  if (lower.includes("wav")) return "wav";
  if (lower.includes("mpeg") || lower.includes("mp3")) return "mp3";
  if (lower.includes("flac")) return "flac";
  if (lower.includes("webm")) return "webm";
  return "ogg";
}

function extractBase64(dataUrl: string): string {
  if (!dataUrl.includes(",")) return dataUrl;
  const [, base64 = ""] = dataUrl.split(",", 2);
  return base64;
}

function errorMessageFrom(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const providerMessage =
      (error.response?.data as { error?: { message?: string } } | undefined)
        ?.error?.message ?? "";
    return providerMessage || error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

function statusFrom(error: unknown): number | undefined {
  if (axios.isAxiosError(error)) return error.response?.status;
  return undefined;
}

function isModelUnavailableError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("not available in your region") ||
    lower.includes("model is not available in your region") ||
    lower.includes("model not found") ||
    lower.includes("does not exist")
  );
}

function isPayloadFormatError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("no endpoints found that support image input") ||
    lower.includes("invalid image") ||
    lower.includes("invalid url") ||
    lower.includes("unsupported content type") ||
    lower.includes("invalid content") ||
    lower.includes("input_audio") ||
    lower.includes("image_url")
  );
}

async function requestTranscription(params: {
  model: string;
  prompt: string;
  audioDataUrl: string;
  audioMimetype: string;
  method: AudioPayloadMethod;
  timeoutMs: number;
  title: string;
}): Promise<string> {
  const { model, prompt, audioDataUrl, audioMimetype, method, timeoutMs, title } = params;

  const content =
    method === "input_audio"
      ? [
          { type: "text", text: prompt },
          {
            type: "input_audio",
            input_audio: {
              data: extractBase64(audioDataUrl),
              format: inferAudioFormat(audioMimetype),
            },
          },
        ]
      : [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: audioDataUrl } },
        ];

  const response = await axios.post(
    `${openRouterConfig.baseUrl}/chat/completions`,
    {
      model,
      messages: [{ role: "user", content }],
    },
    {
      headers: {
        Authorization: `Bearer ${openRouterConfig.apiKey}`,
        "Content-Type": "application/json",
        ...openRouterHeaders(title),
      },
      timeout: timeoutMs,
    },
  );

  const text = response.data?.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("No transcription text returned from provider");
  }
  return text;
}

export async function transcribeAudioWithFallback(params: {
  audioDataUrl: string;
  audioMimetype: string;
  prompt: string;
  timeoutMs?: number;
  title?: string;
  primaryModel?: string;
  fallbackModels?: string[];
}): Promise<AudioTranscriptionResult> {
  if (!openRouterConfig.apiKey) {
    throw new AudioTranscriptionError(
      "OpenRouter API key not configured",
      [],
    );
  }

  const timeoutMs = params.timeoutMs ?? 60_000;
  const title = params.title ?? "Foodflow AI";
  const primaryModel = params.primaryModel ?? openRouterConfig.models.audio;
  const fallbackModels =
    params.fallbackModels ?? openRouterConfig.models.audioFallback ?? [];
  const models = normalizedModelList(primaryModel, fallbackModels);
  const attempts: AudioTranscriptionAttempt[] = [];

  for (const model of models) {
    try {
      const text = await requestTranscription({
        model,
        prompt: params.prompt,
        audioDataUrl: params.audioDataUrl,
        audioMimetype: params.audioMimetype,
        method: "image_url_data_url",
        timeoutMs,
        title,
      });
      attempts.push({ model, method: "image_url_data_url", success: true });
      return { text, model, method: "image_url_data_url", attempts };
    } catch (error) {
      const message = errorMessageFrom(error);
      attempts.push({
        model,
        method: "image_url_data_url",
        success: false,
        status: statusFrom(error),
        errorMessage: message,
      });

      if (isModelUnavailableError(message)) {
        continue;
      }

      if (!isPayloadFormatError(message)) {
        continue;
      }
    }

    try {
      const text = await requestTranscription({
        model,
        prompt: params.prompt,
        audioDataUrl: params.audioDataUrl,
        audioMimetype: params.audioMimetype,
        method: "input_audio",
        timeoutMs,
        title,
      });
      attempts.push({ model, method: "input_audio", success: true });
      return { text, model, method: "input_audio", attempts };
    } catch (error) {
      attempts.push({
        model,
        method: "input_audio",
        success: false,
        status: statusFrom(error),
        errorMessage: errorMessageFrom(error),
      });
    }
  }

  throw new AudioTranscriptionError(
    "Audio transcription unavailable after all fallback attempts",
    attempts,
  );
}

export function audioTranscriptionFailureMessage(
  attempts: AudioTranscriptionAttempt[],
): string {
  const hasRegionIssue = attempts.some((attempt) =>
    isModelUnavailableError(attempt.errorMessage || ""),
  );

  if (hasRegionIssue) {
    return "[Audio transcription unavailable - configured models are not available in this region]";
  }

  return "[Audio transcription unavailable - all fallback methods failed]";
}
