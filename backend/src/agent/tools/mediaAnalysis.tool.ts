import { BaseTool } from './base.js';
import axios from 'axios';
import { openRouterHeaders } from '../../config/httpAttribution.js';
import { openRouterConfig } from '../../config/openrouter.js';
import {
  AudioTranscriptionError,
  audioTranscriptionFailureMessage,
  normalizeAudioMimetype,
  transcribeAudioWithFallback,
} from '../../services/audioTranscription.service.js';
import type { AgentContext, ToolResult } from '../types.js';

export class MediaAnalysisTool extends BaseTool {
  readonly name = 'media_analysis';
  readonly description =
    'Analyze an image or transcribe an audio message using AI vision/audio models. ' +
    'The media must already be available as a base64 data URL or a public URL.';
  readonly parameters = {
    type: 'object',
    properties: {
      mediaType: {
        type: 'string',
        enum: ['image', 'audio'],
        description: 'The type of media to analyze',
      },
      mediaDataUrl: {
        type: 'string',
        description: 'The base64 data URL or public URL of the media',
      },
      prompt: {
        type: 'string',
        description: 'Optional custom prompt for the analysis',
      },
    },
    required: ['mediaType', 'mediaDataUrl'],
  };

  async execute(args: Record<string, unknown>, _context: AgentContext, _signal?: AbortSignal): Promise<ToolResult> {
    const mediaType = args.mediaType as 'image' | 'audio';
    const mediaDataUrl = args.mediaDataUrl as string;
    const customPrompt = args.prompt as string | undefined;

    if (!openRouterConfig.apiKey) {
      return { success: false, data: null, summary: 'Media analysis unavailable: API key not configured' };
    }

    // Validate that mediaDataUrl is actually a URL (starts with http://, https://, or data:)
    if (!mediaDataUrl || (!mediaDataUrl.startsWith('http://') && !mediaDataUrl.startsWith('https://') && !mediaDataUrl.startsWith('data:'))) {
      return {
        success: false,
        data: null,
        summary: `Invalid media URL provided: "${mediaDataUrl?.substring(0, 100)}...". The mediaDataUrl must be a valid URL starting with http://, https://, or data:. Please use the actual media URL from the message context, not a description.`,
      };
    }

    try {
      const defaultPrompt = mediaType === 'image'
        ? 'Describe this image in detail.'
        : 'Transcribe this audio message accurately.';

      if (mediaType === 'audio') {
        const defaultMime = 'audio/ogg';
        const mimeFromDataUrl = mediaDataUrl.startsWith('data:')
          ? mediaDataUrl.slice(5, mediaDataUrl.indexOf(';') > 5 ? mediaDataUrl.indexOf(';') : undefined)
          : '';
        const audioMimetype = normalizeAudioMimetype(
          mimeFromDataUrl || defaultMime,
        );

        try {
          const transcription = await transcribeAudioWithFallback({
            audioDataUrl: mediaDataUrl,
            audioMimetype,
            prompt: customPrompt || defaultPrompt,
            timeoutMs: 60_000,
            title: 'Foodflow AI Agent',
          });

          return {
            success: true,
            data: {
              result: transcription.text,
              model: transcription.model,
              method: transcription.method,
              attempts: transcription.attempts,
            },
            summary: transcription.text,
          };
        } catch (error) {
          const attempts = error instanceof AudioTranscriptionError ? error.attempts : [];
          const failureSummary = audioTranscriptionFailureMessage(attempts);
          return {
            success: false,
            data: {
              attempts,
            },
            summary: failureSummary,
          };
        }
      }

      const model = openRouterConfig.models.vision;
      const content = [
        { type: 'text', text: customPrompt || defaultPrompt },
        { type: 'image_url', image_url: { url: mediaDataUrl } },
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
            ...openRouterHeaders('Foodflow AI Agent'),
          },
          timeout: 60_000,
        },
      );

      const result = response.data.choices[0].message.content || '[No result]';
      return {
        success: true,
        data: { result, model },
        summary: result,
      };
    } catch (error: any) {
      return {
        success: false,
        data: null,
        summary: `Media analysis failed: ${error.message}`,
      };
    }
  }
}
