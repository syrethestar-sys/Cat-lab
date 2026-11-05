-- AlterTable
ALTER TABLE "photos" ADD COLUMN     "fileHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "photos_fileHash_key" ON "photos"("fileHash");
