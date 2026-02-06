import { z } from 'zod';
import { join } from 'path';
import { homedir } from 'os';
import { mkdir, writeFile } from 'fs/promises';
import { GoogleGenAI, RawReferenceImage } from '@google/genai';
import type { ToolHandler, ToolContext, ToolResult } from '@gemini-cowork/core';

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

/**
 * Get the generated media directory for a session.
 * Uses appDataDir if available, otherwise falls back to ~/.cowork
 */
function getGeneratedDir(appDataDir: string | undefined, sessionId: string): string {
  const baseDir = appDataDir || join(homedir(), '.cowork');
  return join(baseDir, 'sessions', sessionId, 'generated');
}

async function saveGeneratedFile(
  appDataDir: string | undefined,
  sessionId: string,
  base64: string,
  mimeType: string | undefined,
  prefix: string
): Promise<string> {
  // Store in ~/.cowork/sessions/<session-id>/generated/
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

export function createMediaTools(
  getApiKey: () => string | null,
  getSpecializedModels: () => SpecializedMediaModels,
  getSessionModel: () => string
): ToolHandler[] {
  const generateImageTool: ToolHandler = {
    name: 'generate_image',
    description: 'Generate an image from a prompt using Gemini image generation models.',
    parameters: z.object({
      prompt: z.string().describe('Prompt describing the image'),
      model: z.string().optional().describe('Image generation model id'),
      numberOfImages: z.number().optional().describe('Number of images to generate'),
      aspectRatio: z.string().optional().describe('Aspect ratio (e.g., 1:1, 16:9)'),
      imageSize: z.string().optional().describe('Image size (e.g., 1K, 2K)'),
    }),
    execute: async (args: unknown, context: ToolContext): Promise<ToolResult> => {
      const apiKey = getApiKey();
      if (!apiKey) {
        return { success: false, error: 'API key not set. Please configure an API key first.' };
      }

      const { prompt, model, numberOfImages, aspectRatio, imageSize } = args as {
        prompt: string;
        model?: string;
        numberOfImages?: number;
        aspectRatio?: string;
        imageSize?: string;
      };

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateImages({
        model: model || getSpecializedModels().imageGeneration,
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
          'image'
        );
        files.push({
          path: filePath,
          mimeType: img.mimeType || 'image/png',
          // Include base64 data for immediate display in UI
          data: img.imageBytes,
        });
      }

      return {
        success: true,
        data: {
          prompt,
          images: files,
        },
      };
    },
  };

  const editImageTool: ToolHandler = {
    name: 'edit_image',
    description: 'Edit an image based on a prompt.',
    parameters: z.object({
      prompt: z.string().describe('Prompt describing the edit'),
      image: z.string().describe('Base64 encoded image data'),
      imageMimeType: z.string().optional().describe('Image mime type'),
      model: z.string().optional().describe('Image edit model id'),
      numberOfImages: z.number().optional().describe('Number of images to generate'),
    }),
    execute: async (args: unknown, context: ToolContext): Promise<ToolResult> => {
      const apiKey = getApiKey();
      if (!apiKey) {
        return { success: false, error: 'API key not set. Please configure an API key first.' };
      }

      const { prompt, image, imageMimeType, model, numberOfImages } = args as {
        prompt: string;
        image: string;
        imageMimeType?: string;
        model?: string;
        numberOfImages?: number;
      };

      const ai = new GoogleGenAI({ apiKey });
      const reference = new RawReferenceImage();
      reference.referenceImage = {
        imageBytes: image,
        mimeType: imageMimeType || 'image/png',
      };

      const response = await ai.models.editImage({
        model: model || getSpecializedModels().imageGeneration,
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
          'image-edit'
        );
        files.push({
          path: filePath,
          mimeType: img.mimeType || 'image/png',
          // Include base64 data for immediate display in UI
          data: img.imageBytes,
        });
      }

      return {
        success: true,
        data: {
          prompt,
          images: files,
        },
      };
    },
  };

  const generateVideoTool: ToolHandler = {
    name: 'generate_video',
    description: 'Generate a video from a prompt using Veo.',
    parameters: z.object({
      prompt: z.string().describe('Prompt describing the video'),
      model: z.string().optional().describe('Video generation model id'),
      numberOfVideos: z.number().optional().describe('Number of videos'),
      durationSeconds: z.number().optional().describe('Duration of the video in seconds'),
      aspectRatio: z.string().optional().describe('Aspect ratio (e.g., 16:9)'),
      resolution: z.string().optional().describe('Resolution (e.g., 720p, 1080p)'),
    }),
    execute: async (args: unknown, context: ToolContext): Promise<ToolResult> => {
      const apiKey = getApiKey();
      if (!apiKey) {
        return { success: false, error: 'API key not set. Please configure an API key first.' };
      }

      const { prompt, model, numberOfVideos, durationSeconds, aspectRatio, resolution } = args as {
        prompt: string;
        model?: string;
        numberOfVideos?: number;
        durationSeconds?: number;
        aspectRatio?: string;
        resolution?: string;
      };

      const ai = new GoogleGenAI({ apiKey });
      let operation = await ai.models.generateVideos({
        model: model || getSpecializedModels().videoGeneration,
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
      const files = [];
      for (const video of generated) {
        if (video.video?.videoBytes) {
          const filePath = await saveGeneratedFile(
            context.appDataDir,
            context.sessionId,
            video.video.videoBytes,
            video.video.mimeType,
            'video'
          );
          files.push({
            path: filePath,
            mimeType: video.video.mimeType || 'video/mp4',
          });
        } else if (video.video?.uri) {
          // Download video from URI to local file (URI requires API key auth)
          try {
            const response = await fetch(video.video.uri, {
              headers: { 'x-goog-api-key': apiKey },
            });
            if (response.ok) {
              const arrayBuffer = await response.arrayBuffer();
              const base64 = Buffer.from(arrayBuffer).toString('base64');
              const filePath = await saveGeneratedFile(
                context.appDataDir,
                context.sessionId,
                base64,
                video.video.mimeType,
                'video'
              );
              files.push({
                path: filePath,
                mimeType: video.video.mimeType || 'video/mp4',
              });
            } else {
              // Fallback: return URL if download fails
              files.push({
                mimeType: video.video.mimeType || 'video/mp4',
                url: video.video.uri,
              });
            }
          } catch {
            // Fallback on error
            files.push({
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
          videos: files,
        },
      };
    },
  };

  const analyzeVideoTool: ToolHandler = {
    name: 'analyze_video',
    description: 'Analyze a video with Gemini video understanding.',
    parameters: z.object({
      prompt: z.string().describe('Question or task for the video'),
      video: z.string().describe('Base64 encoded video data'),
      videoMimeType: z.string().optional().describe('Video mime type'),
      model: z.string().optional().describe('Video understanding model id'),
    }),
    execute: async (args: unknown): Promise<ToolResult> => {
      const apiKey = getApiKey();
      if (!apiKey) {
        return { success: false, error: 'API key not set. Please configure an API key first.' };
      }

      const { prompt, video, videoMimeType, model } = args as {
        prompt: string;
        video: string;
        videoMimeType?: string;
        model?: string;
      };

      const ai = new GoogleGenAI({ apiKey });
      // Use provided model or fall back to session model for video analysis
      const modelId = model || getSessionModel() || 'gemini-2.5-pro';
      const response = await ai.models.generateContent({
        model: modelId,
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: videoMimeType || 'video/mp4',
                  data: video,
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
        },
      };
    },
  };

  return [generateImageTool, editImageTool, generateVideoTool, analyzeVideoTool];
}
