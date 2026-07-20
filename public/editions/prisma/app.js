/* PRISMA — the morning, refracted.
   Same content contract as the playground newsroom.
   Hero: a glass prism takes one white beam and fans it into six
   wavelengths — beam widths follow this morning's story counts. */

import * as THREE from './vendor/three.module.min.js';
import {
  activePodcastChapter,
  clampPodcastSeek,
  formatPlayerTime,
  formatPodcastDuration,
  podcastAssetPath,
  podcastProgress,
  podcastShareUrl,
  podcastTopicArtwork,
  requestedPodcastChapter,
} from './podcast.js?v=20260720-podcast-art';

const SECTIONS = [
  { id: 'ai', name: 'AI', label: 'AI', headline: 'AI', hue: 'ai',
    deck: 'Useful AI and automation updates without hype or long summaries.' },
  { id: 'energy', name: 'Energy / Utilities', label: 'Energy', headline: 'Energy & Utilities', hue: 'energy',
    deck: 'PPL, LG&E/KU, Kentucky utility news, data-center power demand, grid issues, rates, regulation, and market signals.' },
  { id: 'humana', name: 'Humana / Health Insurance', label: 'Humana', headline: 'Humana & Health', hue: 'humana',
    deck: 'Humana-first health-insurance scan with broader US payer stories only when no current Humana item qualifies.' },
  { id: 'kentucky_healthcare', name: 'Kentucky Healthcare', label: 'Ky. Health', headline: 'Kentucky Healthcare', hue: 'kyh',
    deck: 'Kentucky healthcare, Louisville providers, hospitals, Medicaid, access, workforce, and US healthcare backup only when needed.' },
  { id: 'analytics', name: 'Analytics', label: 'Analytics', headline: 'Analytics', hue: 'analytics',
    deck: 'Business analytics, BI, dashboards, data quality, governance, warehouses, lakehouses, and data-platform signals.' },
  { id: 'louisville', name: 'Louisville, Kentucky', label: 'Louisville', headline: 'Louisville', hue: 'louisville',
    deck: 'Louisville and Jefferson County signals across business, healthcare, infrastructure, utilities, policy, and local economy.' },
];

/* Beam colors must match the CSS --*-mid tokens (sRGB approximations). */
const BEAM_RGB = {
  ai: 0x8b5fd6, energy: 0xd9a13c, humana: 0x4caf7d,
  kyh: 0x3fa8bf, analytics: 0x5487d8, louisville: 0xd8574a,
};

const LEARN_BASE = './learn/?id=';
const DATA_PATHS = [
  `../../data/morning-briefs.json?ts=${Date.now()}`,
  `https://dustincole-data.github.io/dustin-ai-playground/data/morning-briefs.json?ts=${Date.now()}`,
];
const PODCAST_PATHS = [
  `../../data/daily-podcast.json?ts=${Date.now()}`,
  `https://dustincole-data.github.io/dustin-ai-playground/data/daily-podcast.json?ts=${Date.now()}`,
];

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let counts = SECTIONS.map(() => 0);

(function setMastDate() {
  document.getElementById('mastDate').textContent = new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York',
  }).format(new Date());
})();

async function loadData() {
  for (const url of DATA_PATHS) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      return await res.json();
    } catch { /* try next */ }
  }
  return null;
}

async function loadPodcast() {
  for (const url of PODCAST_PATHS) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      return await res.json();
    } catch { /* try next */ }
  }
  return null;
}

function initPodcastPlayer(audio, podcast) {
  const player = document.getElementById('podcastPlayer');
  const nowPlaying = document.getElementById('podcastNow');
  const artwork = document.getElementById('podcastArtwork');
  const topicTitle = document.getElementById('podcastTopicTitle');
  const topicMeta = document.getElementById('podcastTopicMeta');
  const share = document.getElementById('podcastShare');
  const chapterWrap = document.getElementById('podcastChapters');
  const chapterButtons = document.getElementById('podcastChapterButtons');
  const play = document.getElementById('podcastPlay');
  const back = document.getElementById('podcastBack');
  const forward = document.getElementById('podcastForward');
  const timeline = document.getElementById('podcastTimeline');
  const elapsed = document.getElementById('podcastElapsed');
  const duration = document.getElementById('podcastDuration');
  const speed = document.getElementById('podcastSpeed');
  const mute = document.getElementById('podcastMute');
  const volume = document.getElementById('podcastVolume');
  const status = document.getElementById('podcastStatus');
  if (![player, nowPlaying, artwork, topicTitle, topicMeta, share, chapterWrap, chapterButtons, play, back, forward, timeline, elapsed, duration, speed, mute, volume, status].every(Boolean)) return;

  const chapters = [...(podcast.chapters || [])]
    .filter((chapter) => chapter?.id && chapter?.title && Number.isFinite(Number(chapter.startSeconds)))
    .sort((a, b) => Number(a.startSeconds) - Number(b.startSeconds));
  const requestedId = requestedPodcastChapter(window.location.search);
  const requestedChapter = chapters.find((chapter) => chapter.id === requestedId) || null;
  let displayedChapter = null;
  const positionKey = `prisma-podcast-position:${audio.currentSrc || audio.src}`;
  const speedKey = 'prisma-podcast-speed';
  let lastSavedSecond = -1;

  const readStorage = (key) => {
    try { return localStorage.getItem(key); } catch { return null; }
  };
  const writeStorage = (key, value) => {
    try { localStorage.setItem(key, value); } catch { /* storage is optional */ }
  };
  const removeStorage = (key) => {
    try { localStorage.removeItem(key); } catch { /* storage is optional */ }
  };
  const playableDuration = () => Number.isFinite(audio.duration) ? audio.duration : Number(podcast.durationSeconds) || 0;
  const announce = (message) => { status.textContent = message; };

  const sectionFor = (chapter) => SECTIONS.find((section) => section.id === chapter?.id) || null;
  const chapterEnd = (chapter) => {
    const index = chapters.findIndex((item) => item.id === chapter.id);
    return Number(chapters[index + 1]?.startSeconds) || playableDuration();
  };

  function updateMediaMetadata(chapter) {
    if (!chapter || !('mediaSession' in navigator) || !('MediaMetadata' in window)) return;
    const artPath = podcastTopicArtwork(chapter.id);
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: chapter.title,
        artist: 'Prisma · Dustin Cole’s personal newsroom',
        album: 'Daily spoken edition',
        artwork: artPath ? [{ src: new URL(artPath, window.location.href).href, sizes: '640x640', type: 'image/webp' }] : [],
      });
    } catch { /* optional browser integration */ }
  }

  function displayChapter(chapter) {
    if (!chapter || displayedChapter?.id === chapter.id) return;
    const section = sectionFor(chapter);
    const artPath = podcastTopicArtwork(chapter.id);
    displayedChapter = chapter;
    player.dataset.topic = chapter.id;
    if (section) {
      player.style.setProperty('--podcast-accent', `var(--${section.hue}-deep)`);
      player.style.setProperty('--podcast-mid', `var(--${section.hue}-mid)`);
      player.style.setProperty('--podcast-wash', `var(--${section.hue}-wash)`);
    }
    if (artPath) {
      artwork.src = artPath;
      artwork.alt = `${chapter.title} podcast artwork`;
    }
    topicTitle.textContent = chapter.title;
    share.setAttribute('aria-label', `Share ${chapter.title}`);
    const topicSeconds = Math.max(1, chapterEnd(chapter) - Number(chapter.startSeconds));
    topicMeta.textContent = `${formatPlayerTime(chapter.startSeconds)} · ${formatPodcastDuration(topicSeconds)}`;
    chapterButtons.querySelectorAll('button').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.topic === chapter.id));
    });
    updateMediaMetadata(chapter);
  }

  if (chapters.length) {
    chapters.forEach((chapter) => {
      const section = sectionFor(chapter);
      const button = document.createElement('button');
      const swatch = document.createElement('span');
      const label = document.createElement('span');
      const time = document.createElement('span');
      button.type = 'button';
      button.className = `podcast-chapter-button chapter-${section?.hue || 'ai'}`;
      button.dataset.topic = chapter.id;
      button.setAttribute('aria-label', `Play ${chapter.title} from ${formatPlayerTime(chapter.startSeconds)}`);
      button.setAttribute('aria-pressed', 'false');
      swatch.className = 'podcast-chapter-swatch';
      swatch.setAttribute('aria-hidden', 'true');
      label.className = 'podcast-chapter-label';
      label.textContent = chapter.title;
      time.className = 'podcast-chapter-time';
      time.textContent = formatPlayerTime(chapter.startSeconds);
      button.append(swatch, label, time);
      button.addEventListener('click', () => playChapter(chapter));
      chapterButtons.append(button);
    });
    chapterWrap.hidden = false;
    nowPlaying.hidden = false;
    displayChapter(requestedChapter || chapters[0]);
  }

  function syncChapter() {
    if (!chapters.length) return;
    displayChapter(activePodcastChapter(chapters, audio.currentTime) || requestedChapter || chapters[0]);
  }

  function syncTimeline() {
    const end = playableDuration();
    const progress = podcastProgress(audio.currentTime, end);
    timeline.value = String(progress);
    timeline.style.setProperty('--progress', `${progress}%`);
    elapsed.textContent = formatPlayerTime(audio.currentTime);
    duration.textContent = formatPlayerTime(end);
    timeline.setAttribute('aria-valuetext', `${formatPlayerTime(audio.currentTime)} of ${formatPlayerTime(end)}`);
    syncChapter();
  }

  function syncPlayState() {
    const isPlaying = !audio.paused && !audio.ended;
    player.classList.toggle('is-playing', isPlaying);
    play.setAttribute('aria-label', isPlaying ? 'Pause briefing' : 'Play briefing');
    play.setAttribute('aria-pressed', String(isPlaying));
    try {
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    } catch { /* optional browser integration */ }
  }

  function syncVolumeState() {
    const isMuted = audio.muted || audio.volume === 0;
    player.classList.toggle('is-muted', isMuted);
    mute.setAttribute('aria-label', isMuted ? 'Unmute briefing' : 'Mute briefing');
    mute.setAttribute('aria-pressed', String(isMuted));
    volume.value = String(audio.muted ? 0 : audio.volume);
  }

  function seekBy(seconds) {
    audio.currentTime = clampPodcastSeek(audio.currentTime, seconds, playableDuration());
    syncTimeline();
    announce(seconds < 0 ? 'Went back 10 seconds' : 'Went forward 10 seconds');
  }

  async function togglePlayback() {
    if (audio.paused || audio.ended) {
      try { await audio.play(); } catch { announce('Playback could not start'); }
    } else {
      audio.pause();
    }
  }

  async function playChapter(chapter) {
    audio.currentTime = clampPodcastSeek(0, Number(chapter.startSeconds), playableDuration());
    displayChapter(chapter);
    syncTimeline();
    announce(`Playing ${chapter.title}`);
    try { await audio.play(); } catch { announce(`${chapter.title} is ready. Press play to listen.`); }
  }

  async function shareChapter() {
    const chapter = displayedChapter || chapters[0];
    if (!chapter) return;
    const url = podcastShareUrl(chapter.id, window.location.href);
    const data = {
      title: `${chapter.title} · Prisma spoken briefing`,
      text: `Listen to the ${chapter.title} section in today’s Prisma briefing.`,
      url,
    };
    try {
      if (navigator.share) {
        await navigator.share(data);
        announce(`Shared ${chapter.title}`);
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const field = document.createElement('textarea');
        field.value = url;
        field.setAttribute('readonly', '');
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.append(field);
        field.select();
        document.execCommand('copy');
        field.remove();
      }
      announce(`${chapter.title} link copied`);
    } catch (error) {
      if (error?.name !== 'AbortError') announce('Could not share this topic');
    }
  }

  share.addEventListener('click', shareChapter);
  play.addEventListener('click', togglePlayback);
  back.addEventListener('click', () => seekBy(-10));
  forward.addEventListener('click', () => seekBy(10));
  timeline.addEventListener('input', () => {
    audio.currentTime = (Number(timeline.value) / 100) * playableDuration();
    syncTimeline();
  });
  speed.addEventListener('change', () => {
    audio.playbackRate = Number(speed.value);
    writeStorage(speedKey, speed.value);
    announce(`Playback speed ${speed.options[speed.selectedIndex].text}`);
  });
  mute.addEventListener('click', () => { audio.muted = !audio.muted; syncVolumeState(); });
  volume.addEventListener('input', () => {
    audio.volume = Number(volume.value);
    audio.muted = audio.volume === 0;
    syncVolumeState();
  });
  audio.addEventListener('play', syncPlayState);
  audio.addEventListener('pause', syncPlayState);
  audio.addEventListener('volumechange', syncVolumeState);
  audio.addEventListener('loadedmetadata', () => {
    if (requestedChapter) {
      audio.currentTime = clampPodcastSeek(0, Number(requestedChapter.startSeconds), audio.duration);
      displayChapter(requestedChapter);
    } else {
      const savedPosition = Number(readStorage(positionKey));
      if (savedPosition > 0 && savedPosition < audio.duration - 15) audio.currentTime = savedPosition;
    }
    syncTimeline();
  });
  audio.addEventListener('timeupdate', () => {
    syncTimeline();
    const currentSecond = Math.floor(audio.currentTime);
    if (currentSecond !== lastSavedSecond && currentSecond % 5 === 0) {
      lastSavedSecond = currentSecond;
      writeStorage(positionKey, String(audio.currentTime));
    }
    if ('mediaSession' in navigator && Number.isFinite(audio.duration) && audio.duration > 0) {
      try { navigator.mediaSession.setPositionState({ duration: audio.duration, playbackRate: audio.playbackRate, position: Math.min(audio.currentTime, audio.duration) }); } catch { /* optional browser integration */ }
    }
  });
  audio.addEventListener('ended', () => { removeStorage(positionKey); syncPlayState(); syncTimeline(); });
  addEventListener('pagehide', () => {
    if (audio.currentTime > 0 && !audio.ended) writeStorage(positionKey, String(audio.currentTime));
  });

  const savedSpeed = Number(readStorage(speedKey));
  if ([0.75, 1, 1.25, 1.5, 2].includes(savedSpeed)) {
    speed.value = String(savedSpeed);
    audio.playbackRate = savedSpeed;
  }

  if ('mediaSession' in navigator && 'MediaMetadata' in window) {
    try {
      const handlers = {
        play: () => audio.play(),
        pause: () => audio.pause(),
        seekbackward: () => seekBy(-10),
        seekforward: () => seekBy(10),
        seekto: (details) => { if (Number.isFinite(details.seekTime)) audio.currentTime = details.seekTime; },
      };
      Object.entries(handlers).forEach(([action, handler]) => {
        try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* unsupported action */ }
      });
      updateMediaMetadata(displayedChapter || chapters[0]);
    } catch { /* optional browser integration */ }
  }

  audio.removeAttribute('controls');
  audio.hidden = true;
  player.hidden = false;
  syncTimeline();
  syncPlayState();
  syncVolumeState();
}

function renderPodcast(podcast) {
  if (!podcast?.audioUrl) return;
  const section = document.getElementById('dailyPodcast');
  const audio = document.getElementById('dailyPodcastAudio');
  const transcript = document.getElementById('dailyPodcastTranscript');
  const meta = document.getElementById('dailyPodcastMeta');
  if (!section || !audio || !transcript || !meta) return;

  const audioPath = podcastAssetPath(podcast.audioUrl);
  const transcriptPath = podcastAssetPath(podcast.transcriptUrl);
  audio.src = audioPath;
  meta.textContent = `${podcast.articleCount || 0} stories · ${formatPodcastDuration(podcast.durationSeconds)} · a fresh spoken rundown, not a page readout`;
  if (transcriptPath) transcript.href = transcriptPath;
  else transcript.hidden = true;
  initPodcastPlayer(audio, podcast);
  section.hidden = false;
  if (requestedPodcastChapter(window.location.search)) {
    requestAnimationFrame(() => section.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' }));
  }
}

function cleanSummary(a) {
  let s = String(a.summary || '');
  return s.replace(/\s*Source:\s*\[?[^.\]]+\]?\([^)]*\)\s*$/i, '').replace(/\s*Source:\s*[^.]+$/i, '').trim();
}

function whyLine(a) {
  const w = String(a.whyItMatters || '').trim();
  if (!w) return '';
  const sum = String(a.summary || '').toLowerCase();
  if (sum.includes(w.toLowerCase().slice(0, 60))) return '';
  return w;
}

function glossChips(a) {
  const terms = (a.glossary || []).filter((g) => g.term && g.definition);
  if (!terms.length) return '';
  const learn = (a.learningPage && a.learningPage.glossary) || [];
  return `<div class="story-gloss" aria-label="Glossary for this story">${terms.map((g) => {
    const extra = learn.find((l) => l.term === g.term && l.whyItMatters);
    return `<details class="gloss">
      <summary>${esc(g.term)}</summary>
      <div class="gloss-def" role="note">
        <p><strong>${esc(g.term)}.</strong> ${esc(g.definition)}</p>
        ${extra ? `<p class="gloss-why">${esc(extra.whyItMatters)}</p>` : ''}
      </div>
    </details>`;
  }).join('')}</div>`;
}

function storyHtml(a) {
  const why = whyLine(a);
  return `<article class="story">
    <p class="story-kick">${esc(a.kicker || 'This morning')}</p>
    <h3 class="story-head"><a href="${esc(a.sourceUrl || '#')}" target="_blank" rel="noopener">${esc(a.title)}</a></h3>
    <p class="story-sum">${esc(cleanSummary(a))}</p>
    ${why ? `<p class="story-why"><strong>Why it matters&ensp;</strong>${esc(why)}</p>` : ''}
    ${glossChips(a)}
    <p class="story-meta">
      <span>${esc(a.sourceLabel || '')}</span>
      ${a.id ? `<a class="learn" href="${LEARN_BASE}${encodeURIComponent(a.id)}">Teach me this story</a>` : ''}
    </p>
  </article>`;
}

function render(data) {
  const byId = new Map((data?.briefs || []).map((b) => [b.id, b]));
  counts = SECTIONS.map((t) => byId.get(t.id)?.articles?.length || 0);
  const total = counts.reduce((a, b) => a + b, 0);

  document.getElementById('heroCount').textContent = total ? `${total} sourced` : 'no';
  document.getElementById('mastStamp').textContent =
    data?.generatedLabel ? `updated ${data.generatedLabel}` : 'live briefs unavailable';

  /* spectrum nav */
  document.getElementById('spectrum').innerHTML = SECTIONS.map((t, i) => `
    <a class="spec-seg" href="#band-${t.id}" data-band="${t.id}"
       style="--seg-deep: var(--${t.hue}-deep); --seg-mid: var(--${t.hue}-mid); --seg-wash: var(--${t.hue}-wash);">
      <span class="spec-wave" aria-hidden="true"></span>
      <span>${esc(t.label)}</span>
      <span class="spec-count">${counts[i]} ${counts[i] === 1 ? 'story' : 'stories'}</span>
    </a>`).join('');

  /* bands */
  document.getElementById('bands').innerHTML = SECTIONS.map((t) => {
    const b = byId.get(t.id);
    const articles = b?.articles || [];
    return `<section class="band" id="band-${t.id}" aria-labelledby="bh-${t.id}"
      style="--band-deep: var(--${t.hue}-deep); --band-mid: var(--${t.hue}-mid); --band-wash: var(--${t.hue}-wash);">
      <div class="band-inner">
        <div class="band-side"><div class="band-rail">
          <span class="band-swatch" aria-hidden="true"></span>
          <h2 class="band-title" id="bh-${t.id}">${esc(t.headline)}</h2>
          <p class="band-deck">${esc(t.deck)}</p>
          <p class="band-updated">${esc(b?.updatedLabel || 'Last 24 hours')}</p>
        </div></div>
        <div class="band-flow">
          ${articles.length ? articles.map(storyHtml).join('')
            : `<p class="band-empty">${esc(b?.emptyMessage || `No qualified ${t.name} stories in the last 24 hours.`)}</p>`}
        </div>
      </div>
    </section>`;
  }).join('');

  wireGlossary();
  markActiveBand();
  choreograph();
  initPrism();
}

/* Close open glossary popovers when another opens or on outside click. */
function wireGlossary() {
  const all = () => document.querySelectorAll('details.gloss[open]');
  document.getElementById('bands').addEventListener('toggle', (e) => {
    if (e.target.matches('details.gloss') && e.target.open) {
      all().forEach((d) => { if (d !== e.target) d.open = false; });
    }
  }, true);
  document.addEventListener('click', (e) => {
    if (!e.target.closest('details.gloss')) all().forEach((d) => { d.open = false; });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') all().forEach((d) => { d.open = false; });
  });
}

function markActiveBand() {
  const segs = new Map([...document.querySelectorAll('.spec-seg')].map((s) => [s.dataset.band, s]));
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      const id = en.target.id.replace('band-', '');
      if (en.isIntersecting) {
        segs.forEach((s) => s.removeAttribute('aria-current'));
        segs.get(id)?.setAttribute('aria-current', 'true');
      }
    });
  }, { rootMargin: '-40% 0px -55% 0px' });
  document.querySelectorAll('.band').forEach((b) => io.observe(b));
}

/* ---------- motion ---------- */

function choreograph() {
  if (reducedMotion || typeof gsap === 'undefined') return;
  gsap.registerPlugin(ScrollTrigger);
  gsap.from('.mast-inner > *', { y: 14, opacity: 0, duration: 0.55, ease: 'power3.out', stagger: 0.08 });
  gsap.from('.hero-head, .hero-sub, .hero-note', { y: 22, opacity: 0, duration: 0.7, ease: 'power4.out', stagger: 0.09, delay: 0.15 });
  gsap.from('.spec-seg', { yPercent: 40, opacity: 0, duration: 0.5, ease: 'power3.out', stagger: 0.05, delay: 0.4 });
  document.querySelectorAll('.band').forEach((band) => {
    gsap.from(band.querySelectorAll('.story'), {
      y: 18, opacity: 0, duration: 0.55, ease: 'power3.out', stagger: 0.09,
      immediateRender: false,
      scrollTrigger: { trigger: band, start: 'top 78%', once: true },
    });
    const swatch = band.querySelector('.band-swatch');
    if (swatch) gsap.from(swatch, {
      scaleX: 0, transformOrigin: 'left center', duration: 0.8, ease: 'power4.out',
      immediateRender: false,
      scrollTrigger: { trigger: band, start: 'top 82%', once: true },
    });
  });
  /* failsafe: nothing may stay invisible */
  setTimeout(() => {
    document.querySelectorAll('.story, .spec-seg, .hero-head, .hero-sub, .hero-note, .band-swatch').forEach((el) => {
      if (getComputedStyle(el).opacity === '0') gsap.set(el, { clearProps: 'all' });
    });
  }, 2400);
}

/* ---------- prism (three.js) ---------- */

function initPrism() {
  const canvas = document.getElementById('prism');
  if (!canvas || canvas.dataset.live) return;
  canvas.dataset.live = '1';
  try {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    cam.position.set(0, 0.55, 9.2);
    cam.lookAt(0.6, 0, 0);

    /* — soft halo behind the prism — */
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(5.6, 5.6),
      new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { uTime: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `
          varying vec2 vUv; uniform float uTime;
          void main(){
            float d = distance(vUv, vec2(0.5));
            float glow = smoothstep(0.5, 0.05, d);
            float breathe = 0.85 + 0.15 * sin(uTime * 0.5);
            gl_FragColor = vec4(vec3(0.62, 0.60, 0.82), glow * 0.16 * breathe);
          }`,
      })
    );
    halo.position.set(0.1, 0.15, -1.2);
    scene.add(halo);

    /* — glass prism: triangular cross-section facing the camera, apex up — */
    const prismGeo = new THREE.CylinderGeometry(1.32, 1.32, 1.05, 3, 1, false);
    prismGeo.rotateY(Math.PI / 3);
    const prismMat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        varying vec3 vNormalW; varying vec3 vViewW; varying vec3 vPos;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vNormalW = normalize(mat3(modelMatrix) * normal);
          vViewW = normalize(cameraPosition - world.xyz);
          vPos = position;
          gl_Position = projectionMatrix * viewMatrix * world;
        }`,
      fragmentShader: `
        varying vec3 vNormalW; varying vec3 vViewW; varying vec3 vPos;
        uniform float uTime;
        void main() {
          float fres = pow(1.0 - abs(dot(normalize(vNormalW), normalize(vViewW))), 1.8);
          /* internal caustic streaks sweeping through the glass */
          float streak = 0.5 + 0.5 * sin(vPos.x * 4.0 - vPos.y * 7.0 + uTime * 0.8);
          float streak2 = 0.5 + 0.5 * sin(vPos.y * 11.0 + uTime * 0.45);
          vec3 glass = mix(vec3(0.90, 0.905, 0.97), vec3(0.55, 0.53, 0.80), fres);
          glass += vec3(0.05, 0.04, 0.10) * streak * streak2;
          float alpha = 0.22 + fres * 0.6 + streak * streak2 * 0.05;
          gl_FragColor = vec4(glass, alpha);
        }`,
    });
    const prism = new THREE.Mesh(prismGeo, prismMat);
    /* axis into the screen so the triangle silhouette faces the viewer */
    prism.rotation.x = Math.PI / 2;
    prism.position.set(0.1, 0.15, 0);
    scene.add(prism);

    /* edge glint */
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(prismGeo, 12),
      new THREE.LineBasicMaterial({ color: 0x7d76b8, transparent: true, opacity: 0.85 })
    );
    prism.add(edges);

    /* — light beams. uMode 0: exit beam (soft birth at glass, dissolve mid-air).
         uMode 1: entry beam (full brightness at the glass, tail fades to source). — */
    function beamPlane(len, w, colorA, colorB, opacity, mode = 0) {
      const geo = new THREE.PlaneGeometry(len, w, 1, 1);
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.NormalBlending,
        uniforms: {
          uA: { value: new THREE.Color(colorA) },
          uB: { value: new THREE.Color(colorB) },
          uOp: { value: opacity }, uTime: { value: 0 }, uMode: { value: mode },
        },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `
          varying vec2 vUv; uniform vec3 uA; uniform vec3 uB; uniform float uOp; uniform float uTime; uniform float uMode;
          void main(){
            float across = 1.0 - abs(vUv.y - 0.5) * 2.0;      /* soft edges */
            float along = uMode > 0.5
              ? (1.0 - smoothstep(0.45, 0.94, vUv.x))          /* entry: bright at glass */
              : smoothstep(0.0, 0.06, vUv.x) * (1.0 - smoothstep(0.35, 0.62, vUv.x));
            float shimmer = 0.92 + 0.08 * sin(vUv.x * 26.0 - uTime * 2.2);
            vec3 col = mix(uA, uB, vUv.x);
            gl_FragColor = vec4(col, pow(across, 1.5) * along * uOp * shimmer);
          }`,
      });
      return new THREE.Mesh(geo, mat);
    }

    /* — incoming white beam, aimed at the prism's upper-left face — */
    const inPivot = new THREE.Group();
    inPivot.position.set(-0.3, 0.5, 0);         /* entry point on the glass */
    inPivot.rotation.z = Math.PI - 0.24;        /* beam runs up-left from here */
    const inBeam = beamPlane(5.4, 0.42, 0xffffff, 0xffffff, 1.0, 1);
    inBeam.position.x = 2.55;
    inPivot.add(inBeam);
    scene.add(inPivot);

    /* — six refracted beams in spectral order, width ∝ story count — */
    const SPECTRAL_ORDER = ['louisville', 'energy', 'humana', 'kyh', 'analytics', 'ai'];
    const maxCount = Math.max(1, ...counts);
    const beams = [];
    SPECTRAL_ORDER.forEach((hue, s) => {
      const i = SECTIONS.findIndex((t) => t.hue === hue);
      const t = SECTIONS[i];
      /* red bends least (top of fan), violet most */
      const angle = -0.06 - s * 0.115;
      const w = 0.11 + (counts[i] / maxCount) * 0.24;
      const beam = beamPlane(6.6, w, BEAM_RGB[t.hue], BEAM_RGB[t.hue], 0.85);
      const pivot = new THREE.Group();
      pivot.position.set(0.5, -0.02 - s * 0.03, 0.02 + s * 0.012);  /* exit face of the glass */
      pivot.rotation.z = angle;
      beam.position.x = 3.3;
      pivot.add(beam);
      scene.add(pivot);
      beams.push({ pivot, beam, t, i, baseOp: 0.85 });
    });

    /* — dust motes in the beam — */
    const moteCount = 240;
    const motePos = new Float32Array(moteCount * 3);
    for (let i = 0; i < moteCount; i++) {
      motePos[i * 3] = -4 + Math.random() * 9;
      motePos[i * 3 + 1] = -1.8 + Math.random() * 3.6;
      motePos[i * 3 + 2] = -0.6 + Math.random() * 1.2;
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
    const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({
      color: 0xb9b4dd, size: 0.035, transparent: true, opacity: 0.6, depthWrite: false,
    }));
    scene.add(motes);

    function resize() {
      const w = canvas.clientWidth || canvas.parentElement.clientWidth;
      const h = canvas.clientHeight || 360;
      renderer.setSize(w, h, false);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
    resize();
    addEventListener('resize', resize);

    /* hover names a beam; click scrolls to its band */
    const ray = new THREE.Raycaster();
    const ptr = new THREE.Vector2();
    const caption = document.getElementById('prismCaption');
    const baseCaption = 'The spectrum is live — beam widths follow this morning’s story counts.';
    let hovered = null;
    function pick(e) {
      const r = canvas.getBoundingClientRect();
      ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ptr, cam);
      const hit = ray.intersectObjects(beams.map((b) => b.beam))[0];
      return hit ? beams.find((b) => b.beam === hit.object) : null;
    }
    canvas.addEventListener('pointermove', (e) => {
      const hit = pick(e);
      if (hit !== hovered) {
        hovered = hit;
        beams.forEach((b) => { b.beam.material.uniforms.uOp.value = hit && b !== hit ? 0.28 : b.baseOp; });
        if (hit) {
          caption.textContent = `${hit.t.name} — ${counts[hit.i]} ${counts[hit.i] === 1 ? 'story' : 'stories'} this morning. Click to read.`;
          canvas.style.cursor = 'pointer';
        } else {
          caption.textContent = baseCaption;
          canvas.style.cursor = 'default';
        }
      }
      /* gentle parallax */
      const r = canvas.getBoundingClientRect();
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
      targetTiltY = nx * 0.16; targetTiltX = ny * 0.08;
    });
    canvas.addEventListener('pointerleave', () => {
      hovered = null;
      beams.forEach((b) => { b.beam.material.uniforms.uOp.value = b.baseOp; });
      caption.textContent = baseCaption;
      targetTiltX = 0; targetTiltY = 0;
    });
    canvas.addEventListener('click', (e) => {
      const hit = pick(e);
      if (hit) document.getElementById(`band-${hit.t.id}`)?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
    });

    let targetTiltX = 0, targetTiltY = 0;

    if (reducedMotion) {
      renderer.render(scene, cam);
      return;
    }

    let visible = true;
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(canvas);
    let t0 = null;
    renderer.setAnimationLoop((t) => {
      if (!visible) return;
      if (t0 === null) t0 = t;
      const el = (t - t0) / 1000;
      prismMat.uniforms.uTime.value = el;
      halo.material.uniforms.uTime.value = el;
      inBeam.material.uniforms.uTime.value = el;
      /* entrance: beams fan out over the first 1.6s */
      beams.forEach((b, i) => {
        const k = Math.min(1, Math.max(0, (el - 0.3 - i * 0.12) / 0.9));
        const e2 = 1 - Math.pow(1 - k, 4);
        b.beam.scale.x = Math.max(0.001, e2);
        b.beam.position.x = 3.3 * e2;
        b.beam.material.uniforms.uTime.value = el;
      });
      /* slow in-plane turn + pointer parallax (base: triangle facing camera) */
      prism.rotation.y = Math.sin(el * 0.24) * 0.09 + targetTiltX * 0.35;
      prism.rotation.z = Math.sin(el * 0.15) * 0.05 + targetTiltY * 0.25;
      motes.rotation.y = Math.sin(el * 0.05) * 0.08;
      motes.position.y = Math.sin(el * 0.32) * 0.06;
      renderer.render(scene, cam);
    });
  } catch (e) {
    console.warn('prism skipped:', e);
    canvas.style.display = 'none';
  }
}

/* ---------- boot ---------- */

(async function boot() {
  const [data, podcast] = await Promise.all([loadData(), loadPodcast()]);
  renderPodcast(podcast);
  if (!data) {
    document.getElementById('wireError').hidden = false;
    render({ briefs: [] });
    return;
  }
  render(data);
})();
