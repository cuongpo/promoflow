const STORAGE_KEY = 'promoflow-reel-v5';
const MOCK_MODE_KEY = 'promoflow-mock-mode';
const SHOPAI_KEY_KEY = 'promoflow-shopai-key';

function isMockMode() {
  const saved = localStorage.getItem(MOCK_MODE_KEY);
  return saved === null ? true : saved === 'true';
}
function setMockMode(val) {
  console.log(`[PromoFlow] Mock mode switched: ${val ? 'ON (Presets/Free)' : 'OFF (Live AI with ShopAIKey)'}`);
  localStorage.setItem(MOCK_MODE_KEY, String(val));
  syncApiConfigUI();
  renderCanvas();
  renderInspector();
}
function getShopApiKey() {
  return (localStorage.getItem(SHOPAI_KEY_KEY) || '').trim();
}
function hasShopApiKey() {
  return getShopApiKey().length > 0;
}
function setShopApiKey(key) {
  const trimmed = (key || '').trim();
  const masked = trimmed.length > 8 ? `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}` : (trimmed ? '****' : '(cleared)');
  console.log(`[PromoFlow] ShopAIKey updated in browser storage: ${masked}`);
  localStorage.setItem(SHOPAI_KEY_KEY, trimmed);
  syncApiConfigUI();
  renderCanvas();
  renderInspector();
}

const DEMO_REACTION_IMAGE = './sample/reaction-creator.jpg';
const $ = selector => document.querySelector(selector);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const formatTime = seconds => `00:${String(Math.floor(seconds)).padStart(2, '0')}`;
const seconds = value => `${Number(value.toFixed(1))}s`;

// Inputs → AI blocks → Reel composer. Wires are typed by port.
// A reference YouTube Short sets the format (beats, timing, caption style); the other AI blocks are mocked in the browser.
const PORTS = {
  reference:{in:[], out:'reference'}, format:{in:['reference'], out:'format'},
  context:{in:[], out:'context'}, shots:{in:[], out:'images'}, demo:{in:[], out:'demo'},
  script:{in:['format', 'context', 'images'], out:'script'},
  hookclip:{in:['script'], out:'hook'},
  proof:{in:['script', 'images'], out:'proof'},
  cutter:{in:['script', 'demo', 'images'], out:'segments'},
  composer:{in:['hook', 'proof', 'segments'], out:'reel'},
  publish:{in:['reel'], out:''}
};
const META = {
  reference:{icon:'▶', label:'Reference Short', group:'input', accent:'#c5f36a'},
  format:{icon:'⧉', label:'Format extractor', group:'ai', accent:'#f0a868'},
  context:{icon:'◈', label:'Product context', group:'input', accent:'#c5f36a'},
  shots:{icon:'▦', label:'Screenshots', group:'input', accent:'#c5f36a'},
  demo:{icon:'▶', label:'Demo video', group:'input', accent:'#c5f36a'},
  script:{icon:'✎', label:'Script writer', group:'ai', accent:'#efb8d3'},
  hookclip:{icon:'☺', label:'Hook clip', group:'ai', accent:'#efb8d3'},
  proof:{icon:'★', label:'Proof collage', group:'ai', accent:'#9ec5f5'},
  cutter:{icon:'✂', label:'Demo cutter', group:'ai', accent:'#9ec5f5'},
  composer:{icon:'↗', label:'Reel composer', group:'output', accent:'#f5e83d'},
  publish:{icon:'⇪', label:'Publish to Shorts', group:'output', accent:'#ff6b6b'}
};
const PORT_LABEL = {reel:'Short', reference:'Short', format:'Format', context:'Context', images:'Screenshots', demo:'Demo video', script:'Script', hook:'Hook clip', proof:'Proof', segments:'Demo cuts'};
const TONES = {confession:'Confession → twist', pov:'POV', problem:'Pain point question', whatif:'“What if you could…?” question'};
// Format taken by hand from a 16s UGC app promo; used for the sample and whenever Gemini is not configured.
const PRESET_FORMAT = {
  source:'preset', title:'UGC app promo (16s)', summary:'Confession hook → proof flash → 4 numbered steps → results payoff',
  hookFormula:'A self-deprecating quote, then a smaller twist line that reveals a big result', tone:'confession',
  beats:[
    {kind:'hook', seconds:2.5, caption:'“I’m so bad at marketing” / Meanwhile I got 10M+ views…', note:'Two people react, face to camera'},
    {kind:'proof', seconds:1, caption:'(hook captions stay)', note:'Their viral videos, split screen'},
    {kind:'step', seconds:2, caption:'1. Go here', note:'Typing the URL'},
    {kind:'step', seconds:1.5, caption:'2. Track viral accounts in your niche', note:'Product UI'},
    {kind:'step', seconds:1.5, caption:'3. Sort by high performance', note:'Sorting a list'},
    {kind:'step', seconds:4.5, caption:'4. Replicate viral content ideas', note:'Detail view, longest beat'},
    {kind:'payoff', seconds:3, caption:'I generated videos with 100k+, 1M+ views…', note:'Grid of results'}
  ],
  captionColors:{hook:'white', steps:'yellow'}, cta:{placement:'caption', example:'SAVE + comment VIRAL and I’ll send you a guide'}
};
// Mock extraction picks one of these, seeded by the video ID, and labels the result as mock.
// Formats annotated by hand from real Shorts, keyed by video ID. Used when Gemini is not connected.
const KNOWN_FORMATS = {
  nAZD57mN78I:{
    title:'Canva Grow walkthrough (20s, Canva)', summary:'Creator question hook → 5 quick app steps → objection → results → CTA', hookFormula:'A creator asks “What if you could…?” naming the whole job, then the app does it step by step', tone:'whatif',
    beats:[
      {kind:'hook', seconds:3.5, caption:'What if you could create your LinkedIn ad, launch your campaign, and see what’s working, all within Canva?', note:'Canva Verified Expert, face to camera'},
      {kind:'step', seconds:2, caption:'With Canva Grow, start with a design you’ve already created', note:'Canva home, then an existing design'},
      {kind:'step', seconds:1.5, caption:'Connect your LinkedIn Ads account', note:'Account connection screen'},
      {kind:'step', seconds:1.5, caption:'Set up your campaign', note:'Campaign form'},
      {kind:'step', seconds:2, caption:'Get a little support from AI for what to say', note:'AI ad copy panel'},
      {kind:'step', seconds:1.5, caption:'Choose who you want to reach, and you’re ready to go', note:'Targeting, then Submit'},
      {kind:'turn', seconds:2.5, caption:'But nobody wants to throw money at an ad and hope for the best', note:'Objection transition over demo'},
      {kind:'payoff', seconds:3, caption:'See how ads are performing and what’s working', note:'Performance dashboard'},
      {kind:'cta', seconds:2.5, caption:'Create, launch, and learn, all in one place. Give it a try today.', note:'App end card with action button'}
    ],
    captionColors:{hook:'white', steps:'white'}, cta:{placement:'endcard', example:'Give it a try today'}
  }
};
const FORMAT_LIBRARY = [PRESET_FORMAT, {
  title:'POV tutorial', summary:'POV hook → 3 quick steps → result → end card', hookFormula:'A “POV:” line that puts the viewer in the moment the problem disappears', tone:'pov',
  beats:[{kind:'hook', seconds:2, caption:'POV: you finally automated it', note:'Creator at a desk, looking at the camera'}, {kind:'step', seconds:2.5, caption:'1. Open it', note:'Screen recording'}, {kind:'step', seconds:2.5, caption:'2. Pick a template', note:'Screen recording'}, {kind:'step', seconds:2.5, caption:'3. Hit go', note:'Result appears'}, {kind:'payoff', seconds:2, caption:'That’s it. Done in a minute.', note:'Finished result, full screen'}, {kind:'cta', seconds:1.5, caption:'Link in bio', note:'End card'}],
  captionColors:{hook:'white', steps:'yellow'}, cta:{placement:'endcard', example:'Link in bio'}
}, {
  title:'Problem → fix listicle', summary:'Pain question → proof → 4 white numbered fixes → payoff', hookFormula:'A blunt question naming the viewer’s pain, in yellow', tone:'problem',
  beats:[{kind:'hook', seconds:2, caption:'Still doing this by hand?', note:'Frustrated person, tight crop'}, {kind:'proof', seconds:1, caption:'(hook stays)', note:'Before/after numbers'}, {kind:'step', seconds:2, caption:'1. Connect your account', note:'App UI'}, {kind:'step', seconds:2, caption:'2. Choose a goal', note:'App UI'}, {kind:'step', seconds:2, caption:'3. Let it run', note:'App UI'}, {kind:'step', seconds:2, caption:'4. Check the results', note:'Dashboard'}, {kind:'payoff', seconds:2.5, caption:'Saved me 6 hours a week', note:'Dashboard close-up'}],
  captionColors:{hook:'yellow', steps:'white'}, cta:{placement:'caption', example:'Comment “FIX” for the link'}
}, {
  title:'Before / after reveal', summary:'Confession hook → proof → 2 long steps → payoff → end card', hookFormula:'Admit a failure, then tease the turnaround', tone:'confession',
  beats:[{kind:'hook', seconds:3, caption:'“I almost quit last month”', note:'Selfie video, emotional'}, {kind:'proof', seconds:1.5, caption:'(hook stays)', note:'Results screenshot flash'}, {kind:'step', seconds:3, caption:'1. I switched to this', note:'App home screen'}, {kind:'step', seconds:3, caption:'2. Did this every day', note:'Daily workflow'}, {kind:'payoff', seconds:3, caption:'Now look at this', note:'Big result number'}, {kind:'cta', seconds:1.5, caption:'Try it free', note:'End card'}],
  captionColors:{hook:'white', steps:'yellow'}, cta:{placement:'endcard', example:'Try it free'}
}];
const youtubeId = value => { try { const url = new URL(String(value).trim()), host = url.hostname.replace(/^(www|m)\./, ''); const id = host === 'youtu.be' ? url.pathname.slice(1) : host === 'youtube.com' ? (url.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/)?.[1] || url.searchParams.get('v')) : ''; return /^[\w-]{11}$/.test(id || '') ? id : ''; } catch { return ''; } };

function newNode(type, x, y, id) {
  const defaults = {
    reference:{mode:'url', url:'', prompt:''},
    format:{format:null, key:''},
    context:{appName:'', description:'', audience:'', pain:'', result:'', features:''},
    shots:{shots:[]},
    demo:{mediaId:'', mediaName:'', duration:0},
    script:{tone:'confession', hook:'', twist:'', turn:'', steps:Array.from({length:4}, () => ({title:'', sub:''})), payoff:'', cta:''},
    hookclip:{mode:'ai', generated:false, mediaId:'', mediaType:'', mediaName:'', duration:2.5, prompt:''},
    proof:{generated:false, duration:3},
    cutter:{clipLength:2, cut:false},
    composer:{proofFlash:true, endCard:false, endDuration:2},
    publish:{title:'', description:'', tags:'', uploaded:false}
  };
  return {id:id || `${type}-${crypto.randomUUID().slice(0, 8)}`, type, x, y, ...structuredClone(defaults[type])};
}
function starterProject() {
  const edge = (from, to, port) => ({from, to, port});
  return {
    name:'Untitled reel', selected:'reference',
    nodes:[newNode('reference', 40, 20, 'reference'), newNode('context', 40, 270, 'context'), newNode('shots', 40, 500, 'shots'), newNode('demo', 40, 720, 'demo'), newNode('format', 330, 20, 'format'), newNode('script', 330, 330, 'script'), newNode('hookclip', 620, 20, 'hookclip'), newNode('proof', 620, 300, 'proof'), newNode('cutter', 620, 560, 'cutter'), newNode('composer', 910, 260, 'composer'), newNode('publish', 1200, 300, 'publish')],
    edges:[edge('reference', 'format', 'reference'), edge('format', 'script', 'format'), edge('context', 'script', 'context'), edge('shots', 'script', 'images'), edge('script', 'hookclip', 'script'), edge('script', 'proof', 'script'), edge('shots', 'proof', 'images'), edge('script', 'cutter', 'script'), edge('demo', 'cutter', 'demo'), edge('shots', 'cutter', 'images'), edge('hookclip', 'composer', 'hook'), edge('proof', 'composer', 'proof'), edge('cutter', 'composer', 'segments'), edge('composer', 'publish', 'reel')]
  };
}
let state;
try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); state = saved && Array.isArray(saved.nodes) && Array.isArray(saved.edges) ? saved : starterProject(); } catch { state = starterProject(); }
let pendingPort = null, activeTab = 'edit', toastTimer, preview = null, running = false, lastFinished = '';
const runState = new Map(), reelThumbs = new Map();
const busy = new Set(), stageText = new Map();
// Mock work shows the stages a real model would go through, one at a time, on the block's status line.
const STAGES = {
  format:['Fetching the Short…', 'Watching it frame by frame…', 'Detecting cuts…', 'Reading on-screen captions…', 'Building the format…'],
  script:['Reading the format…', 'Writing the hook…', 'Writing the steps…', 'Writing the payoff and CTA…'],
  hookclip:['Writing the shot…', 'Generating the reaction…', 'Matching the hook length…'],
  proof:['Picking result screens…', 'Laying out the grid…'],
  cutter:['Scanning the demo…', 'Matching steps to moments…', 'Trimming cuts…', 'Adding captions…'],
  publish:['Writing the title…', 'Writing the description…', 'Picking hashtags…'],
  upload:['Rendering the Short…', 'Uploading… 35%', 'Uploading… 100%', 'Processing on YouTube…']
};
async function mockStages(node, stages) {
  for (const stage of stages) {
    stageText.set(node.id, stage);
    const status = document.querySelector(`.node[data-id="${CSS.escape(node.id)}"] .status`); if (status) status.textContent = stage;
    await new Promise(resolve => setTimeout(resolve, 380 + Math.random() * 320));
  }
  stageText.delete(node.id);
}
let geminiReady = false;

const mediaUrls = new Map();
const mediaDatabase = new Promise((resolveDatabase, rejectDatabase) => {
  const request = indexedDB.open('promoflow-media', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('assets');
  request.onsuccess = () => resolveDatabase(request.result);
  request.onerror = () => rejectDatabase(request.error);
});
async function storeMedia(file) {
  const database = await mediaDatabase;
  const id = `asset-${crypto.randomUUID()}`;
  await new Promise((resolveStore, rejectStore) => {
    const transaction = database.transaction('assets', 'readwrite');
    transaction.objectStore('assets').put(file, id);
    transaction.oncomplete = resolveStore;
    transaction.onerror = () => rejectStore(transaction.error);
  });
  mediaUrls.set(id, URL.createObjectURL(file));
  return id;
}
async function hydrateMedia() {
  const database = await mediaDatabase;
  const ids = [...new Set(state.nodes.flatMap(node => [node.mediaId, ...(node.shots || [])]).filter(Boolean))];
  await Promise.all(ids.map(id => new Promise(resolveAsset => {
    const request = database.transaction('assets').objectStore('assets').get(id);
    request.onsuccess = () => { if (request.result) mediaUrls.set(id, URL.createObjectURL(request.result)); resolveAsset(); };
    request.onerror = () => resolveAsset();
  })));
  renderCanvas(); renderInspector();
}
async function videoDuration(url) {
  const probe = document.createElement('video'); probe.preload = 'metadata'; probe.src = url;
  await new Promise(resolve => { probe.onloadedmetadata = resolve; probe.onerror = resolve; });
  // Browser-recorded WebM often reports Infinity until it is seeked to the end.
  if (!Number.isFinite(probe.duration)) { probe.currentTime = 1e7; await new Promise(resolve => { probe.ondurationchange = resolve; setTimeout(resolve, 1500); }); }
  return Number.isFinite(probe.duration) ? Math.round(probe.duration * 10) / 10 : 0;
}

// ---------- Graph data flow ----------
const nodeById = id => state.nodes.find(node => node.id === id);
const source = (node, port) => node ? nodeById(state.edges.find(edge => edge.to === node.id && edge.port === port)?.from) : undefined;
const formatOf = script => script?.type === 'script' ? source(script, 'format')?.format || null : null;
// Scene timing and caption colors copied from the reference format, bounded for 15-28s high-retention Short.
function timingOf(script) {
  const format = formatOf(script); if (!format) return null;
  const beats = format.beats, first = beats.findIndex(beat => beat.kind === 'step'), last = beats.findLastIndex(beat => beat.kind === 'step');
  const total = (list, kinds) => list.filter(beat => kinds.includes(beat.kind)).reduce((sum, beat) => sum + beat.seconds, 0);
  return {
    hook: clamp(total(beats.slice(0, first), ['hook']) || 3, 2.5, 4.5),
    proof: clamp(total(beats.slice(0, first), ['proof']), 0, 1.5),
    steps: beats.filter(beat => beat.kind === 'step').map(beat => clamp(beat.seconds, 1.5, 3)),
    payoff: clamp(total(beats.slice(last + 1), ['payoff', 'proof']) || 3, 2, 3.5),
    endCard: format.cta.placement === 'endcard',
    colors: format.captionColors
  };
}
const scriptOf = node => { const script = source(node, 'script'); return script?.type === 'script' && script.hook ? script : null; };
function hookMedia(node) {
  if (node?.type !== 'hookclip') return null;
  if (node.mediaId) return {id:node.mediaId, type:node.mediaType || 'video'};
  if (node.mode === 'mock' || node.mode === 'ai') return node.generated ? {type:'mock'} : null;
  return null;
}
function proofMedia(node) {
  const ids = source(node, 'images')?.shots || [];
  return node?.type === 'proof' && node.generated && ids.length ? {type:'collage', ids} : null;
}
function cutSegments(node) {
  if (node?.type !== 'cutter' || !node.cut) return [];
  const demo = source(node, 'demo'), shots = source(node, 'images')?.shots || [];
  const script = scriptOf(node), steps = (script?.steps || []).filter(step => step.title), timing = timingOf(script);
  const count = clamp(steps.length || 3, 1, 6), lengthOf = index => timing?.steps[index] ?? node.clipLength;
  const caption = index => steps[index] ? {title:`${index + 1}. ${steps[index].title}`, sub:steps[index].sub} : {title:`Step ${index + 1}`, sub:''};
  // Mock highlight finder: one clip from the middle of each equal slice of the demo.
  if (demo?.mediaId && demo.duration) {
    const slice = demo.duration / count;
    return Array.from({length:count}, (_, index) => { const clip = Math.min(lengthOf(index), slice); return {media:{id:demo.mediaId, type:'video'}, start:Math.round((index * slice + (slice - clip) / 2) * 10) / 10, duration:clip, ...caption(index)}; });
  }
  return shots.length ? Array.from({length:count}, (_, index) => ({media:{id:shots[index % shots.length], type:'image'}, start:0, duration:lengthOf(index), ...caption(index)})) : [];
}
function composeReel(node) {
  const hookNode = source(node, 'hook'), proofNode = source(node, 'proof'), cutNode = source(node, 'segments');
  const script = [hookNode, proofNode, cutNode].map(scriptOf).find(Boolean);
  const app = source(script, 'context')?.appName || 'Your app', scenes = [], timing = timingOf(script);
  const hook = hookMedia(hookNode), proof = proofMedia(proofNode), segments = cutSegments(cutNode), colors = timing?.colors || {hook:'white', steps:'yellow'};
  const format = formatOf(script);
  if (format) {
    let stepIndex = 0;
    // Creator hook scene plays the hook clip once at the beginning
    const hookSec = hookNode?.duration && hookNode.duration > 1.5 ? Math.min(Math.max(hookNode.duration, 2.5), 4.5) : (timing?.hook || 3);
    for (let bi = 0; bi < format.beats.length; bi++) {
      const beat = format.beats[bi];
      if (beat.kind === 'hook') {
        if (hook) scenes.push({kind:'hook', creator:true, media:hook, start:0, duration:hookSec, title:script.hook, sub:script.twist, color:colors.hook});
      }
      else if (beat.kind === 'proof' && stepIndex === 0) {
        if (proof && hook) scenes.push({kind:'flash', media:proof, start:0, duration:Math.min(beat.seconds || 1, 1.2), title:script.hook, sub:script.twist, color:colors.hook});
      }
      else if (beat.kind === 'step') {
        // If there are more segments remaining than step beats left in format, include remaining segments so all steps are highlighted
        const remainingStepBeats = format.beats.slice(bi + 1).filter(b => b.kind === 'step').length;
        const takeCount = Math.max(1, segments.length - stepIndex - remainingStepBeats);
        for (let i = 0; i < takeCount && stepIndex < segments.length; i++) {
          const segment = segments[stepIndex++];
          scenes.push({kind:'step', ...segment, duration: Math.min(Math.max(segment.duration || 2, 1.5), 3.0), color:colors.steps});
        }
      }
      else if (beat.kind === 'turn') {
        if (script.turn) {
          const last = scenes.at(-1);
          const turnMedia = last?.media || segments[0]?.media || proof;
          scenes.push({
            kind:'turn',
            creator:false,
            continue: !!last && last.media === turnMedia,
            media: turnMedia,
            start: last && last.media === turnMedia ? last.start + last.duration : 0,
            duration: Math.min(Math.max(beat.seconds || 2.5, 2.0), 3.2),
            title: script.turn,
            sub: '',
            color: colors.hook
          });
        }
      }
      else if (beat.kind === 'proof' || beat.kind === 'payoff') {
        if (proof && script.payoff) {
          scenes.push({
            kind:'payoff',
            creator:false,
            media:proof,
            start:0,
            duration:Math.min(Math.max(beat.seconds || 3.0, 2.0), 3.5),
            title:script.payoff,
            sub:''
          });
        }
      }
      else if (beat.kind === 'cta' && script.cta && scenes.length) {
        const last = scenes.at(-1);
        scenes.push({
          kind:'cta',
          creator:false,
          continue:true,
          media:last.media,
          start:last.start + last.duration,
          duration:Math.min(Math.max(beat.seconds || 2.5, 2.0), 3.0),
          title:script.cta,
          sub:app
        });
      }
    }
  } else {
    const hookSec = hookNode?.duration && hookNode.duration > 1.5 ? Math.min(Math.max(hookNode.duration, 2.5), 4.5) : (timing?.hook ?? 3);
    if (hook) scenes.push({kind:'hook', creator:true, media:hook, start:0, duration:hookSec, title:script?.hook || '', sub:script?.twist || '', color:colors.hook});
    if (hook && proof && (timing ? timing.proof > 0 : node.proofFlash)) scenes.push({kind:'flash', media:proof, start:0, duration:timing?.proof || 1, title:script?.hook || '', sub:script?.twist || '', color:colors.hook});
    for (const segment of segments) scenes.push({kind:'step', ...segment, duration: Math.min(Math.max(segment.duration || 2, 1.5), 3), color:colors.steps});
    if (proof && script?.payoff && (!timing || timing.payoff > 0)) scenes.push({kind:'payoff', creator:false, media:proof, start:0, duration:Math.min(timing?.payoff || proofNode.duration || 3, 3.5), title:script.payoff, sub:''});
    if ((node.endCard || timing?.endCard) && script?.cta && scenes.length) { const last = scenes.at(-1); scenes.push({kind:'cta', creator:false, continue:true, media:last.media, start:last.start + last.duration, duration:Math.min(node.endDuration || 2.5, 3), title:script.cta, sub:app}); }
  }

  // Optimize total video length to 15s - 28s (standard short-form)
  let total = scenes.reduce((sum, scene) => sum + scene.duration, 0);
  if (total > 28) {
    const factor = 24 / total;
    for (const scene of scenes) {
      if (scene.kind === 'hook') {
        scene.duration = Math.max(2.5, Math.round(scene.duration * factor * 10) / 10);
      } else if (scene.kind === 'flash') {
        scene.duration = Math.max(0.8, Math.round(scene.duration * factor * 10) / 10);
      } else {
        scene.duration = Math.max(1.5, Math.round(scene.duration * factor * 10) / 10);
      }
    }
    total = scenes.reduce((sum, scene) => sum + scene.duration, 0);
  } else if (total < 15 && scenes.length > 0) {
    const factor = 16 / total;
    for (const scene of scenes) {
      scene.duration = Math.round(scene.duration * factor * 10) / 10;
    }
    total = scenes.reduce((sum, scene) => sum + scene.duration, 0);
  }
  total = Math.round(total * 10) / 10;

  return {scenes, app, caption:script?.cta || '', total, hasHook:!!hook, hasSteps:segments.length > 0};
}
const composers = () => state.nodes.filter(node => node.type === 'composer');
const reelReady = node => { const reel = composeReel(node); return reel.hasHook && reel.hasSteps; };
function activeComposer() { const selected = nodeById(state.selected), viaPublish = selected?.type === 'publish' ? source(selected, 'reel') : null; return selected?.type === 'composer' ? selected : viaPublish || composers().find(reelReady) || composers()[0] || null; }

function nodeStatus(node) {
  if (busy.has(node.id) || runState.get(node.id) === 'running') return ['busy', stageText.get(node.id) || (META[node.type].group === 'input' ? 'Checking…' : 'Working…')];
  if (runState.get(node.id) === 'queued') return ['idle', 'Queued'];
  switch (node.type) {
    case 'reference': return node.mode === 'preset' ? ['ready', 'Preset format'] : node.mode === 'prompt' ? (node.prompt?.trim() ? ['ready', 'Described'] : ['idle', 'Describe the Short']) : youtubeId(node.url) ? ['ready', 'Short linked'] : ['idle', 'Paste a Shorts link'];
    case 'format': return node.format ? ['ready', node.format.source === 'shopaikey' ? `ShopAIKey · ${node.format.beats.length} beats` : node.format.source === 'gemini' ? `Gemini · ${node.format.beats.length} beats` : `${({gemini:'Gemini', shopaikey:'ShopAIKey', library:'Library', mock:'Mock', annotated:'Annotated', described:'Described', preset:'Preset'})[node.format.source] || 'Format'} · ${node.format.beats.length} beats`] : source(node, 'reference') ? ['idle', 'Extract format'] : ['warn', 'Connect a Short'];
    case 'context': return node.appName ? ['ready', 'Ready'] : ['idle', 'Add product info'];
    case 'shots': return node.shots.length ? ['ready', `${node.shots.length} screenshot${node.shots.length > 1 ? 's' : ''}`] : ['idle', 'Upload screenshots'];
    case 'demo': return node.mediaId ? ['ready', `Demo · ${node.duration || '?'}s`] : ['idle', 'Upload a screen recording'];
    case 'script': return node.hook ? ['ready', 'Script ready'] : source(node, 'context') ? ['idle', 'Generate script'] : ['warn', 'Connect context'];
    case 'hookclip': return hookMedia(node) ? ['ready', node.mode === 'mock' ? 'Mock reaction ready' : (node.mode === 'ai' ? 'AI hook ready' : 'Your clip')] : !scriptOf(node) ? ['warn', 'Needs a script'] : ['idle', node.mode === 'upload' ? 'Upload a clip' : 'Generate hook'];
    case 'proof': return proofMedia(node) ? ['ready', `Collage · ${source(node, 'images').shots.length} images`] : !source(node, 'images')?.shots?.length ? ['warn', 'Needs screenshots'] : ['idle', 'Build collage'];
    case 'cutter': {
      if (!source(node, 'demo')?.mediaId && !source(node, 'images')?.shots?.length) return ['warn', 'Needs demo or screenshots'];
      const segments = cutSegments(node); return segments.length ? ['ready', `${segments.length} cuts`] : ['idle', 'Run auto-cut'];
    }
    case 'publish': { const composer = source(node, 'reel'); return node.uploaded ? ['ready', 'Uploaded (mock)'] : node.title ? ['ready', 'Ready to post'] : composer && reelReady(composer) ? ['idle', 'Write title + description'] : ['warn', 'Needs a finished reel']; }
    default: { const reel = composeReel(node); return reel.hasHook && reel.hasSteps ? ['ready', `Reel · ${seconds(reel.total)}`] : ['warn', !reel.hasHook && !reel.hasSteps ? 'Needs hook + demo cuts' : !reel.hasHook ? 'Needs hook clip' : 'Needs demo cuts']; }
  }
}
function nodeSummary(node) {
  switch (node.type) {
    case 'reference': return node.mode === 'preset' ? ['Preset: UGC app promo', 'Built-in format, no link needed'] : node.mode === 'prompt' ? ['Described Short', node.prompt || 'Describe the Short you want'] : [node.info?.videoId === youtubeId(node.url) && node.info.title || 'Reference Short', node.info?.videoId === youtubeId(node.url) && node.info.author ? `by ${node.info.author}` : youtubeId(node.url) ? node.url : 'Paste a YouTube Shorts link'];
    case 'format': return [node.format?.summary || 'No format yet', node.format?.hookFormula || 'Beats, timing, captions, CTA'];
    case 'context': return [node.appName || 'Your product', node.description || 'Name, pain, result, features'];
    case 'shots': return ['Screenshots', node.shots.length ? 'App screens and results' : 'PNG, JPG, or WebP'];
    case 'demo': return ['Demo video', node.mediaName || 'MP4 or WebM screen recording'];
    case 'script': return [node.hook || 'No script yet', node.twist || TONES[node.tone]];
    case 'hookclip': return [node.mode === 'ai' ? 'AI hook clip' : (node.mode === 'mock' ? 'AI reaction (mock)' : 'Your face clip'), node.mediaName || (node.mode === 'ai' ? 'Generated from script (Veo)' : (node.mode === 'mock' ? 'Sample creator still' : 'Upload a 2–4s clip'))];
    case 'proof': return ['Proof collage', 'Flash after the hook, payoff at the end'];
    case 'cutter': return ['Demo cutter', `${node.clipLength}s per step · captions from script`];
    case 'publish': return [node.title || 'Publish to Shorts', node.title ? node.tags : 'Title, description, hashtags'];
    default: return ['Reel composer', 'Hook → proof → steps → payoff'];
  }
}
function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); $('#saveStatus').textContent = 'Saved locally'; } catch { $('#saveStatus').textContent = 'Storage full'; } }
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3200); }

// ---------- Canvas of blocks ----------
const imageStrip = ids => `<div class="node-thumb strip">${ids.slice(0, 4).map(id => mediaUrls.get(id) ? `<img src="${escapeHTML(mediaUrls.get(id))}" alt="">` : '').join('')}</div>`;
const BEAT_COLOR = {hook:'#efb8d3', proof:'#9ec5f5', step:'#f5e83d', turn:'#f0a868', payoff:'#9ec5f5', cta:'#c5f36a'};
const beatBar = format => `<div class="beat-bar">${format.beats.map(beat => `<span style="flex:${beat.seconds};background:${BEAT_COLOR[beat.kind]}" title="${beat.kind} · ${beat.seconds}s"></span>`).join('')}</div>`;
function thumbFor(node) {
  if (node.type === 'publish' && node.title) return `<div class="publish-out"><span class="yt-badge">▶ Shorts</span>${node.uploaded ? '<span class="uploaded">Uploaded · mock</span>' : '<span>Ready to post</span>'}</div>`;
  if (node.type === 'reference' && node.mode === 'url' && youtubeId(node.url)) return `<div class="node-thumb yt"><img src="https://i.ytimg.com/vi/${youtubeId(node.url)}/hqdefault.jpg" alt=""><span>▶ Shorts</span></div>`;
  if (node.type === 'format' && node.format) return beatBar(node.format);
  if (node.type === 'script' && node.hook) return `<ol class="node-out">${node.steps.filter(step => step.title).map(step => `<li>${escapeHTML(step.title)}</li>`).join('')}</ol>`;
  if (node.type === 'cutter') { const segments = cutSegments(node); if (segments.length) return `<div class="node-thumb strip cuts">${segments.map((segment, index) => `<div>${segment.media.type === 'video' ? `<video src="${escapeHTML(mediaUrls.get(segment.media.id) || '')}#t=${segment.start + .3}" muted playsinline preload="metadata"></video>` : `<img src="${escapeHTML(mediaUrls.get(segment.media.id) || '')}" alt="">`}<b>${index + 1}</b></div>`).join('')}</div>`; }
  if (node.type === 'composer' && reelReady(node)) return `<div class="node-thumb reel-thumb">${reelThumbs.get(node.id) ? `<img src="${reelThumbs.get(node.id)}" alt="Reel cover">` : ''}<button class="node-play" data-play="${node.id}">▶ Play reel</button></div>`;
  if (node.type === 'shots' && node.shots.length) return imageStrip(node.shots);
  if (node.type === 'proof' && proofMedia(node)) return imageStrip(proofMedia(node).ids);
  if (node.type === 'demo' && node.mediaId && mediaUrls.get(node.mediaId)) return `<div class="node-thumb"><video src="${escapeHTML(mediaUrls.get(node.mediaId))}#t=0.5" muted playsinline preload="metadata"></video></div>`;
  if (node.type === 'hookclip') { const media = hookMedia(node); if (media?.type === 'mock') return `<div class="node-thumb mock-face"><img src="${DEMO_REACTION_IMAGE}" alt="Sample AI reaction still"><span>DEMO STILL</span></div>`; if (media && mediaUrls.get(media.id)) return `<div class="node-thumb">${media.type === 'video' ? `<video src="${escapeHTML(mediaUrls.get(media.id))}#t=0.5" muted playsinline preload="metadata"></video>` : `<img src="${escapeHTML(mediaUrls.get(media.id))}" alt="">`}</div>`; }
  return '';
}
function nodeTag(node) {
  if (node.type === 'hookclip') {
    if (node.mode === 'upload') return '<span class="mock-tag">CLIP</span>';
    if (node.mode === 'ai') {
      const isLive = !isMockMode() && (hasShopApiKey() || geminiReady);
      return `<span class="mock-tag ${isLive ? 'live' : ''}">${isLive ? 'VEO' : 'AI MOCK'}</span>`;
    }
    return '<span class="mock-tag">MOCK</span>';
  }
  if (['format', 'script'].includes(node.type)) {
    const isLive = node.source ? ['gemini', 'shopaikey'].includes(node.source) : (!isMockMode() && (hasShopApiKey() || geminiReady));
    if (isLive) {
      const label = (node.source === 'shopaikey' || hasShopApiKey()) ? 'SHOPAI' : 'GEMINI';
      return `<span class="mock-tag live">${label}</span>`;
    }
    return '<span class="mock-tag">MOCK</span>';
  }
  if (META[node.type].group === 'ai') return '<span class="mock-tag">MOCK</span>';
  return '';
}
function nodeHTML(node) {
  const meta = META[node.type], [title, body] = nodeSummary(node), [statusClass, statusText] = nodeStatus(node), out = PORTS[node.type].out;
  const inputs = PORTS[node.type].in.map(port => { const from = source(node, port); return `<div class="port-row"><span class="port in ${port}" data-port="${port}" title="${PORT_LABEL[port]} input"></span><span>${PORT_LABEL[port]}</span><span class="port-source">${from ? escapeHTML(META[from.type].label) : 'not connected'}</span></div>`; }).join('');
  const run = runState.get(node.id), badge = {running:'<span class="run-badge">⟳</span>', done:'<span class="run-badge">✓</span>', skipped:'<span class="run-badge">–</span>', error:'<span class="run-badge">!</span>'}[run] || '';
  return `<div class="node ${node.type} group-${meta.group} ${state.selected === node.id ? 'selected' : ''} ${run ? `run-${run}` : ''} ${lastFinished === node.id ? 'run-flash' : ''}" data-id="${node.id}" style="left:${node.x}px;top:${node.y}px">
    <div class="node-header"><span>${meta.icon}</span><span>${meta.label}</span>${nodeTag(node)}${badge}</div>
    ${inputs ? `<div class="node-inputs">${inputs}</div>` : ''}
    <div class="node-body"><h3>${escapeHTML(title)}</h3><p>${escapeHTML(body)}</p>${thumbFor(node)}</div>
    <div class="node-foot"><span class="status ${statusClass}">${escapeHTML(statusText)}</span>${out ? `<span class="out-label">${PORT_LABEL[out]}</span><span class="port out ${out}" data-port="${out}" title="${PORT_LABEL[out]} output"></span>` : ''}</div></div>`;
}
function portPoint(id, direction, port) {
  const node = nodeById(id), card = document.querySelector(`.node[data-id="${CSS.escape(id)}"]`), el = card?.querySelector(`.port.${direction}[data-port="${port}"]`);
  if (!node || !el) return null;
  const from = card.getBoundingClientRect(), to = el.getBoundingClientRect();
  return {x:node.x + to.left - from.left + to.width / 2, y:node.y + to.top - from.top + to.height / 2};
}
function drawWires() {
  $('#connections').innerHTML = state.edges.map(edge => {
    const a = portPoint(edge.from, 'out', edge.port), b = portPoint(edge.to, 'in', edge.port);
    if (!a || !b) return '';
    const dx = Math.max(65, Math.abs(b.x - a.x) * .45);
    return `<path class="wire ${edge.port}" d="M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}"/>`;
  }).join('');
}
const SCENE_LABEL = {hook:'HOOK', flash:'PROOF', turn:'TURN', payoff:'PAYOFF', cta:'CTA'};
function renderTimeline() {
  const node = activeComposer(), reel = node ? composeReel(node) : null;
  $('#timelineDuration').textContent = reel?.scenes.length ? `${formatTime(reel.total)} total` : 'Nothing composed yet';
  $('#timeline').innerHTML = reel?.scenes.length ? reel.scenes.map(scene => `<button class="timeline-item scene-${scene.kind}" data-id="${node.id}" style="flex:${scene.duration}"><strong>${escapeHTML(SCENE_LABEL[scene.kind] || scene.title)}</strong><span>${seconds(scene.duration)}${scene.kind === 'step' ? '' : ` · ${escapeHTML(scene.title)}`}</span></button>`).join('') : '<span style="color:#999;font-size:11px">Connect a Hook clip and Demo cutter to a Reel composer.</span>';
  $('#timeline').querySelectorAll('button').forEach(button => button.onclick = () => selectNode(button.dataset.id));
}
function renderCanvas() {
  const layer = $('#nodesLayer'); layer.innerHTML = state.nodes.map(nodeHTML).join('');
  $('#nodeCanvas').style.minWidth = `${Math.max(1100, ...state.nodes.map(node => node.x + 280))}px`;
  $('#nodeCanvas').style.minHeight = `${Math.max(700, ...state.nodes.map(node => node.y + 300))}px`;
  drawWires();
  layer.querySelectorAll('.node').forEach(element => {
    element.addEventListener('pointerdown', handleNodePointerDown);
    element.querySelectorAll('[data-play]').forEach(button => { button.addEventListener('pointerdown', event => event.stopPropagation()); button.onclick = () => { state.selected = button.dataset.play; openPreview(); }; });
    element.querySelectorAll('.port').forEach(port => port.addEventListener('pointerdown', event => { event.stopPropagation(); handlePort(element.dataset.id, port.classList.contains('out') ? 'out' : 'in', port.dataset.port); }));
  });
  renderSampleBanner();
  renderShotList();
  if (!running) $('#flowStats').textContent = `${state.nodes.length} blocks · ${state.edges.length} wires`;
  renderTimeline();
}
function handleNodePointerDown(event) {
  if (event.button !== 0) return; const el = event.currentTarget, id = el.dataset.id, node = nodeById(id);
  if (state.selected !== id) { state.selected = id; document.querySelectorAll('.node').forEach(item => item.classList.toggle('selected', item.dataset.id === id)); renderInspector(); renderTimeline(); save(); }
  const startX = event.clientX, startY = event.clientY, originalX = node.x, originalY = node.y;
  el.setPointerCapture(event.pointerId);
  const move = e => { node.x = Math.max(10, Math.round(originalX + e.clientX - startX)); node.y = Math.max(20, Math.round(originalY + e.clientY - startY)); el.style.left = `${node.x}px`; el.style.top = `${node.y}px`; drawWires(); };
  const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); save(); };
  el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}
function clearPending() { pendingPort = null; delete document.body.dataset.connecting; document.querySelectorAll('.port.out').forEach(item => item.classList.remove('active')); }
function handlePort(id, direction, port) {
  if (direction === 'out') { pendingPort = {id, port}; document.querySelectorAll('.port.out').forEach(item => item.classList.toggle('active', item.closest('.node').dataset.id === id)); document.body.dataset.connecting = port; toast(`Now click a ${PORT_LABEL[port]} input`); return; }
  if (!pendingPort) {
    const existing = state.edges.find(edge => edge.to === id && edge.port === port);
    if (existing) { state.edges = state.edges.filter(edge => edge !== existing); renderCanvas(); renderInspector(); save(); toast(`${PORT_LABEL[port]} disconnected`); }
    else toast('Click an output dot first');
    return;
  }
  const from = pendingPort; clearPending();
  if (from.id === id) return;
  if (from.port !== port) { toast(`A ${PORT_LABEL[from.port]} output can't feed a ${PORT_LABEL[port]} input`); return; }
  state.edges = state.edges.filter(edge => !(edge.to === id && edge.port === port)); state.edges.push({from:from.id, to:id, port});
  renderCanvas(); renderInspector(); save(); toast('Blocks connected');
}
function selectNode(id) { state.selected = id; renderCanvas(); renderInspector(); save(); }

// ---------- Inspector ----------
const field = (label, key, value, {tag = 'input', hint = '', max = 300, placeholder = ''} = {}) => `<div class="form-group"><label>${label}</label>${tag === 'textarea' ? `<textarea data-field="${key}" maxlength="${max}" placeholder="${escapeHTML(placeholder)}">${escapeHTML(value || '')}</textarea>` : `<input data-field="${key}" value="${escapeHTML(value || '')}" maxlength="${max}" placeholder="${escapeHTML(placeholder)}" />`}${hint ? `<small>${hint}</small>` : ''}</div>`;
const select = (label, key, value, options, rerender = false) => `<div class="form-group"><label>${label}</label><select data-field="${key}" ${rerender ? 'data-rerender' : ''}>${Object.entries(options).map(([option, text]) => `<option value="${option}" ${String(value) === option ? 'selected' : ''}>${text}</option>`).join('')}</select></div>`;
const range = (label, key, value, min, max, step) => `<div class="form-group"><label>${label}</label><div class="duration-row"><input data-field="${key}" data-number type="range" min="${min}" max="${max}" step="${step}" value="${value}"><span data-range-value="${key}">${value} sec</span></div></div>`;
const inputChips = node => PORTS[node.type].in.map(port => { const from = source(node, port); return `<div class="input-chip ${from ? 'on' : ''}"><span>${PORT_LABEL[port]}</span><strong>${from ? escapeHTML(nodeSummary(from)[0]) : 'Not connected'}</strong></div>`; }).join('');
const runButton = (node, id, label) => `<button class="button primary wide" id="${id}" ${busy.has(node.id) ? 'disabled' : ''}>${busy.has(node.id) ? 'Mock AI running…' : label}</button>`;
const uploadBox = (id, label, accept, multiple = false) => `<label class="upload-box"><span>${label}</span><input id="${id}" type="file" accept="${accept}" ${multiple ? 'multiple' : ''}></label>`;

const inspectors = {
  reference:node => `${select('Source', 'mode', node.mode, {url:'YouTube Shorts link', prompt:'Describe the Short', preset:'Preset: UGC app promo'}, true)}
    ${node.mode === 'prompt' ? field('Description', 'prompt', node.prompt, {tag:'textarea', max:400, placeholder:'A creator asks a question, then 4 quick app steps…'}) : ''}
    ${node.mode === 'prompt' ? '' : node.mode === 'url' ? `${field('Shorts URL', 'url', node.url, {max:200, placeholder:'https://youtube.com/shorts/…', hint:'A public Short whose structure you want to copy. Only its format is used, not its footage.'})}${youtubeId(node.url) ? `<a class="yt-link" href="https://www.youtube.com/shorts/${youtubeId(node.url)}" target="_blank" rel="noopener"><img src="https://i.ytimg.com/vi/${youtubeId(node.url)}/hqdefault.jpg" alt="Short thumbnail"><span>Open on YouTube ↗</span></a>` : ''}` : '<div class="media-note">A 16-second UGC app promo: confession hook, one-second proof flash, four numbered steps, results payoff, CTA in the post caption.</div>'}`,
  format:node => { const format = node.format; return `${inputChips(node)}${runButton(node, 'extractFormat', format ? '↻ Re-extract format' : '✦ Extract format')}
    <small class="muted">${isMockMode() ? 'Mock mode is ON. Toggle off on the home page or sidebar to use your ShopAIKey API key.' : (hasShopApiKey() ? 'ShopAIKey is active. Live Gemini analysis will watch the video.' : 'Live mode enabled. Add your ShopAIKey on the home page.')}</small>
    ${format ? `<div class="form-group"><label>${format.source === 'shopaikey' ? 'Extracted via ShopAIKey (Gemini)' : format.source === 'gemini' ? 'Extracted by Gemini' : format.source === 'mock' ? `Mock result · ${escapeHTML(format.title)}` : format.source === 'annotated' ? `Annotated by hand · ${escapeHTML(format.title)}` : format.source === 'described' ? `Picked from your description · ${escapeHTML(format.title)}` : format.source === 'library' ? 'Scanned by Gemini for the Library' : 'Preset format'}</label>${format.source === 'annotated' ? '<small class="muted">Beats and timings were measured from this Short by hand.</small>' : ''}${format.source === 'mock' ? '<small class="muted">Picked from a format library (Mock mode).</small>' : ''}<div class="format-card"><strong>${escapeHTML(format.summary)}</strong><p>${escapeHTML(format.hookFormula)}</p>${beatBar(format)}<ol class="beats">${format.beats.map(beat => `<li><span style="background:${BEAT_COLOR[beat.kind]}">${beat.kind}</span><div><b>${escapeHTML(beat.caption || '—')}</b><small>${escapeHTML(beat.note)}</small></div><em>${beat.seconds}s</em></li>`).join('')}</ol><p class="format-meta">Captions: hook ${format.captionColors.hook}, steps ${format.captionColors.steps} · CTA in ${format.cta.placement === 'endcard' ? 'an end card' : 'the post caption'}</p></div></div>` : ''}`; },
  publish:node => { const composer = source(node, 'reel'); return `${inputChips(node)}${runButton(node, 'writeMetadata', node.title ? '↻ Rewrite title + description (mock)' : '✦ Write title + description (mock)')}
    ${field(`Title · ${node.title.length}/100`, 'title', node.title, {max:100})}
    ${field('Description', 'description', node.description, {tag:'textarea', max:5000})}
    ${field('Hashtags', 'tags', node.tags, {max:200, hint:'#shorts helps YouTube classify it as a Short.'})}
    <div class="inspector-actions"><button class="mini-button" id="publishCopy" ${node.title ? '' : 'disabled'}>⧉ Copy text</button><button class="mini-button" id="publishDownload" ${composer && reelReady(composer) ? '' : 'disabled'}>⇩ Download</button></div>
    <button class="button primary wide yt-upload" id="publishUpload" ${node.title && !busy.has(node.id) ? '' : 'disabled'}>${busy.has(node.id) ? escapeHTML(stageText.get(node.id) || 'Uploading…') : node.uploaded ? '✓ Uploaded (mock) · upload again' : '⇪ Upload to YouTube (mock)'}</button>
    <small class="muted">Mock: nothing is posted. A real version would sign in with Google and upload through the YouTube Data API.</small>`; },
  context:node => `${field('Product name', 'appName', node.appName, {max:60})}
    ${field('What it does', 'description', node.description, {tag:'textarea', max:400, placeholder:'One or two sentences'})}
    ${field('Target audience', 'audience', node.audience, {max:100, placeholder:'e.g. small business owners'})}
    ${field('Pain it removes', 'pain', node.pain, {max:60, placeholder:'e.g. marketing', hint:'Hook: “I’m so bad at …”'})}
    ${field('Result you got', 'result', node.result, {max:80, placeholder:'e.g. got 10M+ views', hint:'Twist: “Meanwhile I …”'})}
    ${field('Key features (one per line)', 'features', node.features, {tag:'textarea', max:400, placeholder:'Track viral accounts in your niche\nSort by high performance\nReplicate viral content ideas', hint:'Become the numbered demo steps after “1. Go here”.'})}`,
  shots:node => `<div class="form-group"><label>Screens and results</label><div class="shot-grid">${node.shots.map((id, index) => `<div class="shot">${mediaUrls.get(id) ? `<img src="${escapeHTML(mediaUrls.get(id))}" alt="Screenshot ${index + 1}">` : index + 1}<button class="shot-remove" data-remove-shot="${index}" aria-label="Remove screenshot">×</button></div>`).join('')}<label class="shot add" title="Upload screenshots">＋<input id="shotUpload" type="file" accept="image/png,image/jpeg,image/webp" multiple></label></div><small>Used by the proof collage, and by the demo cutter when there is no demo video. Results (analytics, viral posts) make the best proof.</small></div>`,
  demo:node => `<div class="form-group"><label>Screen recording</label>${uploadBox('demoUpload', node.mediaId ? `Replace ${escapeHTML(node.mediaName)}` : '＋ Upload MP4 or WebM', 'video/mp4,video/webm')}<small>${node.mediaId ? `${node.duration || 'Unknown'} seconds. ` : ''}Stored in this browser only.</small></div>${node.mediaId && mediaUrls.get(node.mediaId) ? `<div class="media-preview"><video src="${escapeHTML(mediaUrls.get(node.mediaId))}" muted playsinline loop autoplay></video></div>` : ''}`,
  script:node => `${inputChips(node)}${select('Hook style', 'tone', node.tone, TONES)}${runButton(node, 'generateScript', node.hook ? '↻ Rewrite script (mock)' : '✦ Generate script (mock)')}
    ${field('Hook line', 'hook', node.hook, {max:70, hint:'Big white quote over the reaction clip.'})}
    ${field('Twist line', 'twist', node.twist, {max:70, hint:'Smaller line that appears under the hook.'})}
    ${formatOf(node)?.beats.some(beat => beat.kind === 'turn') ? field('Turn line', 'turn', node.turn, {max:80, hint:'The creator comes back to raise an objection.'}) : ''}
    ${node.steps.map((step, index) => `<div class="form-group step-group"><label>Step ${index + 1}</label><input data-step="${index}" data-key="title" value="${escapeHTML(step.title)}" maxlength="50" placeholder="Yellow caption"><input data-step="${index}" data-key="sub" value="${escapeHTML(step.sub)}" maxlength="60" placeholder="Optional white sub-caption"></div>`).join('')}
    ${field('Payoff line', 'payoff', node.payoff, {max:90, hint:'Over the results collage at the end.'})}
    ${field('CTA / post caption', 'cta', node.cta, {max:90, hint:'Goes in the post caption; optionally an end card.'})}`,
  hookclip:node => {
    const script = scriptOf(node);
    const effectivePrompt = node.prompt || (script ? defaultHookPrompt(node) : '');
    return `${inputChips(node)}${select('Source', 'mode', node.mode || 'ai', {
      ai:'✦ Generate AI hook from script (Veo)',
      upload:'Upload my own clip',
      mock:'AI reaction clip (mock)'
    }, true)}
    ${node.mode === 'ai' ? `
      ${!script ? '<div class="media-note" style="border-left:3px solid #f0a868;">Connect a Script writer block with a hook line to generate an AI hook clip.</div>' : `
        <div class="form-group">
          <label>Script Hook Line</label>
          <div style="padding:8px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:6px;font-size:13px;font-weight:600;color:#fff;margin-bottom:6px;">“${escapeHTML(script.hook)}”</div>
          ${script.twist ? `<small class="muted" style="display:block;margin-bottom:8px;">Twist: “${escapeHTML(script.twist)}”</small>` : ''}
        </div>
      `}
      <div class="form-group">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <label style="margin:0;">AI Video Prompt (Veo 3.1)</label>
          <button class="link-button" id="resetHookPrompt" type="button" style="font-size:11px;">↺ Reset to script</button>
        </div>
        <textarea data-field="prompt" rows="3" maxlength="800" placeholder="A vertical 9:16 UGC video of a creator speaking...">${escapeHTML(effectivePrompt)}</textarea>
        <small class="muted">Editable video prompt sent to Google Veo 3.1 Fast.</small>
      </div>
      ${runButton(node, 'generateHook', (node.mediaId || node.generated) ? '↻ Regenerate AI hook from script' : '✦ Generate AI hook from script')}
      <small class="muted">${isMockMode() ? 'Mock mode is ON — generates simulated clip without using API credits. Toggle off on the home page for live Veo 3.1 video.' : (hasShopApiKey() ? 'ShopAIKey is active. Will generate a 9:16 vertical clip using Google Veo 3.1 Fast.' : 'Add your ShopAIKey on the home page to enable live Veo 3.1 video generation.')}</small>
      ${node.mediaId && mediaUrls.get(node.mediaId) ? `
        <div class="media-preview">
          <video src="${escapeHTML(mediaUrls.get(node.mediaId))}" controls playsinline loop autoplay></video>
        </div>
        <div style="font-size:11px;color:#888;margin-top:6px;display:flex;justify-content:space-between;align-items:center;">
          <span>${escapeHTML(node.mediaName || 'ai-hook.mp4')}</span>
          <button class="link-button" id="clearHookMedia" type="button" style="color:#ff6b6b;font-size:11px;">✕ Remove clip</button>
        </div>
      ` : node.generated && !node.mediaId ? `
        <div class="media-preview">
          <img src="${DEMO_REACTION_IMAGE}" alt="Sample creator reaction">
        </div>
        <div style="font-size:11px;color:#888;text-align:center;margin-top:6px;">Simulated creator still (Mock mode)</div>
      ` : ''}
    ` : node.mode === 'upload' ? `
      <div class="form-group">
        <label>Your clip</label>
        ${uploadBox('hookUpload', node.mediaId ? `Replace ${escapeHTML(node.mediaName)}` : '＋ Upload a face-to-camera clip', 'video/mp4,video/webm,image/png,image/jpeg,image/webp')}
      </div>
      ${node.mediaId && mediaUrls.get(node.mediaId) ? `
        <div class="media-preview">
          ${node.mediaType === 'video' ? `<video src="${escapeHTML(mediaUrls.get(node.mediaId))}" controls playsinline loop autoplay></video>` : `<img src="${escapeHTML(mediaUrls.get(node.mediaId))}" alt="Uploaded clip">`}
        </div>
        <div style="font-size:11px;color:#888;margin-top:6px;display:flex;justify-content:space-between;align-items:center;">
          <span>${escapeHTML(node.mediaName)}</span>
          <button class="link-button" id="clearHookMedia" type="button" style="color:#ff6b6b;font-size:11px;">✕ Remove clip</button>
        </div>
      ` : ''}
      <div style="margin-top:12px;padding:10px 12px;background:rgba(239,184,211,0.08);border:1px dashed rgba(239,184,211,0.3);border-radius:6px;font-size:12px;display:flex;align-items:center;justify-content:space-between;">
        <span>Don’t have a face recording?</span>
        <button class="link-button" id="switchToAiHook" type="button" style="color:#efb8d3;font-weight:600;">✦ Generate with AI instead →</button>
      </div>
    ` : `
      ${runButton(node, 'generateHook', node.generated ? '↻ Regenerate reaction (mock)' : '✦ Generate reaction (mock)')}
      <small class="muted">Demo uses a generated creator still with a subtle camera move. It is not a generated video or a reaction to your specific hook.</small>
      ${node.generated ? `<div class="media-preview"><img src="${DEMO_REACTION_IMAGE}" alt="Generated sample creator reaction"></div>` : ''}
    `}
    ${range('Hook length', 'duration', node.duration || 2.5, 1.5, 6, .5)}`;
  },
  proof:node => `${inputChips(node)}${runButton(node, 'buildProof', node.generated ? '↻ Rebuild collage (mock)' : '✦ Build collage (mock)')}
    <small class="muted">Mock: tiles your screenshots into a grid. It flashes for 1s under the hook, then returns at the end with the payoff line.</small>
    ${range('Payoff length', 'duration', node.duration, 2, 5, .5)}`,
  cutter:node => { const segments = cutSegments(node); return `${inputChips(node)}${range('Length per step', 'clipLength', node.clipLength, 1.5, 4, .5)}${runButton(node, 'runCutter', node.cut ? '↻ Re-run auto-cut (mock)' : '✦ Auto-cut demo (mock)')}
    <small class="muted">Mock: one clip from the middle of each equal slice of the demo, one per script step. Falls back to screenshots when there is no demo video.</small>
    ${segments.length ? `<div class="form-group"><label>Cuts</label><div class="segment-list">${segments.map(segment => `<div class="segment"><div class="segment-thumb">${segment.media.type === 'video' ? `<video src="${escapeHTML(mediaUrls.get(segment.media.id) || '')}#t=${segment.start + .2}" muted playsinline preload="metadata"></video>` : `<img src="${escapeHTML(mediaUrls.get(segment.media.id) || '')}" alt="">`}</div><div><strong>${escapeHTML(segment.title)}</strong><span>${segment.media.type === 'video' ? `${segment.start.toFixed(1)}s → ${(segment.start + segment.duration).toFixed(1)}s` : 'Screenshot'} · ${seconds(segment.duration)}</span></div></div>`).join('')}</div></div>` : ''}`; },
  composer:node => { const reel = composeReel(node); return `${inputChips(node)}
    ${source(node, 'hook')?.mode === 'mock' ? '<div class="media-note">The hook uses a generated demo still with a camera move. The scene sequence and exported reel are composed in your browser.</div>' : ''}
    ${timingOf([source(node, 'hook'), source(node, 'proof'), source(node, 'segments')].map(scriptOf).find(Boolean)) ? '<div class="media-note">Scene timing, caption colors, and CTA placement follow the reference format.</div>' : `<label class="check-row"><input type="checkbox" data-field="proofFlash" ${node.proofFlash ? 'checked' : ''}> Flash proof for 1s after the hook</label>`}
    <label class="check-row"><input type="checkbox" data-field="endCard" ${node.endCard ? 'checked' : ''}> Add a CTA end card</label>
    ${node.endCard ? range('End card length', 'endDuration', node.endDuration, 1, 4, .5) : ''}
    <div class="form-group"><label>Sequence · ${seconds(reel.total)}</label><ol class="sequence">${reel.scenes.map(scene => `<li class="scene-${scene.kind}"><span>${SCENE_LABEL[scene.kind] || 'STEP'}</span><strong>${escapeHTML(scene.title)}</strong><em>${seconds(scene.duration)}</em></li>`).join('') || '<li class="empty">Nothing connected yet</li>'}</ol></div>
    ${reel.caption ? `<div class="form-group"><label>Post caption</label><div class="post-caption">${escapeHTML(reel.caption)}</div><button class="link-button" id="copyCaption">⧉ Copy caption</button></div>` : ''}
    <div class="inspector-actions"><button class="mini-button" id="composerPreview" ${reelReady(node) ? '' : 'disabled'}>▶ Preview</button><button class="mini-button primary" id="composerExport" ${reelReady(node) ? '' : 'disabled'}>↗ Export</button></div>`; }
};
function renderInspector() {
  const inspector = $('#inspector');
  if (activeTab === 'preview') {
    const node = activeComposer(), reel = node && composeReel(node);
    inspector.innerHTML = `<div class="preview-pane"><h2>See your reel in motion</h2><p>Reaction hook, proof flash, numbered demo cuts, and the results payoff, rendered in 9:16.</p><p>${reel?.scenes.length ? `${reel.scenes.length} scenes · ${seconds(reel.total)}` : 'Connect blocks to a Reel composer first.'}</p><button class="button primary" id="panelPreview">▶ Play preview</button></div>`;
    $('#panelPreview').onclick = openPreview; return;
  }
  const node = nodeById(state.selected);
  if (!node) { inspector.innerHTML = '<div class="empty-state"><div class="empty-graphic">✦</div><h3>Pick a block</h3><p>Select any block on the canvas to edit it.</p></div>'; return; }
  const meta = META[node.type];
  inspector.innerHTML = `<div class="inspector-head"><span class="inspector-icon" style="background:${meta.accent}">${meta.icon}</span><div><small>${meta.label.toUpperCase()}${meta.group === 'ai' ? ' · MOCK' : ''}</small><h2>${escapeHTML(nodeSummary(node)[0])}</h2></div></div>
    ${inspectors[node.type](node)}
    <div class="inspector-divider"></div><div class="inspector-actions"><button class="mini-button" id="duplicateNode">⧉ Duplicate</button><button class="mini-button danger" id="deleteNode">⌫ Delete</button></div>`;
  const changed = rerender => { renderCanvas(); save(); if (rerender) renderInspector(); else inspector.querySelector('.inspector-head h2').textContent = nodeSummary(node)[0]; };
  inspector.querySelectorAll('[data-field]').forEach(input => input.addEventListener(input.type === 'checkbox' || input.tagName === 'SELECT' || input.type === 'range' ? 'change' : 'input', () => {
    const key = input.dataset.field;
    node[key] = input.type === 'checkbox' ? input.checked : input.hasAttribute('data-number') ? Number(input.value) : input.value;
    changed(input.hasAttribute('data-rerender') || input.type === 'checkbox' || input.type === 'range');
    if (node.type === 'reference' && key === 'url') lookupShort(node);
  }));
  inspector.querySelectorAll('input[type=range]').forEach(input => input.addEventListener('input', () => { const label = inspector.querySelector(`[data-range-value="${input.dataset.field}"]`); if (label) label.textContent = `${input.value} sec`; }));
  inspector.querySelectorAll('[data-step]').forEach(input => input.addEventListener('input', () => { node.steps[Number(input.dataset.step)][input.dataset.key] = input.value; changed(false); }));
  const on = (selector, handler) => { const el = inspector.querySelector(selector); if (el) el.onclick = handler; };
  on('#duplicateNode', () => duplicateNode(node.id));
  on('#deleteNode', () => deleteNode(node.id));
  on('#generateScript', () => generateScript(node));
  on('#writeMetadata', () => { const composer = source(node, 'reel'); if (!composer || !reelReady(composer)) { toast('Connect a finished Reel composer first'); return; } runMock(node, () => { Object.assign(node, shortsMetadata(composer), {uploaded:false}); }, 'Title and description written'); });
  on('#publishUpload', () => uploadShort(node));
  on('#publishDownload', () => { state.selected = source(node, 'reel').id; exportVideo(); });
  on('#publishCopy', () => navigator.clipboard?.writeText(`${node.title}\n\n${node.description}\n\n${node.tags}`).then(() => toast('Title, description, and hashtags copied'), () => toast('Could not copy — select the text instead')));
  on('#extractFormat', () => runFormat(node).catch(error => toast(error.message)));
  on('#generateHook', () => generateHookClip(node));
  on('#switchToAiHook', () => { node.mode = 'ai'; changed(true); });
  on('#resetHookPrompt', () => { node.prompt = defaultHookPrompt(node); changed(true); });
  on('#clearHookMedia', () => { node.mediaId = ''; node.mediaName = ''; node.generated = false; changed(true); });
  on('#buildProof', () => source(node, 'images')?.shots?.length ? runMock(node, () => { node.generated = true; }, 'Proof collage ready') : toast('Connect Screenshots with at least one image first'));
  on('#runCutter', () => runMock(node, () => { node.cut = true; }, 'Demo cut into numbered steps'));
  on('#copyCaption', () => navigator.clipboard?.writeText(composeReel(node).caption).then(() => toast('Caption copied'), () => toast('Could not copy — select the text instead')));
  on('#composerPreview', openPreview);
  on('#composerExport', exportVideo);
  inspector.querySelectorAll('[data-remove-shot]').forEach(button => button.onclick = () => { node.shots.splice(Number(button.dataset.removeShot), 1); changed(true); });
  const bind = (id, handler) => { const input = $(id); if (input) input.onchange = async event => { const files = [...(event.target.files || [])]; if (!files.length) return; try { await handler(files); changed(true); } catch (error) { console.error(error); toast(error.message || 'Could not save this file in your browser'); } }; };
  bind('#shotUpload', async files => { for (const file of files) { if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Choose PNG, JPG, or WebP images'); node.shots.push(await storeMedia(file)); } toast(`${files.length} screenshot${files.length > 1 ? 's' : ''} added`); });
  bind('#demoUpload', async ([file]) => {
    if (!/^video\/(mp4|webm|quicktime)$/.test(file.type)) throw new Error('Choose an MP4, MOV, or WebM video');
    if (file.size > 200 * 1024 * 1024) throw new Error('Please choose a video under 200 MB');
    node.mediaId = await storeMedia(file); node.mediaName = file.name; node.duration = await videoDuration(mediaUrls.get(node.mediaId)); toast('Demo video added');
  });
  bind('#hookUpload', async ([file]) => {
    if (!/^(video\/(mp4|webm|quicktime)|image\/(png|jpeg|webp))$/.test(file.type)) throw new Error('Choose an MP4, MOV, WebM, PNG, JPG, or WebP file');
    node.mediaId = await storeMedia(file); node.mediaType = file.type.startsWith('video/') ? 'video' : 'image'; node.mediaName = file.name; toast('Hook clip added');
  });
}

function addNode(type) {
  const scroll = $('#canvasScroll'), node = newNode(type, Math.round(scroll.scrollLeft + 80 + Math.random() * 120), Math.round(scroll.scrollTop + 80 + Math.random() * 120));
  state.nodes.push(node); state.selected = node.id; renderCanvas(); renderInspector(); save(); toast(`${META[type].label} block added — connect its dots`);
}
function duplicateNode(id) {
  const original = nodeById(id), clone = {...structuredClone(original), id:`${original.type}-${crypto.randomUUID().slice(0, 8)}`, x:original.x + 40, y:original.y + 200};
  state.nodes.push(clone);
  state.edges.push(...state.edges.filter(edge => edge.to === id).map(edge => ({...edge, to:clone.id})));
  state.selected = clone.id; renderCanvas(); renderInspector(); save(); toast('Block duplicated with its inputs');
}
function deleteNode(id) { state.nodes = state.nodes.filter(node => node.id !== id); state.edges = state.edges.filter(edge => edge.from !== id && edge.to !== id); state.selected = state.nodes[0]?.id; renderCanvas(); renderInspector(); save(); toast('Block removed'); }

// ---------- Run the whole pipeline ----------
// Blocks upstream of each Reel composer, dependencies first.
function runOrder() {
  const order = [], seen = new Set();
  const visit = node => { if (!node || seen.has(node.id)) return; seen.add(node.id); PORTS[node.type].in.forEach(port => visit(source(node, port))); order.push(node); };
  state.nodes.filter(node => META[node.type].group === 'output' && !state.edges.some(edge => edge.from === node.id)).forEach(visit);
  return order;
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
// Each step returns 'done' or 'skipped', or throws to stop the run.
const STEPS = {
  async reference(node) { await pause(250); if (node.mode === 'url' && !youtubeId(node.url)) throw new Error('Paste a public YouTube Shorts link, or switch Reference Short to the preset'); return 'done'; },
  async format(node) { await runFormat(node, true); return 'done'; },
  async context(node) { await pause(250); if (!node.appName) throw new Error('Add a product name in Product context'); return 'done'; },
  async shots(node) { await pause(250); return node.shots.length ? 'done' : 'skipped'; },
  async demo(node) { await pause(250); return node.mediaId ? 'done' : 'skipped'; },
  async script(node) {
    const context = source(node, 'context');
    if (!context?.appName) throw new Error('Script writer needs a connected Product context with a name');
    const currentKey = scriptKey(node);
    if (node.hook && node.basedOn === currentKey) { await pause(400); return 'done'; }
    if (!isMockMode()) {
      const apiKey = getShopApiKey();
      if (apiKey || geminiReady) {
        stageText.set(node.id, 'Writing AI script with Gemini…');
        renderCanvas();
        try {
          const res = await fetch('/api/script', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              context: {
                appName: context.appName,
                description: context.description,
                audience: context.audience,
                pain: context.pain,
                result: context.result,
                features: context.features
              },
              format: formatOf(node),
              tone: node.tone,
              apiKey: apiKey || undefined,
              baseUrl: 'https://api.shopaikey.com/v1beta'
            })
          });
          if (res.ok) {
            const aiScript = await res.json();
            Object.assign(node, aiScript, { basedOn: currentKey });
            return 'done';
          }
        } catch (err) {
          console.warn('[PromoFlow] Live script generation failed, falling back:', err);
        }
      }
    }
    await mockStages(node, STAGES.script);
    Object.assign(node, mockScript(context, node), { basedOn: currentKey });
    return 'done';
  },
  async hookclip(node) {
    if (!scriptOf(node)) throw new Error('Hook clip needs a connected Script writer');
    if (node.mode === 'upload') {
      if (!node.mediaId) throw new Error('Upload your hook clip, or switch Hook clip to AI generator');
      await pause(300);
      return 'done';
    }
    if (node.mode === 'ai') {
      if (node.mediaId) { await pause(300); return 'done'; }
      await generateHookClip(node);
      if (!hookMedia(node)) throw new Error('AI hook clip was not generated');
      return 'done';
    }
    await mockStages(node, STAGES.hookclip);
    node.generated = true;
    return 'done';
  },
  async proof(node) {
    if (!source(node, 'images')?.shots?.length) { await pause(250); return 'skipped'; }
    await mockStages(node, STAGES.proof); node.generated = true; return 'done';
  },
  async cutter(node) {
    if (!source(node, 'demo')?.mediaId && !source(node, 'images')?.shots?.length) throw new Error('Demo cutter needs a demo video or screenshots');
    await mockStages(node, STAGES.cutter); node.cut = true; return 'done';
  },
  async composer(node) {
    if (!reelReady(node)) throw new Error('Reel composer needs a hook clip and demo cuts');
    await renderReelThumb(node); return 'done';
  },
  async publish(node) {
    const composer = source(node, 'reel');
    if (!composer || !reelReady(composer)) throw new Error('Publish to Shorts needs a finished Reel composer');
    if (node.title) { await pause(300); return 'done'; }
    await mockStages(node, STAGES.publish); Object.assign(node, shortsMetadata(composer)); return 'done';
  }
};
async function renderReelThumb(node) {
  const reel = composeReel(node), scene = reel.scenes[0], videos = await prepareMedia([scene]);
  const video = videos.get(scene.media.id);
  if (video) { video.currentTime = scene.start + .5; await new Promise(resolve => { video.onseeked = resolve; setTimeout(resolve, 800); }); }
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  paintScene(canvas.getContext('2d'), scene, 1.6, reel.app, videos);
  reelThumbs.set(node.id, canvas.toDataURL('image/jpeg', .75));
}
function setRunning(value) {
  running = value;
  const button = $('#runBtn'); button.disabled = value; button.innerHTML = value ? 'Running…' : '✦ <span>Run</span>';
}
async function runPipeline() {
  if (running) return;
  const order = runOrder();
  if (!order.length) { toast('Add a Reel composer block first'); return; }
  closePreview(); runState.clear(); lastFinished = '';
  order.forEach(node => runState.set(node.id, 'queued'));
  setRunning(true); renderCanvas();
  for (const [index, node] of order.entries()) {
    runState.set(node.id, 'running'); lastFinished = '';
    $('#flowStats').textContent = `Running ${index + 1}/${order.length} · ${META[node.type].label}`;
    renderCanvas(); if (state.selected === node.id) renderInspector();
    const scroller = $('#canvasScroll');
    if (node.x < scroller.scrollLeft || node.x + 230 > scroller.scrollLeft + scroller.clientWidth || node.y < scroller.scrollTop || node.y + 200 > scroller.scrollTop + scroller.clientHeight) scroller.scrollTo({left:Math.max(0, node.x - 60), top:Math.max(0, node.y - 60), behavior:'smooth'});
    try { runState.set(node.id, await STEPS[node.type](node)); }
    catch (error) {
      console.warn(error); runState.set(node.id, 'error'); setRunning(false);
      order.filter(item => runState.get(item.id) === 'queued').forEach(item => runState.delete(item.id));
      selectNode(node.id); toast(error.message || 'Run stopped'); return;
    }
    lastFinished = node.id; save(); renderCanvas(); if (state.selected === node.id) renderInspector();
  }
  state.selected = order.at(-1).id;
  setRunning(false); renderCanvas(); renderInspector(); save();
  toast('Reel ready'); openPreview();
}

// ---------- Sample project ----------
// PromoFlow makes a Short about itself: Canva's Short is the reference; the recording and screens in dist/sample are real PromoFlow footage.
const SAMPLE_REFERENCE = 'https://youtube.com/shorts/nAZD57mN78I';
const SAMPLE_CONTEXT = {
  appName: 'Fitness Online',
  description: 'All-in-one home fitness app offering 3D workouts, diet tracking, and online coach hiring.',
  audience: 'Men and women wanting to lose weight, build muscle, or stay fit at home.',
  pain: 'Staying consistent, mastering correct form, and figuring out meal plans alone.',
  result: 'Built muscle and reached body goals with custom programs guided by elite coaches.',
  features: 'Over 850 exercises with high-quality 3D animations\nReady workouts and diet plans designed by champion bodybuilders\nCalorie counter and food tracker with 5,000+ items\nBuilt-in personal workout and fitness progress diary\nDirect in-app chat and 1-on-1 personal coach hiring'
};
const isBlank = () => !state.nodes.some(node => node.appName || node.mediaId || node.shots?.length || node.hook);
async function loadSample() {
  const file = async (path, type) => new File([await (await fetch(path)).blob()], path.split('/').pop(), {type});
  const [shots, demo] = await Promise.all([
    Promise.all([1, 2, 3, 4, 5].map(async index => storeMedia(await file(`sample/${index}.webp`, 'image/webp')))),
    file('sample/app-trailer.mp4', 'video/mp4').then(storeMedia)
  ]);
  state = starterProject(); state.name = 'Fitness Online Short'; state.sampleSeen = true;
  Object.assign(nodeById('reference'), {mode:'url', url:SAMPLE_REFERENCE});
  lookupShort(nodeById('reference'));
  Object.assign(nodeById('context'), SAMPLE_CONTEXT);
  nodeById('shots').shots = shots;
  Object.assign(nodeById('demo'), {mediaId:demo, mediaName:'app-trailer.mp4', duration:await videoDuration(mediaUrls.get(demo))});
  const sampleFormat = KNOWN_FORMATS.nAZD57mN78I;
  Object.assign(nodeById('format'), {format:sampleFormat, key:'nAZD57mN78I'});
  const scriptNode = nodeById('script');
  Object.assign(scriptNode, writeScript(SAMPLE_CONTEXT, sampleFormat), {basedOn:scriptKey(scriptNode)});
  state.shotList = shotList(sampleFormat, scriptNode);
  $('#projectName').value = state.name; renderCanvas(); renderInspector(); save();
}
async function trySample() {
  if (running) return;
  if (!isBlank() && !confirm('Replace your current project with the PromoFlow sample?')) return;
  $('#sampleBanner').hidden = true;
  const buttons = [$('#sampleBtn'), $('#sampleBannerBtn')]; buttons.forEach(button => button.disabled = true);
  try { toast('Loading the PromoFlow sample…'); await loadSample(); await runPipeline(); }
  catch (error) { console.error(error); toast('Could not load the sample. Check your connection and try again.'); }
  finally { buttons.forEach(button => button.disabled = false); }
}
function renderSampleBanner() { $('#sampleBanner').hidden = !!state.sampleSeen || !isBlank(); }

// ---------- Mock AI ----------
async function runMock(node, apply, message) {
  busy.add(node.id); renderCanvas(); renderInspector();
  try { await mockStages(node, STAGES[node.type]); apply(); toast(message); }
  finally { busy.delete(node.id); renderCanvas(); renderInspector(); save(); }
}
// Mirror the reference's CTA style: comment-to-get, link in bio, or a plain invitation.
function ctaLike(example, name) {
  const word = name.split(/\s+/)[0].toUpperCase();
  if (/link in bio/i.test(example)) return `Try ${name} — link in bio`;
  if (/comment|save/i.test(example) || !example) return `SAVE + comment “${word}” and I’ll send you the link`;
  return `Try ${name} free`;
}
const scriptKey = node => {
  const format = formatOf(node);
  const context = source(node, 'context');
  const ctx = context ? `${context.appName}:${context.pain}:${context.result}:${(context.features || '').slice(0, 120)}` : 'none';
  return `${format?.videoId || format?.source || 'none'}:${format?.beats?.length || 0}:${node.tone}:${ctx}`;
};
const mockScript = (context, node) => writeScript(context, formatOf(node), node.tone);
function writeScript(context, format, fallbackTone = 'confession') {
  const tone = format?.tone || fallbackTone, stepCount = format ? clamp(format.beats.filter(beat => beat.kind === 'step').length, 1, 6) : 4;
  const name = context.appName || 'this app', pain = (context.pain || '').trim() || 'staying consistent', result = (context.result || '').trim();
  const hooks = {
    confession:[`“I’m so bad at ${pain}”`, result ? `Meanwhile I ${result}…` : `Meanwhile ${name} does it for me…`],
    pov:[`POV: you stopped struggling with ${pain}`, result ? `and ${result}` : `${name} handles it now`],
    problem:[`Still bad at ${pain}?`, result ? `I ${result} with this…` : 'Watch this…'],
    whatif:[`What if ${context.pain?.trim() ? `${context.pain.trim()} took one click` : `${name} did it for you`}?`, `With ${name}, it does.`]
  };
  const features = (context.features || '').split('\n').map(line => line.replace(/^[\s*•-]+/, '').trim()).filter(Boolean);
  const steps = (features.length ? features : ['Open the app', 'Pick your workout', 'Track your progress', 'Get results']).slice(0, stepCount).map(title => ({
    title: title.slice(0, 55),
    sub: ''
  }));
  return {tone, hook:hooks[tone]?.[0] || hooks.confession[0], twist:hooks[tone]?.[1] || hooks.confession[1], turn:'Most fitness apps leave you guessing correct form…', steps, payoff:result ? `I ${result} with ${name}. Like this:` : `Real results with ${name}`, cta:ctaLike(format?.cta?.example || '', name)};
}
let lookupTimer;
function lookupShort(node) {
  clearTimeout(lookupTimer);
  const id = youtubeId(node.url);
  if (!id || node.info?.videoId === id) return;
  lookupTimer = setTimeout(async () => {
    const response = await fetch('/api/shortinfo', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({url:node.url})}).catch(() => null);
    const result = await response?.json().catch(() => null);
    node.info = response?.ok ? result : {videoId:id, error:result?.error || 'Could not look up this Short'};
    if (!response?.ok) toast(node.info.error);
    save(); renderCanvas(); if (state.selected === node.id) renderInspector();
  }, 400);
}
const referenceKey = reference => reference.mode === 'preset' ? 'preset' : reference.mode === 'prompt' ? `prompt:${reference.prompt.trim()}` : youtubeId(reference.url);
// Without Gemini, a description picks the closest library format by its words.
function formatFromPrompt(text) {
  const words = text.toLowerCase();
  const pick = /what if|question|creator|talking|walkthrough|feature/.test(words) ? KNOWN_FORMATS.nAZD57mN78I : /pov/.test(words) ? FORMAT_LIBRARY.at(1) : /problem|pain|fix|mistake|list/.test(words) ? FORMAT_LIBRARY.at(2) : /before|after|reveal|story/.test(words) ? FORMAT_LIBRARY.at(3) : PRESET_FORMAT;
  return {...pick, source:'described', prompt:text.trim()};
}
// Real extraction when the server has a Gemini key; otherwise an annotated, library or described format, labeled as such.
async function extractFormat(reference, onStage) {
  const key = referenceKey(reference), step = async stages => { for (const stage of stages) { onStage(stage); await pause(380 + Math.random() * 320); } };
  if (!key || key === 'prompt:') throw new Error(reference.mode === 'prompt' ? 'Describe the Short you want first' : 'Paste a public YouTube Shorts link');
  if (key === 'preset') { await step(STAGES.format.slice(2)); return {key, format:PRESET_FORMAT, message:'Preset format loaded'}; }
  if (reference.mode === 'prompt') { await step(['Reading your description…', 'Matching it to proven formats…', 'Building the format…']); const format = formatFromPrompt(reference.prompt); return {key, format, message:`Format chosen from your description: ${format.title}`}; }
  const scanned = !KNOWN_FORMATS[key] && (await loadLibrary()).shorts.find(short => short.videoId === key);
  if (scanned) { await step(STAGES.format.slice(-2)); return {key, format:{...scanned.format, source:'library'}, message:'Format loaded from the Library, scanned by Gemini'}; }
  if (!isMockMode()) {
    const apiKey = getShopApiKey();
    if (!apiKey && !geminiReady) {
      console.warn('[PromoFlow] Live mode is active but no ShopAIKey API key found in localStorage.');
      throw new Error('Mock mode is OFF, but no ShopAIKey API key was found. Enter your key on the home page or turn Mock mode ON.');
    }
    const maskedKey = apiKey ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : '(none)';
    console.log(`[PromoFlow] Requesting format extraction via ShopAIKey [Key: ${maskedKey}] for:`, reference.url);
    onStage(apiKey ? 'Gemini is watching the Short via ShopAIKey…' : 'Gemini is watching the Short…');
    const start = performance.now();
    const response = await fetch('/api/format', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: reference.url,
        apiKey: apiKey || undefined,
        baseUrl: 'https://api.shopaikey.com/v1beta'
      })
    });
    const result = await response.json().catch(() => ({}));
    const elapsed = Math.round(performance.now() - start);
    if (!response.ok) {
      console.error(`[PromoFlow] ShopAIKey format extraction failed (${response.status}) in ${elapsed}ms:`, result.error);
      throw new Error(result.error || 'Could not extract the format via ShopAIKey');
    }
    console.log(`[PromoFlow] ShopAIKey format extraction succeeded in ${elapsed}ms:`, result);
    return { key, format: result, message: result.source === 'shopaikey' ? 'Format extracted with Gemini via ShopAIKey' : 'Gemini extracted the format' };
  }
  await step(STAGES.format);
  if (KNOWN_FORMATS[key]) return {key, format:{...KNOWN_FORMATS[key], source:'annotated', videoId:key}, message:'Format loaded: annotated by hand from this Short (Mock mode)'};
  const pick = FORMAT_LIBRARY.at([...key].reduce((sum, char) => sum + char.charCodeAt(0), 0) % FORMAT_LIBRARY.length);
  return {key, format:{...pick, source:'mock', videoId:key}, message:`Format extracted (mock): ${pick.title}`};
}
async function runFormat(node, quiet = false) {
  const reference = source(node, 'reference');
  if (!reference) throw new Error('Connect a Reference Short to the Format extractor');
  if (quiet && node.format && node.key === referenceKey(reference)) { await pause(300); return; }
  busy.add(node.id); renderCanvas(); renderInspector();
  try {
    const result = await extractFormat(reference, stage => { stageText.set(node.id, stage); const status = document.querySelector(`.node[data-id="${CSS.escape(node.id)}"] .status`); if (status) status.textContent = stage; });
    node.format = result.format; node.key = result.key; toast(result.message);
  } finally { stageText.delete(node.id); busy.delete(node.id); renderCanvas(); renderInspector(); save(); }
}

// ---------- Workflow planner ----------
const FORMAT_SOURCE = {gemini:'Extracted by Gemini', shopaikey:'Extracted via ShopAIKey (Gemini)', library:'Scanned by Gemini · Library', annotated:'Annotated by hand', mock:'Mock result', described:'Picked from your description', preset:'Preset format'};
// The blocks a format needs, each with the reason. Deterministic: same format, same graph.
function planWorkflow(format) {
  const count = kind => format.beats.filter(beat => beat.kind === kind).length;
  const steps = count('step'), creatorBeats = count('hook') + count('turn') + (format.cta.placement === 'endcard' ? count('cta') : 0), results = count('proof') + count('payoff');
  return [
    {type:'reference', why:'The Short whose format you copy'},
    {type:'format', why:`${format.beats.length} beats, timed`},
    {type:'context', why:'The only facts the script may use'},
    {type:'script', why:`Writes every beat in its ${TONES[format.tone] || 'original'} tone`},
    {type:'hookclip', why:creatorBeats > 1 ? `A face on camera in ${creatorBeats} beats` : 'Opens the Short'},
    steps && {type:'demo', why:`${steps} steps need one screen recording`},
    steps && {type:'cutter', why:'Cuts the recording into the steps'},
    results && {type:'shots', why:'Result screens to show as proof'},
    results && {type:'proof', why:`${results} result beat${results > 1 ? 's' : ''} in the reference`},
    {type:'composer', why:'Puts the beats in order, with the reference timing'},
    {type:'publish', why:'Title, description and #shorts'}
  ].filter(Boolean);
}
// What to record, grouped by what the founder has to make.
function shotList(format, script) {
  const face = [], screen = [], results = [];
  let stepIndex = 0;
  for (const beat of format.beats) {
    if (beat.kind === 'hook') face.push(`Say: “${script.hook}”`);
    else if (beat.kind === 'turn') face.push(`Say: “${script.turn}”`);
    else if (beat.kind === 'cta' && format.cta.placement === 'endcard') face.push(`Say: “${script.cta}”`);
    else if (beat.kind === 'step') { const step = script.steps.at(stepIndex++); if (step) screen.push(`Show: ${step.title}`); }
    else if (beat.kind === 'proof' || beat.kind === 'payoff') results.push(beat.kind === 'payoff' ? `A result that backs up: “${script.payoff}”` : 'A results screen: analytics, reviews or a milestone');
  }
  const seconds = kinds => format.beats.filter(beat => kinds.includes(beat.kind)).reduce((sum, beat) => sum + beat.seconds, 0);
  return [
    face.length && {slot:'hookclip', title:'Face clip', note:`One take, about ${Math.round(seconds(['hook', 'turn', 'cta']))} s, lines in order`, items:face},
    screen.length && {slot:'demo', title:'Screen recording', note:`One action per step, about ${Math.round(seconds(['step']) * 2)} s total`, items:screen},
    results.length && {slot:'shots', title:'Screenshots', note:'Real numbers only', items:results}
  ].filter(Boolean);
}
const shotDone = slot => { const node = state.nodes.find(item => item.type === slot); return slot === 'hookclip' ? !!hookMedia(node) : slot === 'demo' ? !!node?.mediaId : !!node?.shots?.length; };
function projectFromPlan({reference, context, format, key}) {
  const project = starterProject(), keep = new Set(planWorkflow(format).map(block => block.type));
  project.nodes = project.nodes.filter(node => keep.has(node.type));
  project.edges = project.edges.filter(edge => keep.has(edge.from) && keep.has(edge.to));
  const byId = id => project.nodes.find(node => node.id === id);
  Object.assign(byId('reference'), reference);
  Object.assign(byId('format'), {format, key});
  Object.assign(byId('context'), context);
  project.name = `${context.appName || 'My app'} Short`; project.sampleSeen = true; project.selected = 'hookclip';
  return project;
}
function renderShotList() {
  const panel = $('#shotListPanel'); if (!panel) return;
  const groups = state.shotList || [];
  panel.hidden = !groups.length;
  panel.innerHTML = groups.length ? `<div class="section-title"><span>SHOT LIST</span><span>${groups.filter(group => shotDone(group.slot)).length}/${groups.length}</span></div>${groups.map(group => `<button class="shot-group ${shotDone(group.slot) ? 'done' : ''}" data-shot-slot="${group.slot}"><span class="shot-check">${shotDone(group.slot) ? '✓' : '○'}</span><span><strong>${escapeHTML(group.title)}</strong><small>${escapeHTML(group.note)}</small>${group.items.map(item => `<em>${escapeHTML(item)}</em>`).join('')}</span></button>`).join('')}` : '';
  panel.querySelectorAll('[data-shot-slot]').forEach(button => button.onclick = () => { const node = state.nodes.find(item => item.type === button.dataset.shotSlot); if (node) { selectNode(node.id); } });
}
function shortsMetadata(composer) {
  const reel = composeReel(composer), script = [source(composer, 'hook'), source(composer, 'segments')].map(scriptOf).find(Boolean), context = source(script, 'context');
  const app = reel.app, tag = app.replace(/[^\w]/g, '').toLowerCase(), topic = (context?.pain || 'productivity').replace(/[^\w]/g, '').toLowerCase();
  const hook = (script?.hook || app).replace(/[“”"]/g, '');
  return {
    title:`${hook} | ${app}`.slice(0, 100),
    description:[script?.twist, '', ...(script?.steps || []).filter(step => step.title).map((step, index) => `${index + 1}. ${step.title}`), '', script?.cta].filter(line => line !== undefined).join('\n').trim(),
    tags:`#shorts #${tag} #${topic}`
  };
}
async function uploadShort(node) {
  busy.add(node.id); renderCanvas(); renderInspector();
  try {
    for (const stage of STAGES.upload) { stageText.set(node.id, stage); renderCanvas(); renderInspector(); await pause(550 + Math.random() * 300); }
    node.uploaded = true; toast('Mock upload complete — nothing was posted');
  } finally { stageText.delete(node.id); busy.delete(node.id); renderCanvas(); renderInspector(); save(); }
}
async function generateScript(node) {
  const context = source(node, 'context');
  if (!context?.appName) { toast('Connect a Product context with a product name first'); return; }
  busy.add(node.id); renderCanvas(); renderInspector();
  try {
    const currentKey = scriptKey(node);
    if (!isMockMode()) {
      const apiKey = getShopApiKey();
      if (apiKey || geminiReady) {
        stageText.set(node.id, 'Writing AI script with Gemini…');
        renderCanvas();
        try {
          const res = await fetch('/api/script', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              context: {
                appName: context.appName,
                description: context.description,
                audience: context.audience,
                pain: context.pain,
                result: context.result,
                features: context.features
              },
              format: formatOf(node),
              tone: node.tone,
              apiKey: apiKey || undefined,
              baseUrl: 'https://api.shopaikey.com/v1beta'
            })
          });
          if (res.ok) {
            const aiScript = await res.json();
            Object.assign(node, aiScript, { basedOn: currentKey });
            toast(`AI script generated via ${aiScript.source === 'shopaikey' ? 'ShopAIKey (Gemini)' : 'Gemini'}`);
            return;
          }
        } catch (err) {
          console.warn('[PromoFlow] Live script rewrite error, falling back:', err);
        }
      }
    }
    await mockStages(node, STAGES.script);
    Object.assign(node, mockScript(context, node), { basedOn: currentKey });
    toast(formatOf(node) ? 'Script written in the reference format' : 'Mock script written — edit any line');
  } finally {
    stageText.delete(node.id);
    busy.delete(node.id);
    renderCanvas();
    renderInspector();
    save();
  }
}

function defaultHookPrompt(node) {
  const script = scriptOf(node);
  const hook = (script?.hook || 'I used to struggle with this').replace(/[“”"]/g, '').trim();
  return `A vertical 9:16 UGC video of a relatable, energetic creator looking directly at the smartphone camera in a modern bright room, speaking with genuine expression and energy: “${hook}”. Authentic selfie camera angle, clean natural lighting, crisp 4k detail, no on-screen text or logos.`;
}

async function generateHookClip(node) {
  const script = scriptOf(node);
  if (!script || !script.hook) {
    toast('Connect a Script writer with a hook line first');
    return;
  }
  if (!node.prompt) node.prompt = defaultHookPrompt(node);

  busy.add(node.id);
  renderCanvas();
  renderInspector();
  try {
    if (!isMockMode()) {
      const apiKey = getShopApiKey();
      if (!apiKey && !geminiReady) {
        throw new Error('Mock mode is OFF, but no ShopAIKey API key was found. Enter your key on the home page or turn Mock mode ON.');
      }
      stageText.set(node.id, 'Submitting hook clip to Veo 3.1…');
      renderCanvas();
      renderInspector();

      const startRes = await fetch('/api/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: node.prompt,
          duration: node.duration || 4,
          apiKey: apiKey || undefined,
          baseUrl: 'https://api.shopaikey.com/v1beta'
        })
      });
      const startData = await startRes.json().catch(() => null);
      if (!startRes.ok || !startData?.operation) {
        throw new Error(startData?.error || 'Failed to start video generation');
      }

      const operation = startData.operation;
      console.log('[PromoFlow] Veo generation task started:', operation);
      stageText.set(node.id, 'Veo 3.1 generating vertical hook…');
      renderCanvas();
      renderInspector();

      const startTime = Date.now();
      let videoUri = null;
      while (Date.now() - startTime < 360000) {
        await pause(4000);
        const statusRes = await fetch('/api/video-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operation,
            apiKey: apiKey || undefined,
            baseUrl: 'https://api.shopaikey.com/v1beta'
          })
        });
        const statusData = await statusRes.json().catch(() => null);
        if (!statusRes.ok) {
          throw new Error(statusData?.error || 'Video status check failed');
        }
        if (statusData.done && statusData.uri) {
          videoUri = statusData.uri;
          break;
        }
        const elapsedSec = Math.round((Date.now() - startTime) / 1000);
        const progressLabel = statusData.progress ? `${statusData.progress} · ${elapsedSec}s` : `${elapsedSec}s`;
        stageText.set(node.id, `Veo 3.1 generating… ${progressLabel}`);
        renderCanvas();
        renderInspector();
      }

      if (!videoUri) throw new Error('Video generation timed out after 6 minutes');

      stageText.set(node.id, 'Downloading generated clip…');
      renderCanvas();
      renderInspector();

      let blob;
      try {
        const direct = await fetch(videoUri);
        if (direct.ok) blob = await direct.blob();
      } catch {
        // Fallback to proxy
      }
      if (!blob) {
        const proxied = await fetch('/api/video-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uri: videoUri, apiKey: apiKey || undefined })
        });
        if (!proxied.ok) throw new Error('Could not download generated video file');
        blob = await proxied.blob();
      }

      const file = new File([blob], 'veo-hook-clip.mp4', { type: 'video/mp4' });
      node.mediaId = await storeMedia(file);
      node.mediaType = 'video';
      node.mediaName = 'veo-hook-clip.mp4';
      node.generated = true;
      toast('✦ AI hook video generated with Veo 3.1!');
      return;
    }

    // Mock Mode
    await mockStages(node, STAGES.hookclip);
    node.generated = true;
    toast('Simulated creator reaction ready (Mock mode ON)');
  } catch (err) {
    console.error('[PromoFlow] Generate hook error:', err);
    toast(err.message || 'Could not generate hook clip');
  } finally {
    stageText.delete(node.id);
    busy.delete(node.id);
    renderCanvas();
    renderInspector();
    save();
  }
}

// ---------- Rendering (shared by preview and export) ----------
const W = 540, H = 960;
const loadedImages = new Map();
function getImage(src) { if (!src) return null; if (!loadedImages.has(src)) { const image = new Image(); image.src = src; loadedImages.set(src, image); } const image = loadedImages.get(src); return image.complete && image.naturalWidth ? image : null; }
function roundRect(ctx, x, y, w, h, r, fill) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); }
function lines(ctx, text, maxWidth, maxLines) { const words = String(text || '').split(/\s+/), result = []; let line = ''; for (const word of words) { const next = line ? line + ' ' + word : word; if (ctx.measureText(next).width > maxWidth && line) { result.push(line); line = word; } else line = next; } if (line) result.push(line); return result.slice(0, maxLines); }
function drawFit(ctx, media, mode, zoom, box = {x:0, y:0, w:W, h:H}) {
  const mw = media.videoWidth || media.naturalWidth, mh = media.videoHeight || media.naturalHeight;
  if (!mw || !mh) return false;
  const scale = (mode === 'cover' ? Math.max(box.w / mw, box.h / mh) : Math.min(box.w / mw, box.h / mh)) * zoom, width = mw * scale, height = mh * scale;
  ctx.drawImage(media, box.x + (box.w - width) / 2, box.y + (box.h - height) / 2, width, height);
  return true;
}
function drawCaption(ctx, text, y, color, size, maxLines, alpha = 1, scale = 1) {
  if (!text || alpha <= 0) return y;
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(W / 2, y); ctx.scale(scale, scale); ctx.translate(-W / 2, -y);
  ctx.font = `800 ${size}px Space Grotesk, Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round'; ctx.lineWidth = Math.round(size / 6); ctx.strokeStyle = '#111'; ctx.fillStyle = color;
  // 410px keeps captions clear of the Shorts action rail on the right.
  for (const row of lines(ctx, text, 410, maxLines)) { ctx.strokeText(row, W / 2, y); ctx.fillText(row, W / 2, y); y += size * 1.15; }
  ctx.restore(); return y;
}
// Generated demo still with a gentle push-in, shared by the preview, thumbnail, and exported reel.
function paintMockReaction(ctx, t) {
  const photo = getImage(DEMO_REACTION_IMAGE);
  if (photo) drawFit(ctx, photo, 'cover', 1.02 + Math.min(t, 5) * .008);
  else { ctx.fillStyle = '#273044'; ctx.fillRect(0, 0, W, H); }
}
function paintCollage(ctx, ids, progress) {
  const images = ids.map(id => getImage(mediaUrls.get(id))).filter(Boolean);
  const count = images.length >= 6 ? 6 : images.length >= 4 ? 4 : images.length >= 2 ? 2 : images.length, cols = count > 2 ? 2 : 1, rows = Math.ceil(count / cols), gap = 6;
  const cell = {w:(W - gap * (cols + 1)) / cols, h:(H - gap * (rows + 1)) / rows};
  images.slice(0, count).forEach((image, index) => {
    const box = {x:gap + (index % cols) * (cell.w + gap), y:gap + Math.floor(index / cols) * (cell.h + gap), ...cell};
    ctx.save(); ctx.beginPath(); ctx.roundRect(box.x, box.y, box.w, box.h, 10); ctx.clip(); drawFit(ctx, image, 'cover', 1 + progress * .06, box); ctx.restore();
  });
}
function paintScene(ctx, scene, t, app, videos) {
  const progress = clamp(t / scene.duration, 0, 1);
  ctx.fillStyle = '#14171d'; ctx.fillRect(0, 0, W, H);
  if (scene.media.type === 'mock') paintMockReaction(ctx, t);
  else if (scene.media.type === 'collage') paintCollage(ctx, scene.media.ids, progress);
  else {
    const video = scene.media.type === 'video' ? videos.get(scene.media.id) : null, media = video?.readyState >= 2 ? video : getImage(mediaUrls.get(scene.media.id));
    if (media) {
      if (scene.kind === 'hook' || scene.creator) drawFit(ctx, media, 'cover', 1 + progress * .04);
      else { ctx.save(); ctx.filter = 'blur(26px) brightness(.55)'; drawFit(ctx, media, 'cover', 1.1); ctx.restore(); drawFit(ctx, media, 'contain', scene.media.type === 'image' ? .88 + progress * .03 : .88); }
    }
  }
  if (scene.kind === 'cta') { ctx.fillStyle = scene.creator ? '#0006' : '#000b'; ctx.fillRect(0, 0, W, H); }
  if (scene.kind === 'payoff') { ctx.fillStyle = '#0005'; ctx.fillRect(0, 0, W, H); }
  const shade = ctx.createLinearGradient(0, 0, 0, H); shade.addColorStop(0, '#0006'); shade.addColorStop(.18, '#0000'); shade.addColorStop(.72, '#0000'); shade.addColorStop(1, '#0008'); ctx.fillStyle = shade; ctx.fillRect(0, 0, W, H);
  const pop = clamp(t / .22, 0, 1), scale = 1.15 - .15 * (1 - (1 - pop) ** 3);
  // Hook captions stay on screen, unanimated, through the proof flash.
  if (scene.kind === 'hook' || scene.kind === 'flash') {
    const held = scene.kind === 'flash';
    // The twist sits under the hook's last line, however many lines the hook wraps to.
    const after = drawCaption(ctx, scene.title, 545, scene.color === 'yellow' ? '#f5e83d' : '#fff', 40, 3, held ? 1 : pop, held ? 1 : scale);
    drawCaption(ctx, scene.sub, Math.max(640, after + 14), '#fff', 25, 2, held ? 1 : clamp((t - 1.1) / .2, 0, 1));
  } else if (scene.kind === 'turn') {
    drawCaption(ctx, scene.title, 480, scene.color === 'yellow' ? '#f5e83d' : '#fff', 38, 3, pop, scale);
  } else if (scene.kind === 'step') {
    const after = drawCaption(ctx, scene.title, 320, scene.color === 'white' ? '#fff' : '#f5e83d', 36, 2, pop, scale);
    if (scene.sub) drawCaption(ctx, scene.sub, Math.max(390, after + 12), '#fff', 24, 2, clamp((t - .35) / .2, 0, 1));
  } else if (scene.kind === 'payoff') {
    drawCaption(ctx, scene.title, 480, '#fff', 34, 4, pop, scale);
  }
  else {
    const after = drawCaption(ctx, scene.title, 400, '#fff', 38, 4, pop, scale);
    ctx.font = '900 24px Arial'; const pill = ctx.measureText(scene.sub).width + 48;
    ctx.globalAlpha = clamp((t - .3) / .25, 0, 1); roundRect(ctx, (W - pill) / 2, after + 20, pill, 56, 10, '#f5e83d'); ctx.fillStyle = '#1c1d16'; ctx.textAlign = 'center'; ctx.fillText(scene.sub, W / 2, after + 57); ctx.globalAlpha = 1;
  }
}
async function prepareMedia(scenes) {
  const videos = new Map();
  for (const scene of scenes) {
    if (scene.media.type === 'mock') { getImage(DEMO_REACTION_IMAGE); await loadedImages.get(DEMO_REACTION_IMAGE)?.decode?.().catch(() => {}); }
    const ids = scene.media.type === 'collage' ? scene.media.ids : scene.media.type === 'image' ? [scene.media.id] : [];
    for (const id of ids) { const url = mediaUrls.get(id); getImage(url); await loadedImages.get(url)?.decode?.().catch(() => {}); }
    if (scene.media.type === 'video' && !videos.has(scene.media.id)) {
      const url = mediaUrls.get(scene.media.id);
      if (!url) throw new Error('A clip is missing from this browser. Upload it again.');
      const video = document.createElement('video'); video.src = url; video.preload = 'auto'; video.playsInline = true;
      await new Promise((resolve, reject) => { if (video.readyState >= 2) { resolve(); return; } video.onloadeddata = resolve; video.onerror = () => reject(new Error('Could not load a clip. Try WebM or another MP4.')); video.load(); });
      videos.set(scene.media.id, video);
    }
  }
  return videos;
}
function playReel(ctx, reel, videos, onTick) {
  let stopped = false, active = -1;
  const start = performance.now();
  const startClip = scene => { const video = videos.get(scene.media.id); if (!video) return; if (!scene.continue) video.currentTime = video.duration ? scene.start % video.duration : scene.start; video.play().catch(() => { video.muted = true; video.play().catch(() => {}); }); };
  const done = new Promise(resolve => {
    const frame = now => {
      if (stopped) { resolve(false); return; }
      const elapsed = Math.min((now - start) / 1000, reel.total);
      let time = elapsed, index = 0;
      while (index < reel.scenes.length - 1 && time >= reel.scenes[index].duration) { time -= reel.scenes[index].duration; index++; }
      if (index !== active) { const previous = reel.scenes[active]; if (previous) videos.get(previous.media.id)?.pause(); active = index; startClip(reel.scenes[index]); }
      paintScene(ctx, reel.scenes[index], time, reel.app, videos); onTick?.(elapsed);
      if (elapsed < reel.total) requestAnimationFrame(frame); else { videos.forEach(video => video.pause()); resolve(true); }
    };
    requestAnimationFrame(frame);
  });
  return {done, stop() { stopped = true; videos.forEach(video => video.pause()); }};
}

function openPreview() {
  const node = activeComposer();
  if (!node) { toast('Add a Reel composer block first'); return; }
  if (!reelReady(node)) { selectNode(node.id); toast('Connect a ready Hook clip and Demo cutter to the composer'); return; }
  $('#previewModal').hidden = false; $('#modalTitle').textContent = state.name;
  const publish = state.nodes.find(item => item.type === 'publish' && source(item, 'reel')?.id === node.id), reel = composeReel(node);
  $('#phoneScreen').innerHTML = `<canvas width="${W}" height="${H}" class="reel-canvas"></canvas><div class="shorts-ui" ${$('#shortsUi').checked ? '' : 'hidden'}><div class="shorts-top"><span>Shorts</span><span>⌕ ⋮</span></div><div class="shorts-rail"><span>👍<small>48K</small></span><span>👎<small>Dislike</small></span><span>💬<small>1.2K</small></span><span>↪<small>Share</small></span><span>⟳<small>Remix</small></span></div><div class="shorts-meta"><div><b>@${escapeHTML(reel.app.replace(/\s+/g, '').toLowerCase())}</b><em>Subscribe</em></div><p>${escapeHTML(publish?.title || '')}</p></div></div>`;
  playPreview();
}
function stopPreview() { preview?.stop(); preview = null; $('#modalPlay').textContent = '▶'; }
function closePreview() { stopPreview(); $('#previewModal').hidden = true; }
async function playPreview() {
  if (preview) { stopPreview(); return; }
  const reel = composeReel(activeComposer()), ctx = $('#phoneScreen canvas').getContext('2d');
  $('#modalPlay').textContent = 'Ⅱ';
  try {
    const run = playReel(ctx, reel, await prepareMedia(reel.scenes), elapsed => { $('#progressBar').style.width = `${elapsed / reel.total * 100}%`; $('#progressTime').textContent = `${formatTime(elapsed)} / ${formatTime(reel.total)}`; });
    preview = run;
    if (await run.done && preview === run) stopPreview();
  } catch (error) { console.error(error); toast(error.message); stopPreview(); }
}
async function exportVideo() {
  const node = activeComposer();
  if (!node || !reelReady(node)) { if (node) selectNode(node.id); toast('Connect a ready Hook clip and Demo cutter to a Reel composer first'); return; }
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) { toast('Video export needs a browser with MediaRecorder and canvas capture'); return; }
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type)); if (!mime) { toast('This browser cannot encode a video file'); return; }
  stopPreview();
  const buttons = [$('#exportBtn'), $('#modalExport')]; buttons.forEach(button => { button.disabled = true; button.textContent = 'Rendering…'; });
  const reel = composeReel(node);
  let audioContext, stream, canvasStream, videos = new Map();
  try {
    videos = await prepareMedia(reel.scenes);
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H; const ctx = canvas.getContext('2d');
    canvasStream = canvas.captureStream(30); stream = canvasStream;
    if (videos.size && window.AudioContext) {
      audioContext = new AudioContext(); const destination = audioContext.createMediaStreamDestination();
      for (const video of videos.values()) audioContext.createMediaElementSource(video).connect(destination);
      await audioContext.resume();
      // Without a working audio clock (no output device) MediaRecorder waits for audio forever and writes nothing.
      const clock = audioContext.currentTime; await new Promise(resolve => setTimeout(resolve, 250));
      if (audioContext.currentTime - clock > .15) stream = new MediaStream([...canvasStream.getVideoTracks(), ...destination.stream.getAudioTracks()]);
    }
    paintScene(ctx, reel.scenes[0], 0, reel.app, videos);
    const recorder = new MediaRecorder(stream, {mimeType:mime, videoBitsPerSecond:5000000}), chunks = []; recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    const finished = new Promise((resolve, reject) => { recorder.onstop = () => resolve(new Blob(chunks, {type:mime})); recorder.onerror = event => reject(event.error || new Error('Recording failed')); });
    recorder.start(250);
    await playReel(ctx, reel, videos).done;
    recorder.stop(); const blob = await finished, url = URL.createObjectURL(blob), link = document.createElement('a');
    const name = !state.name || state.name === 'Untitled reel' ? `${reel.app} short` : state.name;
    link.href = url; link.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'reel'}.${mime.includes('mp4') ? 'mp4' : 'webm'}`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); toast('Reel exported — check your downloads');
  } catch (error) { console.error(error); toast(error.message?.startsWith('Could not load') || error.message?.startsWith('A clip') ? error.message : 'Export failed. Try Chrome or Edge on desktop.'); }
  finally { videos.forEach(video => video.pause()); stream?.getTracks().forEach(track => track.stop()); canvasStream?.getTracks().forEach(track => track.stop()); await audioContext?.close(); buttons.forEach(button => { button.disabled = false; button.innerHTML = '↗ <span>Export video</span>'; }); }
}

$('#projectName').value = state.name; $('#projectName').addEventListener('input', event => { state.name = event.target.value; save(); });
document.querySelectorAll('[data-add]').forEach(button => button.onclick = () => addNode(button.dataset.add));
$('#fitBtn').onclick = () => $('#canvasScroll').scrollTo({left:0, top:0, behavior:'smooth'});
const loadStarter = message => { state = starterProject(); $('#projectName').value = state.name; renderCanvas(); renderInspector(); save(); $('#canvasScroll').scrollTo({left:0, top:0, behavior:'smooth'}); toast(message); };
$('#resetBtn').onclick = () => { if (confirm('Reset this project to the starter pipeline?')) loadStarter('Starter pipeline restored'); };
$('#reelPresetBtn').onclick = () => { if (confirm('Replace your current blocks with the starter pipeline?')) loadStarter('Starter pipeline loaded — start with Product context'); };
$('#sampleBtn').onclick = trySample; $('#sampleBannerBtn').onclick = trySample; $('#dismissSample').onclick = () => { state.sampleSeen = true; save(); renderSampleBanner(); };
$('#runBtn').onclick = runPipeline; $('#playBtn').onclick = openPreview; $('#exportBtn').onclick = exportVideo; $('#modalExport').onclick = exportVideo;
$('#shortsUi').onchange = () => { const overlay = $('#phoneScreen .shorts-ui'); if (overlay) overlay.hidden = !$('#shortsUi').checked; };
$('#closePreview').onclick = closePreview; $('#modalPlay').onclick = playPreview; $('#previewModal').addEventListener('click', event => { if (event.target.id === 'previewModal') closePreview(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') { closePreview(); closeVideo(); closeSheet(); clearPending(); } });
$('#editTab').onclick = () => { activeTab = 'edit'; $('#editTab').classList.add('active'); $('#previewTab').classList.remove('active'); renderInspector(); };
$('#previewTab').onclick = () => { activeTab = 'preview'; $('#previewTab').classList.add('active'); $('#editTab').classList.remove('active'); renderInspector(); };
// ---------- Landing and Start pages ----------
let startMode = 'url', plan = null;
const VIEWS = ['home', 'start', 'library', 'studio'];
function route() {
  const view = VIEWS.includes(location.hash.replace(/^#\/?/, '')) ? location.hash.replace(/^#\/?/, '') : 'home';
  for (const name of VIEWS) $(`#${name}View`).hidden = name !== view;
  document.body.dataset.view = view;
  if (view === 'studio') { renderCanvas(); renderInspector(); }
  if (view === 'home') $('#continueBtn').hidden = isBlank();
  if (view === 'library') renderLibrary(); else stopReels();
  if (view === 'start') renderPicked();
  syncApiConfigUI();
  window.scrollTo(0, 0);
}
function setStartMode(mode) {
  startMode = mode;
  document.querySelectorAll('[data-start-mode]').forEach(button => button.classList.toggle('active', button.dataset.startMode === mode));
  document.querySelectorAll('[data-start-pane]').forEach(pane => { pane.hidden = pane.dataset.startPane !== mode; });
}
async function analyze() {
  const reference = startMode === 'url' ? {mode:'url', url:$('#startUrl').value.trim(), prompt:''} : {mode:'prompt', url:'', prompt:$('#startPrompt').value.trim()};
  const context = {appName:$('#startName').value.trim(), description:$('#startWhat').value.trim(), audience:'', pain:$('#startPain').value.trim(), result:$('#startResult').value.trim(), features:$('#startSteps').value.trim()};
  if (!context.appName) { toast('Add your app’s name first'); $('#startName').focus(); return; }
  const button = $('#analyzeBtn'), progress = $('#planProgress');
  button.disabled = true; $('#planCard').hidden = true; progress.hidden = false;
  try {
    if (reference.mode === 'url' && youtubeId(reference.url)) {
      progress.textContent = 'Looking up the Short…';
      const response = await fetch('/api/shortinfo', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({url:reference.url})}).catch(() => null);
      const info = await response?.json().catch(() => null);
      if (response && !response.ok) throw new Error(info?.error || 'Could not find this Short');
      if (info) reference.info = info;
    }
    const result = await extractFormat(reference, stage => { progress.textContent = stage; });
    progress.textContent = 'Planning your workflow…'; await pause(500);
    const script = writeScript(context, result.format);
    plan = {reference, context, ...result, script, blocks:planWorkflow(result.format), shots:shotList(result.format, script)};
    renderPlan(); toast(result.message);
  } catch (error) { toast(error.message || 'Could not analyze this'); }
  finally { button.disabled = false; progress.hidden = true; }
}
function renderPlan() {
  const card = $('#planCard'), {format, reference, blocks, shots} = plan;
  const label = reference.info ? `${escapeHTML(reference.info.title)} · ${escapeHTML(reference.info.author)}` : reference.mode === 'prompt' ? `“${escapeHTML(reference.prompt)}”` : '';
  card.innerHTML = `<p class="panel-kicker">Step 3 · Your plan</p>
    <div class="plan-head"><span class="plan-source">${escapeHTML(FORMAT_SOURCE[format.source] || 'Format')}</span><h2>${escapeHTML(format.summary)}</h2>${label ? `<p class="plan-ref">${label}</p>` : ''}<p>${escapeHTML(format.hookFormula)}</p>${beatBar(format)}</div>
    <div class="plan-cols">
      <div><h3>Recommended workflow · ${blocks.length} blocks</h3><ol class="plan-blocks">${blocks.map(block => `<li><span class="plan-icon" style="background:${META[block.type].accent}">${META[block.type].icon}</span><span><strong>${META[block.type].label}</strong><small>${escapeHTML(block.why)}</small></span></li>`).join('')}</ol></div>
      <div><h3>Shot list · what to record</h3>${shots.map(group => `<div class="plan-shot"><strong>${escapeHTML(group.title)}</strong><small>${escapeHTML(group.note)}</small><ul>${group.items.map(item => `<li>${escapeHTML(item)}</li>`).join('')}</ul></div>`).join('')}</div>
    </div>
    <div class="plan-actions"><button class="button primary big" id="openCanvasBtn">Open in canvas →</button><span>Blocks come pre-wired; the shot list stays in the sidebar.</span></div>`;
  card.hidden = false;
  $('#openCanvasBtn').onclick = openCanvas;
  card.scrollIntoView({behavior:'smooth', block:'start'});
}
function openCanvas() {
  if (!isBlank() && !confirm('Replace your current canvas with this plan?')) return;
  state = projectFromPlan(plan); state.shotList = plan.shots;
  const script = nodeById('script'); Object.assign(script, plan.script); script.basedOn = scriptKey(script);
  $('#projectName').value = state.name; save();
  location.hash = '#/studio'; toast('Canvas built from your plan. Record the shot list next.');
}
// On a phone the short beats lose their labels, so a color legend sits under the strip.
function renderLandingBeats() {
  const format = KNOWN_FORMATS.nAZD57mN78I, kinds = [...new Set(format.beats.map(beat => beat.kind))];
  $('#landingBeats').innerHTML = beatSegments(format, matchMedia('(max-width: 600px)').matches ? .12 : 0);
  $('#landingBeats').insertAdjacentHTML('afterend', `<ul class="beat-legend">${kinds.map(kind => `<li><i style="background:${BEAT_COLOR[kind]}"></i>${BEAT_NAME[kind]}</li>`).join('')}</ul>`);
}
// ---------- Library of proven Shorts ----------
// dist/library.json is written by scan-library.mjs: public YouTube stats plus Gemini's format and notes per Short.
let libraryRequest, libraryDomain = 'All', watching = '';
const loadLibrary = () => libraryRequest ??= fetch('library.json').then(response => response.ok ? response.json() : {shorts:[]}).catch(() => ({shorts:[]}));
const compact = value => value == null ? '—' : new Intl.NumberFormat('en', {notation:'compact', maximumFractionDigits:1}).format(value);
const clock = seconds => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
const likeRate = short => short.likes && short.views ? `${(short.likes / short.views * 100).toFixed(1)}%` : '—';
const posted = short => new Date(short.publishedAt).toLocaleDateString('en', {month:'short', year:'numeric'});
const perSubscriber = short => short.subscribers ? short.views / short.subscribers : 0;
const libraryShort = async id => (await loadLibrary()).shorts.find(short => short.videoId === id);
// The hand-timed Canva format is more exact than a scan, so the card shows what Start will use.
const libraryFormat = short => KNOWN_FORMATS[short.videoId] ? {...KNOWN_FORMATS[short.videoId], source:'annotated'} : short.format;
const breakout = short => { const ratio = perSubscriber(short); return ratio >= 1.5 ? `${+ratio.toFixed(ratio < 10 ? 1 : 0)}×` : ''; };
function performanceStats(short) {
  const ratio = perSubscriber(short), stats = [['Views', compact(short.views)], ['Likes', compact(short.likes)], ['Like rate', likeRate(short)], ['Comments', compact(short.comments)], ['Breakout', ratio ? `${+ratio.toFixed(ratio < 10 ? 1 : 0)}×` : '—'], ['Length', clock(short.seconds)]];
  return `<h4>Performance</h4><dl class="perf" title="Breakout is views divided by the channel’s subscribers">${stats.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
}
const BEAT_NAME = {hook:'Hook', proof:'Proof', step:'Step', turn:'Turn', payoff:'Result', cta:'CTA'};
// Beats too short to hold a label keep their color and a tooltip.
function beatSegments(format, minShare = .08) {
  const total = format.beats.reduce((sum, beat) => sum + beat.seconds, 0);
  return format.beats.map(beat => `<div style="flex:${beat.seconds};background:${BEAT_COLOR[beat.kind]}" title="${BEAT_NAME[beat.kind]} · ${beat.seconds}s${beat.caption ? ` · ${escapeHTML(beat.caption)}` : ''}">${beat.seconds / total >= minShare ? `<strong>${BEAT_NAME[beat.kind]}</strong><span>${beat.seconds}s</span>` : ''}</div>`).join('');
}
const productType = short => short.productType.toLowerCase() === short.domain.toLowerCase() ? '' : short.productType[0].toUpperCase() + short.productType.slice(1);
// The library plays like a Shorts feed: one Short per screen, snap scrolling, only the visible one loads its player.
const ICON = {
  heart:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
  eye:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  muted:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l4 6M21 9l-4 6"/></svg>',
  sound:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 8.5a5 5 0 0 1 0 7M19.5 6a8.5 8.5 0 0 1 0 12"/></svg>',
  info:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>'
};
let reelObserver, activeReel = -1, reelMuted = true;
const reels = () => [...document.querySelectorAll('.feed-short')];
function reelDetails(short) {
  const format = libraryFormat(short);
  return `<p class="lib-tags"><span class="lib-domain">${escapeHTML(short.domain)}</span><span>${escapeHTML(productType(short))}</span></p>
    <h3>${escapeHTML(short.product)}</h3>
    <p class="detail-summary">${escapeHTML(short.summary)}</p>
    ${performanceStats(short)}
    <h4>Fits</h4><p>${escapeHTML(short.bestFor)}</p>
    ${short.requires?.length ? `<h4>You’ll need</h4><ul class="needs">${short.requires.map(item => `<li>${escapeHTML(item[0].toUpperCase() + item.slice(1))}</li>`).join('')}</ul>` : ''}
    <h4>Format · ${format.beats.length} beats</h4><ol class="detail-beats">${format.beats.map(beat => `<li><span style="background:${BEAT_COLOR[beat.kind]}">${BEAT_NAME[beat.kind]}</span><em>${beat.seconds}s</em><b>${escapeHTML(beat.caption || beat.note || '')}</b></li>`).join('')}</ol>
    <h4>Why it works</h4><ul class="detail-list">${short.whyItWorks.map(item => `<li>${escapeHTML(item)}</li>`).join('')}</ul>
    <h4>Prepare</h4><ul class="detail-list">${short.needs.map(item => `<li>${escapeHTML(item)}</li>`).join('')}</ul>
    <button class="button primary big" type="button" data-use="${escapeHTML(short.videoId)}">Use this format</button>`;
}
async function renderLibrary() {
  const {shorts, scannedAt, model} = await loadLibrary(), feed = $('#reelFeed');
  stopReels();
  if (!shorts.length) { feed.innerHTML = '<p class="library-empty">The library is empty. Run <code>node scan-library.mjs</code> to scan it.</p>'; return; }
  const domains = ['All', ...new Set(shorts.map(short => short.domain))];
  $('#domainChips').innerHTML = domains.map(domain => `<button type="button" aria-pressed="${domain === libraryDomain}" data-domain="${escapeHTML(domain)}">${escapeHTML(domain)}</button>`).join('');
  const list = shorts.filter(short => libraryDomain === 'All' || short.domain === libraryDomain).sort((a, b) => b.views - a.views);
  const note = `Public YouTube counts from ${new Date(scannedAt).toLocaleDateString('en', {day:'numeric', month:'short', year:'numeric'})}. Format and notes by ${model}. PromoFlow reuses the format, never the footage.`;
  feed.innerHTML = list.map((short, index) => {
    const format = libraryFormat(short);
    return `<section class="feed-short" data-id="${escapeHTML(short.videoId)}" aria-label="${escapeHTML(short.product)}, ${index + 1} of ${list.length}">
      <div class="reel-stage">
        <img class="reel-cover" src="${escapeHTML(short.thumbnail)}" alt="">
        <div class="reel-player"></div>
        <button class="reel-tap" type="button" aria-label="Pause"></button>
        <span class="reel-paused" aria-hidden="true">▶</span>
        <div class="reel-meta">
          <p class="lib-tags"><span class="lib-domain">${escapeHTML(short.domain)}</span><span>${escapeHTML(productType(short))}</span></p>
          <h2>${escapeHTML(short.product)}</h2>
          <p class="reel-stats">${breakout(short) ? `<span class="breakout" title="Views divided by the channel’s subscribers">${breakout(short)} breakout</span>` : ''}<span>${likeRate(short)} liked</span><span>${compact(short.comments)} comments</span></p>
          <p class="reel-channel">${escapeHTML(short.channel)} · ${compact(short.subscribers)} subscribers · ${posted(short)}</p>
          <p class="reel-format">${escapeHTML(format.summary)}</p>
          ${beatBar(format)}
          <button class="button primary reel-use" type="button" data-use="${escapeHTML(short.videoId)}">Use this format</button>
        </div>
        <div class="reel-rail">
          <span>${ICON.heart}<b>${compact(short.likes)}</b></span>
          <span>${ICON.eye}<b>${compact(short.views)}</b></span>
          <button class="reel-mute" type="button" aria-label="Sound off" aria-pressed="false">${ICON.muted}<b>Sound</b></button>
          <button class="reel-info" type="button" data-info="${escapeHTML(short.videoId)}" aria-label="Details">${ICON.info}<b>Details</b></button>
        </div>
      </div>
      <aside class="reel-panel">${reelDetails(short)}<p class="detail-note">${escapeHTML(note)}</p></aside>
    </section>`;
  }).join('');
  feed.scrollTop = 0; syncMute();
  reelObserver?.disconnect();
  reelObserver = new IntersectionObserver(entries => { for (const entry of entries) if (entry.isIntersecting) activateReel(reels().indexOf(entry.target)); }, {root:feed, threshold:.6});
  reels().forEach(reel => reelObserver.observe(reel));
}
function activateReel(index) {
  const list = reels(), reel = list[index];
  if (!reel || (index === activeReel && reel.querySelector('iframe'))) return;
  list.forEach((other, i) => { if (i !== index) { other.querySelector('.reel-player').innerHTML = ''; other.classList.remove('paused', 'loaded'); } });
  activeReel = index;
  const id = encodeURIComponent(reel.dataset.id), player = reel.querySelector('.reel-player');
  player.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=${reelMuted ? 1 : 0}&controls=0&loop=1&playlist=${id}&playsinline=1&rel=0&modestbranding=1&iv_load_policy=3&enablejsapi=1" title="${escapeHTML(reel.getAttribute('aria-label'))}" allow="autoplay; encrypted-media; picture-in-picture" tabindex="-1"></iframe>`;
  player.querySelector('iframe').onload = () => reel.classList.add('loaded');
  $('#reelPrev').disabled = index === 0; $('#reelNext').disabled = index === list.length - 1;
}
function stopReels() { reelObserver?.disconnect(); reels().forEach(reel => { reel.querySelector('.reel-player').innerHTML = ''; }); activeReel = -1; }
// The embed takes commands over postMessage when enablejsapi=1.
function reelCommand(func) { reels()[activeReel]?.querySelector('iframe')?.contentWindow?.postMessage(JSON.stringify({event:'command', func, args:[]}), '*'); }
function togglePause() {
  const reel = reels()[activeReel]; if (!reel) return;
  const paused = reel.classList.toggle('paused');
  reelCommand(paused ? 'pauseVideo' : 'playVideo');
  reel.querySelector('.reel-tap').setAttribute('aria-label', paused ? 'Play' : 'Pause');
}
function syncMute() { document.querySelectorAll('.reel-mute').forEach(button => { button.setAttribute('aria-pressed', String(!reelMuted)); button.setAttribute('aria-label', reelMuted ? 'Sound off' : 'Sound on'); button.innerHTML = `${reelMuted ? ICON.muted : ICON.sound}<b>Sound</b>`; }); }
function toggleMute() { reelMuted = !reelMuted; reelCommand(reelMuted ? 'mute' : 'unMute'); syncMute(); }
function stepReel(delta) { reels()[clamp(activeReel + delta, 0, reels().length - 1)]?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'}); }
async function openSheet(id) { const short = await libraryShort(id); if (!short) return; $('#sheetBody').innerHTML = reelDetails(short); $('#reelSheet').hidden = false; $('#closeSheet').focus(); }
function closeSheet() { $('#reelSheet').hidden = true; }
async function useLibraryShort(id) {
  const short = await libraryShort(id);
  if (!short) return;
  closeVideo(); closeSheet();
  location.hash = '#/start'; setStartMode('url'); $('#startUrl').value = short.url; renderPicked();
  toast(`Using ${short.product}’s format. Now add your app.`);
  setTimeout(() => $('#startName').focus({preventScroll:true}), 80);
}
async function openVideo(id) {
  const short = await libraryShort(id);
  if (!short) return;
  watching = id;
  $('#videoTitle').textContent = short.product;
  $('#videoMeta').textContent = `${short.channel} · ${compact(short.views)} views`;
  $('#videoYoutube').href = short.url;
  $('#videoFrame').innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&playsinline=1" title="${escapeHTML(short.title)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
  $('#videoModal').hidden = false; $('#closeVideo').focus();
}
function closeVideo() { if ($('#videoModal').hidden) return; $('#videoModal').hidden = true; $('#videoFrame').innerHTML = ''; watching = ''; }
// Start page: the library as quick picks, and a preview of the picked Short so the choice stays visible.
async function renderPicks() {
  const {shorts} = await loadLibrary(), id = youtubeId($('#startUrl').value);
  $('#provenPicks').hidden = !shorts.length;
  $('#pickRow').innerHTML = shorts.map(short => `<button type="button" class="pick" data-pick="${escapeHTML(short.videoId)}" aria-pressed="${short.videoId === id}"><img src="${escapeHTML(short.thumbnail)}" alt=""><span><strong>${escapeHTML(short.product)}</strong><small>${escapeHTML(short.domain)}</small></span></button>`).join('');
}
async function renderPicked() {
  const short = await libraryShort(youtubeId($('#startUrl').value)), box = $('#startPicked');
  box.hidden = !short; $('#formatChooser').hidden = !!short; $('#appTitle').hidden = !short;
  $('#appKicker').textContent = short ? 'Step 2 of 3 · Your app' : 'Step 2 · Your app';
  if (short) {
    setStartMode('url');
    const format = libraryFormat(short);
    box.innerHTML = `<button class="picked-thumb" type="button" data-watch="${escapeHTML(short.videoId)}" aria-label="Watch ${escapeHTML(short.product)}’s Short"><img src="${escapeHTML(short.thumbnail)}" alt=""><span aria-hidden="true">▶</span></button>
      <div class="picked-info">
        <p class="panel-kicker">Step 1 of 3 · Your format</p>
        <strong>${escapeHTML(short.product)}’s format</strong>
        <p class="lib-tags"><span class="lib-domain">${escapeHTML(short.domain)}</span><span>${compact(short.views)} views${breakout(short) ? ` · ${breakout(short)} breakout` : ''} · ${clock(short.seconds)}</span></p>
        <p>${escapeHTML(format.summary)}</p>${beatBar(format)}
        <div class="picked-actions"><a class="link-button" href="#/library">Change</a><button class="link-button" type="button" id="ownInstead">Paste your own Short instead</button></div>
      </div>`;
    $('#ownInstead').onclick = () => { $('#startUrl').value = ''; renderPicked(); $('#startUrl').focus(); };
  }
  renderPicks();
}
$('#domainChips').addEventListener('click', event => { const button = event.target.closest('[data-domain]'); if (button && button.dataset.domain !== libraryDomain) { libraryDomain = button.dataset.domain; renderLibrary(); } });
$('#reelFeed').addEventListener('click', event => {
  if (event.target.closest('.reel-tap')) togglePause();
  else if (event.target.closest('.reel-mute')) toggleMute();
  else if (event.target.closest('[data-info]')) openSheet(event.target.closest('[data-info]').dataset.info);
});
$('#reelPrev').onclick = () => stepReel(-1); $('#reelNext').onclick = () => stepReel(1);
$('#closeSheet').onclick = closeSheet;
$('#reelSheet').addEventListener('click', event => { if (event.target.id === 'reelSheet') closeSheet(); });
document.addEventListener('keydown', event => {
  if (document.body.dataset.view !== 'library' || event.target.closest('input, textarea, select') || !$('#reelSheet').hidden) return;
  const action = {ArrowDown:() => stepReel(1), j:() => stepReel(1), ArrowUp:() => stepReel(-1), k:() => stepReel(-1), m:toggleMute, ' ':togglePause}[event.key];
  if (action && !(event.key === ' ' && event.target.closest('button'))) { event.preventDefault(); action(); }
});
document.addEventListener('click', event => {
  const use = event.target.closest('[data-use]'), watch = event.target.closest('[data-watch]'), pick = event.target.closest('[data-pick]');
  if (use) useLibraryShort(use.dataset.use);
  else if (watch) openVideo(watch.dataset.watch);
  else if (pick) { $('#startUrl').value = `https://www.youtube.com/shorts/${pick.dataset.pick}`; renderPicked(); }
});
$('#startUrl').addEventListener('input', renderPicked);
$('#ownShort').onclick = () => { $('#startUrl').value = ''; };
$('#closeVideo').onclick = closeVideo; $('#videoUse').onclick = () => useLibraryShort(watching);
$('#videoModal').addEventListener('click', event => { if (event.target.id === 'videoModal') closeVideo(); });
document.querySelectorAll('[data-start-mode]').forEach(button => button.onclick = () => setStartMode(button.dataset.startMode));
document.querySelectorAll('[data-prompt]').forEach(button => button.onclick = () => { $('#startPrompt').value = button.dataset.prompt; });
$('#analyzeBtn').onclick = analyze;
function syncApiConfigUI() {
  const mockOn = isMockMode();
  const key = getShopApiKey();
  const hasKey = key.length > 0;

  const mockToggle = $('#mockModeToggle');
  if (mockToggle) mockToggle.checked = mockOn;

  const toggleStateText = $('#mockToggleStateText');
  if (toggleStateText) {
    toggleStateText.textContent = mockOn ? 'Mock mode: ON' : 'Mock mode: OFF (Live AI)';
    toggleStateText.classList.toggle('live', !mockOn);
  }

  const mockDesc = $('#mockModeDesc');
  if (mockDesc) {
    if (mockOn) {
      mockDesc.innerHTML = '<strong>Mock Mode is ON:</strong> Uses built-in format presets &amp; demo outputs (free offline mode, zero API costs).';
    } else if (hasKey) {
      mockDesc.innerHTML = '<strong>Live AI Mode active:</strong> Connected to ShopAIKey (<code>https://api.shopaikey.com</code>). Ready to analyze real YouTube Shorts with Gemini.';
    } else {
      mockDesc.innerHTML = '<strong>Live AI Mode enabled:</strong> Please paste and save your ShopAIKey API key below to process live videos.';
    }
  }

  const dot = $('#apiStatusDot');
  if (dot) {
    dot.className = 'status-indicator-dot';
    if (!mockOn) dot.classList.add(hasKey ? 'live' : 'warn');
  }

  const card = $('#apiConfigCard');
  if (card) card.classList.toggle('live-active', !mockOn && hasKey);

  const keyInput = $('#shopApiKeyInput');
  if (keyInput && document.activeElement !== keyInput) keyInput.value = key;

  const statusMsg = $('#apiKeyStatusMsg');
  if (statusMsg) {
    if (hasKey) {
      const masked = key.length > 8 ? `${key.slice(0, 4)}••••${key.slice(-4)}` : '••••••••';
      statusMsg.innerHTML = `<span class="api-key-status-msg success">✓ Key saved (${escapeHTML(masked)}). Active for live requests.</span>`;
    } else {
      statusMsg.innerHTML = '<span class="api-key-status-msg">Key is stored in your browser and used when Mock Mode is OFF.</span>';
    }
  }

  const studioToggle = $('#studioMockToggle');
  if (studioToggle) studioToggle.checked = mockOn;

  const studioTitle = $('#studioMockTitle');
  if (studioTitle) studioTitle.textContent = mockOn ? 'MOCK MODE' : 'LIVE AI MODE';

  const studioDesc = $('#studioMockDesc');
  if (studioDesc) {
    if (mockOn) {
      studioDesc.textContent = 'Mock mode is ON: Format extractor and other blocks use built-in presets and demo outputs.';
    } else if (hasKey) {
      studioDesc.textContent = 'Live mode is ON: The Format extractor connects to ShopAIKey with Gemini.';
    } else {
      studioDesc.textContent = 'Live mode is ON, but no key is saved. Please enter your key on the home page.';
    }
  }

  const geminiStatus = $('#geminiStatus');
  if (geminiStatus) {
    if (mockOn) {
      geminiStatus.textContent = 'Mock mode: using presets (offline).';
    } else if (hasKey) {
      geminiStatus.textContent = 'ShopAIKey connected — watching real Shorts.';
    } else if (geminiReady) {
      geminiStatus.textContent = 'Server Gemini connected.';
    } else {
      geminiStatus.textContent = 'ShopAIKey missing — add key on home page.';
    }
  }
}

$('#mockModeToggle')?.addEventListener('change', event => {
  setMockMode(event.target.checked);
  toast(event.target.checked ? 'Mock mode enabled — using built-in presets' : (hasShopApiKey() ? 'Live mode enabled — using ShopAIKey' : 'Live mode enabled — please enter your ShopAIKey'));
});

$('#studioMockToggle')?.addEventListener('change', event => {
  setMockMode(event.target.checked);
  toast(event.target.checked ? 'Mock mode enabled' : (hasShopApiKey() ? 'Live mode enabled' : 'Please enter ShopAIKey on home page'));
});

$('#saveApiKeyBtn')?.addEventListener('click', () => {
  const val = ($('#shopApiKeyInput')?.value || '').trim();
  setShopApiKey(val);
  toast(val ? 'ShopAIKey saved!' : 'ShopAIKey cleared');
});

$('#shopApiKeyInput')?.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    const val = (event.target.value || '').trim();
    setShopApiKey(val);
    toast(val ? 'ShopAIKey saved!' : 'ShopAIKey cleared');
  }
});

$('#toggleKeyVisibility')?.addEventListener('click', () => {
  const input = $('#shopApiKeyInput');
  if (input) {
    input.type = input.type === 'password' ? 'text' : 'password';
    $('#toggleKeyVisibility').textContent = input.type === 'password' ? '👁' : '🔒';
  }
});

window.addEventListener('hashchange', route);
renderLandingBeats(); route();
renderCanvas(); renderInspector();
fetch('/api/health').then(response => response.json()).then(health => {
  geminiReady = !!health.geminiConfigured;
  syncApiConfigUI();
  renderCanvas();
}).catch(() => {
  syncApiConfigUI();
});
hydrateMedia().catch(error => { console.error(error); toast('Saved media is unavailable in this browser'); });
syncApiConfigUI();
