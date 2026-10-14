// Scans the curated Shorts below and writes dist/library.json for the Library page.
// Stats come from each Short's public YouTube page; format and insights come from Gemini watching the video.
// Run: GEMINI_API_KEY=... node scan-library.mjs   (re-run any time to refresh the numbers)
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { extractFormat, gemini, clean } from './generate.mjs';

// Picked by hand: app promos that clearly outperformed their channel, one per domain.
// cover: which YouTube still to use when the Short's own cover is a dark first frame.
const SHORTS = [
  { id: 'zH_WqhnnYUg', domain: 'Productivity' },
  { id: 'NZBJvtSbFww', domain: 'Health & Fitness' },
  { id: '3YWrLksIaAY', domain: 'Education' },
  { id: 'Pqx14nRu-NA', domain: 'Fintech' },
  { id: 'nAZD57mN78I', domain: 'Marketing SaaS', cover: 'maxres2.jpg' }
];

const out = resolve(import.meta.dirname, 'dist');
const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
if (!key) { console.error('Set GEMINI_API_KEY first.'); process.exit(1); }
const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const headers = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36', 'Accept-Language': 'en-US,en' };

// "2.58 thousand subscribers" → 2580, "1.2K" → 1200
function count(text) {
  const match = String(text || '').replace(/,/g, '').match(/([\d.]+)\s*(thousand|million|billion|K|M|B)?/i);
  if (!match) return null;
  const scale = { thousand: 1e3, k: 1e3, million: 1e6, m: 1e6, billion: 1e9, b: 1e9 }[(match[2] || '').toLowerCase()] || 1;
  return Math.round(Number(match[1]) * scale);
}

async function stats(id) {
  const html = await (await fetch(`https://www.youtube.com/watch?v=${id}`, { headers, signal: AbortSignal.timeout(15000) })).text();
  const player = JSON.parse(html.match(/var ytInitialPlayerResponse = (\{.*?\});(?:var|<\/script>)/s)?.[1] || '{}');
  const details = player.videoDetails, micro = player.microformat?.playerMicroformatRenderer || {};
  if (!details) throw new Error(`No public data for ${id}`);
  const find = pattern => html.match(pattern)?.[1];
  return {
    title: clean(details.title, 120), channel: clean(details.author, 60),
    subscribers: count(find(/"subscriberCountText":\{"accessibility":\{"accessibilityData":\{"label":"([^"]+)"/) || find(/"subscriberCountText":\{"simpleText":"([^"]+)"/)),
    views: Number(details.viewCount),
    likes: count(find(/"likeCount":"(\d+)"/) || find(/like this video along with ([\d,]+) other/)),
    comments: count(find(/"commentCount":\{"simpleText":"([^"]+)"/) || find(/"contextualInfo":\{"runs":\[\{"text":"([^"]+)"/)),
    seconds: Number(details.lengthSeconds),
    publishedAt: micro.publishDate?.slice(0, 10) || ''
  };
}

// Saves the vertical Shorts thumbnail when YouTube has one, otherwise the standard one.
async function thumbnail(id, cover) {
  await mkdir(resolve(out, 'library'), { recursive: true });
  for (const name of [cover, 'oar2.jpg', 'hqdefault.jpg'].filter(Boolean)) {
    const response = await fetch(`https://i.ytimg.com/vi/${id}/${name}`, { headers });
    if (!response.ok) continue;
    await writeFile(resolve(out, 'library', `${id}.jpg`), Buffer.from(await response.arrayBuffer()));
    return `library/${id}.jpg`;
  }
  return '';
}

// What a founder must be able to produce; the Library shows these as the effort for each format.
const REQUIRES = ['face on camera', 'voiceover', 'screen recording', 'real-world footage', 'graphics'];

async function insight(id, domain, info) {
  const prompt = `Watch this YouTube Short. It promotes an app in the ${domain} domain. Stats: ${info.views} views, ${info.likes} likes, channel ${info.channel} with ${info.subscribers} subscribers.
Help an app founder who has no idea for their own Short decide whether to copy this format. Return only JSON:
{"product": "the app or product shown", "productType": "e.g. AI calorie tracker", "audience": "who the video speaks to, a few words",
 "summary": "one sentence: what happens in the video",
 "whyItWorks": ["three short reasons this format performs, each under 15 words, grounded in what is on screen"],
 "bestFor": "which kinds of apps can reuse this format, one sentence",
 "needs": ["what the founder must record or prepare, 2-4 short items"],
 "requires": ["every item from this list the format needs: ${REQUIRES.join(', ')}"]}`;
  const result = await gemini(`models/${encodeURIComponent(model)}:generateContent`, key, {
    contents: [{ role: 'user', parts: [{ fileData: { fileUri: `https://www.youtube.com/watch?v=${id}` } }, { text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: .2 }
  }, 120000);
  const raw = JSON.parse(result.candidates?.[0]?.content?.parts?.filter(part => !part.thought).map(part => part.text || '').join('').replace(/^```(?:json)?|```$/g, '').trim() || '{}');
  const list = (items, max, size) => (Array.isArray(items) ? items : []).slice(0, max).map(item => clean(item, size)).filter(Boolean);
  return {
    product: clean(raw.product, 60), productType: clean(raw.productType, 60), audience: clean(raw.audience, 80),
    summary: clean(raw.summary, 220), whyItWorks: list(raw.whyItWorks, 3, 120), bestFor: clean(raw.bestFor, 180), needs: list(raw.needs, 4, 80),
    requires: REQUIRES.filter(item => (Array.isArray(raw.requires) ? raw.requires : []).some(value => String(value).toLowerCase() === item))
  };
}

// Gemini answers 503 under load; wait and try again a few times.
async function retry(task, tries = 5) {
  for (let attempt = 1; ; attempt++) {
    try { return await task(); }
    catch (error) {
      if (attempt >= tries || !/\((429|500|503)\)|unreadable|could not find a hook/.test(error.message)) throw error;
      process.stdout.write(`retry ${attempt}… `);
      await new Promise(done => setTimeout(done, attempt * 8000));
    }
  }
}

const shorts = [];
for (const { id, domain, cover: still } of SHORTS) {
  process.stdout.write(`${id} · ${domain}… `);
  const info = await stats(id);
  const format = await retry(() => extractFormat({ url: `https://www.youtube.com/shorts/${id}` }));
  const notes = await retry(() => insight(id, domain, info));
  const cover = await thumbnail(id, still);
  shorts.push({ videoId: id, url: `https://www.youtube.com/shorts/${id}`, domain, ...info, thumbnail: cover, ...notes, format });
  console.log(`${info.views.toLocaleString('en-US')} views, ${format.beats.length} beats`);
}
await writeFile(resolve(out, 'library.json'), `${JSON.stringify({ scannedAt: new Date().toISOString(), model, shorts }, null, 2)}\n`);
console.log(`Wrote dist/library.json with ${shorts.length} Shorts.`);
