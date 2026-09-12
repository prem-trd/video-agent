import type { AspectRatio } from "../types/project.js";

// Media-provider abstraction (spec #17): the agent/tools only ever talk to
// these interfaces. Swapping a mock for a real vendor (Phase 8) means
// writing one new adapter file and registering it - AgentLoop, tools, and
// everything upstream of the provider registry never change.

export type GenerationStatus = "queued" | "processing" | "completed" | "failed";

export interface ImageGenerationInput {
  prompt: string;
  aspectRatio: AspectRatio;
  resolution: string;
}

export interface ImageGenerationResult {
  status: GenerationStatus;
  filePath: string;
  provider: string;
  isMock: boolean;
  jobId?: string;
}

export interface ImageProvider {
  readonly name: string;
  readonly isMock: boolean;
  generateImage(input: ImageGenerationInput, outputPath: string): Promise<ImageGenerationResult>;
  getStatus(jobId: string): Promise<GenerationStatus>;
  cancel(jobId: string): Promise<void>;
}

export interface VideoGenerationInput {
  prompt: string;
  duration: number;
  aspectRatio: AspectRatio;
  resolution: string;
  /** Optional still frame (e.g. from generate_image) to animate from, if the provider supports image-to-video. */
  sourceImagePath?: string;
}

export interface VideoGenerationResult {
  status: GenerationStatus;
  filePath: string;
  duration: number;
  provider: string;
  isMock: boolean;
  jobId?: string;
}

export interface VideoProvider {
  readonly name: string;
  readonly isMock: boolean;
  generateVideo(input: VideoGenerationInput, outputPath: string): Promise<VideoGenerationResult>;
  getStatus(jobId: string): Promise<GenerationStatus>;
  cancel(jobId: string): Promise<void>;
}

export interface TTSGenerationInput {
  text: string;
  language: string;
  voice: string;
  speed?: number;
  pitch?: number;
}

export interface TTSGenerationResult {
  status: GenerationStatus;
  filePath: string;
  durationSec: number;
  provider: string;
  isMock: boolean;
  voice: string;
  language: string;
}

export interface TTSProvider {
  readonly name: string;
  readonly isMock: boolean;
  generateVoice(input: TTSGenerationInput, outputPath: string): Promise<TTSGenerationResult>;
}

export interface MusicGenerationInput {
  prompt?: string;
  mood?: string;
  durationSec: number;
}

export interface MusicGenerationResult {
  status: GenerationStatus;
  filePath: string;
  durationSec: number;
  provider: string;
  isMock: boolean;
}

export interface MusicProvider {
  readonly name: string;
  readonly isMock: boolean;
  generateMusic(input: MusicGenerationInput, outputPath: string): Promise<MusicGenerationResult>;
}
