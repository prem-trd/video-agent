-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "topic" TEXT NOT NULL DEFAULT '',
    "duration" INTEGER NOT NULL DEFAULT 60,
    "mediaType" TEXT NOT NULL DEFAULT 'VIDEO',
    "clipDurationSec" REAL NOT NULL DEFAULT 10,
    "imageDurationSec" REAL NOT NULL DEFAULT 5,
    "narrationRequired" BOOLEAN NOT NULL DEFAULT false,
    "musicRequired" BOOLEAN NOT NULL DEFAULT false,
    "aspectRatio" TEXT NOT NULL DEFAULT '16:9',
    "resolution" TEXT NOT NULL DEFAULT '1920x1080',
    "fps" INTEGER NOT NULL DEFAULT 30,
    "language" TEXT NOT NULL DEFAULT 'English',
    "audience" TEXT NOT NULL DEFAULT 'General',
    "style" TEXT NOT NULL DEFAULT '3D Cartoon',
    "videoType" TEXT NOT NULL DEFAULT 'Educational',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "agentState" TEXT NOT NULL DEFAULT 'IDLE',
    "storagePath" TEXT NOT NULL,
    "scriptJson" TEXT NOT NULL DEFAULT 'null',
    "styleBible" TEXT NOT NULL DEFAULT 'null',
    "storyContext" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Scene" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "sceneNumber" INTEGER NOT NULL,
    "duration" REAL NOT NULL DEFAULT 5,
    "startTime" REAL NOT NULL DEFAULT 0,
    "endTime" REAL NOT NULL DEFAULT 0,
    "narration" TEXT NOT NULL DEFAULT '',
    "onScreenText" TEXT NOT NULL DEFAULT '',
    "visualDescription" TEXT NOT NULL DEFAULT '',
    "imagePrompt" TEXT NOT NULL DEFAULT '',
    "videoPrompt" TEXT NOT NULL DEFAULT '',
    "animationDirection" TEXT NOT NULL DEFAULT '',
    "cameraDirection" TEXT NOT NULL DEFAULT '',
    "composition" TEXT NOT NULL DEFAULT '',
    "negativeInstructions" TEXT NOT NULL DEFAULT '',
    "continuityNotes" TEXT NOT NULL DEFAULT '',
    "characters" TEXT NOT NULL DEFAULT '[]',
    "environmentKey" TEXT NOT NULL DEFAULT '',
    "transition" TEXT NOT NULL DEFAULT 'fade',
    "soundEffects" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Scene_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "characterKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "appearance" TEXT NOT NULL DEFAULT '',
    "age" TEXT NOT NULL DEFAULT '',
    "colors" TEXT NOT NULL DEFAULT '',
    "clothing" TEXT NOT NULL DEFAULT '',
    "personality" TEXT NOT NULL DEFAULT '',
    "visualStyle" TEXT NOT NULL DEFAULT '',
    "environment" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Character_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Environment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "environmentKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "lighting" TEXT NOT NULL DEFAULT '',
    "colors" TEXT NOT NULL DEFAULT '',
    "props" TEXT NOT NULL DEFAULT '',
    "timeOfDay" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Environment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PromptVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "visualDescription" TEXT NOT NULL DEFAULT '',
    "imagePrompt" TEXT NOT NULL DEFAULT '',
    "videoPrompt" TEXT NOT NULL DEFAULT '',
    "animationDirection" TEXT NOT NULL DEFAULT '',
    "cameraDirection" TEXT NOT NULL DEFAULT '',
    "composition" TEXT NOT NULL DEFAULT '',
    "negativeInstructions" TEXT NOT NULL DEFAULT '',
    "continuityNotes" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromptVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PromptVersion_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationSec" REAL,
    "aspectRatio" TEXT NOT NULL DEFAULT '',
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "probeMetadata" TEXT NOT NULL DEFAULT '{}',
    "matchedSceneNumber" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TimelineItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "sceneId" TEXT,
    "kind" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "displayDurationSec" REAL,
    "trimStartSec" REAL,
    "trimEndSec" REAL,
    "fitMode" TEXT NOT NULL DEFAULT 'FIT',
    "transition" TEXT NOT NULL DEFAULT 'cut',
    "startTime" REAL NOT NULL DEFAULT 0,
    "endTime" REAL NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TimelineItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TimelineItem_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TimelineItem_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AudioTrack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL DEFAULT '',
    "durationSec" REAL,
    "volume" REAL NOT NULL DEFAULT 1,
    "fadeInSec" REAL NOT NULL DEFAULT 0,
    "fadeOutSec" REAL NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AudioTrack_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "provider" TEXT NOT NULL DEFAULT 'internal',
    "isMock" BOOLEAN NOT NULL DEFAULT false,
    "prompt" TEXT NOT NULL DEFAULT '',
    "filePath" TEXT NOT NULL DEFAULT '',
    "duration" REAL,
    "generationHash" TEXT NOT NULL DEFAULT '',
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Asset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Render" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "durationSec" REAL NOT NULL DEFAULT 0,
    "resolution" TEXT NOT NULL DEFAULT '',
    "aspectRatio" TEXT NOT NULL DEFAULT '',
    "fps" REAL NOT NULL DEFAULT 0,
    "mediaItemCount" INTEGER NOT NULL DEFAULT 0,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "hasAudio" BOOLEAN NOT NULL DEFAULT false,
    "hasSubtitles" BOOLEAN NOT NULL DEFAULT false,
    "validationIssues" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Render_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "input" TEXT NOT NULL DEFAULT '{}',
    "output" TEXT NOT NULL DEFAULT '{}',
    "error" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "agentState" TEXT NOT NULL DEFAULT '',
    "task" TEXT NOT NULL DEFAULT '',
    "tool" TEXT NOT NULL DEFAULT '',
    "message" TEXT NOT NULL,
    "durationMs" INTEGER,
    "data" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Revision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "diff" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Revision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "toolCalls" TEXT NOT NULL DEFAULT 'null',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Scene_projectId_idx" ON "Scene"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Scene_projectId_sceneNumber_key" ON "Scene"("projectId", "sceneNumber");

-- CreateIndex
CREATE INDEX "Character_projectId_idx" ON "Character"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Character_projectId_characterKey_key" ON "Character"("projectId", "characterKey");

-- CreateIndex
CREATE INDEX "Environment_projectId_idx" ON "Environment"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Environment_projectId_environmentKey_key" ON "Environment"("projectId", "environmentKey");

-- CreateIndex
CREATE INDEX "PromptVersion_projectId_idx" ON "PromptVersion"("projectId");

-- CreateIndex
CREATE INDEX "PromptVersion_sceneId_idx" ON "PromptVersion"("sceneId");

-- CreateIndex
CREATE UNIQUE INDEX "PromptVersion_sceneId_version_key" ON "PromptVersion"("sceneId", "version");

-- CreateIndex
CREATE INDEX "MediaAsset_projectId_idx" ON "MediaAsset"("projectId");

-- CreateIndex
CREATE INDEX "TimelineItem_projectId_idx" ON "TimelineItem"("projectId");

-- CreateIndex
CREATE INDEX "TimelineItem_sceneId_idx" ON "TimelineItem"("sceneId");

-- CreateIndex
CREATE INDEX "AudioTrack_projectId_idx" ON "AudioTrack"("projectId");

-- CreateIndex
CREATE INDEX "Asset_projectId_idx" ON "Asset"("projectId");

-- CreateIndex
CREATE INDEX "Asset_generationHash_idx" ON "Asset"("generationHash");

-- CreateIndex
CREATE INDEX "Render_projectId_idx" ON "Render"("projectId");

-- CreateIndex
CREATE INDEX "AgentTask_projectId_idx" ON "AgentTask"("projectId");

-- CreateIndex
CREATE INDEX "AgentLog_projectId_idx" ON "AgentLog"("projectId");

-- CreateIndex
CREATE INDEX "Revision_projectId_idx" ON "Revision"("projectId");

-- CreateIndex
CREATE INDEX "ChatMessage_projectId_idx" ON "ChatMessage"("projectId");
