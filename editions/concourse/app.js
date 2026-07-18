/* CONCOURSE — morning departures.
   Same content contract as the playground newsroom.
   Hero: a working split-flap departure board (one row per brief,
   cycling through its headlines) + a rotating three-faced pylon. */

import * as THREE from './vendor/three.module.min.js';

const SECTIONS = [
  { id: 'ai', name: 'AI', dest: 'AI', gate: 'A1', headline: 'AI',
    deck: 'Useful AI and automation updates without hype or long summaries.' },
  { id: 'energy', name: 'Energy / Utilities', dest: 'Energy & Utilities', gate: 'A2', headline: 'Energy & Utilities',
    deck: 'PPL, LG&E/KU, Kentucky utility news, data-center power demand, grid issues, rates, regulation, and market signals.' },
  { id: 'humana', name: 'Humana / Health Insurance', dest: 'Humana & Health', gate: 'A3', headline: 'Humana & Health',
    deck: 'Humana-first health-insurance scan with broader US payer stories only when no current Humana item qualifies.' },
  { id: 'kentucky_healthcare', name: 'Kentucky Healthcare', dest: 'Ky. Healthcare', gate: 'A4', headline: 'Kentucky Healthcare',
    deck: 'Kentucky healthcare, Louisville providers, hospitals, Medicaid, access, workforce, and US healthcare backup only when needed.' },
  { id: 'analytics', name: 'Analytics', dest: 'Analytics', gate: 'A5', headline: 'Analytics',
    deck: 'Business analytics, BI, dashboards, data quality, governance, warehouses, lakehouses, and data-platform signals.' },
  { id: 'louisville', name: 'Louisville, Kentucky', dest: 'Louisville', gate: 'A6', headline: 'Louisville',
    deck: 'Louisville and Jefferson County signals across business, healthcare, infrastructure, utilities, policy, and local economy.' },
];

const LEARN_BASE = 'https://dustincole-data.github.io/dustin-ai-playground/#/learn/';
const DATA_PATHS = [
  `../../data/morning-briefs.json?ts=${Date.now()}`,
  `https://dustincole-data.github.io/dustin-ai-playground/data/morning-briefs.json?ts=${Date.now()}`,
];

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const FLAP_CHARS = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:’-&';
const BOARD_COLS = 38;

let briefData = null;

/* ---------- clock ---------- */
function tickClock() {
  document.getElementById('clockTime').textContent = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/New_York',
  }).format(new Date());
}
tickClock();
setInterval(tickClock, 10_000);

(function setDate() {
  document.getElementById('hallDate').textContent = new Intl.DateTimeFormat('en-US', {
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

function cleanSummary(a) {
  return String(a.summary || '')
    .replace(/\s*Source:\s*\[?[^.\]]+\]?\([^)]*\)\s*$/i, '')
    .replace(/\s*Source:\s*[^.]+$/i, '').trim();
}

function whyLine(a) {
  const w = String(a.whyItMatters || '').trim();
  if (!w) return '';
  if (String(a.summary || '').toLowerCase().includes(w.toLowerCase().slice(0, 60))) return '';
  return w;
}

function depTime(a) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/New_York',
    }).format(new Date(a.publishedAt));
  } catch { return '—'; }
}

function srcShort(a) {
  return String(a.kicker || a.sourceLabel || '').split('·')[0].trim().slice(0, 14);
}

function tinfoBlock(a) {
  const terms = (a.glossary || []).filter((g) => g.term && g.definition);
  if (!terms.length) return '';
  const learn = (a.learningPage && a.learningPage.glossary) || [];
  return `<details class="tinfo">
    <summary>Traveler information — ${terms.length} ${terms.length === 1 ? 'term' : 'terms'} explained</summary>
    <div class="tinfo-body">${terms.map((g) => {
      const extra = learn.find((l) => l.term === g.term && l.whyItMatters);
      return `<p class="tinfo-term"><strong>${esc(g.term)}.</strong> ${esc(g.definition)}${extra ? ` <span class="t-why">${esc(extra.whyItMatters)}</span>` : ''}</p>`;
    }).join('')}</div>
  </details>`;
}

function depHtml(a) {
  const why = whyLine(a);
  const tags = (a.dataSignals || []).slice(0, 3);
  return `<article class="dep">
    <p class="dep-time">${esc(depTime(a))}<span class="dt-src">${esc(srcShort(a))}</span></p>
    <div class="dep-body">
      <h3 class="dep-head"><a href="${esc(a.sourceUrl || '#')}" target="_blank" rel="noopener">${esc(a.title)}</a></h3>
      <p class="dep-sum">${esc(cleanSummary(a))}</p>
      ${why ? `<p class="dep-why"><strong>Why board this&ensp;</strong>${esc(why)}</p>` : ''}
      ${tags.length ? `<div class="dep-tags">${tags.map((s) => `<span class="dep-tag">${esc(s)}</span>`).join('')}</div>` : ''}
      ${tinfoBlock(a)}
      <p class="dep-meta">
        <span>${esc(a.sourceLabel || '')}</span>
        ${a.id ? `<a class="learn" href="${LEARN_BASE}${encodeURIComponent(a.id)}">Teach me this story</a>` : ''}
      </p>
    </div>
  </article>`;
}

/* ---------- render ---------- */

function render(data) {
  briefData = data;
  const byId = new Map((data?.briefs || []).map((b) => [b.id, b]));
  const counts = SECTIONS.map((t) => byId.get(t.id)?.articles?.length || 0);
  const total = counts.reduce((a, b) => a + b, 0);

  document.getElementById('atriumCount').textContent = total || 'no';
  document.getElementById('hallStamp').textContent =
    data?.generatedLabel ? data.generatedLabel : 'live briefs unavailable';

  /* board rows */
  const board = document.getElementById('board');
  board.querySelectorAll('.board-row').forEach((r) => r.remove());
  SECTIONS.forEach((t, i) => {
    const articles = byId.get(t.id)?.articles || [];
    const row = document.createElement('button');
    row.className = 'board-row';
    row.type = 'button';
    row.setAttribute('role', 'row');
    row.dataset.gate = t.id;
    row.innerHTML = `
      <span class="brd-gate" role="cell">${t.gate}</span>
      <span class="brd-dest" role="cell"><span class="d1">${esc(t.dest)}</span><span class="d2">${counts[i]} ${counts[i] === 1 ? 'story' : 'stories'} this morning</span></span>
      <span class="flapline" role="cell" aria-live="off" data-row="${i}"></span>
      <span class="brd-status ${counts[i] ? '' : 'busy'}" role="cell">${counts[i] ? 'BOARDING' : 'DELAYED'}</span>`;
    row.addEventListener('click', () => {
      document.getElementById(`gate-${t.id}`)?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
    });
    board.appendChild(row);
  });

  /* gates */
  document.getElementById('gates').innerHTML = SECTIONS.map((t, i) => {
    const b = byId.get(t.id);
    const articles = b?.articles || [];
    return `<section class="gate" id="gate-${t.id}" aria-labelledby="gh-${t.id}">
      <div class="gate-head">
        <span class="gate-chip">GATE ${t.gate}</span>
        <h2 class="gate-title" id="gh-${t.id}">${esc(t.headline)}</h2>
        <span class="gate-status">${esc(b?.updatedLabel || 'Last 24 hours')}</span>
      </div>
      <p class="gate-deck">${esc(t.deck)}</p>
      <div class="gate-flow">
        ${articles.length ? articles.map(depHtml).join('')
          : `<p class="gate-empty">${esc(b?.emptyMessage || `No qualified ${t.name} stories in the last 24 hours.`)}</p>`}
      </div>
    </section>`;
  }).join('');

  initFlaps(byId);
  choreograph();
  initPylon(byId, counts);
}

/* ---------- split-flap engine ---------- */

function flapText(a) {
  const title = String(a?.title || 'No departures').toUpperCase()
    .replace(/[^A-Z0-9 .,:’'&-]/g, '')
    .replace(/'/g, '’');
  if (title.length <= BOARD_COLS) return title.padEnd(BOARD_COLS, ' ');
  /* cut on a word boundary, flap-board style (no ellipsis) */
  let cut = title.slice(0, BOARD_COLS + 1);
  cut = cut.slice(0, cut.lastIndexOf(' ')).trimEnd().replace(/[,.:;-]$/, '');
  return cut.padEnd(BOARD_COLS, ' ');
}

function initFlaps(byId) {
  const lines = [...document.querySelectorAll('.flapline')];
  const rows = lines.map((line, i) => {
    const articles = byId.get(SECTIONS[i].id)?.articles || [];
    line.innerHTML = '';
    const cells = [];
    for (let c = 0; c < BOARD_COLS; c++) {
      const cell = document.createElement('span');
      cell.className = 'flap space';
      cell.textContent = ' ';
      line.appendChild(cell);
      cells.push(cell);
    }
    return { line, cells, articles, idx: 0 };
  });

  function setCell(cell, ch) {
    cell.textContent = ch;
    cell.classList.toggle('space', ch === ' ');
  }

  function spellRow(row, text, instant = false) {
    if (instant) {
      [...text].forEach((ch, c) => setCell(row.cells[c], ch));
      return;
    }
    [...text].forEach((ch, c) => {
      const cell = row.cells[c];
      const current = cell.textContent;
      if (current === ch) return;
      const startDelay = c * 26 + Math.random() * 60;
      const spins = 2 + Math.floor(Math.random() * 3);
      let step = 0;
      setTimeout(function spin() {
        step += 1;
        if (step > spins) {
          setCell(cell, ch);
          cell.animate(
            [{ transform: 'rotateX(-72deg)' }, { transform: 'rotateX(0deg)' }],
            { duration: 90, easing: 'ease-out' }
          );
          return;
        }
        setCell(cell, FLAP_CHARS[Math.floor(Math.random() * FLAP_CHARS.length)]);
        cell.animate(
          [{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(-72deg)' }],
          { duration: 55, easing: 'ease-in' }
        );
        setTimeout(spin, 62);
      }, startDelay);
    });
  }

  rows.forEach((row, i) => {
    const first = flapText(row.articles[0]);
    if (reducedMotion) spellRow(row, first, true);
    else setTimeout(() => spellRow(row, first), 300 + i * 180);
  });

  if (reducedMotion) return;
  /* rotate each row through its section's headlines */
  setInterval(() => {
    rows.forEach((row, i) => {
      if (row.articles.length < 2) return;
      row.idx = (row.idx + 1) % row.articles.length;
      setTimeout(() => spellRow(row, flapText(row.articles[row.idx])), i * 350);
    });
  }, 14_000);
}

/* ---------- motion ---------- */

function choreograph() {
  if (reducedMotion || typeof gsap === 'undefined') return;
  gsap.registerPlugin(ScrollTrigger);
  gsap.from('.hall-name, .hall-line, .hall-dim', { y: 16, opacity: 0, duration: 0.55, ease: 'power3.out', stagger: 0.08 });
  gsap.from('.hall-clock', { opacity: 0, duration: 0.7, ease: 'power2.out', delay: 0.3 });
  gsap.from('.board', { y: 26, opacity: 0, duration: 0.75, ease: 'power4.out', delay: 0.15 });
  gsap.from('.atrium-head, .atrium-sub, .atrium-note', {
    y: 20, opacity: 0, duration: 0.6, ease: 'power3.out', stagger: 0.09,
    immediateRender: false,
    scrollTrigger: { trigger: '.atrium', start: 'top 80%', once: true },
  });
  document.querySelectorAll('.gate').forEach((gate) => {
    gsap.from(gate.querySelectorAll('.dep'), {
      y: 16, opacity: 0, duration: 0.5, ease: 'power3.out', stagger: 0.07,
      immediateRender: false,
      scrollTrigger: { trigger: gate, start: 'top 80%', once: true },
    });
  });
  setTimeout(() => {
    document.querySelectorAll('.dep, .board, .atrium-head, .atrium-sub, .atrium-note, .hall-name').forEach((el) => {
      if (getComputedStyle(el).opacity === '0') gsap.set(el, { clearProps: 'all' });
    });
  }, 2600);
}

/* ---------- pylon (three.js) ---------- */

function initPylon(byId, counts) {
  const canvas = document.getElementById('pylon');
  if (!canvas || canvas.dataset.live) return;
  canvas.dataset.live = '1';
  try {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    cam.position.set(0, 0.4, 8.6);
    cam.lookAt(0, 0.1, 0);

    /* content queue: sections with stories, in order */
    const queue = SECTIONS
      .map((t, i) => ({ t, i, a: (byId.get(t.id)?.articles || [])[0], count: counts[i] }))
      .filter((q) => q.a);
    if (!queue.length) { canvas.style.display = 'none'; return; }

    function faceTexture(q) {
      const c = document.createElement('canvas');
      c.width = 512; c.height = 768;
      const x = c.getContext('2d');
      x.fillStyle = '#232733'; x.fillRect(0, 0, 512, 768);
      x.strokeStyle = '#343a4b'; x.lineWidth = 3; x.strokeRect(10, 10, 492, 748);
      x.fillStyle = '#8d93a5';
      x.font = '600 30px "Barlow Semi Condensed", Arial';
      x.letterSpacing = '6px';
      x.fillText('NOW BOARDING', 42, 88);
      x.fillStyle = '#f2c744';
      const dest = q.t.dest.toUpperCase();
      let destSize = 64;
      x.font = `700 ${destSize}px "Barlow Semi Condensed", Arial`;
      while (x.measureText(dest).width > 428 && destSize > 34) {
        destSize -= 3;
        x.font = `700 ${destSize}px "Barlow Semi Condensed", Arial`;
      }
      x.fillText(dest, 42, 178);
      x.fillStyle = '#e8eaf0';
      x.font = '600 38px "Barlow Semi Condensed", Arial';
      const words = String(q.a.title).toUpperCase().split(' ');
      let line = '', y = 268;
      for (const w of words) {
        if (x.measureText(line + w).width > 420) {
          x.fillText(line.trimEnd(), 42, y); y += 52; line = '';
          if (y > 580) { line = line + '…'; break; }
        }
        line += w + ' ';
      }
      if (line.trim() && y <= 580) x.fillText(line.trimEnd(), 42, y);
      x.fillStyle = '#f2c744';
      x.font = '700 44px "Barlow Semi Condensed", Arial';
      x.fillText(`GATE ${q.t.gate}`, 42, 690);
      x.fillStyle = '#8d93a5';
      x.font = '600 30px "Barlow Semi Condensed", Arial';
      x.fillText(`${q.count} ${q.count === 1 ? 'STORY' : 'STORIES'}`, 250, 690);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }

    /* three faces at 120°, each its own texture.
       For a triangular prism with circumradius R: apothem = R/2,
       side length = R·√3. Planes sit just proud of the core's flats. */
    const pylon = new THREE.Group();
    const R = 1.02;
    const apothem = R * 0.5;
    const sideLen = R * Math.sqrt(3);
    const faces = [];
    for (let f = 0; f < 3; f++) {
      const geo = new THREE.PlaneGeometry(sideLen * 0.96, 2.9);
      const mat = new THREE.MeshBasicMaterial({ map: faceTexture(queue[f % queue.length]), toneMapped: false });
      const mesh = new THREE.Mesh(geo, mat);
      const ang = (f / 3) * Math.PI * 2;
      mesh.position.set(Math.sin(ang) * apothem * 1.03, 0, Math.cos(ang) * apothem * 1.03);
      mesh.rotation.y = ang;
      pylon.add(mesh);
      faces.push({ mesh, mat, slot: f });
    }
    /* charcoal core */
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(R * 1.01, R * 1.01, 2.94, 3),
      new THREE.MeshBasicMaterial({ color: 0x1b1f29 })
    );
    core.rotation.y = Math.PI / 3;
    pylon.add(core);
    /* caps */
    const capMat = new THREE.MeshBasicMaterial({ color: 0x2c3140 });
    const capTop = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.06, R * 1.06, 0.12, 3), capMat);
    capTop.rotation.y = Math.PI / 3; capTop.position.y = 1.52;
    const capBot = capTop.clone(); capBot.position.y = -1.52;
    pylon.add(capTop, capBot);
    /* hanger rod */
    const rod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 1.1),
      new THREE.MeshBasicMaterial({ color: 0x9aa0b0 })
    );
    rod.position.y = 2.1;
    scene.add(rod);
    scene.add(pylon);

    /* soft shadow */
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.5, 40),
      new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `varying vec2 vUv; void main(){ float d = distance(vUv, vec2(0.5)); gl_FragColor = vec4(vec3(0.1, 0.11, 0.15), smoothstep(0.5, 0.08, d) * 0.24); }`,
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -1.95;
    scene.add(shadow);

    function resize() {
      const w = canvas.clientWidth || canvas.parentElement.clientWidth;
      const h = canvas.clientHeight || 380;
      renderer.setSize(w, h, false);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
    resize();
    addEventListener('resize', resize);

    /* refresh face content once fonts are in (canvas needs loaded fonts) */
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => {
        faces.forEach((f) => { f.mat.map = faceTexture(queue[f.slot % queue.length]); f.mat.map.needsUpdate = true; });
      });
    }

    if (reducedMotion) {
      pylon.rotation.y = 0.18;
      renderer.render(scene, cam);
      return;
    }

    /* rotation state machine: snap 120° every 5.5s, retexture the face
       that just rotated out of view with the next queue item */
    let baseRot = 0, animStart = null, animFrom = 0, contentStep = 2;
    setInterval(() => {
      animFrom = baseRot;
      baseRot += (Math.PI * 2) / 3;
      animStart = performance.now();
      /* the face now facing away gets content 3 steps ahead */
      contentStep += 1;
      const backFace = faces[((contentStep % 3) + 3) % 3];
      const q = queue[contentStep % queue.length];
      backFace.mat.map.dispose();
      backFace.mat.map = faceTexture(q);
      backFace.mat.needsUpdate = true;
    }, 5500);

    let visible = true;
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(canvas);
    renderer.setAnimationLoop((t) => {
      if (!visible) return;
      let rot = baseRot;
      if (animStart !== null) {
        const k = Math.min(1, (t - animStart) / 900);
        const e = 1 - Math.pow(1 - k, 4);
        rot = animFrom + (baseRot - animFrom) * e;
        if (k >= 1) animStart = null;
      }
      pylon.rotation.y = rot + Math.sin(t / 4200) * 0.03;
      pylon.position.y = Math.sin(t / 2600) * 0.04;
      renderer.render(scene, cam);
    });
  } catch (e) {
    console.warn('pylon skipped:', e);
    canvas.style.display = 'none';
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
