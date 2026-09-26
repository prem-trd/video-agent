-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Channel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL DEFAULT '',
    "logoPath" TEXT NOT NULL DEFAULT '',
    "endLogoPath" TEXT NOT NULL DEFAULT '',
    "openingMusicPath" TEXT NOT NULL DEFAULT '',
    "endAudioPath" TEXT NOT NULL DEFAULT '',
    "fontPath" TEXT NOT NULL DEFAULT '',
    "likeButtonPath" TEXT NOT NULL DEFAULT '',
    "shareButtonPath" TEXT NOT NULL DEFAULT '',
    "subscribeButtonPath" TEXT NOT NULL DEFAULT '',
    "textColor" TEXT NOT NULL DEFAULT '#FFFFFF',
    "openingText" TEXT NOT NULL DEFAULT 'Welcome to',
    "introDurationSec" REAL NOT NULL DEFAULT 6,
    "outroDurationSec" REAL NOT NULL DEFAULT 6,
    "showTitleOnIntro" BOOLEAN NOT NULL DEFAULT false,
    "musicVolume" REAL NOT NULL DEFAULT 0.5,
    "endBackground" TEXT NOT NULL DEFAULT 'WHITE',
    "watermarkEnabled" BOOLEAN NOT NULL DEFAULT true,
    "watermarkPosition" TEXT NOT NULL DEFAULT 'BOTTOM_RIGHT',
    "watermarkX" REAL NOT NULL DEFAULT 0.94,
    "watermarkY" REAL NOT NULL DEFAULT 0.9,
    "watermarkSizePct" REAL NOT NULL DEFAULT 14,
    "watermarkOpacity" REAL NOT NULL DEFAULT 0.9,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Channel" ("createdAt", "endAudioPath", "endBackground", "endLogoPath", "fontPath", "id", "introDurationSec", "likeButtonPath", "logoPath", "musicVolume", "name", "openingMusicPath", "openingText", "outroDurationSec", "shareButtonPath", "showTitleOnIntro", "subscribeButtonPath", "textColor", "updatedAt", "watermarkEnabled", "watermarkOpacity", "watermarkPosition", "watermarkSizePct") SELECT "createdAt", "endAudioPath", "endBackground", "endLogoPath", "fontPath", "id", "introDurationSec", "likeButtonPath", "logoPath", "musicVolume", "name", "openingMusicPath", "openingText", "outroDurationSec", "shareButtonPath", "showTitleOnIntro", "subscribeButtonPath", "textColor", "updatedAt", "watermarkEnabled", "watermarkOpacity", "watermarkPosition", "watermarkSizePct" FROM "Channel";
DROP TABLE "Channel";
ALTER TABLE "new_Channel" RENAME TO "Channel";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
