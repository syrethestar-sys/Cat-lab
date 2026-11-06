@AGENTS.md

# Cat Lab

A class project: a web app that learns to tell cats from other things.
Students teach a model in the **Training ground**, then check it in the **Testing ground**.

## How to work in this repo

1. **Plan first.** Before writing code, write a short plan: what changes, which files, and how it will be checked.
2. **Ask open questions.** If anything in the request is unclear, ask the user before building. Don't guess on scope, tools or behavior.
3. **Check your work with Chrome DevTools.** After a change, open http://localhost:3000 with the chrome-devtools MCP tools. Click through the changed flow, take a snapshot or screenshot, and check the console for errors. Only report a change as done after you have seen it work.
4. **One step at a time.** Build and verify one step of the flow before starting the next.
5. **No Claude attribution in git.** Don't add `Co-Authored-By: Claude` or "Generated with Claude Code" lines to commits or PRs. Commits are authored by the user only.

## The flow (4 screens)

Photos and labels go **through our API routes**. The browser never talks to Supabase directly, and the secret key stays on the server. Training and guessing run in the browser. The model is saved in **IndexedDB**, not Supabase.

1. Upload → `POST /api/photos` → file to Storage (private bucket `photos`), row via Prisma, signed link valid 1 hour
2. Label → `PATCH /api/photos/[id]` → `photos.label` is `cat` or `not_cat`
3. Train → TensorFlow.js in the browser (10, 30 or 50 rounds, default 30) → model to `indexeddb://cat-lab-baby` → `POST /api/training-runs`
4. Test → load the model from IndexedDB → upload a photo with `ground = testing` → guess → "Cat, 87% sure"

Tables: `photos` (id, storagePath, label, ground, fileHash, createdAt) and `training_runs` (id, rounds, accuracy, modelUrl, continued, model, photos, heldOut, createdAt).

The step-by-step build guide is in `GUIDE.md`. Follow it in order.

## Current state

- Screen 1 (Upload) is done and verified: `/api/photos` (GET, POST) and `/api/photos/[id]` (DELETE) store files in Storage and rows in Postgres. Every visit starts empty: the page does not load saved photos on refresh (they stay in Supabase). A "Load my saved photos" button (opt-in, `loadSaved()` in CatLab) puts every saved training photo on the page with its label (verified: 820 photos, labels 349 / 471); a refresh still starts empty. A "Clear previews" button only empties the page; the photos stay saved in Supabase. Training uses only the photos shown on the page. The × on a tile deletes that one photo from Supabase.
- Screen 2 (Label) is done and verified: `PATCH /api/photos/[id]` saves `cat` / `not_cat` in the database; a failed save undoes the click and shows an error.
- Screen 3 (Train) is done and verified: pick 10/30/50 rounds (default 30). The model is a **baby model learned from zero** (the class subject; MobileNet was removed on purpose): photos are shrunk to 64 × 64 (12,288 numbers), a small CNN (`look1`/`look2`/`look3` conv layers with 8/16/32 detectors, then dense) starts from random numbers and trains in the browser. 20% of photos are held back. The whole model is saved to IndexedDB `cat-lab-baby` (old MobileNet models under `cat-lab-model` are ignored). `POST /api/training-runs` records the held-out accuracy and `model = "baby"` (older rows are `mobilenet`). Code is `app/_lib/model.ts` (browser only, no downloads).
- Screen 3 extras (verified): a **Start fresh / Keep learning** toggle (`app/_components/ModeToggle.tsx`) shows only when a model is saved in the browser; the choice is remembered in localStorage (`cat-lab-train-mode`). Keep learning loads the saved classifier, compiles it again and trains more; `training_runs.continued` records which mode ran. The held-back photos are fixed by a hash of the photo id (score < 0.2, at most 20% per group, groups under 5 hold none back), so "photos it never saw" stays honest across runs. A live process list (`app/_components/TrainingProcess.tsx`) shows the stages in order with progress bars; for each photo: the photo, its 64 × 64 version, the mirror copy and its pixel numbers; while learning: the 8 first-layer pattern detectors (before vs now, and how much they changed) and what each look layer sees in one held-back photo. The chart (`AccuracyChart.tsx`) draws training accuracy (blue) and accuracy on photos it never saw (dashed orange); a note says "It is starting to memorize" when, after 5+ rounds, training is 15+ points higher.
- Latest (820 photos: 349 cat / 471 not cat, 30 rounds): 89% on training photos, 68% on 153 held-out; 3 of 6 fresh German shepherds called "not cat" correctly. Earlier, with the baby model, 30 rounds from zero: 205 photos → 88% on training photos, 58% on 36 held-out; 209 photos (106 cat / 103 not cat) → 89% training, 56% on 34 held-out, detectors changed ~21%. It memorizes. The old MobileNet version scored 100% held-out.
- Screen 4 (Test) is done and verified: loads the model from IndexedDB, uploads one photo with `ground = testing` (never used for training), guesses, and shows e.g. "A cat, 100% sure". A model saved in the browser unlocks Step 4 after a reload (`app/_lib/saved-model.ts`).
- Step 4 test score (verified): below the quick test, a **Test score** section (`app/_components/TestSet.tsx`) lets students add many test photos (`ground = testing`), label each one first (the answer key, `PATCH /api/photos/[id]`), then "Check the model". It shows "Right on 9 of 10 (90%)", a per-group breakdown, "Last check: 70%" to compare, and a result grid (`ResultTile.tsx`) with wrong guesses first. Test photos and results live in CatLab state (they survive switching steps, not a reload); retraining clears the result so it is never stale. The score is not saved in the database. `predictMany()` in `app/_lib/model.ts` guesses many photos.
- GUIDE.md Step 0 is done: packages, `.env.local` (incl. `SUPABASE_SERVICE_ROLE_KEY`), private `photos` bucket, `certs/supabase-ca.crt`, tables `photos` and `training_runs` migrated, helpers `app/_lib/db.ts` and `app/_lib/storage.ts` (verified: the server reads the database and Storage).
- Calibrated confidence (verified): after training, `train()` fits a temperature on the held-out photos (needs 20+) and divides the last layer's weights and bias by it (`fitTemperature`/`applyTemperature` in `app/_lib/model.ts`), so the saved model's "% sure" matches how often it is really right; guesses never change. Before: "95–100% sure" was right 31/37 on never-seen photos; after (T = 3.5): 90–100% right 15/16, 80–90% 10/12. Step 3 says how much it was softened. A model trained before this change stays overconfident until trained again.
- Step 4 always uses the latest saved model (verified): every time Step 4 opens it reloads `cat-lab-baby` from IndexedDB, and shows "Using the model you trained on <date>, learned from N photos, right on X% of M photos it never saw." That info is saved inside the model (`setUserDefinedMetadata`, `modelInfo()` in `app/_lib/model.ts`); models saved earlier show "trained before details were kept". Training loads photos 12 at a time and retries a failed one up to 3 times (loading all at once made a run fail with "Could not load one of your photos").
- Step 3 "Does it improve with more photos?" chart (`app/_components/ScoreHistory.tsx`, verified): every run records `photos` (labeled photos used) and `heldOut` (photos kept aside); `GET /api/training-runs` returns baby-model runs with `heldOut > 0`, and the chart plots never-seen accuracy against photo count with an 85% goal line and a note that one never-seen photo is worth 100/heldOut points. It only shows once a run exists (older runs have `photos = 0` and are left out). Experiments on 209 photos showed 65–70% is the ceiling for this baby model (flips/shifts/bigger model did not help); 60 photos → 42%, 209 photos → 53%. Reaching 85% needs many more photos (500+ per group suggested).
- Duplicate uploads are never stored twice (verified): `POST /api/photos` saves a SHA-256 of each file in `photos.fileHash` (unique). Same photo, same ground → 200 with the saved photo and `reused: true`: the page shows the saved copy again **with its label** ("209 photos were saved before, so the saved copies are shown with their labels. Nothing was stored twice."), so a returning student gets their labeled photos back by picking the same files. Works in Step 1, the Test score and the quick test. Other ground → 409 `duplicate: "other"`, blocked with "This photo is already a training photo. Test with photos the model never saw." All saved photos have a fingerprint.
- `app/_lib/db.ts` replaces its cached client when `prisma generate` makes new client code, so the dev server no longer needs a restart after a schema change.
- Training changes (latest): each round trains on randomly zoomed, flipped and brightness/color-changed copies of every photo (`varied()` in `app/_lib/model.ts`), built a chunk of 128 photos at a time so the graphics card never holds the whole set; the small group is weighted up (`classWeight`); the model is wider (8/32/64 detectors, dense 64). Results on the same 369 never-seen photos (1,966 photos: 740 cat / 1,226 not cat): 71%, 71% (50 rounds), then 64% with the chunked loop. Run-to-run noise is about 3 points, and always answering "not cat" scores about 62%, so this is not yet clearly better than that. 128 × 128 pixels crashed the GPU (Metal command buffer failed) after about 4 rounds, so `SIZE` stays 64.
- A server copy of every trained model is kept in Storage (`POST /api/models` → `models/<id>/model.json` + `model.weights.bin`; the run's `modelUrl` points there). Step 4 has a "Load latest model from server" button (`GET /api/models/latest`, `loadFromServer()`) that replaces this browser's model with the newest server copy. `GET /api/photos` asks for signed links in batches of 200 (one request for 1,000+ paths came back empty).
- All 4 screens are built. Remaining ideas: real-photo accuracy checks, README.
- Run Prisma with `--config prisma.config.ts` unless the extra `prisma7.config.ts` is gone.

## Code

- Next.js 16 App Router, React 19, Tailwind 4, `lucide-react` icons.
- Read `node_modules/next/dist/docs/` before using a Next.js API (see AGENTS.md).
- UI pieces live in `app/_components/`. The step logic is in `app/_components/CatLab.tsx`.
- Colors and fonts are tokens in `app/globals.css` (`bg-page`, `text-muted`, `border-cat`, `text-green`, ...). Use these tokens, not new hex values.
- Show no example or placeholder data in the app. Show only what the user really added.
- Check types with `npx tsc --noEmit`.

## Security

- Row level security is ON for `photos` and `training_runs` (migration `enable_rls`, no policies). The Supabase anon key can't read or write them; only the server (Prisma, secret key) can. Keep RLS on for any new table.
