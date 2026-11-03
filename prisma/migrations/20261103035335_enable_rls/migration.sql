-- Supabase's Data API would otherwise let anyone with the public anon key read
-- and change these tables. With row level security on and no policies, only the
-- table owner (the role Prisma connects as) can reach them.
ALTER TABLE "photos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "training_runs" ENABLE ROW LEVEL SECURITY;
