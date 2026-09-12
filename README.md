# AI Video Studio

A local AI agent that plans, scripts, generates, assembles and revises short
videos, built around a real tool-calling agent loop backed by **Ollama
Cloud / gpt-oss:120b** — not a scripted demo and not a UI mockup. Every
capability described below has been exercised against the live model and
verified by inspecting the actual database rows and files it produced.

> **Build status**: Phases 1–7 and 9 of 9 are complete and live-tested (see
> [Progress](#progress) below); Phase 8 (real provider adapters) was
> deliberately skipped at the user's request since no real API keys were
> available to test against. A single chat message can now take a project
> from nothing to a real, validated, playable final MP4 (video + narration
> + music + subtitles) end-to-end, the full multi-pane Studio UI (left
> project sidebar, center chat, right preview/scenes, bottom agent
> activity feed) is wired to the live backend, progress streams to the
> browser in real time over Server-Sent Events, and the agent can prepare
> YouTube title/description/tags/thumbnail content (without uploading
> anything).

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
- [Provider configuration](#provider-configuration)
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
- No paid media-generation API keys are required to run the app — everything
  works out of the box against mock providers (see [Provider
  configuration](#provider-configuration))

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
| Ollama Cloud | `OLLAMA_API_KEY`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL` |
| Media providers | `VIDEO_PROVIDER`, `IMAGE_PROVIDER`, `TTS_PROVIDER`, `MUSIC_PROVIDER` (all `mock` by default) |
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
Project**, describe your video in the "Create from prompt" tab (or fill in
the structured form), and chat with the agent. The right panel shows the
video preview, project/Style Bible info, and per-scene status with
regenerate buttons; the bottom panel shows live agent activity (it polls
`/status` while a turn is in flight, since a full pipeline run can take
30–60+ seconds).

**Via the API directly** — the same walkthrough, useful for scripting or
debugging:

```bash
# 1. Create a project
curl -s -X POST http://localhost:4000/api/projects \
  -H "Content-Type: application/json" \
  -d '{"title":"ABC with Farm Animals","topic":"Teach the alphabet using farm animals","duration":30,"style":"3D Cartoon","audience":"Preschool","aspectRatio":"16:9"}'
# -> {"id": "...", ...}

# 2. Ask the agent to plan, script and break it into scenes
curl -s -X POST http://localhost:4000/api/projects/<id>/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Plan this video and write the full script and scene breakdown."}'

# 3. Ask it to generate media for every scene
curl -s -X POST http://localhost:4000/api/projects/<id>/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Generate video and narration for every scene, plus background music."}'

# 4. Make a targeted revision
curl -s -X POST http://localhost:4000/api/projects/<id>/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Regenerate the video prompt for scene 2 to add more energy."}'

# 5. Inspect what happened
curl -s http://localhost:4000/api/projects/<id>/status | python3 -m json.tool
```

Generated files land in `video-projects/<id>/assets/{images,videos,audio,music}/`.

## Provider configuration

Image, video, TTS and music generation are behind provider interfaces
([server/src/providers/types.ts](server/src/providers/types.ts)) so the
agent loop, tools, and routes never know or care which vendor is actually
generating media.

**Local development (default, zero cost):** `*_PROVIDER=mock` for all four.
The mock providers render **real** output through FFmpeg — placeholder
images/videos with a "MOCK ASSET" watermark, and placeholder audio tones
sized to match narration length — so the entire pipeline (generation →
FFmpeg assembly → validation) is genuinely exercised without ever calling a
paid API. Every mock-generated `Asset` row is flagged `isMock: true` and
`provider: "mock"`; the API/UI must never claim a mock asset is real
AI-generated media.

**Adding a real vendor (Phase 8):** implement `ImageProvider` /
`VideoProvider` / `TTSProvider` / `MusicProvider`
([server/src/providers/types.ts](server/src/providers/types.ts)) in a new
file under `server/src/providers/<kind>/`, register it in
[server/src/providers/registry.ts](server/src/providers/registry.ts), and
set the matching `*_PROVIDER` env var to its name. Nothing else changes —
not the tools, not `AgentLoop`, not the routes.

## Project structure

```
ai-video-studio/
├── client/                       React + Vite + TypeScript frontend
│   └── src/                      (currently: Phase 1 connectivity-check page only)
├── server/
│   ├── src/
│   │   ├── agent/                AgentLoop, VideoAgent, AgentMemory, TaskManager, AgentLogger, ToolExecutor
│   │   ├── llm/                  OllamaClient (the only file that talks to Ollama Cloud)
│   │   ├── tools/                every agent tool, grouped: planning/ script/ scenes/ media/ audio/
│   │   ├── providers/            ImageProvider/VideoProvider/TTSProvider/MusicProvider + mock adapters + registry
│   │   ├── media/ffmpeg/         FFmpegService - the only place ffmpeg/ffprobe are invoked
│   │   ├── services/             ProjectService, SceneService, CharacterService, AssetService, ProjectStorage
│   │   ├── database/             Prisma client
│   │   ├── routes/                Express routes
│   │   ├── types/                shared domain types + zod schemas (single source of truth)
│   │   └── utils/                env, logger, errors, path safety, zod helpers
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
    script/script.json
    scenes/scenes.json
    characters/character-bible.json
    style-bible.json
    assets/{images,videos,audio,music,subtitles}/
    renders/           preview_silent.mp4, with_narration.mp4, with_music.mp4, final.mp4
    thumbnails/        thumbnail.png
    logs/
```

The SQLite database holds the queryable metadata (projects, scenes,
characters, assets, agent tasks/logs, chat history); the filesystem holds
the actual working files and media. Every filesystem path a tool touches is
resolved through
[server/src/utils/paths.ts](server/src/utils/paths.ts), which rejects
anything that would escape `PROJECT_STORAGE_PATH` (path traversal, absolute
escapes, etc) — the LLM never gets raw filesystem or shell access.

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
   filesystem (ProjectStorage)  and/or  Providers (providers/*)  →
   FFmpegService (media/ffmpeg/*)
```

The model **never** generates an entire project in one response — each
LLM round-trip is one reasoning step plus (optionally) one batch of tool
calls, exactly matching the "analyze → plan → tool → result → reason →
next tool → complete" loop the product spec calls for. This was verified
live: a full plan+script+scenes+media request for a 3-scene video took 16
real LLM round-trips (not 1), with the model inspecting real tool results
(via `read_project`/`list_assets`) between steps rather than assuming.

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

**Error handling**: every layer (LLM, tool, provider, ffmpeg, filesystem,
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

Tools registered so far (Phases 2–5, 9) — see
[server/src/tools/index.ts](server/src/tools/index.ts) for the live list:

| Tool | Purpose |
|---|---|
| `read_project` | Inspect current project config, scenes, characters |
| `update_project` | Change config fields (duration, style, audience, ...) |
| `analyze_request` | Extract structured config from a freeform request |
| `create_video_plan` | Produce objective + scene count + **Style Bible** |
| `update_style_bible` | Edit the Style Bible directly |
| `update_character_bible` | Create/edit a **Character Bible** entry |
| `generate_script` | Write narration-level scenes + identify recurring characters |
| `create_scene_plan` | Batch-enrich every scene with prompts/direction (one call, all scenes) |
| `generate_visual_prompt` / `generate_video_prompt` | Regenerate one scene's image/video prompt |
| `update_scene` | Direct field edit on one scene |
| `generate_image` | Generate a scene's still image (provider-backed, cached, versioned, `force` bypasses cache) |
| `generate_video` | Generate a scene's video clip (provider-backed, cached, versioned, `force` bypasses cache) |
| `generate_voice` | Generate narration audio for a scene or standalone text (cached, versioned, `force` bypasses cache) |
| `generate_all_scene_media` | Generate video+voice for every scene (or a subset) in ONE call - preferred over per-scene calls for the initial full pipeline |
| `generate_music` | Generate a project-level background music bed |
| `list_assets` | Check what's already been generated |
| `merge_videos` | Concatenate every scene's video, in order, into one silent video |
| `add_audio` | Concatenate + mux every scene's narration onto the merged video |
| `add_music` | Mix the music bed under the narration and re-mux |
| `generate_subtitles` | Write SRT + WebVTT timed from each scene's actual narration length |
| `add_subtitles` | Burn in or soft-mux subtitles, producing `renders/final.mp4` |
| `create_thumbnail` | Extract a frame from the best-available render as a versioned thumbnail |
| `validate_video` | ffprobe-based validation of the final render; sets project READY or FIXING |
| `generate_youtube_metadata` | Title/description/tags/hashtags/thumbnail prompt + (by default) a rendered thumbnail image - never uploads anything |

Caching: before generating, `generate_image`/`generate_video`/
`generate_voice`/`generate_music` hash the generation parameters
(`AssetService.computeGenerationHash`) and reuse an identical prior
`COMPLETED` asset instead of regenerating (spec'd caching behavior). Pass
`force: true` to skip the cache and always create a new version - this is
what the UI's scene "regenerate" buttons and the agent's own "regenerate
scene N" handling use, so an explicit regenerate request always produces a
genuinely new asset rather than silently returning the same one.
Versioning: every real generation creates a new `Asset` row and a new,
separately-named file (`scene-01-v1.mp4`, `scene-01-v2.mp4`, ...) - nothing
overwrites a prior version's file. `VIDEO` assets also update the scene's
`activeAssetId`; `THUMBNAIL` assets share one version counter per project
regardless of whether they came from `create_thumbnail` or
`generate_youtube_metadata`, so `GET /thumbnail` always serves "whichever
ran most recently."

The assembly pipeline (`merge_videos` → `add_audio` → `add_music` →
`generate_subtitles` → `add_subtitles` → `validate_video`) writes to fixed,
well-known paths under `renders/` (see
[server/src/services/RenderPaths.ts](server/src/services/RenderPaths.ts))
so each stage can find the most complete render available and tell the
agent exactly which prior step is missing if run out of order.

Not implemented: `regenerate_scene` as a distinct tool name (covered by
re-calling `generate_video`/`generate_voice`/`generate_visual_prompt`
directly, or via `POST /scenes/:id/regenerate`); actual YouTube upload
(spec #35 explicitly excludes this from V1).

## API reference

Implemented so far:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Basic liveness check |
| POST | `/api/health/ollama` | Verifies the full Ollama Cloud round-trip |
| POST | `/api/projects` | Create a project |
| GET | `/api/projects` | List projects |
| GET | `/api/projects/:id` | Get one project |
| DELETE | `/api/projects/:id` | Delete a project (DB row + files) |
| POST | `/api/projects/:id/chat` | Send a chat turn to the agent |
| GET | `/api/projects/:id/chat` | Get chat history |
| POST | `/api/projects/:id/generate` | Run the full pipeline via a canned instruction (the UI's "Generate Full Video" button) |
| POST | `/api/projects/:id/cancel` | Cancel the in-flight turn |
| GET | `/api/projects/:id/status` | Agent state + recent logs/tasks |
| GET | `/api/projects/:id/scenes` | List scenes |
| PATCH | `/api/projects/:id/scenes/:sceneId` | Direct field edit on a scene (no LLM involved) |
| POST | `/api/projects/:id/scenes/:sceneId/regenerate` | Force-regenerate one scene's video/voice/image (bypasses the cache, always creates a new version) |
| GET | `/api/projects/:id/assets` | List assets, optionally filtered by `sceneId`/`type` |
| GET | `/api/projects/:id/video` | Streams the best-available render (final, else the most complete intermediate stage); supports HTTP Range requests |
| GET | `/api/projects/:id/thumbnail` | Streams the thumbnail image |
| GET | `/api/projects/:id/files/*` | Safety-scoped access to any file inside the project's storage directory |
| GET | `/api/projects/:id/events` | Server-Sent Events stream of live agent activity (`agent_started`, `agent_state_changed`, `tool_called`, `tool_completed`, `error`, `project_completed`) |
| GET | `/api/projects/:id/scenes/:sceneId/versions` | List every generated version of a scene's asset (`?type=VIDEO\|IMAGE\|VOICE`, defaults to `VIDEO`) |
| POST | `/api/projects/:id/scenes/:sceneId/versions/:assetId/activate` | Switch which version is active (VIDEO only - that's what assembly reads) |

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

**"Exceeded max iterations (N)"** — a real bug we hit and fixed live: asked
for an "alphabet" video in 60 seconds, the model wrote one scene per letter
(26 scenes at 2.3s each), and since each scene needed its own
`generate_video`/`generate_voice` call, that alone used up more iterations
than the loop allowed. Fixed with three changes, all already in place:
1. `generate_script` now clamps scene count so no scene can average under
   4 seconds, and is told explicitly to group multiple items into one
   scene (e.g. "A is for Apple, B is for Ball") rather than shrinking
   scenes to fit everything.
2. `generate_all_scene_media` generates every scene's video+voice in ONE
   tool call instead of one call per scene per media type - the agent is
   now instructed to prefer it for the initial full-pipeline run.
3. `MAX_AGENT_ITERATIONS` default raised from 50 to 100 as a safety net.

If you still hit this on an unusually long/complex video, the request
itself may need to be split (e.g. ask for a shorter duration, or fewer
distinct topics) - the agent will now group content rather than silently
producing unwatchably short scenes, but very dense topics still have a
real limit to how much fits in a given duration.

**Prisma can't find `DATABASE_URL`** — `server/.env` and `client/.env` are
symlinks to the root `.env`; if you deleted them, recreate with
`ln -sf ../.env server/.env` (and the same for `client/`).

## Progress

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

72/72 automated tests passing (`npm run test`), clean `npm run typecheck`
and `npm run build` across both workspaces. 8 of 9 phases complete (Phase
8 intentionally deferred - see above).
