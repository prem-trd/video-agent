import { z } from "zod";
import type { Tool } from "../types.js";
import { ollamaClient } from "../../llm/OllamaClient.js";
import { ProjectService } from "../../services/ProjectService.js";
import { SceneService } from "../../services/SceneService.js";
import { ChannelService } from "../../services/ChannelService.js";
import { BrandingService } from "../../services/BrandingService.js";
import { ProjectStorage } from "../../services/ProjectStorage.js";
import { buildCreativeContext } from "../../agent/PromptContext.js";
import { stringOrList } from "../../utils/zodHelpers.js";
import { CharacterService } from "../../services/CharacterService.js";
import type { ChatMessage } from "../../llm/types.js";

// Accepts a JSON array or a single newline/comma-less string of options.
const stringList = () => z.preprocess((v) => (typeof v === "string" ? v.split("\n").map((x) => x.trim()).filter(Boolean) : v), z.array(z.string()).min(1));

const InputSchema = z
  .object({
    guidance: z.string().optional().describe('Optional user instruction, e.g. "target Indian parents" or "make the title more exciting".'),
  })
  .strict();

const OutputSchema = z.object({
  titles: z.array(z.string()).min(1).describe("5 title options, best first."),
  descriptionBody: z.string().min(1),
  tags: z.array(z.string()).min(1),
  hashtags: z.array(z.string()).min(1),
  thumbnailTextOptions: stringList().describe("4 short thumbnail title options, best first."),
  thumbnailPrompt: z.string().min(1),
  pinnedComment: stringOrList(),
  whatsInside: z
    .array(z.string())
    .default([])
    .describe("One bullet per scene, in order, saying what that scene teaches - taken from its narration."),
  chapterTitles: z
    .array(z.object({ sceneNumber: z.number().int(), title: z.string() }))
    .default([])
    .describe("One short chapter name per scene."),
});

// YouTube limits: title 100 chars, tags 500 chars total, more than 15
// hashtags makes YouTube ignore all of them (first 3 show above the title).
const TITLE_MAX = 100;
const TAGS_MAX_CHARS = 500;
const HASHTAGS_MAX = 15;
// Words that describe the video's look rather than anything people search
// for - the model keeps producing tags like "learning with mascots".
const FILLER_TAG_WORDS = /\b(mascots?|sparkl\w*|interactive|glossy|vibrant|pixar|3d animated)\b/i;

function formatTimestamp(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function limitTags(tags: string[]): string[] {
  const out: string[] = [];
  let used = 0;
  for (const raw of tags) {
    const tag = raw.replace(/^#/, "").replace(/[<>,]/g, "").trim();
    if (!tag || out.some((t) => t.toLowerCase() === tag.toLowerCase())) continue;
    const cost = tag.length + (tag.includes(" ") ? 2 : 0) + (out.length ? 1 : 0); // quotes + comma, as YouTube counts them
    if (used + cost > TAGS_MAX_CHARS) break;
    out.push(tag);
    used += cost;
  }
  return out;
}

function normalizeHashtags(hashtags: string[]): string[] {
  const seen = new Set<string>();
  return hashtags
    .map((h) => `#${h.replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "")}`)
    .filter((h) => h.length > 1 && !seen.has(h.toLowerCase()) && seen.add(h.toLowerCase()))
    .slice(0, HASHTAGS_MAX);
}

/**
 * Writes YouTube upload metadata tuned for search and click-through: title
 * options, description (hook + keywords + chapters + CTA), tags, hashtags,
 * a thumbnail image prompt + overlay text, and a pinned comment. Chapters
 * come from the real scene timings (offset past the opening screen once a
 * render exists) and YouTube's hard limits are enforced in code, not left
 * to the model. Saved to youtube-metadata.json in the project folder.
 */
export const generateYoutubeMetadataTool: Tool<z.infer<typeof InputSchema>> = {
  name: "generate_youtube_metadata",
  description:
    "Generate SEO-optimized YouTube upload metadata for this video: 5 title options, full description with chapters, tags, hashtags, 4 thumbnail text options + a thumbnail image prompt, and a pinned comment. Call whenever the user asks for a title, description, tags, hashtags, thumbnail idea, or 'YouTube details'. Present the result to the user in full, ready to copy.",
  inputSchema: InputSchema,
  retryable: true,
  async execute(input, ctx) {
    const project = await ProjectService.get(ctx.projectId);
    const scenes = await SceneService.list(ctx.projectId);
    const channel = await ChannelService.get();
    const { introSec } = await BrandingService.readManifest(ctx.projectId);
    const context = await buildCreativeContext(ctx.projectId);

    const sceneList = scenes.map((s) => `#${s.sceneNumber}: ${s.onScreenText || s.visualDescription}${s.narration ? ` | narration: "${s.narration}"` : ""}`).join("\n");

    const messages: ChatMessage[] = [
        {
          role: "system",
          content:
            "You are a YouTube growth strategist for educational channels. Write upload metadata that maximizes search discovery and click-through, based ONLY on what is actually in this video (misleading metadata gets videos suppressed). " +
            "First decide the MAIN SEARCH KEYWORD: the phrase parents type most, usually \"<topic> for kids\" (e.g. \"body parts for kids\", \"ABC for kids\", \"numbers 1 to 10 for kids\"). " +
            "titles: 5 options, best first, each under 70 characters, in the proven format \"<the concrete items taught> <1 relevant emoji> | <main search keyword, Title Case>\" (e.g. \"Learn Head, Eyes, Nose & Mouth 👀 | Body Parts for Kids\", \"Learn ABC with Fruits 🍎 | Alphabet for Kids\"); vary the item wording and emoji, a couple may put the keyword first; exactly one emoji; no ALL CAPS words except short ones like ABC. " +
            (channel.name ? `The channel is "${channel.name}" - use this exact name for branding (e.g. "Welcome to ${channel.name}!"). ` : "") +
            "Do NOT name the video's characters/mascots in titles, descriptionBody, tags or hashtags - new viewers don't know them and nobody searches for them; say \"our friendly teacher\" if a presenter must be mentioned. " +
            "descriptionBody: first 2 lines (shown before 'more') are a hook with the main keywords naturally" +
            (channel.name ? `, welcoming viewers to ${channel.name}` : "") +
            "; then 1-2 sentences on what the video covers; then a line for parents/teachers on how to use it; then a subscribe call-to-action" +
            (channel.name ? ` for ${channel.name}` : "") +
            ". Do NOT include the scene list, chapters/timestamps or hashtags in descriptionBody - they are added separately. No keyword stuffing. " +
            "whatsInside: one short bullet per scene, in scene order, describing what that scene actually teaches, based on its NARRATION (e.g. \"Our eyes help us see colors and shapes\") - no character names, no invented content. " +
            "Never claim formats the video doesn't have (don't say song, nursery rhyme, full episode or compilation unless the scenes show it). " +
            "tags: 15-25 tags, most important first, never \"<single item> for kids\" filler like \"knees for kids\" (list the items together in ONE phrase instead), starting with the main search keyword and its close variants (e.g. body parts for kids, learn body parts, body parts names, body parts for toddlers, body parts learning), then the items taught as a phrase (head eyes nose mouth), then broad ones (kids learning video, preschool learning, educational video for kids, kindergarten learning). " +
            "EVERY tag must be a phrase real people type into YouTube search - no descriptive filler about the video's look (never things like \"learning with sparkles\", \"bright educational video\", \"3d animated learning\", \"interactive body parts\"), no misspellings, no competitor channel names. " +
            "chapterTitles: for EVERY scene, a 1-4 word chapter name with the item taught (e.g. \"Welcome\", \"Head\", \"Eyes\", \"Goodbye\"). " +
            "hashtags: 5-8, the 3 most important first (they appear above the title). " +
            "thumbnailTextOptions: 4 options, best first, each 2-4 BIG punchy words in caps naming the concrete items or the topic (e.g. \"HEAD, EYES, NOSE!\", \"LEARN BODY PARTS!\", \"ABC FUN!\"). " +
            "thumbnailPrompt: one detailed text-to-image prompt for a 16:9 YouTube thumbnail in the project's Visual style, built for clicks at small phone size: " +
            "(1) the best thumbnailTextOptions entry as a large, bold, glossy 3D title with thick white outlines in colorful rainbow bubble letters, quoted exactly, taking about a third of the frame; " +
            "(2) the presenter or mascot from the Character Bible (full look description) large, with a big excited open-mouth smile, pointing toward the title or items; " +
            "(3) only the 3-4 most important items as big glossy floating 3D icons with short colorful arrows linking them to the title or presenter - never more than 4; " +
            "(4) a simple bright background with at most 3 elements (e.g. blue sky, rainbow, soft blurred classroom) so the subject pops; " +
            "(5) style: glossy Pixar-inspired 3D render, bright saturated colors, high contrast, soft rim lighting, clean composition, no other text, no watermark, no logo. " +
            "Only the presenter/mascot may be a person - never add other people, and never mention ages, heights, children, kids, boys or girls (image generators' safety filters reject that, especially with body-related topics). " +
            "pinnedComment: a friendly question to viewers that invites comments (e.g. which part they liked). " +
            "Write in the project's language. Respond with ONLY a JSON object matching the schema.",
        },
        {
          role: "user",
          content: `${context}\n\nVideo title (working): "${project.title}"\nScenes:\n${sceneList || "(no scenes yet - use the topic)"}${input.guidance ? `\n\nUser guidance: ${input.guidance}` : ""}`,
        },
      ];
    let result = await ollamaClient.chatJSON(messages, OutputSchema);

    // Character/mascot names mean nothing to searchers - the model still
    // slips them in sometimes, so check and ask for one rewrite.
    // Match the full name and its first word ("Sunny the Squirrel" is often written just "Sunny").
    const characterNames = [
      ...new Set(
        (await CharacterService.list(ctx.projectId)).flatMap((c) => [c.name.trim(), c.name.trim().split(/\s+/)[0]]).filter((n) => n.length > 2)
      ),
    ];
    const mentionsCharacter = (text: string) => characterNames.find((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text));
    const named = mentionsCharacter([...result.titles, result.descriptionBody, ...result.whatsInside, result.thumbnailTextOptions.join(" ")].join("\n"));
    if (named) {
      result = await ollamaClient.chatJSON(
        [
          ...messages,
          { role: "assistant", content: JSON.stringify(result) },
          { role: "user", content: `You used the character name "${named}". Rewrite the whole JSON with NO character or mascot names anywhere (say "our friendly teacher" if needed). Keep everything else.` },
        ],
        OutputSchema
      );
    }
    result.tags = result.tags.filter((t) => !mentionsCharacter(t) && !FILLER_TAG_WORDS.test(t));

    // Chapters: YouTube needs the first at 0:00, at least 3, each >= 10s.
    const chapters: string[] = [];
    if (scenes.length >= 3) {
      // An opening screen shorter than 10s can't be its own chapter - fold it into the first scene's.
      const introChapter = introSec >= 10;
      if (introChapter) chapters.push(`0:00 Intro`);
      scenes.forEach((s, i) => {
        const named = result.chapterTitles.find((c) => c.sceneNumber === s.sceneNumber)?.title.trim();
        const label = (named || s.onScreenText || s.visualDescription.split(/[.;\n]/)[0]).slice(0, 50).trim();
        const start = i === 0 && !introChapter ? 0 : introSec + s.startTime;
        chapters.push(`${formatTimestamp(start)} ${label}`);
      });
    }

    const hashtags = normalizeHashtags(result.hashtags);
    const tags = limitTags(result.tags);
    const whatsInside = result.whatsInside.map((line) => line.replace(/^[-•*\s]+/, "").trim()).filter(Boolean);
    const description = [
      result.descriptionBody.trim(),
      whatsInside.length ? `📚 In this video\n${whatsInside.map((line) => `• ${line}`).join("\n")}` : "",
      chapters.length >= 3 ? `⏱ Chapters\n${chapters.join("\n")}` : "",
      hashtags.join(" "),
    ]
      .filter(Boolean)
      .join("\n\n");

    const metadata = {
      titles: result.titles.slice(0, 5).map((t) => t.trim().slice(0, TITLE_MAX)),
      description,
      tags,
      tagsCommaSeparated: tags.join(", "),
      hashtags,
      thumbnailText: result.thumbnailTextOptions[0] ?? "",
      thumbnailTextOptions: result.thumbnailTextOptions,
      thumbnailPrompt: result.thumbnailPrompt,
      pinnedComment: result.pinnedComment,
      chaptersNote: introSec > 0 || scenes.length < 3 ? "" : "Chapter times assume no opening screen - regenerate after render_timeline if the opening screen is enabled so they line up.",
      audienceNote: /kid|child|toddler|preschool/i.test(`${project.audience} ${project.topic}`)
        ? "Set 'Made for kids: Yes' when uploading - it's legally required (COPPA) for content aimed at children."
        : "",
    };

    await ProjectStorage.writeJson(ctx.projectId, "youtube-metadata.json", metadata);
    return metadata;
  },
};
