-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL DEFAULT '',
    "logoPath" TEXT NOT NULL DEFAULT '',
    "fontPath" TEXT NOT NULL DEFAULT '',
    "textColor" TEXT NOT NULL DEFAULT '#FFFFFF',
    "introDurationSec" REAL NOT NULL DEFAULT 4,
    "outroDurationSec" REAL NOT NULL DEFAULT 12,
    "showTitleOnIntro" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Project" (
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
    "introEnabled" BOOLEAN NOT NULL DEFAULT true,
    "outroEnabled" BOOLEAN NOT NULL DEFAULT true,
    "brandBackgroundPath" TEXT NOT NULL DEFAULT '',
    "brandBackgroundPrompt" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Project" ("agentState", "aspectRatio", "audience", "clipDurationSec", "createdAt", "description", "duration", "fps", "id", "imageDurationSec", "language", "mediaType", "musicRequired", "narrationRequired", "resolution", "scriptJson", "status", "storagePath", "storyContext", "style", "styleBible", "title", "topic", "updatedAt", "videoType") SELECT "agentState", "aspectRatio", "audience", "clipDurationSec", "createdAt", "description", "duration", "fps", "id", "imageDurationSec", "language", "mediaType", "musicRequired", "narrationRequired", "resolution", "scriptJson", "status", "storagePath", "storyContext", "style", "styleBible", "title", "topic", "updatedAt", "videoType" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
