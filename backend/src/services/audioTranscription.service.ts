import axios from "axios";
import { openRouterConfig } from "../config/openrouter.js";
import { openRouterHeaders } from "../config/httpAttribution.js";

type AudioPayloadMethod =
  | "audio_transcriptions"
  | "image_url_data_url"
  | "input_audio";

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

/** Evolution/WhatsApp often returns `audio/ogg; codecs=opus` — strip parameters for stable data URLs and format inference. */
export function normalizeAudioMimetype(mimetype: string): string {
  const trimmed = mimetype.trim();
  const base = trimmed.split(";")[0]?.trim() || "audio/ogg";
  return base.toLowerCase();
}

function normalizedModelList(primary: string, fallbacks: string[]): string[] {
  const models = [primary, ...fallbacks.map((m) => m.trim())].filter(Boolean);
  return Array.from(new Set(models));
}

function envFlag(name: string): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return false;
  return ["1", "true", "yes", "on"].includes(raw);
}

/** ASR models should use OpenRouter `input_audio` first; optional env forces the same for all audio models. */
function preferInputAudioFirst(model: string): boolean {
  if (envFlag("OPENROUTER_AUDIO_PREFER_INPUT_AUDIO")) return true;
  return /asr/i.test(model);
}

function isSpeechToTextModel(model: string): boolean {
  return /asr|whisper|transcri/i.test(model);
}

function inferAudioFormat(mimetype: string): string {
  const lower = normalizeAudioMimetype(mimetype).toLowerCase();
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

/** Rewrite data URL to use normalized MIME (no `codecs=` suffix). */
function normalizeAudioDataUrl(audioDataUrl: string, normalizedMime: string): string {
  if (!audioDataUrl.startsWith("data:")) return audioDataUrl;
  const comma = audioDataUrl.indexOf(",");
  if (comma === -1) return audioDataUrl;
  const base64 = audioDataUrl.slice(comma + 1);
  return `data:${normalizedMime};base64,${base64}`;
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
  const { model, prompt, audioDataUrl, audioMimetype, method, timeoutMs, title } =
      params;

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

async function requestSpeechToTextTranscription(params: {
  model: string;
  audioDataUrl: string;
  audioMimetype: string;
  timeoutMs: number;
  title: string;
}): Promise<string> {
  const { model, audioDataUrl, audioMimetype, timeoutMs, title } = params;

  const response = await axios.post(
    `${openRouterConfig.baseUrl}/audio/transcriptions`,
    {
      model,
      input_audio: {
        data: extractBase64(audioDataUrl),
        format: inferAudioFormat(audioMimetype),
      },
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

  const text = response.data?.text?.trim();
  if (!text) {
    throw new Error("No transcription text returned from STT provider");
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

  const normalizedMime = normalizeAudioMimetype(params.audioMimetype);
  const audioDataUrl = normalizeAudioDataUrl(
    params.audioDataUrl,
    normalizedMime,
  );

  for (const model of models) {
    const methods: AudioPayloadMethod[] = isSpeechToTextModel(model)
      ? ["audio_transcriptions", "input_audio", "image_url_data_url"]
      : preferInputAudioFirst(model)
        ? ["input_audio", "image_url_data_url"]
        : ["image_url_data_url", "input_audio"];

    for (const method of methods) {
      console.log(
        `[AI:Audio] OpenRouter attempt: model=${model} method=${method}`,
      );
      try {
        const text =
          method === "audio_transcriptions"
            ? await requestSpeechToTextTranscription({
                model,
                audioDataUrl,
                audioMimetype: normalizedMime,
                timeoutMs,
                title,
              })
            : await requestTranscription({
                model,
                prompt: params.prompt,
                audioDataUrl,
                audioMimetype: normalizedMime,
                method,
                timeoutMs,
                title,
              });
        attempts.push({ model, method, success: true });
        console.log(
          `[AI:Audio] OpenRouter success: model=${model} method=${method}`,
        );
        return { text, model, method, attempts };
      } catch (error) {
        const message = errorMessageFrom(error);
        attempts.push({
          model,
          method,
          success: false,
          status: statusFrom(error),
          errorMessage: message,
        });
        console.warn(
          `[AI:Audio] OpenRouter failed: model=${model} method=${method} status=${statusFrom(error) ?? "?"} message=${message}`,
        );

        if (isModelUnavailableError(message)) {
          break;
        }

        const tryAlternates =
          isPayloadFormatError(message) || method === "input_audio";
        if (!tryAlternates) {
          break;
        }
      }
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
