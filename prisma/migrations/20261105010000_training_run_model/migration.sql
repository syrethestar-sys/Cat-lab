-- AlterTable: runs saved so far used MobileNet, new runs default to the baby model.
ALTER TABLE "training_runs" ADD COLUMN     "model" TEXT NOT NULL DEFAULT 'mobilenet';
ALTER TABLE "training_runs" ALTER COLUMN "model" SET DEFAULT 'baby';
