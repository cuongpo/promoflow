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

Set `GEMINI_API_KEY` in the environment to let the Format extractor watch real Shorts; without it the app runs with labelled mock outputs.
