-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "label" TEXT,
    "split" TEXT NOT NULL DEFAULT 'train',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);
