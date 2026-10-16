import { Readable } from 'node:stream';
import { captureWebsite, browserPath } from './capture.mjs';
import { siteContext, generateHooks, generateFullScript, startVideo, videoStatus, videoFile, extractFormat, shortInfo } from './generate.mjs';

// Shared by the local server and the Vercel function, so both expose the same API.
let activeCaptures = 0;

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

function fail(response, error) {
  const message = error instanceof Error ? error.message : 'Request failed';
  const status = /could not be found/.test(message) ? 404 : /not configured/.test(message) ? 501 : /Gemini/.test(message) ? 502 : /unavailable/.test(message) ? 503 : /URL|JSON|large|port|private|reserved|prompt|Unknown/.test(message) ? 400 : 500;
  json(response, status, { error: message });
}

const routes = {
  async context(input, response) {
    if (activeCaptures >= 2) { json(response, 429, { error: 'Two sites are being captured. Try again shortly.' }); return; }
    activeCaptures++;
    try {
      if (!input.url || String(input.url).length > 500) throw new Error('Enter a public app or website URL');
      const context = siteContext(await captureWebsite(String(input.url)));
      json(response, 200, { ...context, screenshots: context.screenshots.map(image => `data:image/jpeg;base64,${image}`) });
    } finally { activeCaptures--; }
  },
  async shortinfo(input, response) {
    json(response, 200, await shortInfo(input.url));
  },
  async format(input, response) {
    json(response, 200, await extractFormat({ url: input.url, apiKey: input.apiKey, baseUrl: input.baseUrl }));
  },
  async hooks(input, response) {
    json(response, 200, await generateHooks(input.context || {}, { style: input.style, apiKey: input.apiKey, baseUrl: input.baseUrl }));
  },
  async script(input, response) {
    json(response, 200, await generateFullScript(input.context || {}, { format: input.format, tone: input.tone, apiKey: input.apiKey, baseUrl: input.baseUrl }));
  },
  async video(input, response) {
    json(response, 200, await startVideo({ prompt: input.prompt, image: typeof input.image === 'string' ? input.image : '', duration: input.duration, apiKey: input.apiKey, baseUrl: input.baseUrl }));
  },
  async 'video-status'(input, response) {
    json(response, 200, await videoStatus({ operation: input.operation, apiKey: input.apiKey, baseUrl: input.baseUrl }));
  },
  async 'video-file'(input, response) {
    const download = await videoFile({ uri: input.uri, apiKey: input.apiKey });
    response.writeHead(200, { 'Content-Type': 'video/mp4', 'Cache-Control': 'no-store' });
    Readable.fromWeb(download.body).pipe(response);
  }
};

export const bodyLimit = route => route === 'video' ? 3_000_000 : 16000;

export async function handleApi(route, method, input, response) {
  if (route === 'health') { json(response, 200, { ready: !!browserPath(), geminiConfigured: !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) }); return; }
  if (!routes[route]) { json(response, 404, { error: 'Unknown API route' }); return; }
  if (method !== 'POST') { json(response, 405, { error: 'Use POST' }); return; }

  const keyTag = input?.apiKey
    ? `[Key: ${input.apiKey.length > 8 ? `${input.apiKey.slice(0, 4)}...${input.apiKey.slice(-4)}` : '****'}]`
    : '[Key: env/default]';
  const isShopAI = input?.baseUrl?.includes('shopaikey') || (input?.apiKey && !input.apiKey.startsWith('AIza'));
  const provider = isShopAI ? 'ShopAIKey' : 'Google Gemini';

  console.log(`[${new Date().toISOString()}] [API:${route}] ${provider} request ${keyTag}`);

  try {
    await routes[route](input || {}, response);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [API:${route}] Error:`, error.message);
    fail(response, error);
  }
}
