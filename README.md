# AI Video Studio

A **conversational AI video prompt & media assembly studio**, built around a
real tool-calling agent loop backed by **Ollama Cloud / gpt-oss:120b** — not
a scripted demo and not a UI mockup. The agent never generates images,
video, narration, or music itself — there is no such API and no such
capability. Instead it (1) writes continuity-consistent, production-ready
**prompts** for however many scenes a target duration requires (30 seconds
through 30+ minutes, video or image mode, any clip/image length), which you
take to your own external AI image/video generator, and (2) helps you
upload the resulting files, match them to scenes conversationally, and
assemble them into a final MP4 locally with FFmpeg — mixing in any narration/
music you also upload, with no TTS or music-generation API involved. Every
capability described below has been exercised against the live model and
verified by inspecting the actual database rows and files it produced.

> **Build status**: The full pivot from the original "agent fabricates mock
> media" prototype to this prompt-generation + upload/assembly workflow is
> complete and live-tested (see [Progress](#progress) below). A single chat
> message can take a project from a topic to a full set of continuity-aware
> scene prompts; after externally generating and uploading the media, a
> second message (or the "Assemble Video" button) matches uploads to scenes,
> normalizes mixed image/video sources without stretching, and produces a
> real, validated, playable final MP4 — with or without narration/music/
> subtitles, all of which are optional. The multi-pane Studio UI (left
> project sidebar, center chat, right Prompts/Upload & Assemble/Final Render
> tabs, bottom agent activity feed) is wired to the live backend, and
> progress streams to the browser in real time over Server-Sent Events.

---

## Table of contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Ollama Cloud setup](#ollama-cloud-setup)
- [FFmpeg installation](#ffmpeg-installation)
- [Environment variables](#environment-variables)
- [Database setup](#database-setup)
- [Development commands](#development-commands)
- [Production build](#production-build)
- [Trying it out](#trying-it-out)
- [Project structure](#project-structure)
- [Agent architecture](#agent-architecture)
- [Tool reference](#tool-reference)
- [API reference](#api-reference)
- [Troubleshooting](#troubleshooting)
- [Progress](#progress)

---

## Requirements

- **Node.js 20+** (developed on 24)
- **macOS** with **Homebrew** (for FFmpeg with `drawtext`/subtitle support)
- An **Ollama Cloud** account and API key
- No image/video/TTS/music generation API keys are required or used —
  Ollama Cloud is the only external service this app talks to. Actual media
  generation happens externally, in whatever AI image/video tool you
  already use; this app writes the prompts and assembles what you upload.

## Installation

Full setup on a machine that has nothing yet - copy/paste in order:

```bash
# 0. Prerequisites: Node 20+ and Homebrew must already be installed.

# 1. Get the code onto the machine (however you're moving it - git clone,
#    zip, drag-and-drop folder copy - then cd into the repo root).
cd ai-video-studio

# 2. Install FFmpeg with drawtext/subtitle support (plain `ffmpeg` lacks it).
brew install ffmpeg-full

# 3. Install all dependencies (npm workspaces: installs client + server
#    together and generates the Prisma client via postinstall).
npm install

# 4. Create the env file and the two symlinks that keep server/client
#    reading the SAME .env (not committed to git - see .gitignore).
cp .env.example .env
ln -sf ../.env server/.env
ln -sf ../.env client/.env

# 5. Edit .env: set OLLAMA_API_KEY (see "Ollama Cloud setup" below).
#    FFMPEG_PATH/FFPROBE_PATH already default to the ffmpeg-full path from
#    step 2 - only change them if yours differs.

# 6. Create the SQLite database and apply migrations.
cd server && npx prisma migrate dev && cd ..

# 7. Run it.
npm run dev
```

Then open **http://localhost:5173**.

This is an **npm workspaces** monorepo: `npm install` at the root installs
`client/` and `server/` together. Steps 4-6 are one-time setup - after
that, `npm run dev` from the repo root is all you need.

## Ollama Cloud setup

1. Create an account at [ollama.com](https://ollama.com) and go to **Settings
   → API Keys** to generate a key.
2. Copy the example env file and fill in your key:
   ```bash
   cp .env.example .env
   ```
   Set:
   ```
   OLLAMA_API_KEY=your-key-here
   OLLAMA_BASE_URL=https://ollama.com/v1
   OLLAMA_MODEL=gpt-oss:120b-cloud
   ```
   The model id that actually resolves on Ollama Cloud is
   **`gpt-oss:120b-cloud`** (not `gpt-oss:120b`) — this is what `.env.example`
   ships with. If your account exposes a different tag, adjust accordingly.
3. `OLLAMA_API_KEY` is read **only** by the Node server
   ([server/src/llm/OllamaClient.ts](server/src/llm/OllamaClient.ts)) and is
   never sent to the browser.
4. Verify connectivity once the dev server is running:
   ```bash
   curl -X POST http://localhost:4000/api/health/ollama
   ```
   `{"ok":true,...}` confirms the full chain (Node → OllamaClient → Ollama
   Cloud → the model) is working.

## FFmpeg installation

The mock media providers and the assembly pipeline need FFmpeg's `drawtext`
filter (placeholder text overlays) and `libass` (subtitle burn-in), which
**Homebrew's plain `ffmpeg` formula does not include**. Install the full
build instead:

```bash
brew install ffmpeg-full
```

`ffmpeg-full` is keg-only (it won't override a plain `ffmpeg` already on your
PATH), so point the app at it explicitly in `.env`:

```
FFMPEG_PATH=/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg
FFPROBE_PATH=/opt/homebrew/opt/ffmpeg-full/bin/ffprobe
```

(`.env.example` already has these paths set.) If you already have an
`ffmpeg`/`ffprobe` on PATH with `drawtext` support, `FFMPEG_PATH=ffmpeg` /
`FFPROBE_PATH=ffprobe` works too — verify with:

```bash
ffmpeg -filters | grep drawtext
```

## Environment variables

All configuration lives in one `.env` file at the **repo root**
(`server/.env` and `client/.env` are symlinks to it, so there's a single
source of truth). See [.env.example](.env.example) for the full annotated
list. Key groups:

| Group | Variables |
|---|---|
| Ollama Cloud | `OLLAMA_API_KEY`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL` (the only external service this app calls) |
| FFmpeg | `FFMPEG_PATH`, `FFPROBE_PATH` |
| Storage | `PROJECT_STORAGE_PATH` (resolved relative to `server/`'s cwd, so `../video-projects` points at the repo-root `video-projects/`) |
| Agent | `MAX_AGENT_ITERATIONS`, `MAX_TOOL_RETRIES`, `TOOL_TIMEOUT_MS`, `LLM_TIMEOUT_MS` |
| Database | `DATABASE_URL` |
| Server | `PORT`, `NODE_ENV`, `LOG_LEVEL` |

Never commit `.env` — it's gitignored. Secrets never touch the database or
the client bundle.

## Database setup

SQLite via Prisma. The first `npm install` already generates the Prisma
client; to (re)create the database and apply migrations:

```bash
cd server
npx prisma migrate dev
```

This creates `server/data/dev.db`. To inspect it visually:

```bash
cd server
npx prisma studio
```

## Development commands

From the repo root:

```bash
npm run dev          # runs client (Vite, :5173) and server (tsx watch, :4000) together
npm run dev:server    # server only
npm run dev:client    # client only
npm run typecheck     # tsc --noEmit for both workspaces
npm run test          # server test suite (vitest)
npm run build          # production build for both workspaces
```

Open **http://localhost:5173**.

## Production build

```bash
npm run build
cd server && npm start   # serves the built API on $PORT
```

(A production static-file serve of the built client, and a combined
single-process deploy, will be finalized in a later phase alongside the full
Studio UI.)

## Trying it out

**Via the UI**: `npm run dev`, open http://localhost:5173, click **+ New
Project**, describe what you want in "Describe it" (or fill in the basics
yourself), and let the agent write the prompts. The right panel has three
tabs: **Prompts** (the configuration form plus the generated scene list),
**Upload & Assemble** (drag-and-drop your externally-generated clips/images,
match them to scenes, upload optional narration/music), and **Final Render**
(preview, stats, download). The bottom panel shows live agent activity over
Server-Sent Events.

**Via the API directly** — the same walkthrough, useful for scripting or
debugging:

```bash
# 1. Create a project
curl -s -X POST http://localhost:4000/api/projects \
  -H "Content-Type: application/json" \
  -d '{"title":"ABC with Farm Animals","topic":"Teach the alphabet using farm animals","duration":300,"mediaType":"VIDEO","clipDurationSec":10,"style":"3D Cartoon","audience":"Preschool","aspectRatio":"16:9"}'
# -> {"id": "...", ...}  (300s / 10s clips -> 30 scenes, computed deterministically)

# 2. Generate the full prompt package (plan -> story structure -> per-scene prompts)
curl -s -X POST http://localhost:4000/api/projects/<id>/generate-prompts

# 3. Inspect the generated scenes/prompts
curl -s http://localhost:4000/api/projects/<id>/scenes | python3 -m json.tool

# 4. Generate the 30 clips externally (your own AI video tool) named e.g.
#    scene-01.mp4 .. scene-30.mp4, then upload them:
curl -s -X POST http://localhost:4000/api/projects/<id>/upload \
  -F "files=@scene-01.mp4;type=video/mp4" -F "files=@scene-02.mp4;type=video/mp4" # ... etc

# 5. Assemble (skips narration/music/subtitles automatically if none were uploaded)
curl -s -X POST http://localhost:4000/api/projects/<id>/assemble

# 6. Make a targeted revision via chat
curl -s -X POST http://localhost:4000/api/projects/<id>/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Replace scene 8, and move scene 15 before scene 12."}'

# 7. Inspect the result
curl -s http://localhost:4000/api/projects/<id>/renders/latest | python3 -m json.tool
```

Uploaded files land in `video-projects/<id>/assets/uploads/{images,videos}/`
and `assets/audio/`; the final render is
`video-projects/<id>/renders/final.mp4` (or an earlier stage if narration/
music/subtitles were skipped).

## Project structure

```
ai-video-studio/
├── client/                       React + Vite + TypeScript frontend
│   └── src/features/             chat/ projects/ promptgen/ scenes/ assemble/ render/ activity/
├── server/
│   ├── src/
│   │   ├── agent/                AgentLoop, VideoAgent, AgentMemory, TaskManager, AgentLogger, ToolExecutor
│   │   ├── llm/                  OllamaClient (the only file that talks to Ollama Cloud, and the only external AI service used)
│   │   ├── tools/                every agent tool, grouped: planning/ script/ scenes/ media/ audio/ validation/
│   │   ├── media/ffmpeg/         FFmpegService - the only place ffmpeg/ffprobe are invoked (probe, normalize, image-to-video, concat, mux, subtitles)
│   │   ├── services/             ProjectService, SceneService, PromptVersionService, CharacterService, EnvironmentService, MediaUploadService, TimelineService, AssetService, ProjectStorage
│   │   ├── database/             Prisma client
│   │   ├── routes/                Express routes (projects, chat, scenes, upload, timeline, media, assets, agent, events)
│   │   ├── types/                shared domain types + zod schemas (single source of truth)
│   │   └── utils/                env, logger, errors, path safety, zod helpers, deterministic scene-count math
│   ├── prisma/                   schema + migrations
│   └── tests/                    vitest unit + real-ffmpeg integration tests
├── video-projects/               per-project generated files (gitignored) - see layout below
├── .env.example
└── package.json                  npm workspaces root
```

Each project gets its own directory under `video-projects/`:

```
video-projects/<projectId>/
    project.json
    script/story-structure.json
    scenes/scenes.json
    characters/character-bible.json
    characters/environment-bible.json
    style-bible.json
    assets/
        uploads/{images,videos}/   externally-generated media the user uploaded
        audio/                     uploaded narration/music tracks
        subtitles/                 generated or uploaded .srt/.vtt
    renders/           preview_silent.mp4, with_narration.mp4, with_music.mp4, final.mp4
    thumbnails/        thumbnail-vN.png
    logs/
```

The SQLite database holds the queryable metadata (projects, scenes/prompts,
prompt versions, character/environment bibles, uploaded media, the assembly
timeline, audio tracks, renders, agent tasks/logs, chat history); the
filesystem holds the actual uploaded files and rendered media. Every
filesystem path a tool touches is resolved through
[server/src/utils/paths.ts](server/src/utils/paths.ts), which rejects
anything that would escape `PROJECT_STORAGE_PATH` (path traversal, absolute
escapes, etc) — the LLM never gets raw filesystem or shell access, and
uploads never write outside the project's own directory.

## Agent architecture

```
Browser (React)
   │  fetch("/api/projects/:id/chat", { message })
   ▼
Express route (routes/chat.ts)
   ▼
VideoAgent.handleChatMessage()          - agent/VideoAgent.ts
   │  loads project context (AgentMemory), appends the user turn
   ▼
AgentLoop.run()                          - agent/AgentLoop.ts
   │
   │  while (iterations < MAX_AGENT_ITERATIONS):
   │    response = OllamaClient.chat(messages, tools)
   │    if response has tool_calls:
   │        for each call: ToolExecutor.execute(call)   (validates input,
   │            runs with a timeout, retries transient failures, NEVER
   │            throws - always returns a structured ToolResult)
   │        append each tool result to the conversation; continue
   │    else:
   │        return the model's final answer  →  COMPLETED
   │
   ▼
Tool implementations (tools/*)  →  Services (services/*)  →  Prisma DB +
   filesystem (ProjectStorage, uploaded media)  →  FFmpegService
   (media/ffmpeg/*) for anything that touches pixels/audio
```

The model **never** generates an entire project in one response — each
LLM round-trip is one reasoning step plus (optionally) one batch of tool
calls, matching the "analyze → plan → tool → result → reason → next tool →
complete" loop this app is built around. Live-verified for both halves of
the workflow: a `generate-prompts` run for a 6-scene, 60-second video took 5
real LLM round-trips (`read_project` → `create_prompt_plan` →
`create_story_structure` → `generate_scene_prompts` → `read_project`), and
an `assemble` run correctly stopped mid-pipeline to ask the user how to
resolve an ambiguously-named upload rather than guessing, then finished the
full render → narration → music → subtitles → validate chain in one
follow-up turn once confirmed.

**Cancellation**: `VideoAgent` keeps an `AbortController` per in-flight
project turn; `POST /api/projects/:id/cancel` aborts it, and `AgentLoop`
checks the signal between iterations and between tool calls.

**Real-time progress** (spec #31): [server/src/agent/AgentEvents.ts](server/src/agent/AgentEvents.ts)
is a tiny per-project pub/sub. `AgentLoop` calls `onToolStart`/`onToolResult`
callbacks and `VideoAgent` publishes `agent_started`, `agent_state_changed`,
`tool_called`, `tool_completed`, `error` and `project_completed` events to
it; `GET /api/projects/:id/events` is a Server-Sent Events stream that
pushes them to the browser the moment they happen. The client's
`useAgentEvents` hook (a thin wrapper over the browser's native
`EventSource`, which reconnects automatically) drives both the "is the
agent working" state and a DB-backed refresh (`GET /status`, `/scenes`,
`/assets`) - so the UI updates live without polling on a timer. Live-tested
with `curl -N` against a real chat turn: the exact expected event sequence
arrived in order (`agent_started` → `agent_state_changed(ANALYZING)` →
`tool_called` → `tool_completed` → `agent_state_changed(IDLE)` →
`project_completed`).

**Error handling**: every layer (LLM, tool, ffmpeg, upload, filesystem,
database) throws a typed `AppError` with `{ code, message, retryable,
details }` ([server/src/utils/errors.ts](server/src/utils/errors.ts)).
`ToolExecutor` catches these and always returns a structured
`{ success, data | error }` result to the model — a failing tool is fed
back as data the model can reason about and recover from, never an
uncaught exception that kills the turn.

**A real bug class found and fixed during live testing**: gpt-oss:120b
sometimes fills in *every* schema property rather than omitting unused
optional ones (sending `""` for an optional enum/number field) and is
inconsistent about enum casing (`"video"` vs `"VIDEO"`). Plain
`z.string().optional()` tolerates `""` fine, but `z.number().optional()`
and `z.enum().optional()` do not. Fixed generally via
[server/src/utils/zodHelpers.ts](server/src/utils/zodHelpers.ts)
(`looseOptional`, `caseInsensitiveEnum`), applied across every tool schema,
with regression tests locking in the exact failures observed live
([server/tests/looseOptional.test.ts](server/tests/looseOptional.test.ts)).

## Tool reference

Tools registered — see [server/src/tools/index.ts](server/src/tools/index.ts)
for the live list:

**Prompt generation**

| Tool | Purpose |
|---|---|
| `read_project` | Inspect current config, scenes/prompts, bibles, media library, timeline, latest render |
| `update_project` | Change config fields (duration, mediaType, clip/imageDurationSec, aspectRatio, style, audience, ...) |
| `analyze_request` | Extract structured config (incl. mediaType/duration/clip-or-image-duration) from a freeform request |
| `create_prompt_plan` | Objective + **Style Bible** + deterministically-computed scene count (`targetDuration / clipOrImageDuration`) |
| `update_style_bible` | Edit the Style Bible directly |
| `update_character_bible` / `update_environment_bible` | Create/edit a **Character** or **Environment Bible** entry |
| `create_story_structure` | Per-scene beat/summary (+ narration if required) + recurring characters/environments + story context, in internal batches |
| `generate_scene_prompts` | Batch-fill every scene's final image/video prompt, branching on mediaType, in internal batches |
| `regenerate_scene_prompt` | Regenerate one scene's prompt (writes a new **PromptVersion**) |
| `update_scene` | Direct field edit on one scene (also versions the prompt fields) |
| `add_scenes` / `remove_scene` / `move_scene` | Extend, remove, or reorder scenes ("add 5 more scenes", "generate another 2 minutes") |

**Upload & assembly** (media is always user-uploaded, never generated by this app)

| Tool | Purpose |
|---|---|
| `list_media` / `inspect_media` | Check what's been uploaded and its probed technical details |
| `match_media_to_scene` | Auto-match unassigned uploads to scenes by filename; returns ambiguous ones to ask the user about |
| `assign_media_to_scene` / `replace_media` / `remove_media` / `reorder_media` | Place, swap, drop, or reorder timeline items |
| `set_image_duration` | Set one or every image's display duration |
| `set_audio_track` | Adjust the uploaded narration/music track's volume/fades, or remove it from assembly |
| `build_timeline` | Recompute ordering/timing across the whole timeline |
| `render_timeline` | Normalize every item (image→video, fit/crop/blur, trim) and concatenate into one silent video |
| `add_narration` / `add_music` | Mux the uploaded narration/music track in (each a no-op to skip if nothing was uploaded) |
| `generate_subtitles` / `add_subtitles` | Write SRT/VTT from scene narration/on-screen text, then burn in or soft-mux them |
| `create_thumbnail` | Extract a frame from the best-available render as a versioned thumbnail |
| `validate_video` | ffprobe-based validation of the final render; records a **Render** row; audio is only required if a track was actually uploaded |

No tool ever calls an image/video/TTS/music generation API - there isn't
one. `generate_scene_prompts`/`create_story_structure` process scenes in
internal batches of ~10-12 so a 100+ scene (30+ minute) project is still
one tool call/one agent iteration, not one-per-scene.

Versioning: `PromptVersion` snapshots a scene's prompt fields before every
overwrite (batch generation, regenerate, or a direct edit), the same way
`Asset` already versions internally-produced thumbnails - nothing is ever
silently lost, and a version can be restored
(`POST /scenes/:id/prompt-versions/:versionId/activate`). `TimelineItem`
rows are soft-deleted (`active: false`) on remove/replace, so uploaded
media history is preserved too.

The assembly pipeline (`render_timeline` → `add_narration` → `add_music` →
`generate_subtitles` → `add_subtitles` → `validate_video`) writes to fixed,
well-known paths under `renders/` (see
[server/src/services/RenderPaths.ts](server/src/services/RenderPaths.ts))
so each stage can find the most complete render available; every step
except `render_timeline`/`validate_video` is optional and skipped cleanly
when nothing applies (no narration/music uploaded, no on-screen text for
subtitles).

## API reference

Implemented so far:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Basic liveness check |
| POST | `/api/health/ollama` | Verifies the full Ollama Cloud round-trip |
| POST | `/api/projects` | Create a project |
| GET | `/api/projects` | List projects |
| GET | `/api/projects/:id` | Get one project |
| PATCH | `/api/projects/:id` | Direct config edit (no LLM involved) - what the Prompt Generator form uses |
| DELETE | `/api/projects/:id` | Delete a project (DB rows + files) |
| POST | `/api/projects/:id/chat` | Send a chat turn to the agent |
| GET | `/api/projects/:id/chat` | Get chat history |
| POST | `/api/projects/:id/generate-prompts` | Canned instruction: run the prompt-generation pipeline from its current state |
| POST | `/api/projects/:id/assemble` | Canned instruction: match uploads, render, mux audio, subtitles, validate |
| POST | `/api/projects/:id/cancel` | Cancel the in-flight turn |
| GET | `/api/projects/:id/status` | Agent state + recent logs/tasks |
| GET | `/api/projects/:id/renders/latest` | Latest assembly result (duration/resolution/aspect ratio/item count/size/validation) |
| GET | `/api/projects/:id/scenes` | List scenes/prompts |
| POST | `/api/projects/:id/scenes` | Add scene(s) directly |
| PATCH | `/api/projects/:id/scenes/:sceneId` | Direct field edit on a scene |
| DELETE | `/api/projects/:id/scenes/:sceneId` | Remove a scene directly |
| POST | `/api/projects/:id/scenes/:sceneId/move` | Reorder a scene directly |
| POST | `/api/projects/:id/scenes/:sceneId/regenerate` | Regenerate one scene's prompt directly |
| GET | `/api/projects/:id/scenes/:sceneId/prompt-versions` | List a scene's prompt version history |
| POST | `/api/projects/:id/scenes/:sceneId/prompt-versions/:versionId/activate` | Restore a prior prompt version |
| GET | `/api/projects/:id/assets` | List internal artifacts (subtitles/thumbnails), optionally filtered by `type` |
| GET | `/api/projects/:id/media` | List the uploaded media library |
| POST | `/api/projects/:id/upload` | Upload one or more image/video files (multipart `files`) |
| GET | `/api/projects/:id/audio-tracks` | Currently active narration/music tracks |
| POST | `/api/projects/:id/upload-audio` | Upload a narration or music file (multipart `file`, body `kind`) |
| POST | `/api/projects/:id/upload-subtitles` | Upload a ready-made `.srt` directly |
| GET | `/api/projects/:id/timeline` | List the ordered assembly timeline |
| POST | `/api/projects/:id/timeline/assign` | Assign an uploaded file to a scene (or append unassigned) |
| POST | `/api/projects/:id/timeline/:itemId/replace` | Swap which file backs a timeline slot |
| POST | `/api/projects/:id/timeline/:itemId/reorder` | Move a timeline item before/after another |
| PATCH | `/api/projects/:id/timeline/:itemId` | Set display duration / fit mode / trim |
| DELETE | `/api/projects/:id/timeline/:itemId` | Remove a timeline item (soft delete) |
| GET | `/api/projects/:id/video` | Streams the best-available render (final, else the most complete intermediate stage); supports HTTP Range requests |
| GET | `/api/projects/:id/thumbnail` | Streams the thumbnail image |
| GET | `/api/projects/:id/files/*` | Safety-scoped access to any file inside the project's storage directory |
| GET | `/api/projects/:id/events` | Server-Sent Events stream of live agent activity (`agent_started`, `agent_state_changed`, `tool_called`, `tool_completed`, `error`, `project_completed`) |

## Troubleshooting

**`OLLAMA_API_KEY is not set`** — copy `.env.example` to `.env` and fill in
your key; restart the dev server (`tsx watch` doesn't reload on `.env`
changes, only on `src/` changes).

**`ffmpeg failed ... Unknown filter 'drawtext'` or `Input format lavfi is not
available`** — you're pointed at a plain `ffmpeg` build without
freetype/fontconfig. Install `brew install ffmpeg-full` and set
`FFMPEG_PATH`/`FFPROBE_PATH` as shown above.

**A tool call fails validation with a confusing enum/empty-string error** —
should not happen anymore (see the bug class note above); if you hit a new
instance of it, the fix is `looseOptional`/`caseInsensitiveEnum` in
`server/src/utils/zodHelpers.ts` applied to the offending field.

**`Cannot find module '@esbuild/darwin-arm64'` or similar after `npm
install`** — an npm optional-dependency resolution flake we hit a couple of
times during development. Fix: `rm -rf node_modules package-lock.json
client/node_modules server/node_modules && npm install`.

**An uploaded clip didn't auto-match its scene** — filename matching (spec:
`scene-01.mp4`, `scene_01.mp4`, `01.mp4`, `01-scene.mp4`) only auto-assigns
on a high-confidence match; anything else (e.g. `cow_final.mp4`) is left
for `match_media_to_scene`/the Upload & Assemble tab's "Assign to scene"
dropdown to resolve deliberately rather than guessing wrong.

**"Exceeded max iterations (N)" on a very long/many-scene request** —
`generate_scene_prompts`/`create_story_structure` already process scenes in
internal batches of ~10-12 (one tool call regardless of scene count), so
this should be rare; if it still happens on an unusually long request,
`MAX_AGENT_ITERATIONS` can be raised in `.env`, or the request split into a
smaller initial duration plus a follow-up `add_scenes` call.

**Prisma can't find `DATABASE_URL`** — `server/.env` and `client/.env` are
symlinks to the root `.env`; if you deleted them, recreate with
`ln -sf ../.env server/.env` (and the same for `client/`).

## Progress

Phases 1–9 built and validated the original prototype, which had the agent
*generate* mock media itself via provider interfaces. Phase 10 replaced
that workflow entirely with the prompt-generation + upload/assembly studio
described throughout this README - the provider interfaces, mock adapters,
and generation tools mentioned in Phases 4/5/6/7/9 below no longer exist in
the codebase; they're kept here as an accurate history of how the app got
to its current architecture.

- [x] **Phase 1** — Project scaffold; React/Node/TypeScript/SQLite/FFmpeg set
      up; live-verified React → Node → `OllamaClient` → Ollama Cloud →
      gpt-oss:120b-cloud (chat, streaming, and tool-calling all confirmed
      against the real API).
- [x] **Phase 2** — Agent engine: `AgentLoop`, `ToolExecutor`, tool
      registry, `AgentMemory`, `TaskManager`/`AgentLogger` persistence,
      structured error handling, cancellation. Live-verified end-to-end
      with `read_project`/`update_project`.
- [x] **Phase 3** — Video Planner, Script Generator, Scene Planner,
      Character Bible, Style Bible. Live-verified: full plan→script→scenes
      pipeline against gpt-oss:120b, plus targeted single-scene/character
      revisions. Found and fixed real bugs (character schema validation,
      silent field-loss on `update_scene`, scene-lookup-by-number
      ergonomics).
- [x] **Phase 4** — Mock Image/Video/TTS/Music providers backed by a real
      `FFmpegService`; `generate_image`/`generate_video`/`generate_voice`/
      `generate_music`/`list_assets` tools with caching and versioning.
      Live-verified: full pipeline from a single natural-language request
      produced 3 real watermarked mock video clips, 3 narration clips and
      1 music track, all correctly probed, linked and persisted. Found and
      fixed a real bug class (empty-string/case-insensitive tool-argument
      handling).
- [x] **Phase 5** — FFmpeg assembly pipeline: `merge_videos`, `add_audio`,
      `add_music`, `generate_subtitles`, `add_subtitles`, `create_thumbnail`,
      `validate_video`. Added `FFmpegService.concatenateAudios` and rewrote
      `addAudio` to pad the shorter of video/audio to match instead of
      truncating. Live-verified: a single chat message took a fresh project
      through the **entire** pipeline (plan → script → scenes → 3 videos →
      3 narrations → music → merge → mux narration → mix music →
      subtitles → validate) in one 50-second, 16-tool-call run with zero
      failures, producing a real playable 1920×1080 H.264/AAC MP4 with soft
      subtitles that `validate_video` confirmed as valid. Found and fixed a
      cosmetic bug (smart quotes/dashes rendering as tofu boxes in
      placeholder text) and a subtitle-timing rounding-carry edge case.
- [x] **Phase 6** — Full React Video Studio UI: left project sidebar
      (create/select/delete, "Create from prompt" or structured form),
      center chat panel (markdown-lite rendering, suggestion chips,
      Enter-to-send, cancel button), right panel (video player with Range
      support, project/Style Bible info, per-scene status + regenerate
      buttons), bottom live agent-activity feed. Added the API routes the
      UI needed: `GET/PATCH /scenes`, `POST /scenes/:id/regenerate`,
      `GET /assets`, `GET /video` + `/thumbnail` + safety-scoped `/files/*`,
      `POST /generate`. Live-verified every new endpoint, including HTTP
      Range requests (206 Partial Content) needed for video scrubbing, and
      the full pipeline via the exact `/generate` endpoint the UI's button
      calls (21/21 tool calls succeeded, real validated MP4 produced).
      Found and fixed a real design gap: the scene "regenerate" endpoint
      was hitting the generation cache and silently returning the
      **same** asset instead of a new version - added a `force` flag
      (skips the cache) to `generate_video`/`generate_image`/
      `generate_voice`, wired the regenerate route to always pass it, and
      confirmed live that regenerating now correctly produces v2 alongside
      the preserved v1 file.
- [x] **Phase 7** — Real-time progress via Server-Sent Events
      (`AgentEvents` pub/sub, `GET /events`, client `useAgentEvents` hook)
      replacing the polling interval from Phase 6; asset version switching
      end-to-end (`GET /scenes/:id/versions`, `POST
      /versions/:assetId/activate`, a version `<select>` in the scene row).
      Live-verified the exact SSE event sequence via `curl -N` during a
      real chat turn, and version switching via a full regenerate → list
      versions (v1, v2) → activate v1 → confirm `scene.activeAssetId`
      round-trip. Added a real safety check found while building this:
      `setActiveVersion` now rejects activating a non-VIDEO asset (400),
      since `Scene.activeAssetId` is a single pointer that `merge_videos`
      reads - pointing it at e.g. a VOICE asset would silently break
      assembly.
- [~] **Phase 8** — Deliberately skipped at the user's request (no real
      provider API keys available to test against, and implementing
      untested adapters against paid APIs risks shipping broken code that
      looks like it works). The `ImageProvider`/`VideoProvider`/
      `TTSProvider`/`MusicProvider` interfaces and registry from Phase 4
      are ready for this - adding a real vendor later is one new adapter
      file plus one registry entry, with zero changes to `AgentLoop` or
      any tool.
- [x] **Phase 9** — `generate_youtube_metadata`: title/description/tags/
      hashtags/thumbnailPrompt via structured LLM output, persisted to
      `Project.youtubeMeta` + `youtube-metadata.json`, plus (by default) a
      rendered stylized thumbnail image via the image provider. Never
      uploads anything (spec #35). Added a UI card showing the generated
      metadata and thumbnail. Live-verified end-to-end against the real
      model. Found and fixed a real versioning bug while wiring this up:
      `create_thumbnail` was writing every generation to the **same fixed
      file path** while the database still incremented version numbers -
      so an old "version" row's `filePath` silently pointed at whatever a
      *later* call had overwritten it with. Fixed to write a distinct file
      per version (matching how every other asset type already works) and
      confirmed live: two `create_thumbnail` calls now produce
      `thumbnail-v2.png` and `thumbnail-v3.png` as genuinely different
      files, both independently retained.

- [x] **Phase 10** — Full pivot to the conversational prompt & media
      assembly studio described throughout this README, per an explicit
      product-spec rewrite request. Deleted the provider layer and every
      mock generation tool (`generate_image/video/voice/music`,
      `generate_all_scene_media`, `generate_youtube_metadata`) and the
      old `merge_videos`/`add_audio` implementations entirely - confirmed
      decision was to remove rather than hide them. Added: deterministic
      scene-count/timing math (`utils/sceneMath.ts`, no fixed duration cap,
      verified for 30s through 30-minute/180-scene projects); a two-stage
      prompt pipeline (`create_prompt_plan` → `create_story_structure` →
      `generate_scene_prompts`, batched internally for scale) that branches
      on `mediaType` (VIDEO vs IMAGE) and writes continuity via Style/
      Character/Environment Bibles + a persisted story context;
      `PromptVersion` history with restore; `MediaAsset`/`TimelineItem`/
      `AudioTrack`/`Render` models and matching services
      (`MediaUploadService` with filename-based scene matching,
      `TimelineService` for ordering/timing); new `FFmpegService` methods
      (`imageToVideo`, `normalizeVideoClip`, `prepareMusicTrack`) supporting
      FIT/CROP/BLUR_BACKGROUND so mixed aspect-ratio uploads are never
      stretched; multer-based upload routes; and the tabbed Prompts/Upload
      &amp; Assemble/Final Render right panel. Live-verified end-to-end
      twice against the real model and real ffmpeg: a 60s/6-scene video
      project (upload → auto-match all 6 by filename → assemble with no
      audio uploaded → validated 1920×1080 MP4, exactly per spec "still
      assemble successfully" with no audio); and a 15s/3-scene image
      project with `narrationRequired`/`musicRequired` (ambiguous filename
      matches correctly triggered the agent to ask the user instead of
      guessing, a mid-turn tool failure was self-corrected via `list_media`
      before retrying, and the final render came back 1080×1080 with
      video+AAC audio+soft subtitles, all confirmed via `ffprobe`).

83/83 automated tests passing (`npm run test`), clean `npm run typecheck`
and `npm run build` across both workspaces.
