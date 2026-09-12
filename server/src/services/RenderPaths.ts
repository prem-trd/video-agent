import { ProjectStorage } from "./ProjectStorage.js";

/**
 * Fixed, well-known locations for the intermediate/final render artifacts
 * a project produces (spec #8/#23 pipeline: concat -> +voice -> +music ->
 * +subtitles -> final). Each assembly tool checks for the most complete
 * stage available so add_music can skip straight to it if add_audio was
 * never called, etc.
 */
export const RenderPaths = {
  silentVideo: (projectId: string) => ProjectStorage.absolutePath(projectId, "renders/preview_silent.mp4"),
  narrationTrack: (projectId: string) => ProjectStorage.absolutePath(projectId, "assets/audio/narration-full.m4a"),
  withNarration: (projectId: string) => ProjectStorage.absolutePath(projectId, "renders/with_narration.mp4"),
  mixedAudioTrack: (projectId: string) => ProjectStorage.absolutePath(projectId, "assets/audio/final-mix.m4a"),
  withMusic: (projectId: string) => ProjectStorage.absolutePath(projectId, "renders/with_music.mp4"),
  subtitlesSrt: (projectId: string) => ProjectStorage.absolutePath(projectId, "assets/subtitles/subtitles.srt"),
  subtitlesVtt: (projectId: string) => ProjectStorage.absolutePath(projectId, "assets/subtitles/subtitles.vtt"),
  final: (projectId: string) => ProjectStorage.absolutePath(projectId, "renders/final.mp4"),
  // Thumbnails are versioned (thumbnails/thumbnail-vN.png, youtube-thumbnail-vN.png)
  // and looked up via the latest THUMBNAIL Asset row, not a fixed path -
  // see AssetService.getLatest and routes/media.ts.
};
