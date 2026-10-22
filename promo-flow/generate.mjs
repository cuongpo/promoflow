import './env.mjs';

// ShopAIKey Gemini-compatible endpoint
const API = process.env.SHOPAI_BASE_URL || 'https://api.shopaikey.com/v1';
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
const scriptSchema = {
  type: 'object',
  properties: {
    hook: { type: 'string' },
    twist: { type: 'string' },
    turn: { type: 'string' },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: { title: { type: 'string' }, sub: { type: 'string' } },
        required: ['title']
      }
    },
    payoff: { type: 'string' },
    cta: { type: 'string' }
  },
  required: ['hook', 'twist', 'steps', 'cta']
};

const styles = {
  problem: 'name a painful, specific problem the audience already feels',
  curiosity: 'open a curiosity gap the viewer must keep watching to close',
  pov: 'use a first-person "POV:" or "I…" voice, like a creator talking to camera',
  bold: 'make a bold but fully truthful statement about what the product does',
  confession: 'a self-deprecating quote about struggling, then revealing a solution'
};

export const clean = (text, max) => {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (value.length <= max) return value;
  const piece = value.slice(0, max - 1);
  const wordEnd = piece.lastIndexOf(' ');
  return `${piece.slice(0, wordEnd > max * .6 ? wordEnd : max - 1).replace(/[.,;: ]+$/, '')}…`;
};
const headline = (text, fallback) => clean(text || fallback, 72).replace(/[.!?]+$/, '');

export const apiKeyFrom = apiKey =>
  (typeof apiKey === 'string' && apiKey.trim().slice(0, 300)) ||
  process.env.GEMINI_API_KEY ||
  process.env.SHOPAI_API_KEY ||
  '';

export function isShopAI() {
  return true;
}

export function getBaseUrl(first, second) {
  const customBase = typeof first === 'string' ? first : (typeof second === 'string' ? second : null);
  if (customBase && !customBase.includes('googleapis.com')) return customBase.replace(/\/v1beta\/?$/, '/v1');
  if (process.env.SHOPAI_BASE_URL) return process.env.SHOPAI_BASE_URL.replace(/\/v1beta\/?$/, '/v1');
  return 'https://api.shopaikey.com/v1';
}

export function getModelForStep(step) {
  const defaultModel = process.env.SHOPAI_MODEL || 'gemini-2.5-flash';

  switch (step) {
    case 'format':
      return process.env.FORMAT_MODEL || defaultModel;
    case 'script':
      return process.env.SCRIPT_MODEL || defaultModel;
    case 'hooks':
      return process.env.HOOKS_MODEL || process.env.HOOK_MODEL || defaultModel;
    case 'video':
      return process.env.VEO_MODEL || process.env.VIDEO_MODEL || 'veo3.1-fast';
    case 'library':
      return process.env.LIBRARY_MODEL || process.env.FORMAT_MODEL || defaultModel;
    default:
      return process.env.SHOPAI_MODEL || 'gemini-2.5-flash';
  }
}

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

const maskKey = key => {
  if (!key || typeof key !== 'string') return '(none)';
  if (key.length <= 8) return '****';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
};
const log = (tag, ...args) => console.log(`[${new Date().toISOString()}] [${tag}]`, ...args);
const logErr = (tag, ...args) => console.error(`[${new Date().toISOString()}] [${tag}]`, ...args);

export async function gemini(path, key, body, timeout, customBase) {
  const provider = 'Gemini';
  const base = getBaseUrl(customBase);
  const headers = { 'Content-Type': 'application/json' };
  if (key) {
    headers['Authorization'] = `Bearer ${key}`;
    headers['x-goog-api-key'] = key;
  }

  const start = Date.now();
  log(provider, `-> POST ${base}/${path} | Key: ${maskKey(key)}`);

  try {
    const response = await fetch(`${base}/${path}`, {
      method: body ? 'POST' : 'GET',
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout)
    });
    const duration = Date.now() - start;
    const result = await response.json();
    if (!response.ok) {
      logErr(provider, `<- FAIL (${response.status}) in ${duration}ms:`, result.error?.message || result.message || 'Unknown error');
      throw new Error(`Gemini request failed (${response.status}): ${clean(result.error?.message || result.message, 180) || 'Check API key and model'}`);
    }
    log(provider, `<- OK (${response.status}) in ${duration}ms`);
    return result;
  } catch (err) {
    if (!err.message?.startsWith('Gemini request failed')) {
      logErr(provider, `<- Network/Timeout error in ${Date.now() - start}ms:`, err.message);
    }
    throw err;
  }
}

export function parseModelJson(rawText) {
  const text = String(rawText || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (match) {
      try { return JSON.parse(match[1]); } catch {}
    }
    throw new Error('Unreadable JSON received from model');
  }
}

export async function generateHooks(context, { style, apiKey, baseUrl }) {
  const key = apiKeyFrom(apiKey);
  if (!key) return { hooks: fallbackHooks(context), source: 'template' };
  const model = getModelForStep('hooks');
  log('Gemini:Hooks', `Generating hooks with model: ${model} | Style: ${style || 'problem'} | Key: ${maskKey(key)}`);
  const prompt = `Write 4 alternative opening hooks for a 9:16 social video ad. A hook is the on-screen caption shown in the first 3 seconds; it must stop the scroll and be readable in under 2 seconds (max 8 words). Each hook also gets an optional short subtitle (max 10 words, may be empty). Angle: ${styles[style] || styles.problem}. Use ONLY facts in the product context. Do not invent metrics, testimonials, customers, pricing, or features. Return valid JSON only with format: {"hooks": [{"text": "...", "sub": "..."}]}. English only.\n\n${contextText(context)}`;
  const result = await gemini(`models/${encodeURIComponent(model)}:generateContent`, key, {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.3 }
  }, 45000, baseUrl);
  const text = result.candidates?.[0]?.content?.parts?.filter(part => !part.thought).map(part => part.text || '').join('') || '';
  const parsed = parseModelJson(text);
  const hooks = (parsed.hooks || []).map(hook => ({ text: clean(hook.text, 70), sub: clean(hook.sub, 80) })).filter(hook => hook.text).slice(0, 4);
  if (!hooks.length) throw new Error('Gemini returned no hooks');
  log('Gemini:Hooks', `Generated ${hooks.length} hooks successfully.`);
  return { hooks, source: 'gemini', model };
}

export async function generateFullScript(context, { format, tone, apiKey, baseUrl }) {
  const key = apiKeyFrom(apiKey);
  if (!key) return null;
  const model = getModelForStep('script');
  log('Gemini:Script', `Generating full script with model: ${model} for app: ${context.appName || 'app'} | Tone: ${tone || 'confession'}`);

  const stepCount = format ? Math.max(3, Math.min(5, (format.beats || []).filter(b => b.kind === 'step').length || 3)) : 4;
  const prompt = `You are an elite short-form video copywriter for TikTok and YouTube Shorts.
Write a punchy, high-converting vertical video ad script for this product.
Tone/Angle: ${tone || 'confession'} (${styles[tone] || styles.problem}).
Produce exactly ${stepCount} distinct sequential demo steps highlighting the product's real features.
Hook line: on-screen text for the first 3 seconds (max 8 words).
Twist line: secondary text under the hook (max 10 words).
Turn line: optional line raising an objection or turning point (max 12 words).
Steps: ${stepCount} actionable steps showing how to use the app or what the user sees (title max 7 words, sub max 10 words).
Payoff line: proof or final result (max 10 words).
CTA line: clear call to action (max 8 words).
Use ONLY facts from the product information. Do not invent fake testimonials, pricing, or numbers. Return valid JSON only with format: {"hook": "...", "twist": "...", "turn": "...", "steps": [{"title": "...", "sub": "..."}], "payoff": "...", "cta": "..."}. English only.

Product Information:
${contextText(context)}
${context.features ? `Features:\n${context.features}` : ''}`;

  const result = await gemini(`models/${encodeURIComponent(model)}:generateContent`, key, {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.3 }
  }, 45000, baseUrl);

  const text = result.candidates?.[0]?.content?.parts?.filter(part => !part.thought).map(part => part.text || '').join('') || '';
  let parsed = {};
  try { parsed = parseModelJson(text); } catch { throw new Error('Gemini returned unreadable script JSON'); }
  log('Gemini:Script', `Generated script: "${parsed.hook}" with ${parsed.steps?.length || 0} steps.`);
  return {
    tone: tone || 'confession',
    hook: clean(parsed.hook, 70),
    twist: clean(parsed.twist, 80),
    turn: clean(parsed.turn, 90),
    steps: (Array.isArray(parsed.steps) ? parsed.steps : []).slice(0, 6).map(s => ({
      title: clean(s.title, 60),
      sub: clean(s.sub, 80)
    })),
    payoff: clean(parsed.payoff, 80) || `Real results with ${context.appName || 'this app'}`,
    cta: clean(parsed.cta, 80) || `Try ${context.appName || 'this app'} free`,
    source: 'gemini',
    model
  };
}

export async function startVideo({ prompt, image, duration, apiKey, baseUrl }) {
  const key = apiKeyFrom(apiKey);
  if (!key) throw new Error('Video generation needs API key. Set SHOPAI_API_KEY in .env or provide it in the request.');
  if (!String(prompt || '').trim()) throw new Error('Write a video prompt first');

  const model = getModelForStep('video');
  const shopBase = getBaseUrl(baseUrl).replace(/\/v1(?:beta)?\/?$/, '');
  const payload = {
    model,
    prompt: `${clean(prompt, 1500)}\nVertical 9:16 framing. Do not render any on-screen text, captions, logos, or watermarks; a caption is added later.`,
    metadata: {
      aspect_ratio: '9:16',
      enhance_prompt: true,
      enable_upsample: true
    }
  };
  if (image) payload.metadata.images = [typeof image === 'string' && image.startsWith('http') ? image : `data:image/jpeg;base64,${image}`];

  log('Veo3:Video', `-> Creating video generation task via ${shopBase}/v1/video/generations | Key: ${maskKey(key)} | Model: ${payload.model}`);
  const start = Date.now();
  const response = await fetch(`${shopBase}/v1/video/generations`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const res = await response.json();
  const elapsed = Date.now() - start;
  log('Veo3:Video', `<- Server response (${response.status}) in ${elapsed}ms:`, JSON.stringify(res));

  const taskId = res.data?.task_id || res.task_id || res.data?.id || res.id || (typeof res.data === 'string' && res.data.startsWith('task_') ? res.data : null);
  if (!response.ok || res.error || (res.code && res.code !== 'success') || !taskId) {
    const errMsg = res.error?.message || (typeof res.error === 'string' ? res.error : null) || res.message || res.msg || (res.data?.fail_reason) || `Veo 3 video generation failed (${response.status}): ${JSON.stringify(res)}`;
    logErr('Veo3:Video', `<- Generation failed (${response.status}) in ${elapsed}ms:`, errMsg);
    throw new Error(errMsg);
  }
  log('Veo3:Video', `<- Video task created in ${elapsed}ms | Task ID: ${taskId}`);
  return { operation: taskId, model: payload.model, provider: 'veo3' };
}

// Veo runs for minutes, so the client polls this instead of holding one request open.
export async function videoStatus({ operation, apiKey, baseUrl }) {
  const key = apiKeyFrom(apiKey);
  if (!key) throw new Error('API key is not configured');
  const shopBase = getBaseUrl(baseUrl).replace(/\/v1(?:beta)?\/?$/, '');
  log('Veo3:Video', `-> Polling task status: ${operation} | Key: ${maskKey(key)}`);
  const response = await fetch(`${shopBase}/v1/video/generations/${encodeURIComponent(operation)}`, {
    headers: { 'Authorization': `Bearer ${key}` }
  });
  const res = await response.json();
  log('Veo3:Video', `<- Poll response status: ${response.status} | Body:`, JSON.stringify(res));
  if (!response.ok || res.error || (res.code && res.code !== 'success')) {
    const errMsg = res.error?.message || (typeof res.error === 'string' ? res.error : null) || res.message || res.msg || 'Failed to check video status';
    logErr('Veo3:Video', `<- Poll failed (${response.status}):`, errMsg);
    throw new Error(errMsg);
  }
  const data = res.data || res || {};
  const status = data.status || res.status;
  log('Veo3:Video', `<- Task ${operation} status: ${status} | Progress: ${data.progress || 'processing'}`);
  if (status === 'SUCCESS' || status === 'completed') return { done: true, uri: data.result_url || data.video_url || data.url };
  if (status === 'FAILURE' || status === 'failed') throw new Error(`Veo 3 generation failed: ${clean(data.fail_reason || data.error, 180) || 'Unknown error'}`);
  return { done: false, progress: data.progress || 'processing' };
}

export async function videoFile({ uri, apiKey }) {
  if (String(uri || '').startsWith('http')) {
    const headers = {};
    const key = apiKeyFrom(apiKey);
    if (key) headers['Authorization'] = `Bearer ${key}`;
    const download = await fetch(uri, { headers, redirect: 'follow', signal: AbortSignal.timeout(60000) });
    if (!download.ok) throw new Error(`Video download failed (${download.status})`);
    return download;
  }
  throw new Error('Unknown video URL');
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
  const beats = (Array.isArray(raw?.beats) ? raw.beats : []).slice(0, 12).map(beat => {
    const kind = BEAT_KINDS.includes(beat.kind) ? beat.kind : 'step';
    const maxSec = kind === 'hook' ? 4.5 : kind === 'step' ? 3.5 : kind === 'turn' ? 3.5 : kind === 'payoff' ? 3.5 : kind === 'cta' ? 3.0 : 1.5;
    const minSec = kind === 'proof' ? 0.8 : kind === 'step' ? 1.5 : 2.0;
    return {
      kind,
      seconds: Math.round(clampNumber(beat.seconds, minSec, maxSec, 2.5) * 2) / 2,
      caption: clean(beat.caption, 90),
      note: clean(beat.note, 120)
    };
  });
  if (!beats.some(beat => beat.kind === 'hook') || !beats.some(beat => beat.kind === 'step')) throw new Error('Could not find a hook and demo steps in this Short. Try one that shows a product step by step.');
  let totalSec = beats.reduce((sum, b) => sum + b.seconds, 0);
  if (totalSec > 28) {
    const factor = 24 / totalSec;
    for (const b of beats) {
      b.seconds = Math.max(b.kind === 'proof' ? 0.8 : 1.5, Math.round(b.seconds * factor * 2) / 2);
    }
  } else if (totalSec < 15 && beats.length) {
    const factor = 16 / totalSec;
    for (const b of beats) {
      b.seconds = Math.round(b.seconds * factor * 2) / 2;
    }
  }
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

export async function extractFormat({ url, apiKey, baseUrl }) {
  const videoId = youtubeId(url);
  if (!videoId) throw new Error('Paste a public YouTube Shorts URL');
  const key = apiKeyFrom(apiKey);
  if (!key) throw new Error('API key is not configured');
  const model = getModelForStep('format');
  const tag = 'Gemini:Format';
  log(tag, `-> Extracting format for video ${videoId} with model ${model} | Key: ${maskKey(key)}`);
  const prompt = `You are a short-form video editor. Watch this YouTube Short and describe its reusable FORMAT (structure, not content) so the same format can be rebuilt for a different product.
Return only JSON with this shape:
{"title": string, "summary": "one line, e.g. Confession hook → proof flash → 4 numbered steps → results payoff",
 "hookFormula": "how the hook works, generalized", "tone": "confession" | "pov" | "problem" | "whatif",
 "beats": [{"kind": "hook" | "proof" | "step" | "turn" | "payoff" | "cta", "seconds": number, "caption": "on-screen text or spoken line", "note": "what is on screen"}],
 "captionColors": {"hook": "white" | "yellow", "steps": "white" | "yellow"},
 "cta": {"placement": "caption" | "endcard", "example": "the call to action as written"}}
List beats in order with their real durations, optimized for high-retention short-form video between 15 and 30 seconds total (hook 3-4s, steps 1.5-3s each, payoff 2-3s, CTA 2-3s). Use "step" for each numbered or sequential product step, and for any stretch that shows the product in use even if it is not numbered (every Short has at least one hook and one step), "proof" for social proof or results shown early, "turn" when the presenter returns to camera mid-video to raise an objection or change direction, and "payoff" for the result at the end. Use tone "whatif" for a "What if you could…?" hook. If the CTA appears or is spoken in the video, use placement "endcard"; if it is only in the description, use "caption".`;
  const result = await gemini(`models/${encodeURIComponent(model)}:generateContent`, key, {
    contents: [{ role: 'user', parts: [{ fileData: { fileUri: `https://www.youtube.com/watch?v=${videoId}` } }, { text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: .2 }
  }, 120000, baseUrl);
  const text = result.candidates?.[0]?.content?.parts?.filter(part => !part.thought).map(part => part.text || '').join('') || '';
  let raw;
  try { raw = JSON.parse(text.replace(/^```(?:json)?|```$/g, '').trim()); } catch {
    logErr(tag, `<- Unreadable format JSON received:`, text.slice(0, 300));
    throw new Error('API returned an unreadable format. Try again.');
  }
  const normalized = normalizeFormat(raw, videoId);
  log(tag, `<- Format extracted successfully: "${normalized.title}" (${normalized.beats.length} beats)`);
  return { ...normalized, source: 'gemini', model };
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
