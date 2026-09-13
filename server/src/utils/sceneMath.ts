// Deterministic scene count/timing math - the LLM is never asked to guess
// how many scenes a video needs or how long each one is. Given a target
// duration and a per-scene (clip or image) duration, this is pure
// arithmetic, so it scales the same way from 30 seconds to 30+ minutes.

export interface SceneTiming {
  sceneNumber: number;
  duration: number;
  startTime: number;
  endTime: number;
}

/** Number of scenes required to cover targetDurationSec at perSceneDurationSec each. */
export function computeSceneCount(targetDurationSec: number, perSceneDurationSec: number): number {
  if (perSceneDurationSec <= 0) throw new Error("perSceneDurationSec must be positive");
  return Math.max(1, Math.ceil(targetDurationSec / perSceneDurationSec));
}

/**
 * Per-scene duration/startTime/endTime summing to exactly targetDurationSec.
 * Every scene is perSceneDurationSec except the last, which absorbs the
 * remainder - unless that remainder would be under 20% of a normal scene,
 * in which case it's folded into the second-to-last scene instead of
 * leaving an oddly tiny final clip.
 */
export function computeSceneTimings(targetDurationSec: number, perSceneDurationSec: number): SceneTiming[] {
  const count = computeSceneCount(targetDurationSec, perSceneDurationSec);
  const durations = new Array(count).fill(perSceneDurationSec);
  // The last scene absorbs whatever's left after (count - 1) full-length
  // scenes - always > 0 and <= perSceneDurationSec, since count = ceil(...).
  durations[count - 1] = targetDurationSec - perSceneDurationSec * (count - 1);

  if (count > 1 && durations[count - 1] < perSceneDurationSec * 0.2) {
    const dropped = durations.pop()!;
    durations[durations.length - 1] += dropped;
  }

  const timings: SceneTiming[] = [];
  let cursor = 0;
  for (let i = 0; i < durations.length; i++) {
    const duration = Math.max(0.5, Math.round(durations[i] * 100) / 100);
    const startTime = cursor;
    const endTime = cursor + duration;
    cursor = endTime;
    timings.push({ sceneNumber: i + 1, duration, startTime, endTime });
  }
  return timings;
}
