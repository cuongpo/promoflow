# PromoFlow — Pitch

11 slides · AI Builder Cup 2026 · Media, Content & Digital Experiences

**Outline**

1. **Why** (slides 1–3): the problem small teams face and the reel format that works
2. **What** (slides 4–6): PromoFlow's inputs, block pipeline and editing experience
3. **How** (slides 7–9): Google AI, the Cloud Run architecture and honest build status
4. **Who** (slides 10–11): who it serves, how it grows, and where to try it

---

## 1. Cover

*AI Builder Cup 2026 · Media, Content & Digital Experiences*

# promoflow.

Turn a product's context, screenshots and demo recording into a 15-second, scroll-stopping vertical reel.

[Team name] · [Member 1] · [Member 2] · [Member 3]

> **Speaker notes:** Hi, we're [team]. PromoFlow is a visual studio that turns what a product team already has — a description, a few screenshots, a screen recording — into a ready-to-post 15-second UGC-style reel.

---

## 2. The problem

**Product teams know a 15-second reel can sell their app. Making one every week is the part they can't keep up with.**

1. Writing a hook that stops the scroll in two seconds
2. Cutting a screen recording into captioned steps
3. Re-editing a 9:16 cut for every variant they want to test

> **Speaker notes:** Founders and small marketing teams already know the UGC reel formula works. What stops them is the editing: writing the hook, cutting the demo, captioning every step, and doing it again for each A/B variant. That needs editing skill, time, or an agency. [Add one sourced data point here if you have it.]

---

## 3. The format that works: five beats in 15 seconds

| Beat | Length | What's on screen |
| --- | --- | --- |
| Hook | 2.5 s | Reaction clip, a quoted line and a twist |
| Proof flash | 1 s | Screenshot collage under the same captions |
| Demo steps | 4 × 2 s | Numbered cuts with yellow captions |
| Payoff | 3 s | The result, over the proof collage |
| CTA | Caption | In the post caption, or an optional end card |

PromoFlow builds every beat from what the team already has. Nobody has to film or edit.

> **Speaker notes:** This is the common UGC ad structure, and it's exactly what PromoFlow's reel composer assembles: a 2.5-second reaction hook, a one-second proof flash, four two-second demo steps, a three-second payoff, and the call to action in the caption.

---

## 4. Three inputs in. One reel out.

**Inputs**

- **Product context:** name, audience, the pain it removes, the result, key features
- **Screenshots:** app screens and results for the proof collage
- **Demo video:** an MP4, MOV or WebM screen recording

→ **Output: a 9:16 reel and its post caption.** Hook, proof flash, four captioned demo steps and a payoff. Previewed in a phone frame and exported as WebM or MP4.

> **Speaker notes:** PromoFlow asks only for what a product team already has. Product context drives the script; screenshots drive the proof collage (and the demo cuts when there's no video); the demo recording is cut into one clip per script step. Out comes a vertical reel ready to post, plus its caption.

---

## 5. Every step is a block you can edit

| Inputs | → | AI blocks | → | Output |
| --- | --- | --- | --- | --- |
| **Product context**: name, pain, result, features | | **Script writer**: hook, twist, 4 steps, payoff, CTA | | **Reel composer**: orders the scenes, shows the timeline, previews and exports the 9:16 reel with its caption |
| **Screenshots**: app screens and results | | **Hook clip**: AI reaction clip or your face | | |
| **Demo video**: screen recording | | **Proof collage**: screenshots tiled into a grid | | |
| | | **Demo cutter**: one captioned clip per step | | |

> **Speaker notes:** Under the hood the reel is a graph of blocks on a canvas. Inputs on the left, AI blocks in the middle, the reel composer on the right. Wires are typed, so an output only connects to an input of the same kind. Because each step is visible, a marketer can see exactly where a line or a clip came from and change just that block.

---

## 6. One click runs the whole flow

1. **Add inputs:** drop in product details, screenshots and a screen recording.
2. **Press Run:** blocks run dependencies first, each showing a spinner, then a check. Run stops at the first missing input and selects it.
3. **Tweak:** edit any script line; your edits survive a rerun. Duplicate a block to build an A/B variant.
4. **Export:** preview in a phone frame, then export WebM or MP4, with an optional CTA end card.

Typed wires keep the flow valid: an output only connects to an input of the same type.

> **Speaker notes:** Demo this live if you can. Load the starter pipeline, press Run, watch each block tick through, then open the preview. Point out that hand-written script lines are kept, and duplicate the script block to show an A/B variant.

---

## 7. Google AI does the creative work

| | Hooks | Reaction clips | Site capture |
| --- | --- | --- | --- |
| **Engine** | Gemini 3.6 Flash | Veo 3.1 Fast | Headless Chromium |
| **What it does** | Writes four alternative hooks for an angle (problem, curiosity, POV or bold) as schema-checked JSON | Generates a 4, 6 or 8-second vertical hook clip from a prompt, optionally starting from a still image | Paste a product URL; it pulls the title, headings and screenshots in as context for Gemini |
| **Safeguard** | **Grounded:** only facts from the product context. No invented metrics, testimonials or pricing. | **Clean frames:** no text or logos in the clip; the composer adds the captions. | **Safe by default:** private and reserved IP ranges are blocked. |

These run as server endpoints today. The canvas blocks still use mock output until they are wired in (slide 9).

> **Speaker notes:** Gemini writes the words, Veo makes the reaction footage, and website capture gives both of them real facts to work from. The hook prompt explicitly forbids inventing metrics, testimonials, customers, pricing or features, which matters for ads. Both model IDs are configurable through environment variables.

---

## 8. Built to run on Google Cloud

**Browser app (client)** → **Cloud Run (asia-southeast1)** → **Google AI (Gemini API)**

- **Browser app:** block canvas and inspector; media kept in IndexedDB; reel drawn to canvas, exported with MediaRecorder
- **Cloud Run:** Node API for context, hooks, video and status; Chromium for site capture; one Dockerfile, 2 GiB
- **Google AI:** Gemini returns structured hook JSON; Veo runs long-running jobs the client polls

**Secret Manager:** holds the Gemini API key and injects it into Cloud Run.
**Guardrails:** at most two captures at once, request size limits, no private URLs.

> **Speaker notes:** The browser does the editing and the final render, which keeps server cost low: Cloud Run only handles AI calls and website capture, and scales to zero when idle. Veo jobs take minutes, so the server starts the job and the client polls for status instead of holding a request open.

---

## 9. Where the build stands today

**Working now**

- Full inputs → script → clips → reel flow on the canvas
- Real uploads, preview and WebM/MP4 export in Chrome and Edge
- Gemini, Veo and site-capture endpoints on the server
- Cloud Run container with the key in Secret Manager

**Next**

- Swap each mock AI block for its Gemini or Veo call
- Server-side rendering, so export works in any browser
- Accounts and shared, multi-user project storage
- [Your next milestone]

> **Speaker notes:** Be upfront here. The end-to-end flow works and exports a real video, but in the current UI the AI blocks return placeholder output so the demo runs without an API key. The Gemini and Veo integrations already exist on the server; connecting each block to them is the next step.

---

## 10. Built for teams without a video editor

- **Indie founders:** ship a launch reel the same day as the feature.
- **App marketing teams:** test hook variants side by side from one set of inputs.
- **Agencies and creators:** draft client reels at volume, then polish the best ones.

**Business model:** [Free flow with your own uploads; paid credits for Gemini and Veo generation at $__/month]
**Market:** [Size of the target segment, with source]

> **Speaker notes:** Three groups feel this pain most: founders who are their own marketing team, small app teams that need to test many hooks, and agencies producing reels for many clients. Fill in the pricing and market figures before submitting.

---

## 11. Try it

# Hook. Demo. Proof.

- **Live app:** [Cloud Run URL]
- **Source code:** [GitHub repository URL]
- **Demo video:** [Video link]

> **Speaker notes:** PromoFlow turns what a product team already has into a reel they can post today. Thank you. We'd love your questions.
