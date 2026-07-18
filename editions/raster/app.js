/* RASTER — the Swiss-grid daily
   Same content contract as the playground newsroom, set in order.
   Sculpture: six bars (one per brief) on an orthographic stage,
   heights = this morning's article counts. */

import * as THREE from './vendor/three.module.min.js';

const TEMPLATES = [
  { id: 'ai', name: 'AI', label: 'AI', headline: 'AI', deck: 'Useful AI and automation updates without hype or long summaries.' },
  { id: 'energy', name: 'Energy / Utilities', label: 'Energy', headline: 'Energy & Utilities', deck: 'PPL, LG&E/KU, Kentucky utility news, data-center power demand, grid issues, rates, regulation, and market signals.' },
  { id: 'humana', name: 'Humana / Health Insurance', label: 'Humana', headline: 'Humana & Health', deck: 'Humana-first health-insurance scan with broader US payer stories only when no current Humana item qualifies.' },
  { id: 'kentucky_healthcare', name: 'Kentucky Healthcare', label: 'Ky. Health', headline: 'Ky. Healthcare', deck: 'Kentucky healthcare, Louisville providers, hospitals, Medicaid, access, workforce, and US healthcare backup only when needed.' },
  { id: 'analytics', name: 'Analytics', label: 'Analytics', headline: 'Analytics', deck: 'Business analytics, BI, dashboards, data quality, governance, warehouses, lakehouses, and data-platform signals.' },
  { id: 'louisville', name: 'Louisville, Kentucky', label: 'Louisville', headline: 'Louisville', deck: 'Louisville and Jefferson County signals across business, healthcare, infrastructure, utilities, policy, and local economy.' },
];

const LEARN_BASE = 'https://dustincole-data.github.io/dustin-ai-playground/#/learn/';
const DATA_PATHS = [
  `../../data/morning-briefs.json?ts=${Date.now()}`,
  `https://dustincole-data.github.io/dustin-ai-playground/data/morning-briefs.json?ts=${Date.now()}`,
];

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function dayOfYear(d) { return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000); }

(function setMeta() {
  const now = new Date();
  document.getElementById('metaDate').textContent = new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York',
  }).format(now);
  document.getElementById('metaNo').textContent = `Nr. ${dayOfYear(now)}`;
})();

function cleanTitle(t) {
  const s = String(t || '');
  const cut = s.indexOf(': ');
  if (cut > 20 && cut < 90) return s.slice(0, cut);
  return s.replace(/:\s*$/, '');
}

function shortSummary(a, max = 200) {
  let s = a.summary || '';
  if (a.title && s.startsWith(a.title.replace(/…$/, '').slice(0, 40))) {
    const cut = s.indexOf(': ');
    if (cut > -1 && cut < 140) s = s.slice(cut + 2);
  }
  s = s.replace(/\s*Source:\s*[^.]+$/i, '');
  if (s.length > max) s = s.slice(0, max - 3).trimEnd() + '…';
  return s;
}

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

/* ---------- render ---------- */

let counts = TEMPLATES.map(() => 0);

function render(data) {
  const byId = new Map((data?.briefs || []).map((b) => [b.id, b]));
  counts = TEMPLATES.map((t) => byId.get(t.id)?.articles?.length || 0);

  /* lead */
  const lead = TEMPLATES.map((t) => ({ t, b: byId.get(t.id) })).find(({ b }) => b?.articles?.length);
  if (lead) {
    const a = lead.b.articles[0];
    document.getElementById('leadKick').textContent = `${lead.t.name} · ${a.kicker || 'this morning'}`;
    document.getElementById('leadHead').innerHTML =
      `<a href="${esc(a.sourceUrl || '#')}" target="_blank" rel="noopener" title="${esc(a.title)}">${esc(cleanTitle(a.title))}</a>`;
    document.getElementById('leadSum').textContent = shortSummary(a, 280);
    document.getElementById('leadMeta').innerHTML =
      `${esc(a.sourceLabel || '')}${a.id ? ` — <a href="${LEARN_BASE}${encodeURIComponent(a.id)}">Teach me</a>` : ''}`;
  }

  /* modules */
  document.getElementById('register').innerHTML = TEMPLATES.map((t, i) => {
    const b = byId.get(t.id);
    const articles = b?.articles || [];
    const rows = articles.length
      ? articles.map((a, j) => `<article class="mrow">
          <span class="mrow-no">${String(j + 1).padStart(2, '0')}</span>
          <div>
            <h4 class="mrow-head"><a href="${esc(a.sourceUrl || '#')}" target="_blank" rel="noopener" title="${esc(a.title)}">${esc(cleanTitle(a.title))}</a></h4>
            <p class="mrow-sum">${esc(shortSummary(a))}</p>
            <p class="mrow-meta"><span class="src">${esc(a.sourceLabel || '')}</span>${a.id ? `<a href="${LEARN_BASE}${encodeURIComponent(a.id)}">Teach me</a>` : ''}</p>
          </div>
        </article>`).join('')
      : `<p class="module-empty">${esc(b?.emptyMessage || `No qualified ${t.name} stories in the last 24 hours.`)}</p>`;
    return `<section class="module" id="mod-${t.id}" aria-labelledby="mh-${t.id}">
      <div class="module-head">
        <span class="module-no">${i + 1}</span>
        <h3 class="module-title" id="mh-${t.id}">${esc(t.headline)}</h3>
        <span class="module-updated">${esc(b?.updatedLabel || 'Last 24 hours')}</span>
      </div>
      <p class="module-deck">${esc(t.deck)}</p>
      ${rows}
    </section>`;
  }).join('');

  document.getElementById('metaStamp').textContent =
    data?.generatedLabel ? `Updated ${data.generatedLabel}` : 'Live briefs unavailable';

  document.getElementById('sculptureLegend').textContent =
    TEMPLATES.map((t, i) => `${t.label} ${counts[i]}`).join(' · ');

  choreograph();
  initSculpture();
}

/* ---------- motion ---------- */

function choreograph() {
  if (reducedMotion || typeof gsap === 'undefined') return;
  gsap.registerPlugin(ScrollTrigger);
  gsap.from('.band-logo', { yPercent: 30, opacity: 0, duration: 0.6, ease: 'power4.out' });
  gsap.from('.hero-cell', { y: 18, opacity: 0, duration: 0.5, ease: 'power3.out', stagger: 0.08, delay: 0.1 });
  document.querySelectorAll('.module').forEach((mod) => {
    gsap.from(mod.querySelectorAll('.mrow'), {
      y: 12, opacity: 0, duration: 0.4, ease: 'power3.out', stagger: 0.04,
      immediateRender: false,
      scrollTrigger: { trigger: mod, start: 'top 80%', once: true },
    });
  });
  setTimeout(() => {
    document.querySelectorAll('.hero-cell, .mrow, .band-logo').forEach((el) => {
      if (getComputedStyle(el).opacity === '0') gsap.set(el, { clearProps: 'all' });
    });
  }, 2000);
}

/* ---------- sculpture (three.js) ---------- */

function initSculpture() {
  const canvas = document.getElementById('sculpture');
  if (!canvas || canvas.dataset.live) return;
  canvas.dataset.live = '1';
  try {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    const scene = new THREE.Scene();

    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    cam.position.set(6, 5.2, 6);
    cam.lookAt(0, 0.7, 0);

    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(4, 8, 2);
    scene.add(key);
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));

    const group = new THREE.Group();
    scene.add(group);

    /* stage plane, hairline grid */
    const gridHelper = new THREE.GridHelper(4.2, 12, 0xbbbbbb, 0xdddddd);
    gridHelper.position.y = 0;
    group.add(gridHelper);

    const inkMat = new THREE.MeshLambertMaterial({ color: 0x2b2b2b });
    const redMat = new THREE.MeshLambertMaterial({ color: 0xd63c2a });
    const bars = [];
    const maxCount = Math.max(1, ...counts);
    const W = 0.5, GX = 1.05, GZ = 1.05;
    counts.forEach((c, i) => {
      const h = 0.25 + (c / maxCount) * 2.2;
      const geo = new THREE.BoxGeometry(W, h, W);
      const mesh = new THREE.Mesh(geo, i === counts.indexOf(maxCount) ? redMat : inkMat);
      const col = i % 3, row = Math.floor(i / 3);
      mesh.position.set((col - 1) * GX, h / 2, (row - 0.5) * GZ);
      group.add(mesh);
      bars.push({ mesh, h, i });
    });

    function resize() {
      const w = canvas.clientWidth || canvas.parentElement.clientWidth;
      const h = canvas.clientHeight || 320;
      renderer.setSize(w, h, false);
      const aspect = w / h;
      const view = aspect < 1.1 ? 3.7 : 2.6;
      cam.left = -view * aspect / 2; cam.right = view * aspect / 2;
      cam.top = view / 2 + 0.9; cam.bottom = -view / 2 + 0.9;
      cam.updateProjectionMatrix();
    }
    resize();
    addEventListener('resize', resize);

    /* hover highlights a bar and names it; click jumps to its module */
    const ray = new THREE.Raycaster();
    const ptr = new THREE.Vector2();
    const caption = document.getElementById('sculptureLegend');
    const baseCaption = () => TEMPLATES.map((t, i) => `${t.label} ${counts[i]}`).join(' · ');
    let hovered = null;
    const hoverMat = new THREE.MeshLambertMaterial({ color: 0x666666 });
    function pick(e) {
      const r = canvas.getBoundingClientRect();
      ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ptr, cam);
      return ray.intersectObjects(bars.map((b) => b.mesh))[0]?.object || null;
    }
    canvas.addEventListener('pointermove', (e) => {
      const hit = pick(e);
      if (hit !== hovered) {
        if (hovered && hovered.userData.baseMat) hovered.material = hovered.userData.baseMat;
        hovered = hit;
        if (hovered) {
          hovered.userData.baseMat = hovered.material;
          if (hovered.material !== redMat) hovered.material = hoverMat;
          const bar = bars.find((b) => b.mesh === hovered);
          caption.textContent = `${TEMPLATES[bar.i].name} — ${counts[bar.i]} ${counts[bar.i] === 1 ? 'signal' : 'signals'} this morning. Click to read.`;
          canvas.style.cursor = 'pointer';
        } else {
          caption.textContent = baseCaption();
          canvas.style.cursor = 'default';
        }
      }
    });
    canvas.addEventListener('pointerleave', () => {
      if (hovered && hovered.userData.baseMat) hovered.material = hovered.userData.baseMat;
      hovered = null;
      caption.textContent = baseCaption();
    });
    canvas.addEventListener('click', (e) => {
      const hit = pick(e);
      if (hit) {
        const bar = bars.find((b) => b.mesh === hit);
        document.getElementById(`mod-${TEMPLATES[bar.i].id}`)?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
      }
    });

    if (reducedMotion) {
      group.rotation.y = -0.35;
      renderer.render(scene, cam);
      return;
    }

    /* bars grow in, then the stage slowly turns */
    let t0 = null;
    let visible = true;
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(canvas);
    renderer.setAnimationLoop((t) => {
      if (!visible) return;
      if (t0 === null) t0 = t;
      const el = (t - t0) / 1000;
      for (const b of bars) {
        const k = Math.min(1, Math.max(0, (el - 0.15 - b.i * 0.09) / 0.7));
        const e = 1 - Math.pow(1 - k, 4);
        b.mesh.scale.y = Math.max(0.001, e);
        b.mesh.position.y = (b.h * e) / 2;
      }
      group.rotation.y = -0.35 + Math.sin(el * 0.16) * 0.5;
      renderer.render(scene, cam);
    });
  } catch (e) {
    console.warn('sculpture skipped:', e);
    canvas.closest('.hero-sculpture')?.classList.add('no-webgl');
  }
}

/* ---------- boot ---------- */

(async function boot() {
  const data = await loadData();
  if (!data) {
    document.getElementById('wireError').hidden = false;
    render({ briefs: [] });
    return;
  }
  render(data);
})();
