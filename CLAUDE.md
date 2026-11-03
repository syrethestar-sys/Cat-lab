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
3. Train → TensorFlow.js in the browser (10, 30 or 50 rounds, default 30) → model to `indexeddb://cat-lab-model` → `POST /api/training-runs`
4. Test → load the model from IndexedDB → upload a photo with `ground = testing` → guess → "Cat, 87% sure"

Tables: `photos` (id, storagePath, label, ground, createdAt) and `training_runs` (id, rounds, accuracy, modelUrl, createdAt).

The step-by-step build guide is in `GUIDE.md`. Follow it in order.

## Current state

- Screen 1 (Upload) is done and verified: `/api/photos` (GET, POST) and `/api/photos/[id]` (DELETE) store files in Storage and rows in Postgres; photos survive a reload.
- Screen 2 (Label) is done and verified: `PATCH /api/photos/[id]` saves `cat` / `not_cat`; labels survive a reload; a failed save undoes the click and shows an error.
- Screen 3 (Train) is done and verified: pick 10/30/50 rounds (default 30), TensorFlow.js trains in the browser, the model is saved to IndexedDB `cat-lab-model`, and `POST /api/training-runs` records the run. Training code is `app/_lib/model.ts` (browser only).
- Screen 4 (Test) is done and verified: loads the model from IndexedDB, uploads one photo with `ground = testing` (never used for training), guesses, and shows e.g. "A cat, 100% sure". A model saved in the browser unlocks Step 4 after a reload (`app/_lib/saved-model.ts`).
- GUIDE.md Step 0 is done: packages, `.env.local` (incl. `SUPABASE_SERVICE_ROLE_KEY`), private `photos` bucket, `certs/supabase-ca.crt`, tables `photos` and `training_runs` migrated, helpers `app/_lib/db.ts` and `app/_lib/storage.ts` (verified: the server reads the database and Storage).
- All 4 screens are built. Remaining ideas: a test score on labeled test photos, real-photo accuracy checks, README.
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
