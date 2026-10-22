# PromoFlow Studio

An interactive prototype for the **Media, Content & Digital Experiences** theme at AI Builder Cup 2026. Paste a YouTube Short whose format you want to copy; Gemini extracts its structure (beats, timing, caption style, CTA placement), and PromoFlow rebuilds that format for your product from your context, screenshots, and demo recording.

## Run locally

```bash
npm run dev
```

Run `npm install` once inside `promo-flow/`, then run `npm run dev` from the workspace root or from `promo-flow/`. Open `http://localhost:4173` in Chrome or Edge. Chrome or Chromium must be installed for website capture; set `CHROME_BIN` if it is in a nonstandard location. The local server reloads the page when files in `dist/` change.

## The flow

1. **Landing** (`#/`) — what PromoFlow does; *Make a Short* and *Watch the sample* both open Proven Shorts.
2. **Proven Shorts** (`#/library`) — *Make a Short* opens here. Real app Shorts play as a Shorts-style feed: one per screen, swipe or arrow keys to move, tap to pause. Over each video are its domain, breakout (views ÷ channel subscribers), like rate, comments and format; beside it (or in a sheet on phones) are its performance, what it fits, what you need to film, the beat list and why it works. *Use this format* picks it; *Your own Short* skips to Start with a blank reference.
3. **Start** (`#/start`) — with a picked Short, the page opens on it and asks only about your app; without one, paste a YouTube Shorts link or describe the Short you want. Then *Analyze and plan*. The plan shows the format beat by beat, the recommended workflow (only the blocks this format needs, each with the reason), and a shot list of what to record: the face-clip lines in order, one screen action per step, and the result screens.
4. **Studio** (`#/studio`) — *Open in canvas* builds the block graph from the plan with the script pre-filled. The shot list stays in the sidebar, ticks itself off as clips and screenshots arrive, and jumps to the block that needs each one.

Without a Gemini key, a pasted link uses its hand-annotated format when one exists, otherwise a library format marked as mock; a description picks the closest library format by its words.

## Proven Shorts library

`#/library` reads `dist/library.json`: five app Shorts from five domains (Productivity, Health & Fitness, Education, Fintech, Marketing SaaS). Each plays muted through YouTube's embed (only the Short on screen loads a player) with its views, likes, reach against the channel's subscribers, the beat-by-beat format, what it fits, what you need to film and why it works. Filter by domain from the chips at the top.

The data is real. `scan-library.mjs` reads each Short's public YouTube page for the counts, has Gemini watch the video for the format and notes, and saves the cover to `dist/library/`. Re-run it to refresh the numbers or after editing the list at the top of the file:

```bash
# Using keys from .env or inline:
node scan-library.mjs
# or:
SHOPAI_API_KEY=... node scan-library.mjs
```

Configure `SHOPAI_API_KEY` and models in `.env`. Set `SHOPAI_BASE_URL` to send calls through a custom proxy when needed. A Short picked from the library reuses its scanned format, so Start needs no Gemini call for it; the Canva Short keeps its hand-timed format.

## How the blocks fit together

```
INPUTS               AI                                   OUTPUT
Reference Short ─▶ Format extractor ─┐
Product context ─────────────────────┼─▶ Script writer ─┬─▶ Hook clip ──────┐
Screenshots ─────┬───────────────────┘                  ├─▶ Proof collage ──┼─▶ Reel composer ─▶ Publish to Shorts
Demo video ──────┴──────────────────────────────────────┴─▶ Demo cutter ────┘
```

- **Reference Short** — a public YouTube Shorts link, or the built-in preset (a 16-second UGC app promo). The card shows the Short's real title and channel from YouTube's public oEmbed endpoint.
- **Format extractor** — sends the link to Gemini, which watches the Short and returns its format as JSON: an ordered list of beats (hook, proof, step, payoff, CTA) with durations, the hook formula, caption colors, and where the CTA lives. Only the format is used, never the footage.
- **Product context** — name, description, audience, the pain it removes, the result you got, and key features (one per line).
- **Screenshots** — app screens and results. They feed the proof collage, and the demo cutter when there is no demo video.
- **Demo video** — an MP4, MOV, or WebM screen recording.
- **Script writer** — writes the hook, twist, one step per step beat in the format, payoff line, and CTA, in the format's tone. Every line is editable.
- **Hook clip** — a generated creator still with a subtle camera move in demo mode, or your own face-to-camera clip.
- **Proof collage** — tiles the screenshots into a grid for the proof flash and the payoff.
- **Demo cutter** — cuts the demo into one clip per step, using the format's step durations.
- **Reel composer** — orders the scenes with the format's timing and caption colors, previews (with an optional YouTube Shorts UI overlay), and exports WebM/MP4 with `MediaRecorder`. Captions stay clear of the Shorts action rail.
- **Publish to Shorts** — writes a title (up to 100 characters), a description with the steps and CTA, and hashtags including #shorts. Copy the text, download the video, or run a mock upload.

**Run** executes every block upstream of each Reel composer, dependencies first. Each block shows a spinner while it runs, a check when it finishes, and its output on the card: the script's steps, the reaction clip, the collage, the numbered cuts, and finally the reel cover. The run stops at the first block that is missing an input and selects it. When every step finishes, the preview opens. Script lines you already wrote are kept unless the format or hook style changed; clear the hook line to have Run rewrite them.

Wires are typed: an output only connects to an input of the same type. Click a connected input dot to disconnect it. Duplicate a block to build A/B variants from the same inputs.

**Sample project.** *Try the sample* (sidebar, or the banner on a fresh canvas) has PromoFlow make a Short about itself. The reference is a real public YouTube Short, Canva's "Create & launch LinkedIn Ads without leaving Canva" (`youtube.com/shorts/nAZD57mN78I`), whose beats were timed by hand from its scene cuts and captions and ship as an annotated format, so the sample runs without a Gemini key. The inputs in `dist/sample/` are a real 30-second screen recording of PromoFlow and four real screens of its output. The hook uses a generated creator still in the sample; upload your own face-to-camera clip to replace it. No footage from the reference is used.

**Mock mode and Live AI mode.** Every block runs without an API key in Mock Mode. When configured with `SHOPAI_API_KEY` in `.env` (or in the browser UI when enabled), PromoFlow calls Gemini & Veo 3 (`/api/format`, `/api/script`, `/api/video`) to analyze real public YouTube Shorts, write tailored ad scripts, and generate Veo 3 hook clips. Without a key, the app runs with labelled mock outputs.

## Run on Cloud Run

The included Dockerfile runs the same app and API on Cloud Run. Configure a `SHOPAI_API_KEY` secret in Google Secret Manager, then deploy the `promo-flow/` folder with a command such as:

```bash
gcloud run deploy promoflow --source . --region asia-southeast1 --allow-unauthenticated --memory 2Gi --set-secrets SHOPAI_API_KEY=promoflow-shopai-key:latest
```

Run that command from `promo-flow/` after selecting your Google Cloud project. The deployment needs a Chromium-capable container and the supplied Dockerfile provides it. The current ChatGPT Site is a static preview and does not run the URL capture API.

## Hackathon status

The interface runs the full inputs → script → clips → reel path with mocked AI blocks, and exports a real video in Chrome and Edge. Replacing each mock with a model call is future work. Browser projects and uploaded media are stored locally; multi-user storage and server-side rendering are not built.

All interface copy and this document are in English to match the submission rules. Use screenshots and other assets that you have permission to include.
