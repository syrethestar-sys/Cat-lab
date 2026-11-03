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

## The flow (8 steps)

Training ground:
1. Upload photos → Supabase Storage
2. Label each one → Prisma `Photo.label`
3. Train → TensorFlow.js, in the browser
4. Save the model → `model.json` to Storage

Testing ground (uses the same model):
5. Load the model → `tf.loadLayersModel()`
6. Add a new photo (never used in training)
7. Model guesses → `model.predict()`
8. Show the answer → "Cat, 87% sure"

The step-by-step build guide is in `GUIDE.md`. Follow it in order.

## Current state

- Steps 1–2 work in the UI only. Photos are kept in browser memory, not in Supabase or Prisma yet.
- Step 3 shows a locked "Start training" button. There is no model yet.
- Steps 4–8 are not built.

## Code

- Next.js 16 App Router, React 19, Tailwind 4, `lucide-react` icons.
- Read `node_modules/next/dist/docs/` before using a Next.js API (see AGENTS.md).
- UI pieces live in `app/_components/`. The step logic is in `app/_components/CatLab.tsx`.
- Colors and fonts are tokens in `app/globals.css` (`bg-page`, `text-muted`, `border-cat`, `text-green`, ...). Use these tokens, not new hex values.
- Show no example or placeholder data in the app. Show only what the user really added.
- Check types with `npx tsc --noEmit`.
