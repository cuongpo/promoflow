// GEMINI_BASE_URL points the Gemini calls at a compatible proxy; Google's endpoint by default.
const API = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';
const hookSchema = {
  type: 'object',
  properties: {
    hooks: {
      type: 'array',
      items: {
        type: 'object',
        properties: { text: { type: 'string' }, sub: { type: 'string' } },
        required: ['text', 'sub']
      }
    }
  },
  required: ['hooks']
};
const styles = {
  problem: 'name a painful, specific problem the audience already feels',
  curiosity: 'open a curiosity gap the viewer must keep watching to close',
  pov: 'use a first-person "POV:" or "I…" voice, like a creator talking to camera',
  bold: 'make a bold but fully truthful statement about what the product does'
};

export const clean = (text, max) => {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (value.length <= max) return value;
  const piece = value.slice(0, max - 1);
  const wordEnd = piece.lastIndexOf(' ');
  return `${piece.slice(0, wordEnd > max * .6 ? wordEnd : max - 1).replace(/[.,;: ]+$/, '')}…`;
};
const headline = (text, fallback) => clean(text || fallback, 72).replace(/[.!?]+$/, '');
const apiKeyFrom = apiKey => (typeof apiKey === 'string' && apiKey.slice(0, 300)) || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

export function siteContext(site) {
  return {
    appName: headline(site.title?.split(/[|–—]/)[0], 'Your app'),
    url: site.url,
    hero: site.hero,
    description: clean(site.description || site.hero || site.headings[0], 300),
    facts: site.headings.slice(0, 12).map(text => clean(text, 160)),
    screenshots: site.screenshots
  };
}

function contextText(context) {
  return [
    `Product: ${clean(context.appName, 60) || 'unnamed app'}`,
    context.url && `Website: ${clean(context.url, 200)}`,
    context.description && `Description: ${clean(context.description, 400)}`,
    context.audience && `Audience: ${clean(context.audience, 100)}`,
    context.goal && `Ad goal: ${clean(context.goal, 100)}`,
    Array.isArray(context.facts) && context.facts.length && `Evidence from the site: ${context.facts.map(fact => clean(fact, 160)).join(' | ').slice(0, 2000)}`
  ].filter(Boolean).join('\n');
}

function fallbackHooks(context) {
  const name = clean(context.appName, 40) || 'this app';
  const audience = clean(context.audience, 60);
  const lead = clean(context.description, 90);
  return [
    { text: audience ? `${audience[0].toUpperCase()}${audience.slice(1)}, watch this.` : 'Watch this before you try another app.', sub: lead },
    { text: `I wish I'd found ${name} sooner.`, sub: lead },
    { text: headline(context.hero, `POV: you just found ${name}`), sub: clean(context.goal, 80) },
    { text: `Here's what ${name} actually does.`, sub: lead }
  ];
}

export async function gemini(path, key, body, timeout) {
  const response = await fetch(`${API}/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeout)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`Gemini request failed (${response.status}): ${clean(result.error?.message, 180) || 'Check the API key and model'}`);
  return result;
}

export async function generateHooks(context, { style, apiKey }) {
  const key = apiKeyFrom(apiKey);
  if (!key) return { hooks: fallbackHooks(context), source: 'template' };
  const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  const prompt = `Write 4 alternative opening hooks for a 9:16 social video ad. A hook is the on-screen caption shown in the first 3 seconds; it must stop the scroll and be readable in under 2 seconds (max 8 words). Each hook also gets an optional short subtitle (max 10 words, may be empty). Angle: ${styles[style] || styles.problem}. Use ONLY facts in the product context. Do not invent metrics, testimonials, customers, pricing, or features. English only.\n\n${contextText(context)}`;
  const result = await gemini(`models/${encodeURIComponent(model)}:generateContent`, key, {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseFormat: { text: { mimeType: 'application/json', schema: hookSchema } } }
  }, 45000);
  const text = result.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';
  const hooks = (JSON.parse(text || '{}').hooks || []).map(hook => ({ text: clean(hook.text, 70), sub: clean(hook.sub, 80) })).filter(hook => hook.text).slice(0, 4);
  if (!hooks.length) throw new Error('Gemini returned no hooks');
  return { hooks, source: 'gemini', model };
}

const OPERATION = /^models\/[\w.-]+\/operations\/[\w-]+$/;
const FILE_HOST = 'https://generativelanguage.googleapis.com/';

export async function startVideo({ prompt, image, duration, apiKey }) {
  const key = apiKeyFrom(apiKey);
  if (!key) throw new Error('Video generation needs a Gemini API key. Upload a clip or use an app screen instead.');
  if (!String(prompt || '').trim()) throw new Error('Write a video prompt first');
  const model = process.env.VEO_MODEL || 'veo-3.1-fast-generate-preview';
  const instance = { prompt: `${clean(prompt, 1500)}\nVertical 9:16 framing. Do not render any on-screen text, captions, logos, or watermarks; a caption is added later.` };
  if (image) instance.image = { inlineData: { mimeType: 'image/jpeg', data: image } };
  const operation = await gemini(`models/${encodeURIComponent(model)}:predictLongRunning`, key, {
    instances: [instance],
    parameters: { aspectRatio: '9:16', durationSeconds: String([4, 6, 8].includes(Number(duration)) ? Number(duration) : 4), personGeneration: image ? 'allow_adult' : 'allow_all' }
  }, 30000);
  return { operation: operation.name, model };
}

// Veo runs for minutes, so the client polls this instead of holding one request open.
export async function videoStatus({ operation, apiKey }) {
  const key = apiKeyFrom(apiKey);
  if (!OPERATION.test(String(operation || ''))) throw new Error('Unknown video operation');
  const status = await gemini(operation, key, null, 20000);
  if (!status.done) return { done: false };
  if (status.error) throw new Error(`Gemini video generation failed: ${clean(status.error.message, 180)}`);
  const uri = status.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
  if (!uri) throw new Error('Gemini returned no video. The prompt may have been filtered; try rewording it.');
  return { done: true, uri };
}

export async function videoFile({ uri, apiKey }) {
  if (!String(uri || '').startsWith(FILE_HOST)) throw new Error('Unknown video URL');
  const download = await fetch(uri, { headers: { 'x-goog-api-key': apiKeyFrom(apiKey) }, redirect: 'follow', signal: AbortSignal.timeout(60000) });
  if (!download.ok) throw new Error(`Gemini video download failed (${download.status})`);
  return download;
}

// ---------- Reference Short → reusable format ----------
const BEAT_KINDS = ['hook', 'proof', 'step', 'turn', 'payoff', 'cta'];
const clampNumber = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;

export function youtubeId(value) {
  let url;
  try { url = new URL(String(value || '').trim()); } catch { return ''; }
  const host = url.hostname.replace(/^(www|m)\./, '');
  const id = host === 'youtu.be' ? url.pathname.slice(1) : host === 'youtube.com' ? (url.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/)?.[1] || url.searchParams.get('v')) : '';
  return /^[\w-]{11}$/.test(id || '') ? id : '';
}

function normalizeFormat(raw, videoId) {
  const beats = (Array.isArray(raw?.beats) ? raw.beats : []).slice(0, 12).map(beat => ({
    kind: BEAT_KINDS.includes(beat.kind) ? beat.kind : 'step',
    seconds: Math.round(clampNumber(beat.seconds, .5, 8, 2) * 2) / 2,
    caption: clean(beat.caption, 90),
    note: clean(beat.note, 120)
  }));
  if (!beats.some(beat => beat.kind === 'hook') || !beats.some(beat => beat.kind === 'step')) throw new Error('Gemini could not find a hook and demo steps in this Short. Try one that shows a product step by step.');
  return {
    source: 'gemini', videoId,
    title: clean(raw.title, 90),
    summary: clean(raw.summary, 160),
    hookFormula: clean(raw.hookFormula, 180),
    tone: ['confession', 'pov', 'problem', 'whatif'].includes(raw.tone) ? raw.tone : 'confession',
    beats,
    captionColors: { hook: raw.captionColors?.hook === 'yellow' ? 'yellow' : 'white', steps: raw.captionColors?.steps === 'white' ? 'white' : 'yellow' },
    cta: { placement: raw.cta?.placement === 'endcard' ? 'endcard' : 'caption', example: clean(raw.cta?.example, 120) }
  };
}

export async function extractFormat({ url, apiKey }) {
  const videoId = youtubeId(url);
  if (!videoId) throw new Error('Paste a public YouTube Shorts URL');
  const key = apiKeyFrom(apiKey);
  if (!key) throw new Error('Gemini API key is not configured on the server');
  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const prompt = `You are a short-form video editor. Watch this YouTube Short and describe its reusable FORMAT (structure, not content) so the same format can be rebuilt for a different product.
Return only JSON with this shape:
{"title": string, "summary": "one line, e.g. Confession hook → proof flash → 4 numbered steps → results payoff",
 "hookFormula": "how the hook works, generalized", "tone": "confession" | "pov" | "problem" | "whatif",
 "beats": [{"kind": "hook" | "proof" | "step" | "turn" | "payoff" | "cta", "seconds": number, "caption": "on-screen text or spoken line", "note": "what is on screen"}],
 "captionColors": {"hook": "white" | "yellow", "steps": "white" | "yellow"},
 "cta": {"placement": "caption" | "endcard", "example": "the call to action as written"}}
List beats in order with their real durations. Use "step" for each numbered or sequential product step, and for any stretch that shows the product in use even if it is not numbered (every Short has at least one hook and one step), "proof" for social proof or results shown early, "turn" when the presenter returns to camera mid-video to raise an objection or change direction, and "payoff" for the result at the end. Use tone "whatif" for a "What if you could…?" hook. If the CTA appears or is spoken in the video, use placement "endcard"; if it is only in the description, use "caption".`;
  const result = await gemini(`models/${encodeURIComponent(model)}:generateContent`, key, {
    contents: [{ role: 'user', parts: [{ fileData: { fileUri: `https://www.youtube.com/watch?v=${videoId}` } }, { text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: .2 }
  }, 120000);
  const text = result.candidates?.[0]?.content?.parts?.filter(part => !part.thought).map(part => part.text || '').join('') || '';
  let raw;
  try { raw = JSON.parse(text.replace(/^```(?:json)?|```$/g, '').trim()); } catch { throw new Error('Gemini returned an unreadable format. Try again.'); }
  return { ...normalizeFormat(raw, videoId), model };
}

// Public title and channel for a Short, from YouTube's oEmbed endpoint (no key needed).
export async function shortInfo(url) {
  const videoId = youtubeId(url);
  if (!videoId) throw new Error('Paste a public YouTube Shorts URL');
  const response = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error([400, 401, 403, 404].includes(response.status) ? 'This Short could not be found. Check the link and make sure the video is public.' : `YouTube lookup unavailable (${response.status})`);
  const info = await response.json();
  return { videoId, title: clean(info.title, 120), author: clean(info.author_name, 60) };
}
