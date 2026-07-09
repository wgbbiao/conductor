-- AlterTable
ALTER TABLE "Project"
ADD COLUMN "repoUrl" TEXT,
ADD COLUMN "defaultBranch" TEXT NOT NULL DEFAULT 'main';

UPDATE "Project"
SET "repoUrl" = 'git@github.com:wgbbiao/test-demo.git'
WHERE "repoUrl" IS NULL;

ALTER TABLE "Project"
ALTER COLUMN "repoUrl" SET NOT NULL;

-- AlterTable
ALTER TABLE "ToolRun"
ADD COLUMN "branch" TEXT,
ADD COLUMN "baseCommit" TEXT;

-- AlterTable
ALTER TABLE "Artifact"
ADD COLUMN "type" TEXT NOT NULL DEFAULT 'diff',
ADD COLUMN "content" TEXT;

UPDATE "Artifact"
SET "content" = "path"
WHERE "content" IS NULL;

ALTER TABLE "Artifact"
ALTER COLUMN "content" SET NOT NULL,
DROP COLUMN "path";

-- CreateIndex
CREATE INDEX "Project_repoUrl_idx" ON "Project"("repoUrl");
