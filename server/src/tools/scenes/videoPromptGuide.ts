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
1. Start with: "Create a <N>-second cheerful educational <Visual style> animation." using the scene's exact duration (e.g. "Create a 10-second cheerful educational 3D cartoon animation.").
2. Describe the speaking/featured character IN FULL using the Character Bible's look (hair, eyes, clothing, shoes, species/colors) - never just "the girl" or "the same character", because each clip is generated independently.
3. Describe the setting (Environment Bible verbatim) and lighting in 1-2 sentences.
4. Describe the action step by step in short sentences: what appears, what the character does (waves, points, jumps), what moves.
5. SPOKEN LINE: if the scene has narration, include it VERBATIM in double quotes, attributed to a speaker with a voice description that stays identical in every scene, e.g.
   The teacher waves happily and says in a bright, cheerful female voice: "Hello friends! Today we're going to learn the Circle Shape!"
   If no character is on screen, use a voice-over: A warm, cheerful female narrator says: "A is for Apple."
   Never paraphrase or lengthen the narration - EXCEPT to make it pass rule 9 (swap only the offending words, e.g. "kids" -> "friends", "our bodies" -> "our eyes, nose and mouth"). No emojis inside quotes.
6. AUDIO line: "Audio: <the spoken line above>, <specific sound effects, e.g. soft pop as the ball appears, gentle boing on each bounce>, <ambience>, <music, e.g. light cheerful ukulele background music at low volume>."
7. Camera: one clear move (slow zoom in, gentle orbit, static medium shot).
8. End with the style line, which MUST restate the Visual style explicitly (if it is 3D: "3D animated Pixar-style cartoon, rendered 3D characters, soft shading, depth of field" - never flat/2D/vector words; if the Style Bible contains words that contradict the Visual style, such as "flat colors" or "simple shapes" in a 3D project, DROP them - the Visual style always wins): "<Visual style expanded>, <Style Bible rendering>, bright family-friendly educational cartoon, smooth animation, vibrant colors, no subtitles, no captions, no watermark."
   Only put text on screen if the scene teaches a single word (e.g. the word "BALL" in colorful 3D letters) - never sentences.
9. SAFETY FILTERS - these OVERRIDE the scene beat and narration (video generators reject prompts that look like they involve minors in a sensitive way - a rejected prompt is useless):
   - Never write ages, heights, weights, measurements, skin hex codes or body proportions for any character. Describe people as cartoon characters in the Visual style (e.g. "a 3D Pixar-style cartoon teacher") by look and clothing only.
   - Never use the words child, children, kid(s), toddler, baby, preschool(er), little girl/boy, minor or young in videoPrompt (the spoken narration may say "friends"; rewrite "kids" to "friends" there too).
   - Never show or mention pictures, silhouettes or figures of children - if the beat asks for one, show a big friendly cartoon face icon or the animal mascot instead.
   - Body-parts topics: show the part only on the adult presenter or an animal mascot (e.g. the presenter taps her nose), use cartoon/labelled-diagram language ("a big friendly cartoon nose icon"), and never use the words "body/bodies", "skin", "undress" or "touch" with a person - say the part's name instead (e.g. "our nose", "our ears").

EXAMPLE videoPrompt:
Create a 10-second cheerful educational 3D cartoon animation. A cheerful 3D Pixar-style cartoon teacher with dark voluminous wavy curly brown hair, large dark eyes and a bright smile, wearing a pastel light-blue t-shirt, high-waisted blue denim jeans and brown canvas high-top sneakers with white soles. She stands in a bright modern classroom with a large green chalkboard behind her; warm sunlight streams through the windows on the right. A colorful ball pops into view beside her. The teacher points at it and says in a bright, cheerful female voice: "Wow! A ball is shaped like a circle! Let's bounce the ball!" The word "BALL" appears in colorful 3D letters and the ball gently bounces. Audio: the teacher's spoken line, a soft pop as the ball appears, a playful boing on each bounce, light cheerful ukulele background music at low volume. Camera: slow zoom in to a medium shot. 3D animated Pixar-style cartoon, rendered 3D characters, soft shading, depth of field, bright family-friendly educational cartoon, smooth animation, vibrant colors, no subtitles, no captions, no watermark.
`.trim();
