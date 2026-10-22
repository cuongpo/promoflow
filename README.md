# PromoFlow

AI Builder Cup 2026 · Media, Content & Digital Experiences

PromoFlow helps app founders make YouTube Shorts that work. Pick an app Short that already performed (with its real YouTube numbers), or paste any public Short; Gemini reads its format beat by beat, and PromoFlow rebuilds that format for your app from your own screen recording: a plan, a shot list, a script, the cut, the composed 9:16 reel, and the title and hashtags to post it.

- **Live app:** https://promo-flow-blush.vercel.app
- **The app:** [`promo-flow/`](promo-flow/) — how it works, how to run it locally, and how to deploy it to Cloud Run are in [its README](promo-flow/README.md)
- **Product docs:** [PRD](docs/PromoFlow-PRD.md) · [Pitch deck](docs/PromoFlow-Pitch-Deck.md) (PDFs alongside)

## Run locally

```bash
cd promo-flow
npm install
npm run dev        # http://localhost:4173
```

Copy `.env.example` to `.env` to configure your API keys and models:
- **`SHOPAI_API_KEY`**: Connects live AI (Gemini & Veo 3) for watching real Shorts, writing tailored scripts, and generating Veo hooks.
- **Model controls per step**:
  - `FORMAT_MODEL`: Model used to watch & extract Short formats (e.g. `gemini-2.5-flash` or `gemini-3.8-flash`)
  - `SCRIPT_MODEL`: Model used for video script generation
  - `HOOKS_MODEL`: Model used for opening hook copy options
  - `VEO_MODEL`: Model used for Veo 3 video generation (`veo3.1-fast` or `veo-3.1-fast-generate-preview`)
- **UI controls**:
  - `SHOW_API_KEY_INPUT`: Set to `true` to display the API key input card on the landing page, or `false` to hide it (default: `false`).

Without an API key, the app runs in Mock Mode using hand-annotated presets and demo outputs.
