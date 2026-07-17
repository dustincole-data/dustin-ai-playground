/* THE MORNING LEDGER — edition engine
   Content contract (same as the playground newsroom):
   identity line, six briefs, live morning-briefs.json, filters,
   article sources, data signals, glossary/learning explainers. */

import * as THREE from './vendor/three.module.min.js';

const TEMPLATES = [
  { id: 'ai', name: 'AI', label: 'AI', headline: 'The AI Brief', deck: 'Useful AI and automation updates without hype or long summaries.' },
  { id: 'energy', name: 'Energy / Utilities', label: 'Energy', headline: 'Energy & Utilities', deck: 'PPL, LG&E/KU, Kentucky utility news, data-center power demand, grid issues, rates, regulation, and market signals.' },
  { id: 'humana', name: 'Humana / Health Insurance', label: 'Humana', headline: 'Humana & Health Insurance', deck: 'Humana-first health-insurance scan with broader US payer stories only when no current Humana item qualifies.' },
  { id: 'kentucky_healthcare', name: 'Kentucky Healthcare', label: 'Ky. Healthcare', headline: 'Kentucky Healthcare', deck: 'Kentucky healthcare, Louisville providers, hospitals, Medicaid, access, workforce, and US healthcare backup only when needed.' },
  { id: 'analytics', name: 'Analytics', label: 'Analytics', headline: 'The Analytics Brief', deck: 'Business analytics, BI, dashboards, data quality, governance, warehouses, lakehouses, and data-platform signals.' },
  { id: 'louisville', name: 'Louisville, Kentucky', label: 'Louisville', headline: 'The Louisville Brief', deck: 'Louisville and Jefferson County signals across business, healthcare, infrastructure, utilities, policy, and local economy.' },
];

const DATA_PATHS = [
  `../../data/morning-briefs.json?ts=${Date.now()}`,
  `https://dustincole-data.github.io/dustin-ai-playground/data/morning-briefs.json?ts=${Date.now()}`,
];

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const state = { active: 'all', briefs: [], generatedLabel: null };

/* ---------- utilities ---------- */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmtStamp(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: 'America/New_York', timeZoneName: 'short',
  }).format(d);
}

function dayOfYear(d) {
  return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
}

/* ---------- folio line ---------- */

(function setFolio() {
  const now = new Date();
  const long = new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York',
  }).format(now).toUpperCase();
  document.getElementById('folioDate').textContent = `LOUISVILLE, KY. — ${long}`;
  document.getElementById('folioNo').textContent = `No. ${dayOfYear(now)}`;
})();

/* ---------- data ---------- */

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

function mergeBriefs(data) {
  const live = new Map((data?.briefs ?? []).map((b) => [b.id, b]));
  return TEMPLATES.map((t) => {
    const l = live.get(t.id) ?? {};
    return {
      ...t,
      updatedLabel: l.updatedLabel ?? 'No feed loaded yet',
      emptyMessage: l.emptyMessage ?? `No qualified ${t.name} stories found.`,
      articles: Array.isArray(l.articles) ? l.articles : [],
    };
  });
}

/* ---------- render: briefs ---------- */

function storyHTML(article, isFirst) {
  const signals = (article.dataSignals ?? []).slice(0, 3).map(esc).join(' · ');
  const hasExplainer = article.learningPage || (article.glossary ?? []).length > 0;
  return `
  <article class="story">
    <p class="story-kicker">${esc(article.kicker)}</p>
    <h4 class="story-head"><a href="${esc(article.sourceUrl)}" target="_blank" rel="noreferrer">${esc(article.title)}</a></h4>
    <p class="story-summary">${esc(firstSentences(article.summary, isFirst ? 3 : 2))}</p>
    ${article.whyItMatters ? `<p class="story-why"><strong>Why it matters.</strong> ${esc(article.whyItMatters)}</p>` : ''}
    <div class="story-meta">
      <a class="story-source" href="${esc(article.sourceUrl)}" target="_blank" rel="noreferrer">${esc(article.sourceLabel ?? 'Source')} ↗</a>
      ${signals ? `<span class="story-signals">[${signals}]</span>` : ''}
      ${hasExplainer ? `<button class="story-learn" type="button" data-learn="${esc(article.id)}">Teach me</button>` : ''}
    </div>
  </article>`;
}

function firstSentences(text, n) {
  if (!text) return '';
  const parts = String(text).split(/(?<=\.)\s+/);
  return parts.slice(0, n).join(' ');
}

function briefHTML(brief) {
  const stories = brief.articles.map((a, i) => storyHTML(a, i === 0)).join('');
  return `
  <section class="brief" data-brief="${brief.id}" aria-labelledby="brief-${brief.id}">
    <div class="brief-bar">
      <h3 class="brief-name" id="brief-${brief.id}">${esc(brief.headline)}</h3>
      <span class="brief-updated">${esc(brief.updatedLabel)}</span>
    </div>
    <p class="brief-deck">${esc(brief.deck)}</p>
    ${brief.articles.length
      ? `<div class="story-cols">${stories}</div>`
      : `<div class="brief-empty"><strong>No qualifying stories.</strong>${esc(brief.emptyMessage)} This section stays empty instead of showing generic trackers or old placeholder content.</div>`}
  </section>`;
}

function renderBriefs() {
  const root = document.getElementById('briefsRoot');
  const visible = state.active === 'all' ? state.briefs : state.briefs.filter((b) => b.id === state.active);
  root.innerHTML = visible.map(briefHTML).join('');
  if (!reducedMotion && window.gsap) {
    gsap.from(root.querySelectorAll('.brief-bar, .brief-deck'), {
      opacity: 0, y: 14, duration: 0.55, ease: 'power3.out', stagger: 0.05, clearProps: 'all',
    });
    gsap.from(root.querySelectorAll('.story'), {
      opacity: 0, y: 10, duration: 0.5, ease: 'power2.out', stagger: { each: 0.035, grid: 'auto' }, clearProps: 'all',
    });
  }
}

/* ---------- render: contents nav ---------- */

function renderContents() {
  const nav = document.getElementById('contentsNav');
  nav.querySelectorAll('button').forEach((b) => b.remove());
  const mkBtn = (id, label, count) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.brief = id;
    btn.setAttribute('aria-pressed', String(state.active === id));
    btn.innerHTML = `${esc(label)}&nbsp;<span class="story-count">${count != null ? `(${count})` : ''}</span>`;
    btn.addEventListener('click', () => {
      state.active = id;
      renderContents();
      renderBriefs();
      wireExplainerButtons();
    });
    return btn;
  };
  const total = state.briefs.reduce((n, b) => n + b.articles.length, 0);
  nav.appendChild(mkBtn('all', 'All Briefs', total || null));
  state.briefs.forEach((b) => nav.appendChild(mkBtn(b.id, b.label, b.articles.length || null)));
}

/* ---------- explainer overlay ---------- */

let lastFocus = null;

function openExplainer(article) {
  const overlay = document.getElementById('explainer');
  const title = document.getElementById('exTitle');
  const body = document.getElementById('exBody');
  const page = article.learningPage;
  title.textContent = page?.title ?? article.title;
  let html = '';
  if (page?.explanationText) html += `<p class="explainer-lede">${esc(page.explanationText)}</p>`;
  const glossary = page?.glossary ?? article.glossary ?? [];
  if (glossary.length) {
    html += `<h3 class="explainer-terms-title">Terms to know</h3><dl>`;
    for (const g of glossary) {
      html += `<div class="explainer-term"><dt>${esc(g.term)}</dt><dd>${esc(g.definition)}</dd>${g.whyItMatters ? `<dd class="why"><strong>Why it matters.</strong> ${esc(g.whyItMatters)}</dd>` : ''}</div>`;
    }
    html += `</dl>`;
  }
  body.innerHTML = html;
  lastFocus = document.activeElement;
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
  overlay.querySelector('.explainer-close').focus();
  if (!reducedMotion && window.gsap) {
    gsap.fromTo('.explainer-sheet', { y: 26, opacity: 0, scale: 0.985 }, { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: 'expo.out' });
    gsap.fromTo('.explainer-backdrop', { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'power1.out' });
  }
}

function closeExplainer() {
  const overlay = document.getElementById('explainer');
  overlay.hidden = true;
  document.body.style.overflow = '';
  if (lastFocus) lastFocus.focus();
}

function wireExplainerButtons() {
  document.querySelectorAll('[data-learn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const article = state.briefs.flatMap((b) => b.articles).find((a) => a.id === btn.dataset.learn);
      if (article) openExplainer(article);
    });
  });
}

document.getElementById('explainer').addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) closeExplainer();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.getElementById('explainer').hidden) closeExplainer();
});

/* ---------- the wire (ticker) ---------- */

function buildWire() {
  const track = document.getElementById('wireTrack');
  const items = state.briefs.flatMap((b) => b.articles.map((a) => ({ section: b.label, title: a.title })));
  if (!items.length) return;
  const text = items.map((i) => `<em>${esc(i.section.toUpperCase())}</em>&nbsp; ${esc(truncate(i.title, 110))}<span class="wire-sep">★</span>`).join('');
  track.innerHTML = `<span class="wire-run">${text}</span><span class="wire-run" aria-hidden="true">${text}</span>`;
  if (reducedMotion || !window.gsap) return;
  const run = track.querySelector('.wire-run');
  const w = run.offsetWidth;
  gsap.to(track, { x: -w, duration: Math.max(40, w / 55), ease: 'none', repeat: -1 });
}

function truncate(s, n) {
  s = String(s ?? '');
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

/* ---------- 3D: the press ---------- */

async function initPress(headlines) {
  const canvas = document.getElementById('pressCanvas');
  if (!canvas || !window.WebGLRenderingContext) return;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch { return; }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 2, 0.1, 60);
  camera.position.set(0, 0.6, 8.4);
  camera.lookAt(0, -0.1, 0);

  const group = new THREE.Group();
  scene.add(group);

  await document.fonts.load('700 84px "Bodoni Moda"');
  await document.fonts.load('400 110px "UnifrakturMaguntia"');
  await document.fonts.load('400 44px "Old Standard TT"');

  /* — plate cylinder texture: mirrored masthead + headlines, embossed on lead.
       canvas x = circumference (u), canvas y = drum axis (v). Text is drawn
       rotated so it reads along the axis, and mirrored like a real plate. — */
  function plateTexture() {
    const c = document.createElement('canvas');
    c.width = 2048; c.height = 1024;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, c.height);
    grad.addColorStop(0, '#9599a3'); grad.addColorStop(0.5, '#b7bac2'); grad.addColorStop(1, '#8b8f99');
    g.fillStyle = grad;
    g.fillRect(0, 0, c.width, c.height);
    /* fine machined lines around circumference */
    g.strokeStyle = 'rgba(255,255,255,0.06)';
    for (let x = 0; x < c.width; x += 6) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, c.height); g.stroke(); }
    /* seal-red register bands near each edge of the drum */
    g.fillStyle = 'rgba(122,28,32,0.85)';
    g.fillRect(0, 18, c.width, 26);
    g.fillRect(0, c.height - 44, c.width, 26);
    /* mirrored type bands: 4 bands around the circumference */
    const bands = 4;
    const lines = headlines.length ? headlines : ['Awaiting the morning scan'];
    for (let b = 0; b < bands; b++) {
      const cx = (b + 0.5) * (c.width / bands);
      g.save();
      g.translate(cx, c.height / 2);
      g.rotate(Math.PI / 2);
      g.scale(-1, 1); /* mirror: real plates read backwards */
      g.textAlign = 'center';
      if (b === 0) {
        g.fillStyle = 'rgba(20,21,26,0.92)';
        g.font = '400 96px "UnifrakturMaguntia"';
        g.fillText('The Morning Ledger', 0, 34);
      } else {
        g.fillStyle = 'rgba(20,21,26,0.88)';
        g.font = '800 68px "Bodoni Moda"';
        const h = lines[(b - 1) % lines.length];
        g.fillText(truncate(h.toUpperCase(), 22), 0, -6);
        g.font = '400 44px "Old Standard TT"';
        g.fillStyle = 'rgba(20,21,26,0.55)';
        g.fillText(truncate(h.toUpperCase(), 36), 0, 62);
      }
      g.restore();
    }
    const tx = new THREE.CanvasTexture(c);
    tx.wrapS = THREE.RepeatWrapping;
    tx.anisotropy = 8;
    tx.colorSpace = THREE.SRGBColorSpace;
    return tx;
  }

  /* — paper web texture: printed columns, right side up — */
  function paperTexture() {
    const c = document.createElement('canvas');
    c.width = 4096; c.height = 640;
    const g = c.getContext('2d');
    g.fillStyle = '#f4f3ef';
    g.fillRect(0, 0, c.width, c.height);
    g.textAlign = 'left';
    let x = 80;
    const items = headlines.length ? headlines : ['Awaiting the morning scan'];
    let i = 0;
    while (x < c.width - 700) {
      const h = items[i % items.length];
      g.fillStyle = 'rgba(18,19,24,1)';
      g.font = '800 92px "Bodoni Moda"';
      const title = truncate(h.toUpperCase(), 30);
      const w = Math.max(g.measureText(title).width, 820);
      g.fillText(title, x, 240);
      /* faux body text lines */
      g.fillStyle = 'rgba(18,19,24,0.42)';
      for (let row = 0; row < 5; row++) {
        const lw = w * (row === 4 ? 0.55 : 0.92 + (row % 2) * 0.06);
        g.fillRect(x, 310 + row * 58, lw, 20);
      }
      /* column rule */
      g.fillStyle = 'rgba(18,19,24,0.5)';
      g.fillRect(x + w + 70, 120, 4, 440);
      x += w + 150;
      i++;
    }
    const tx = new THREE.CanvasTexture(c);
    tx.wrapS = THREE.RepeatWrapping;
    tx.anisotropy = 8;
    tx.colorSpace = THREE.SRGBColorSpace;
    return tx;
  }

  /* plate cylinder — low metalness: standard material with no envmap goes
     black at high metalness, so carry the "lead" read via the texture */
  const plateTex = plateTexture();
  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(1.05, 1.05, 4.8, 96, 1, false),
    new THREE.MeshStandardMaterial({ map: plateTex, metalness: 0.15, roughness: 0.55 })
  );
  plate.rotation.z = Math.PI / 2;
  plate.position.y = 0.62;
  group.add(plate);

  /* end caps / trunnions */
  const capMat = new THREE.MeshStandardMaterial({ color: 0x6d7078, metalness: 0.4, roughness: 0.42 });
  [-2.55, 2.55].forEach((px) => {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.5, 32), capMat);
    cap.rotation.z = Math.PI / 2;
    cap.position.set(px, 0.62, 0);
    group.add(cap);
  });

  /* impression cylinder, kissing the web line */
  const roller = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.42, 4.8, 64),
    new THREE.MeshStandardMaterial({ color: 0x44464e, metalness: 0.35, roughness: 0.45 })
  );
  roller.rotation.z = Math.PI / 2;
  roller.position.y = -0.96;
  group.add(roller);

  /* paper web running through the nip between the cylinders */
  const paperTex = paperTexture();
  paperTex.repeat.set(1.35, 1);
  const web = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 1.9, 80, 1),
    new THREE.MeshStandardMaterial({ map: paperTex, side: THREE.DoubleSide, metalness: 0, roughness: 0.92 })
  );
  /* very gentle sag along the web */
  const pos = web.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    pos.setZ(i, Math.cos((px / 14) * Math.PI * 2) * 0.06);
  }
  pos.needsUpdate = true;
  web.geometry.computeVertexNormals();
  web.rotation.x = -Math.PI / 2.05;   /* nearly flat, top face to camera */
  web.position.y = -0.52;             /* the nip line */
  group.add(web);

  /* contact shadow */
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 256; shadowCanvas.height = 128;
  const sg = shadowCanvas.getContext('2d');
  const rad = sg.createRadialGradient(128, 64, 8, 128, 64, 120);
  rad.addColorStop(0, 'rgba(22,23,28,0.38)');
  rad.addColorStop(1, 'rgba(22,23,28,0)');
  sg.fillStyle = rad; sg.fillRect(0, 0, 256, 128);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(9.5, 3.4),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -1.75;
  group.add(shadow);

  /* lights — modern three uses physical light units; be generous */
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8890a0, 1.6));
  scene.add(new THREE.AmbientLight(0xffffff, 1.2));
  const key = new THREE.DirectionalLight(0xfff3e2, 3.2);
  key.position.set(4, 7, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xd6e0ff, 1.8);
  rim.position.set(-6, 2, -4);
  scene.add(rim);
  const under = new THREE.DirectionalLight(0xffffff, 0.7);
  under.position.set(0, -3, 5);
  scene.add(under);

  group.rotation.x = 0.1;

  /* drag to nudge */
  let targetRotY = 0, curRotY = 0, dragging = false, lastX = 0;
  canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    targetRotY += (e.clientX - lastX) * 0.004;
    targetRotY = Math.max(-0.5, Math.min(0.5, targetRotY));
    lastX = e.clientX;
  });
  canvas.addEventListener('pointerup', () => { dragging = false; targetRotY = 0; });
  canvas.addEventListener('pointercancel', () => { dragging = false; targetRotY = 0; });

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w * devicePixelRatio || canvas.height !== h * devicePixelRatio) {
      renderer.setSize(w, h, false);
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.02 }).observe(canvas);

  const clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    if (!visible) return;
    resize();
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!reducedMotion) {
      plate.rotation.x += dt * 0.55;
      roller.rotation.x -= dt * 1.35;
      paperTex.offset.x += dt * 0.028;
    }
    curRotY += (targetRotY - curRotY) * 0.08;
    group.rotation.y = curRotY;
    renderer.render(scene, camera);
  }
  resize();
  renderer.render(scene, camera);
  frame();
}

/* ---------- entrance motion ---------- */

function entrance() {
  if (reducedMotion || !window.gsap) return;
  gsap.registerPlugin(ScrollTrigger);
  const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
  tl.from('.masthead', { scale: 1.045, filter: 'blur(4px)', opacity: 0.4, duration: 1.05, clearProps: 'all' })
    .from('.masthead-sub, .folio', { opacity: 0, y: 8, duration: 0.6, stagger: 0.08, clearProps: 'all' }, '-=0.55')
    .from('.ear', { opacity: 0, x: (i) => (i === 0 ? -14 : 14), duration: 0.6, stagger: 0.06, clearProps: 'all' }, '-=0.5')
    .from('.lead-story > *', { opacity: 0, y: 16, duration: 0.7, stagger: 0.07, clearProps: 'all' }, '-=0.35')
    .from('.readers-key', { opacity: 0, y: 16, duration: 0.7, clearProps: 'all' }, '-=0.55');
}

/* ---------- boot ---------- */

(async function boot() {
  entrance();

  const data = await loadData();
  state.briefs = mergeBriefs(data);
  state.generatedLabel = fmtStamp(data?.generatedAt) ?? data?.generatedLabel ?? 'not yet generated';

  const updated = document.getElementById('updatedLine');
  updated.textContent = data
    ? `Live feed compiled ${state.generatedLabel} · lookback ${data.lookbackHours ?? 24}h`
    : 'The live feed could not be reached — the presses idle politely.';

  const since = document.getElementById('pressSince');
  if (since && state.generatedLabel) since.textContent = state.generatedLabel;

  renderContents();
  renderBriefs();
  wireExplainerButtons();
  buildWire();

  const headlines = state.briefs.flatMap((b) => b.articles.map((a) => a.title));
  initPress(headlines.length ? headlines : ['Awaiting the morning scan']);
})();
