// Shared rules for VIDEO-mode prompts. External generators with native
// audio (Google Flow / Veo, etc.) only produce speech, SFX and music that the
// prompt itself describes - narration kept in a separate field never reaches
// them. So every videoPrompt must be a single self-contained block that
// carries the spoken line (verbatim, in quotes) and the soundscape.

/** Max narration words that fit comfortably in a clip at a child-friendly speaking pace. */
export function maxNarrationWords(durationSec: number): number {
  return Math.max(6, Math.floor(durationSec * 2));
}

export const VIDEO_PROMPT_GUIDE = `
videoPrompt RULES (the user pastes videoPrompt ALONE into the video generator - it must contain everything, including audio):
1. Start with: "Create a <N>-second <audience/videoType> animation." using the scene's exact duration.
2. Describe the speaking/featured character IN FULL using the Character Bible text verbatim (age, height, skin, hair, eyes, clothing, shoes) - never just "the girl" or "the same character", because each clip is generated independently.
3. Describe the setting (Environment Bible verbatim) and lighting in 1-2 sentences.
4. Describe the action step by step in short sentences: what appears, what the character does (waves, points, jumps), what moves.
5. SPOKEN LINE: if the scene has narration, include it VERBATIM in double quotes, attributed to a speaker with a voice description that stays identical in every scene, e.g.
   The girl waves happily and says in a bright, cheerful young girl's voice: "Hello kids! Today we're going to learn the Circle Shape!"
   If no character is on screen, use a voice-over: A warm, cheerful female narrator says: "A is for Apple."
   Never paraphrase or lengthen the narration. No emojis inside quotes.
6. AUDIO line: "Audio: <the spoken line above>, <specific sound effects, e.g. soft pop as the ball appears, gentle boing on each bounce>, <ambience>, <music, e.g. light cheerful ukulele background music at low volume>."
7. Camera: one clear move (slow zoom in, gentle orbit, static medium shot).
8. End with the style line: "<Style Bible style/rendering>, bright preschool educational animation, smooth animation, vibrant colors, no subtitles, no captions, no watermark."
   Only put text on screen if the scene teaches a single word (e.g. the word "BALL" in colorful 3D letters) - never sentences.

EXAMPLE videoPrompt:
Create a 10-second educational kids animation. A cheerful 3D Pixar-style animated girl, about 6-7 years old, around 3.5 feet tall, childlike proportions with slightly chubby cheeks, medium-tan skin, dark voluminous wavy curly brown hair, large dark eyes and a bright smile, wearing a pastel light-blue t-shirt, high-waisted blue denim jeans and brown canvas high-top sneakers with white soles. She stands in a bright modern classroom with a large green chalkboard behind her; warm sunlight streams through the windows on the right. A colorful ball pops into view beside her. The girl points at it and says in a bright, cheerful young girl's voice: "Wow! A ball is shaped like a circle! Let's bounce the ball!" The word "BALL" appears in colorful 3D letters and the ball gently bounces. Audio: the girl's spoken line, a soft pop as the ball appears, a playful boing on each bounce, light cheerful ukulele background music at low volume. Camera: slow zoom in to a medium shot. 3D cartoon, bright preschool educational animation, smooth animation, vibrant colors, no subtitles, no captions, no watermark.
`.trim();
