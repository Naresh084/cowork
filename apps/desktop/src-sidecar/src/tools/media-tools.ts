// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { z } from 'zod';
import { join } from 'path';
import { homedir } from 'os';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { GoogleGenAI, RawReferenceImage } from '@google/genai';
import type { ToolHandler, ToolContext, ToolResult } from '@cowork/core';

function getExtension(mimeType?: string, fallback = 'bin'): string {
  if (!mimeType) return fallback;
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('gif')) return 'gif';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('mov')) return 'mov';
  return fallback;
}

function getVideoMimeTypeFromPath(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.m4v')) return 'video/mp4';
  return 'video/mp4';
}

function getGeneratedDir(appDataDir: string | undefined, sessionId: string): string {
  const baseDir = appDataDir || join(homedir(), '.cowork');
  return join(baseDir, 'sessions', sessionId, 'generated');
}

async function saveGeneratedFile(
  appDataDir: string | undefined,
  sessionId: string,
  base64: string,
  mimeType: string | undefined,
  prefix: string,
): Promise<string> {
  const dir = getGeneratedDir(appDataDir, sessionId);
  await mkdir(dir, { recursive: true });
  const ext = getExtension(mimeType);
  const filename = `${prefix}-${Date.now()}.${ext}`;
  const filePath = join(dir, filename);
  const buffer = Buffer.from(base64, 'base64');
  await writeFile(filePath, buffer);
  return filePath;
}

interface SpecializedMediaModels {
  imageGeneration: string;
  videoGeneration: string;
}

interface MediaRoutingSettings {
  imageBackend: 'google' | 'openai' | 'fal';
  videoBackend: 'google' | 'openai' | 'fal';
}

function normalizeOpenAIBaseUrl(baseUrl?: string): string {
  const trimmed = (baseUrl || 'https://api.openai.com').trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/v1')) return trimmed;
  return `${trimmed}/v1`;
}

function normalizeFalModelPath(modelId: string): string {
  return modelId.trim().replace(/^\/+/, '').replace(/\/+$/, '');
}

function buildFalQueueUrl(modelId: string): string {
  return `https://queue.fal.run/${normalizeFalModelPath(modelId)}`;
}

function normalizeBase64Payload(
  value: string,
  fallbackMimeType: string,
): { base64: string; mimeType: string } {
  const trimmed = value.trim();
  const match = trimmed.match(/^data:(.+);base64,(.+)$/);
  if (match) {
    return {
      mimeType: match[1] || fallbackMimeType,
      base64: match[2] || '',
    };
  }
  return { base64: trimmed, mimeType: fallbackMimeType };
}

function extractFalImageCandidates(payload: unknown): Array<{ url?: string; base64?: string; mimeType?: string }> {
  if (!payload || typeof payload !== 'object') return [];
  const obj = payload as Record<string, unknown>;
  const sources = [
    obj,
    obj.data as Record<string, unknown> | undefined,
    obj.output as Record<string, unknown> | undefined,
    obj.result as Record<string, unknown> | undefined,
    obj.response as Record<string, unknown> | undefined,
  ].filter(Boolean) as Array<Record<string, unknown>>;

  const items: Array<{ url?: string; base64?: string; mimeType?: string }> = [];
  for (const source of sources) {
    const fromArray = (arr: unknown) => {
      if (!Array.isArray(arr)) return;
      for (const row of arr) {
        if (!row || typeof row !== 'object') continue;
        const r = row as Record<string, unknown>;
        const url = typeof r.url === 'string' ? r.url : undefined;
        const base64 =
          typeof r.base64 === 'string'
            ? r.base64
            : typeof r.b64_json === 'string'
              ? r.b64_json
              : typeof r.image_base64 === 'string'
                ? r.image_base64
                : undefined;
        const mimeType =
          typeof r.content_type === 'string'
            ? r.content_type
            : typeof r.mime_type === 'string'
              ? r.mime_type
              : undefined;
        if (url || base64) {
          items.push({ url, base64, mimeType });
        }
      }
    };

    fromArray(source.images);
    fromArray(source.outputs);
    fromArray(source.results);

    const image = source.image;
    if (typeof image === 'string' && image.startsWith('http')) {
      items.push({ url: image });
    } else if (image && typeof image === 'object') {
      const r = image as Record<string, unknown>;
      const url = typeof r.url === 'string' ? r.url : undefined;
      const base64 =
        typeof r.base64 === 'string'
          ? r.base64
          : typeof r.b64_json === 'string'
            ? r.b64_json
            : undefined;
      const mimeType =
        typeof r.content_type === 'string'
          ? r.content_type
          : typeof r.mime_type === 'string'
            ? r.mime_type
            : undefined;
      if (url || base64) {
        items.push({ url, base64, mimeType });
      }
    }
  }

  return items;
}

function extractFalVideoCandidates(payload: unknown): Array<{ url?: string; base64?: string; mimeType?: string }> {
  if (!payload || typeof payload !== 'object') return [];
  const obj = payload as Record<string, unknown>;
  const sources = [
    obj,
    obj.data as Record<string, unknown> | undefined,
    obj.output as Record<string, unknown> | undefined,
    obj.result as Record<string, unknown> | undefined,
    obj.response as Record<string, unknown> | undefined,
  ].filter(Boolean) as Array<Record<string, unknown>>;

  const items: Array<{ url?: string; base64?: string; mimeType?: string }> = [];
  for (const source of sources) {
    const fromArray = (arr: unknown) => {
      if (!Array.isArray(arr)) return;
      for (const row of arr) {
        if (!row || typeof row !== 'object') continue;
        const r = row as Record<string, unknown>;
        const url = typeof r.url === 'string' ? r.url : undefined;
        const base64 =
          typeof r.base64 === 'string'
            ? r.base64
            : typeof r.b64_json === 'string'
              ? r.b64_json
              : typeof r.video_base64 === 'string'
                ? r.video_base64
                : undefined;
        const mimeType =
          typeof r.content_type === 'string'
            ? r.content_type
            : typeof r.mime_type === 'string'
              ? r.mime_type
              : undefined;
        if (url || base64) {
          items.push({ url, base64, mimeType });
        }
      }
    };

    fromArray(source.videos);
    fromArray(source.outputs);
    fromArray(source.results);

    const video = source.video;
    if (typeof video === 'string' && video.startsWith('http')) {
      items.push({ url: video, mimeType: 'video/mp4' });
    } else if (video && typeof video === 'object') {
      const r = video as Record<string, unknown>;
      const url = typeof r.url === 'string' ? r.url : undefined;
      const base64 =
        typeof r.base64 === 'string'
          ? r.base64
          : typeof r.b64_json === 'string'
            ? r.b64_json
            : undefined;
      const mimeType =
        typeof r.content_type === 'string'
          ? r.content_type
          : typeof r.mime_type === 'string'
            ? r.mime_type
            : 'video/mp4';
      if (url || base64) {
        items.push({ url, base64, mimeType });
      }
    }
  }

  return items;
}

async function runFalQueue(
  apiKey: string,
  modelId: string,
  input: Record<string, unknown>,
  timeoutMs = 180_000,
): Promise<Record<string, unknown>> {
  const queueUrl = buildFalQueueUrl(modelId);
  const submitRes = await fetch(queueUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify(input),
  });

  const submitText = await submitRes.text();
  if (!submitRes.ok) {
    throw new Error(`Fal request failed (${submitRes.status}): ${submitText}`);
  }

  const submitJson = (submitText ? JSON.parse(submitText) : {}) as Record<string, unknown>;
  if (submitJson && (submitJson.images || submitJson.videos || submitJson.video || submitJson.image)) {
    return submitJson;
  }

  const requestId =
    typeof submitJson.request_id === 'string'
      ? submitJson.request_id
      : typeof submitJson.id === 'string'
        ? submitJson.id
        : '';
  const responseUrl =
    typeof submitJson.response_url === 'string'
      ? submitJson.response_url
      : requestId
        ? `${queueUrl}/requests/${requestId}`
        : '';
  const statusUrl =
    typeof submitJson.status_url === 'string'
      ? submitJson.status_url
      : requestId
        ? `${queueUrl}/requests/${requestId}/status`
        : '';

  if (!responseUrl && !statusUrl) {
    return submitJson;
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    let statusPayload: Record<string, unknown> | null = null;
    if (statusUrl) {
      const statusRes = await fetch(statusUrl, {
        headers: { Authorization: `Key ${apiKey}` },
      });
      const statusText = await statusRes.text();
      if (!statusRes.ok) {
        throw new Error(`Fal status failed (${statusRes.status}): ${statusText}`);
      }
      statusPayload = (statusText ? JSON.parse(statusText) : {}) as Record<string, unknown>;
      const statusValue = String(statusPayload.status || statusPayload.state || '').toLowerCase();
      if (statusValue.includes('fail') || statusValue.includes('error') || statusValue.includes('cancel')) {
        const err = statusPayload.error;
        throw new Error(`Fal generation failed: ${typeof err === 'string' ? err : statusValue || 'unknown error'}`);
      }
      if (
        statusPayload.response ||
        statusPayload.result ||
        statusPayload.images ||
        statusPayload.videos ||
        statusValue === 'completed' ||
        statusValue === 'succeeded' ||
        statusValue === 'done'
      ) {
        if (!responseUrl) return statusPayload;
        const responseRes = await fetch(responseUrl, {
          headers: { Authorization: `Key ${apiKey}` },
        });
        const responseText = await responseRes.text();
        if (!responseRes.ok) {
          throw new Error(`Fal response failed (${responseRes.status}): ${responseText}`);
        }
        return (responseText ? JSON.parse(responseText) : {}) as Record<string, unknown>;
      }
    } else if (responseUrl) {
      const responseRes = await fetch(responseUrl, {
        headers: { Authorization: `Key ${apiKey}` },
      });
      if (responseRes.ok) {
        const responseText = await responseRes.text();
        return (responseText ? JSON.parse(responseText) : {}) as Record<string, unknown>;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  throw new Error('Fal generation timed out.');
}

export function createMediaTools(
  getProviderApiKey: (provider: 'google' | 'openai') => string | null,
  getGoogleApiKey: () => string | null,
  getOpenAIApiKey: () => string | null,
  getFalApiKey: () => string | null,
  getOpenAIBaseUrl: () => string | undefined,
  getMediaRouting: () => MediaRoutingSettings,
  getSpecializedModels: () => SpecializedMediaModels,
  getSessionModel: () => string,
): ToolHandler[] {
  const resolveImageBackend = () => getMediaRouting().imageBackend;
  const resolveVideoBackend = () => getMediaRouting().videoBackend;

  const resolveGoogleKey = () => getGoogleApiKey() || getProviderApiKey('google');
  const resolveOpenAIKey = () => getOpenAIApiKey() || getProviderApiKey('openai');
  const resolveFalKey = () => getFalApiKey();

  const generateImageTool: ToolHandler = {
    name: 'generate_image',
    description: 'Generate an image from a prompt. Backend is selected in settings (Google/OpenAI/Fal).',
    parameters: z.object({
      prompt: z.string().describe('Prompt describing the image'),
      model: z.string().optional().describe('Image generation model id'),
      numberOfImages: z.number().optional().describe('Number of images to generate'),
      aspectRatio: z.string().optional().describe('Aspect ratio (for Google backend, e.g. 1:1, 16:9)'),
      imageSize: z.string().optional().describe('Image size (for Google backend, e.g. 1K, 2K)'),
      size: z.string().optional().describe('Image size (for OpenAI backend, e.g. 1024x1024)'),
    }),
    execute: async (args: unknown, context: ToolContext): Promise<ToolResult> => {
      const { prompt, model, numberOfImages, aspectRatio, imageSize, size } = args as {
        prompt: string;
        model?: string;
        numberOfImages?: number;
        aspectRatio?: string;
        imageSize?: string;
        size?: string;
      };

      const backend = resolveImageBackend();
      const modelId = model || getSpecializedModels().imageGeneration;

      if (backend === 'fal') {
        const apiKey = resolveFalKey();
        if (!apiKey) {
          return { success: false, error: 'Fal API key not set. Configure Fal API key in Media settings.' };
        }

        const falResult = await runFalQueue(apiKey, modelId, {
          prompt,
          num_images: numberOfImages ?? 1,
          image_size: imageSize || size,
          aspect_ratio: aspectRatio,
        });

        const outputs = extractFalImageCandidates(falResult);
        if (outputs.length === 0) {
          return {
            success: false,
            error: 'Fal returned no image outputs. Check model compatibility and inputs.',
          };
        }

        const files = [];
        for (const output of outputs.slice(0, numberOfImages ?? 1)) {
          if (output.base64) {
            const normalized = normalizeBase64Payload(output.base64, output.mimeType || 'image/png');
            const filePath = await saveGeneratedFile(
              context.appDataDir,
              context.sessionId,
              normalized.base64,
              normalized.mimeType,
              'image',
            );
            files.push({
              path: filePath,
              mimeType: normalized.mimeType,
              data: normalized.base64,
            });
          } else if (output.url) {
            files.push({
              mimeType: output.mimeType || 'image/png',
              url: output.url,
            });
          }
        }

        return {
          success: true,
          data: {
            prompt,
            backend: 'fal',
            model: modelId,
            images: files,
          },
        };
      }

      if (backend === 'openai') {
        const apiKey = resolveOpenAIKey();
        if (!apiKey) {
          return { success: false, error: 'OpenAI API key not set. Configure OpenAI key or OpenAI provider key.' };
        }

        const response = await fetch(`${normalizeOpenAIBaseUrl(getOpenAIBaseUrl())}/images/generations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: modelId,
            prompt,
            n: numberOfImages ?? 1,
            size: size || '1024x1024',
            response_format: 'b64_json',
          }),
        });

        const bodyText = await response.text();
        if (!response.ok) {
          return { success: false, error: `OpenAI image generation failed (${response.status}): ${bodyText}` };
        }

        const data = JSON.parse(bodyText) as {
          data?: Array<{ b64_json?: string; url?: string }>;
        };

        const files = [];
        for (const item of data.data || []) {
          if (item.b64_json) {
            const filePath = await saveGeneratedFile(
              context.appDataDir,
              context.sessionId,
              item.b64_json,
              'image/png',
              'image',
            );
            files.push({
              path: filePath,
              mimeType: 'image/png',
              data: item.b64_json,
            });
          } else if (item.url) {
            files.push({
              mimeType: 'image/png',
              url: item.url,
            });
          }
        }

        return {
          success: true,
          data: {
            prompt,
            backend: 'openai',
            model: modelId,
            images: files,
          },
        };
      }

      const apiKey = resolveGoogleKey();
      if (!apiKey) {
        return { success: false, error: 'Google API key not set. Configure Google key or Google provider key.' };
      }

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateImages({
        model: modelId,
        prompt,
        config: {
          numberOfImages: numberOfImages ?? 1,
          aspectRatio,
          imageSize,
        },
      });

      const images = (response.generatedImages || [])
        .map((img) => img.image)
        .filter((img): img is { imageBytes?: string; mimeType?: string } => !!img?.imageBytes)
        .slice(0, numberOfImages ?? 1);

      const files = [];
      for (const img of images) {
        const filePath = await saveGeneratedFile(
          context.appDataDir,
          context.sessionId,
          img.imageBytes || '',
          img.mimeType,
          'image',
        );
        files.push({
          path: filePath,
          mimeType: img.mimeType || 'image/png',
          data: img.imageBytes,
        });
      }

      return {
        success: true,
        data: {
          prompt,
          backend: 'google',
          model: modelId,
          images: files,
        },
      };
    },
  };

  const editImageTool: ToolHandler = {
    name: 'edit_image',
    description: 'Edit an image from a prompt. Uses same backend routing as generate_image.',
    parameters: z.object({
      prompt: z.string().describe('Prompt describing the edit'),
      image: z.string().describe('Base64 encoded image data'),
      imageMimeType: z.string().optional().describe('Image mime type'),
      model: z.string().optional().describe('Image edit model id'),
      numberOfImages: z.number().optional().describe('Number of images to generate'),
    }),
    execute: async (args: unknown, context: ToolContext): Promise<ToolResult> => {
      const { prompt, image, imageMimeType, model, numberOfImages } = args as {
        prompt: string;
        image: string;
        imageMimeType?: string;
        model?: string;
        numberOfImages?: number;
      };
      const backend = resolveImageBackend();
      const modelId = model || getSpecializedModels().imageGeneration;

      if (backend === 'fal') {
        const apiKey = resolveFalKey();
        if (!apiKey) {
          return { success: false, error: 'Fal API key not set. Configure Fal API key in Media settings.' };
        }

        const dataUrl = `data:${imageMimeType || 'image/png'};base64,${image}`;
        const falResult = await runFalQueue(apiKey, modelId, {
          prompt,
          image_url: dataUrl,
          image: dataUrl,
          image_base64: image,
          num_images: numberOfImages ?? 1,
        });

        const outputs = extractFalImageCandidates(falResult);
        if (outputs.length === 0) {
          return {
            success: false,
            error: 'Fal returned no edited image outputs. Check model compatibility and inputs.',
          };
        }

        const files = [];
        for (const output of outputs.slice(0, numberOfImages ?? 1)) {
          if (output.base64) {
            const normalized = normalizeBase64Payload(output.base64, output.mimeType || 'image/png');
            const filePath = await saveGeneratedFile(
              context.appDataDir,
              context.sessionId,
              normalized.base64,
              normalized.mimeType,
              'image-edit',
            );
            files.push({
              path: filePath,
              mimeType: normalized.mimeType,
              data: normalized.base64,
            });
          } else if (output.url) {
            files.push({
              mimeType: output.mimeType || 'image/png',
              url: output.url,
            });
          }
        }

        return {
          success: true,
          data: {
            prompt,
            backend: 'fal',
            model: modelId,
            images: files,
          },
        };
      }

      if (backend === 'openai') {
        const apiKey = resolveOpenAIKey();
        if (!apiKey) {
          return { success: false, error: 'OpenAI API key not set. Configure OpenAI key or OpenAI provider key.' };
        }

        const form = new FormData();
        form.append('model', modelId);
        form.append('prompt', prompt);
        form.append('n', String(numberOfImages ?? 1));
        form.append(
          'image',
          new Blob([Buffer.from(image, 'base64')], { type: imageMimeType || 'image/png' }),
          `edit.${getExtension(imageMimeType, 'png')}`,
        );

        const response = await fetch(`${normalizeOpenAIBaseUrl(getOpenAIBaseUrl())}/images/edits`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          body: form,
        });

        const bodyText = await response.text();
        if (!response.ok) {
          return { success: false, error: `OpenAI image edit failed (${response.status}): ${bodyText}` };
        }

        const data = JSON.parse(bodyText) as {
          data?: Array<{ b64_json?: string; url?: string }>;
        };

        const files = [];
        for (const item of data.data || []) {
          if (item.b64_json) {
            const filePath = await saveGeneratedFile(
              context.appDataDir,
              context.sessionId,
              item.b64_json,
              'image/png',
              'image-edit',
            );
            files.push({
              path: filePath,
              mimeType: 'image/png',
              data: item.b64_json,
            });
          } else if (item.url) {
            files.push({
              mimeType: 'image/png',
              url: item.url,
            });
          }
        }

        return {
          success: true,
          data: {
            prompt,
            backend: 'openai',
            model: modelId,
            images: files,
          },
        };
      }

      const apiKey = resolveGoogleKey();
      if (!apiKey) {
        return { success: false, error: 'Google API key not set. Configure Google key or Google provider key.' };
      }

      const ai = new GoogleGenAI({ apiKey });
      const reference = new RawReferenceImage();
      reference.referenceImage = {
        imageBytes: image,
        mimeType: imageMimeType || 'image/png',
      };

      const response = await ai.models.editImage({
        model: modelId,
        prompt,
        referenceImages: [reference],
        config: {
          numberOfImages: numberOfImages ?? 1,
        },
      });

      const images = (response.generatedImages || [])
        .map((img) => img.image)
        .filter((img): img is { imageBytes?: string; mimeType?: string } => !!img?.imageBytes)
        .slice(0, numberOfImages ?? 1);

      const files = [];
      for (const img of images) {
        const filePath = await saveGeneratedFile(
          context.appDataDir,
          context.sessionId,
          img.imageBytes || '',
          img.mimeType,
          'image-edit',
        );
        files.push({
          path: filePath,
          mimeType: img.mimeType || 'image/png',
          data: img.imageBytes,
        });
      }

      return {
        success: true,
        data: {
          prompt,
          backend: 'google',
          model: modelId,
          images: files,
        },
      };
    },
  };

  const generateVideoTool: ToolHandler = {
    name: 'generate_video',
    description: 'Generate a video from a prompt. Backend is selected in settings (Google/OpenAI/Fal).',
    parameters: z.object({
      prompt: z.string().describe('Prompt describing the video'),
      model: z.string().optional().describe('Video generation model id'),
      numberOfVideos: z.number().optional().describe('Number of videos'),
      durationSeconds: z.number().optional().describe('Duration of the video in seconds'),
      aspectRatio: z.string().optional().describe('Aspect ratio (e.g., 16:9)'),
      resolution: z.string().optional().describe('Resolution (e.g., 720p, 1080p)'),
    }),
    execute: async (args: unknown, context: ToolContext): Promise<ToolResult> => {
      const { prompt, model, numberOfVideos, durationSeconds, aspectRatio, resolution } = args as {
        prompt: string;
        model?: string;
        numberOfVideos?: number;
        durationSeconds?: number;
        aspectRatio?: string;
        resolution?: string;
      };

      const backend = resolveVideoBackend();
      const modelId = model || getSpecializedModels().videoGeneration;

      if (backend === 'fal') {
        const apiKey = resolveFalKey();
        if (!apiKey) {
          return { success: false, error: 'Fal API key not set. Configure Fal API key in Media settings.' };
        }

        const falResult = await runFalQueue(apiKey, modelId, {
          prompt,
          num_videos: numberOfVideos ?? 1,
          duration: durationSeconds,
          duration_seconds: durationSeconds,
          aspect_ratio: aspectRatio,
          resolution,
        });

        const outputs = extractFalVideoCandidates(falResult);
        if (outputs.length === 0) {
          return {
            success: false,
            error: 'Fal returned no video outputs. Check model compatibility and inputs.',
          };
        }

        const videos = [];
        for (const output of outputs.slice(0, numberOfVideos ?? 1)) {
          if (output.base64) {
            const normalized = normalizeBase64Payload(output.base64, output.mimeType || 'video/mp4');
            const filePath = await saveGeneratedFile(
              context.appDataDir,
              context.sessionId,
              normalized.base64,
              normalized.mimeType,
              'video',
            );
            videos.push({
              path: filePath,
              mimeType: normalized.mimeType,
            });
          } else if (output.url) {
            videos.push({
              mimeType: output.mimeType || 'video/mp4',
              url: output.url,
            });
          }
        }

        return {
          success: true,
          data: {
            prompt,
            backend: 'fal',
            model: modelId,
            videos,
          },
        };
      }

      if (backend === 'openai') {
        const apiKey = resolveOpenAIKey();
        if (!apiKey) {
          return { success: false, error: 'OpenAI API key not set. Configure OpenAI key or OpenAI provider key.' };
        }

        const response = await fetch(`${normalizeOpenAIBaseUrl(getOpenAIBaseUrl())}/videos/generations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: modelId,
            prompt,
            n: numberOfVideos ?? 1,
            duration: durationSeconds,
            aspect_ratio: aspectRatio,
            resolution,
          }),
        });

        const bodyText = await response.text();
        if (!response.ok) {
          return { success: false, error: `OpenAI video generation failed (${response.status}): ${bodyText}` };
        }

        const data = JSON.parse(bodyText) as {
          data?: Array<{ b64_json?: string; url?: string; mime_type?: string }>;
        };

        const videos = [];
        for (const item of data.data || []) {
          if (item.b64_json) {
            const mimeType = item.mime_type || 'video/mp4';
            const filePath = await saveGeneratedFile(
              context.appDataDir,
              context.sessionId,
              item.b64_json,
              mimeType,
              'video',
            );
            videos.push({
              path: filePath,
              mimeType,
            });
          } else if (item.url) {
            videos.push({
              mimeType: item.mime_type || 'video/mp4',
              url: item.url,
            });
          }
        }

        return {
          success: true,
          data: {
            prompt,
            backend: 'openai',
            model: modelId,
            videos,
          },
        };
      }

      const apiKey = resolveGoogleKey();
      if (!apiKey) {
        return { success: false, error: 'Google API key not set. Configure Google key or Google provider key.' };
      }

      const ai = new GoogleGenAI({ apiKey });
      let operation = await ai.models.generateVideos({
        model: modelId,
        source: { prompt },
        config: {
          numberOfVideos: numberOfVideos ?? 1,
          durationSeconds,
          aspectRatio,
          resolution,
        },
      });

      while (!operation.done) {
        await new Promise((resolve) => setTimeout(resolve, 10000));
        operation = await ai.operations.getVideosOperation({ operation });
      }

      const generated = operation.response?.generatedVideos || [];
      const videos = [];
      for (const video of generated) {
        if (video.video?.videoBytes) {
          const filePath = await saveGeneratedFile(
            context.appDataDir,
            context.sessionId,
            video.video.videoBytes,
            video.video.mimeType,
            'video',
          );
          videos.push({
            path: filePath,
            mimeType: video.video.mimeType || 'video/mp4',
          });
        } else if (video.video?.uri) {
          try {
            const fetchRes = await fetch(video.video.uri, {
              headers: { 'x-goog-api-key': apiKey },
            });
            if (fetchRes.ok) {
              const arrayBuffer = await fetchRes.arrayBuffer();
              const base64 = Buffer.from(arrayBuffer).toString('base64');
              const filePath = await saveGeneratedFile(
                context.appDataDir,
                context.sessionId,
                base64,
                video.video.mimeType,
                'video',
              );
              videos.push({
                path: filePath,
                mimeType: video.video.mimeType || 'video/mp4',
              });
            } else {
              videos.push({
                mimeType: video.video.mimeType || 'video/mp4',
                url: video.video.uri,
              });
            }
          } catch {
            videos.push({
              mimeType: video.video.mimeType || 'video/mp4',
              url: video.video.uri,
            });
          }
        }
      }

      return {
        success: true,
        data: {
          prompt,
          backend: 'google',
          model: modelId,
          videos,
        },
      };
    },
  };

  const analyzeVideoTool: ToolHandler = {
    name: 'analyze_video',
    description: 'Analyze a video with provider-aware multimodal understanding (base64 or local path).',
    parameters: z.object({
      prompt: z.string().describe('Question or task for the video'),
      video: z.string().optional().describe('Base64 encoded video data'),
      videoPath: z.string().optional().describe('Local path to a video file'),
      videoMimeType: z.string().optional().describe('Video mime type'),
      model: z.string().optional().describe('Video understanding model id'),
    }),
    execute: async (args: unknown): Promise<ToolResult> => {
      const { prompt, video, videoPath, videoMimeType, model } = args as {
        prompt: string;
        video?: string;
        videoPath?: string;
        videoMimeType?: string;
        model?: string;
      };

      if (!video && !videoPath) {
        return { success: false, error: 'Provide either video (base64) or videoPath.' };
      }

      let videoBase64 = video;
      let mimeType = videoMimeType || (videoPath ? getVideoMimeTypeFromPath(videoPath) : 'video/mp4');
      if (!videoBase64 && videoPath) {
        try {
          const buffer = await readFile(videoPath);
          videoBase64 = buffer.toString('base64');
        } catch (error) {
          return {
            success: false,
            error: `Failed to read videoPath "${videoPath}": ${
              error instanceof Error ? error.message : String(error)
            }`,
          };
        }
      }
      if (!videoBase64) {
        return { success: false, error: 'Unable to load video data for analysis.' };
      }

      const configuredBackend = resolveVideoBackend();
      const backend = configuredBackend === 'fal'
        ? (resolveOpenAIKey() ? 'openai' : 'google')
        : configuredBackend;
      const modelId = model || getSessionModel() || (backend === 'openai' ? 'gpt-4.1' : 'gemini-2.5-pro');

      if (backend === 'openai') {
        const apiKey = resolveOpenAIKey();
        if (!apiKey) {
          return { success: false, error: 'OpenAI API key not set. Configure OpenAI key or OpenAI provider key.' };
        }

        const endpoint = `${normalizeOpenAIBaseUrl(getOpenAIBaseUrl())}/responses`;
        const primaryRes = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: modelId,
            input: [
              {
                role: 'user',
                content: [
                  { type: 'input_text', text: prompt },
                  {
                    type: 'input_video',
                    video_url: `data:${mimeType};base64,${videoBase64}`,
                  },
                ],
              },
            ],
          }),
        });

        const primaryText = await primaryRes.text();
        if (!primaryRes.ok) {
          return {
            success: false,
            error:
              `OpenAI video analysis failed (${primaryRes.status}). ` +
              `If your model/account does not support video input, switch Video backend to Google. Details: ${primaryText}`,
          };
        }

        const parsed = JSON.parse(primaryText) as {
          output_text?: string;
          output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
        };
        const analysis =
          parsed.output_text ||
          (parsed.output || [])
            .flatMap((item) => item.content || [])
            .filter((part) => part.type === 'output_text')
            .map((part) => part.text || '')
            .join('\n')
            .trim();

        return {
          success: true,
          data: {
            analysis,
            backend: 'openai',
            model: modelId,
          },
        };
      }

      const apiKey = resolveGoogleKey();
      if (!apiKey) {
        return { success: false, error: 'Google API key not set. Configure Google key or Google provider key.' };
      }

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: modelId,
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType,
                  data: videoBase64,
                },
              },
            ],
          },
        ],
      });

      return {
        success: true,
        data: {
          analysis: response.text,
          backend: 'google',
          model: modelId,
        },
      };
    },
  };

  return [generateImageTool, editImageTool, generateVideoTool, analyzeVideoTool];
}
