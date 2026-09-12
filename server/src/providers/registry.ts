import { env } from "../utils/env.js";
import { AppError } from "../utils/errors.js";
import { mockImageProvider } from "./image/MockImageProvider.js";
import { mockVideoProvider } from "./video/MockVideoProvider.js";
import { mockTTSProvider } from "./tts/MockTTSProvider.js";
import { mockMusicProvider } from "./music/MockMusicProvider.js";
import type { ImageProvider, VideoProvider, TTSProvider, MusicProvider } from "./types.js";

// Central place that resolves "mock" | "<vendor>" from .env into a real
// provider instance (spec #17, #40). Nothing outside this file (tools,
// AgentLoop, routes) ever imports a concrete provider class directly -
// adding a real vendor in Phase 8 means writing one adapter and adding one
// case here, with zero changes anywhere else.

const imageProviders: Record<string, ImageProvider> = {
  mock: mockImageProvider,
};

const videoProviders: Record<string, VideoProvider> = {
  mock: mockVideoProvider,
};

const ttsProviders: Record<string, TTSProvider> = {
  mock: mockTTSProvider,
};

const musicProviders: Record<string, MusicProvider> = {
  mock: mockMusicProvider,
};

function resolve<T>(kind: string, name: string, table: Record<string, T>): T {
  const provider = table[name];
  if (!provider) {
    throw new AppError(
      "PROVIDER_ERROR",
      `${kind} provider "${name}" is not configured. Available: ${Object.keys(table).join(", ")}. ` +
        `Set ${kind.toUpperCase()}_PROVIDER=mock in .env for local development, or implement and register a "${name}" adapter.`,
      { retryable: false }
    );
  }
  return provider;
}

export function getImageProvider(): ImageProvider {
  return resolve("IMAGE", env.IMAGE_PROVIDER, imageProviders);
}

export function getVideoProvider(): VideoProvider {
  return resolve("VIDEO", env.VIDEO_PROVIDER, videoProviders);
}

export function getTTSProvider(): TTSProvider {
  return resolve("TTS", env.TTS_PROVIDER, ttsProviders);
}

export function getMusicProvider(): MusicProvider {
  return resolve("MUSIC", env.MUSIC_PROVIDER, musicProviders);
}

/** Summary for the UI/API to show which providers are active and whether they're mock (spec #46). */
export function getProviderSummary() {
  return {
    image: { name: env.IMAGE_PROVIDER, isMock: getImageProvider().isMock },
    video: { name: env.VIDEO_PROVIDER, isMock: getVideoProvider().isMock },
    tts: { name: env.TTS_PROVIDER, isMock: getTTSProvider().isMock },
    music: { name: env.MUSIC_PROVIDER, isMock: getMusicProvider().isMock },
  };
}
