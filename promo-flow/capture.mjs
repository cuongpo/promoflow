import { lookup } from 'node:dns/promises';
import { existsSync } from 'node:fs';
import { isIP } from 'node:net';
import { chromium } from 'playwright-core';

const browserPaths = [
  process.env.CHROME_BIN,
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean);

export function browserPath() { return process.env.VERCEL ? 'serverless' : browserPaths.find(existsSync) || null; }

async function launchBrowser() {
  if (process.env.VERCEL) {
    const { default: serverless } = await import('@sparticuz/chromium');
    return chromium.launch({ executablePath: await serverless.executablePath(), args: serverless.args, headless: true });
  }
  const executablePath = browserPath();
  if (!executablePath) throw new Error('Chromium is unavailable. Set CHROME_BIN to a Chrome or Chromium executable.');
  return chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
}

function publicIP(address) {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168 || (b === 0 && c === 2))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (isIP(address) === 6) {
    const value = address.toLowerCase();
    if (value.startsWith('::ffff:')) return publicIP(value.slice(7));
    return !(value === '::' || value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb') || value.startsWith('ff') || value.startsWith('2001:db8'));
  }
  return false;
}

const dnsCache = new Map();
export async function validatePublicURL(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use a public HTTP or HTTPS URL');
  if (url.port && !['80', '443'].includes(url.port)) throw new Error('Use a public URL on port 80 or 443');
  const host = url.hostname.replace(/\.$/, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('Local or private URLs are not supported');
  let addresses = dnsCache.get(host);
  if (!addresses) {
    addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
    dnsCache.set(host, addresses);
  }
  if (!addresses.length || addresses.some(({ address }) => !publicIP(address))) throw new Error('This URL resolves to a private or reserved address');
  return url;
}

export async function captureWebsite(value) {
  await validatePublicURL(value);
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, serviceWorkers: 'block', acceptDownloads: false });
    await context.route('**/*', async route => {
      try { await validatePublicURL(route.request().url()); await route.continue(); }
      catch { await route.abort(); }
    });
    const page = await context.newPage();
    await page.goto(value, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(1200);
    const content = await page.evaluate(() => {
      const meta = selector => document.querySelector(selector)?.content?.trim() || '';
      const scope = document.querySelector('main') || document.body;
      const text = [...scope.querySelectorAll('h1,h2,h3,p,[role="heading"]')]
        .filter(element => !element.closest('header,nav,footer,[role="navigation"]') && element.getClientRects().length)
        .map(element => element.innerText?.replace(/\s+/g, ' ').trim())
        .filter(value => value && value.length >= 18 && value.length <= 240);
      const sections = [...scope.querySelectorAll('h2,h3')]
        .filter(element => !element.closest('header,nav,footer,[role="navigation"]') && element.getClientRects().length && element.innerText?.trim().length >= 18)
        .map(element => Math.round(element.getBoundingClientRect().top + window.scrollY));
      return {
        title: document.title?.trim() || meta('meta[property="og:title"]'),
        hero: document.querySelector('h1')?.innerText?.replace(/\s+/g, ' ').trim() || '',
        description: meta('meta[name="description"]') || meta('meta[property="og:description"]'),
        headings: [...new Set(text)].slice(0, 24),
        pageHeight: document.documentElement.scrollHeight,
        sections
      };
    });
    const screenshots = [];
    const maxScroll = Math.max(0, content.pageHeight - 844);
    const positions = [0];
    for (const y of content.sections) {
      const position = Math.min(maxScroll, Math.max(0, y - 125));
      if (position > 550 && position < maxScroll - 300 && position - positions.at(-1) > 500) positions.push(position);
      if (positions.length === 3) break;
    }
    for (const fraction of [.25, .5]) {
      if (positions.length >= 3) break;
      const position = Math.round(maxScroll * fraction);
      if (position > 450 && positions.every(existing => Math.abs(existing - position) > 400)) positions.push(position);
    }
    for (const position of positions) {
      await page.evaluate(y => {
        document.documentElement.style.scrollBehavior = 'auto';
        document.body.style.scrollBehavior = 'auto';
        window.scrollTo({ top: y, behavior: 'instant' });
      }, position);
      await page.waitForTimeout(180);
      screenshots.push((await page.screenshot({ type: 'jpeg', quality: 72 })).toString('base64'));
    }
    if (screenshots.length < 3) {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.waitForTimeout(350);
      screenshots.push((await page.screenshot({ type: 'jpeg', quality: 72 })).toString('base64'));
    }
    const finalURL = page.url();
    await context.close();
    return { url: finalURL, title: content.title.slice(0, 120), hero: content.hero.slice(0, 180), description: content.description.slice(0, 400), headings: content.headings, screenshots: screenshots.slice(0, 4) };
  } finally { await browser.close(); }
}
