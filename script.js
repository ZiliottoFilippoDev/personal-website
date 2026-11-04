/* Filippo Ziliotto, site behaviour.
   Progressive enhancement throughout: every feature degrades to plain HTML. */
(() => {
  'use strict';

  const root = document.documentElement;
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const reduceMotionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const darkQuery = matchMedia('(prefers-color-scheme: dark)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reduced = () => reduceMotionQuery.matches;
  const hasVT = typeof document.startViewTransition === 'function';
  if (hasVT) root.classList.add('has-vt');

  /** Run a DOM update inside a view transition when available and appropriate. */
  function transition(update, { skip = false } = {}) {
    if (!hasVT || skip || reduced()) {
      const result = update();
      return Promise.resolve(result);
    }
    // Drop backdrop blur on captured glass for the duration (see CSS).
    root.classList.add('vt-running');
    const vt = document.startViewTransition(update);
    return vt.finished.catch(() => {}).finally(() => root.classList.remove('vt-running'));
  }

  /* ======================================================================
     Theme
     ====================================================================== */
  const isDark = () => root.dataset.theme === 'dark' || (!root.dataset.theme && darkQuery.matches);

  function syncTheme() {
    root.classList.toggle('is-dark', isDark());
    cloud?.refreshColors();
  }

  const toggle = $('.theme-toggle');
  toggle?.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    const r = toggle.getBoundingClientRect();
    root.style.setProperty('--ox', `${r.left + r.width / 2}px`);
    root.style.setProperty('--oy', `${r.top + r.height / 2}px`);
    root.classList.add('vt-theme');
    transition(() => {
      root.dataset.theme = next;
      syncTheme();
    }).finally(() => root.classList.remove('vt-theme'));
    try { localStorage.setItem('theme', next); } catch (_) { /* storage unavailable */ }
  });
  darkQuery.addEventListener('change', syncTheme);

  /* ======================================================================
     Ambient point cloud
     A procedurally scanned room orbiting slowly. Two cameras observe it;
     points inside both frusta are tinted (co-visible). Scroll and pointer
     move the viewpoint. Plain 2D canvas, about 2.7k points.
     ====================================================================== */
  const cloud = (() => {
    const canvas = $('#cloud');
    if (!canvas || !canvas.getContext) return null;
    const ctx = canvas.getContext('2d', { alpha: true });

    // Deterministic RNG so the room looks the same on every visit.
    let seed = 7;
    const rand = () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const range = (a, b) => a + (b - a) * rand();
    const jitter = (s = 0.012) => (rand() - 0.5) * s;

    const pts = [];
    const add = (x, y, z) => pts.push({ x: x + jitter(), y: y + jitter(), z: z + jitter() });
    const DENSITY = 1.5;
    const plane = (n, fn) => { for (let i = 0; i < Math.round(n * DENSITY); i++) fn(); };

    // Floor
    plane(1000, () => add(range(-3, 3), 0, range(-2.2, 2.2)));
    // Back wall with a window opening
    plane(520, () => {
      const x = range(-3, 3), y = range(0, 2.6);
      if (x > 0.5 && x < 1.9 && y > 0.95 && y < 2.05) return;
      add(x, y, -2.2);
    });
    // Left wall with a doorway
    plane(380, () => {
      const z = range(-2.2, 2.2), y = range(0, 2.6);
      if (z > 0.55 && z < 1.45 && y < 2.1) return;
      add(-3, y, z);
    });
    // Table top and legs
    plane(190, () => add(range(-0.1, 1.4), 0.75, range(-0.85, 0)));
    for (const [lx, lz] of [[-0.05, -0.8], [1.35, -0.8], [-0.05, -0.05], [1.35, -0.05]]) {
      plane(12, () => add(lx, range(0, 0.75), lz));
    }
    // Chair
    plane(45, () => add(range(0.45, 0.95), 0.46, range(0.25, 0.7)));
    plane(35, () => add(range(0.45, 0.95), range(0.46, 0.95), 0.7));
    // Sofa: seat, back, arms
    plane(130, () => add(range(-2.7, -1.0), 0.45, range(-1.65, -1.05)));
    plane(120, () => add(range(-2.7, -1.0), range(0.3, 0.92), -1.75));
    plane(40, () => add(-2.75, range(0.2, 0.62), range(-1.75, -1.05)));
    plane(40, () => add(-0.95, range(0.2, 0.62), range(-1.75, -1.05)));
    // Bookshelf: front edges plus shelves
    plane(70, () => add(range(1.95, 2.85), [0.02, 0.5, 0.98, 1.46, 1.92][Math.floor(rand() * 5)], -1.85));
    plane(60, () => add(rand() < 0.5 ? 1.95 : 2.85, range(0, 1.92), -1.85));
    // Floor lamp: pole and shade
    plane(26, () => add(2.45, range(0, 1.5), 1.35));
    plane(80, () => {
      const u = range(0, Math.PI * 2), v = Math.acos(range(-1, 1));
      add(2.45 + 0.22 * Math.sin(v) * Math.cos(u), 1.68 + 0.22 * Math.cos(v), 1.35 + 0.22 * Math.sin(v) * Math.sin(u));
    });

    // Vector helpers
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    const basis = (pos, target) => {
      const f = norm(sub(target, pos));
      const r = norm(cross(f, [0, 1, 0]));
      const u = cross(r, f);
      return { pos, f, r, u };
    };

    // Observing cameras and their visibility sets
    const tanH = Math.tan((68 * Math.PI) / 360), tanV = tanH * 0.75;
    const cams = [
      basis([-2.25, 1.45, 1.9], [0.7, 0.55, -1.3]),
      basis([2.5, 1.5, 1.15], [-1.1, 0.6, -1.4]),
    ];
    const sees = (cam, p) => {
      const d = sub([p.x, p.y, p.z], cam.pos);
      const z = dot(d, cam.f);
      if (z < 0.25 || z > 6.5) return false;
      return Math.abs(dot(d, cam.r) / z) < tanH && Math.abs(dot(d, cam.u) / z) < tanV;
    };
    for (const p of pts) {
      const n = (sees(cams[0], p) ? 1 : 0) + (sees(cams[1], p) ? 1 : 0);
      p.g = n === 2 ? 2 : 0;
      // Scan-line reveal: a sweep across x, slight vertical stagger.
      p.delay = ((p.x + 3) / 6) * 1100 + p.y * 90 + rand() * 160;
    }
    // Frustum wireframes (apex + 4 corners at a short depth)
    const frusta = cams.map((c) => {
      const d = 0.5;
      const corner = (sx, sy) => [0, 1, 2].map((k) => c.pos[k] + c.f[k] * d + c.r[k] * sx * tanH * d + c.u[k] * sy * tanV * d);
      return { apex: c.pos, corners: [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)] };
    });

    let W = 0, H = 0, dpr = 1, raf = 0, running = false, t0 = 0;
    let colors = { ink: '#0f1b2e', accent: '#2a5bd7', teal: '#179fb0' };
    const ptr = { x: 0, y: 0, sx: 0, sy: 0 };
    let scrollSmooth = window.scrollY;

    function refreshColors() {
      const cs = getComputedStyle(root);
      colors = {
        ink: cs.getPropertyValue('--ink').trim() || colors.ink,
        accent: cs.getPropertyValue('--accent').trim() || colors.accent,
        teal: cs.getPropertyValue('--teal').trim() || colors.teal,
      };
      if (!running) draw(performance.now());
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      if (!running) draw(performance.now());
    }

    function draw(now) {
      const elapsed = now - t0;
      const wide = W > 900;
      // Centred behind the hero card and larger than it, so the room frames the glass.
      const cx = W * 0.5 * dpr;
      const cy = (wide ? H * 0.46 : H * 0.32) * dpr;
      const F = Math.min(W, H) * (wide ? 1.3 : 1.0) * dpr;

      scrollSmooth += (window.scrollY - scrollSmooth) * 0.08;
      ptr.sx += (ptr.x - ptr.sx) * 0.05;
      ptr.sy += (ptr.y - ptr.sy) * 0.05;

      const motion = reduced() ? 0 : 1;
      const az = -0.75 + motion * (elapsed * 0.000045 + scrollSmooth * 0.0007) + ptr.sx * 0.22;
      const el = Math.max(0.12, Math.min(0.75, 0.44 + ptr.sy * 0.08 - motion * scrollSmooth * 0.00008));
      const target = [0, 0.85, -0.2], r = 8.4;
      const eye = [target[0] + r * Math.cos(el) * Math.sin(az), target[1] + r * Math.sin(el), target[2] + r * Math.cos(el) * Math.cos(az)];
      const v = basis(eye, target);

      const project = (x, y, z) => {
        const d = [x - eye[0], y - eye[1], z - eye[2]];
        const zz = dot(d, v.f);
        if (zz < 0.5) return null;
        return [cx + (dot(d, v.r) * F) / zz, cy - (dot(d, v.u) * F) / zz, zz];
      };

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Points, drawn in two passes so fillStyle changes only twice.
      const intro = motion ? elapsed : 1e9;
      for (const pass of [0, 2]) {
        ctx.fillStyle = pass === 2 ? colors.accent : colors.ink;
        for (const p of pts) {
          if (p.g !== pass) continue;
          const k = Math.min(1, Math.max(0, (intro - p.delay) / 900));
          if (k <= 0) continue;
          const e = 1 - Math.pow(1 - k, 3);
          const s = project(p.x, p.y + (1 - e) * 0.4, p.z);
          if (!s) continue;
          const fog = Math.max(0.22, Math.min(1, 1.35 - (s[2] - 5.5) / 6));
          const size = Math.max(1, Math.min(3.2, 17 / s[2])) * dpr;
          ctx.globalAlpha = e * fog * (pass === 2 ? 0.9 : 0.42);
          ctx.fillRect(s[0] - size / 2, s[1] - size / 2, size, size);
        }
      }

      // Camera frusta appear once the scan has passed.
      const fk = Math.min(1, Math.max(0, (intro - 1100) / 700));
      if (fk > 0) {
        ctx.globalAlpha = 0.7 * fk;
        ctx.strokeStyle = colors.teal;
        ctx.fillStyle = colors.teal;
        ctx.lineWidth = 1.1 * dpr;
        ctx.lineJoin = 'round';
        for (const fr of frusta) {
          const a = project(...fr.apex);
          const c = fr.corners.map((q) => project(...q));
          if (!a || c.some((q) => !q)) continue;
          ctx.beginPath();
          for (const q of c) { ctx.moveTo(a[0], a[1]); ctx.lineTo(q[0], q[1]); }
          ctx.moveTo(c[0][0], c[0][1]);
          for (let i = 1; i <= 4; i++) ctx.lineTo(c[i % 4][0], c[i % 4][1]);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(a[0], a[1], 2.6 * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    function frame(now) {
      draw(now);
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (running || reduced()) { draw(performance.now()); return; }
      running = true;
      raf = requestAnimationFrame(frame);
    }
    function stop() { running = false; cancelAnimationFrame(raf); }

    window.addEventListener('pointermove', (e) => {
      ptr.x = (e.clientX / window.innerWidth - 0.5) * 2;
      ptr.y = (e.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });
    window.addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
    reduceMotionQuery.addEventListener('change', () => { stop(); start(); });

    return {
      boot() { t0 = performance.now(); resize(); refreshColors(); start(); },
      refreshColors,
    };
  })();

  /* ======================================================================
     Dock: scroll spy with a sliding lens
     ====================================================================== */
  const dockBar = $('.dock-bar');
  const lens = $('.lens');
  const spyLinks = $$('.dock-link[data-spy]');
  let activeLink = spyLinks[0];

  function moveLens(link) {
    if (!dockBar || !link) return;
    dockBar.style.setProperty('--lx', `${link.offsetLeft}px`);
    dockBar.style.setProperty('--lw', `${link.offsetWidth}px`);
    dockBar.style.setProperty('--lo', '1');
  }
  function setActive(link) {
    activeLink = link;
    spyLinks.forEach((l) => (l === link ? l.setAttribute('aria-current', 'true') : l.removeAttribute('aria-current')));
    moveLens(link);
  }
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const link = spyLinks.find((l) => l.dataset.spy === entry.target.id);
        if (link) setActive(link);
      }
    }, { rootMargin: '-40% 0px -55% 0px' });
    spyLinks.forEach((l) => { const s = document.getElementById(l.dataset.spy); if (s) io.observe(s); });
  }
  $$('.dock-link').forEach((l) => l.addEventListener('pointerenter', () => moveLens(l)));
  dockBar?.addEventListener('pointerleave', () => moveLens(activeLink));

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { root.classList.toggle('is-scrolled', window.scrollY > 24); ticking = false; });
  }, { passive: true });

  /* ======================================================================
     Glass sheen and card tilt (fine pointers only)
     ====================================================================== */
  if (finePointer) {
    for (const el of $$('[data-sheen], .pub')) {
      const tilt = el.classList.contains('pub');
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left, y = e.clientY - r.top;
        el.style.setProperty('--mx', `${x}px`);
        el.style.setProperty('--my', `${y}px`);
        el.style.setProperty('--sheen-on', '1');
        if (tilt && !reduced()) {
          el.style.setProperty('--ry', `${((x / r.width) - 0.5) * 7}deg`);
          el.style.setProperty('--rx', `${-((y / r.height) - 0.5) * 7}deg`);
        }
      });
      el.addEventListener('pointerleave', () => {
        el.style.setProperty('--sheen-on', '0');
        el.style.setProperty('--rx', '0deg');
        el.style.setProperty('--ry', '0deg');
      });
    }
  }

  /* ======================================================================
     Segmented controls (shared thumb logic + arrow-key navigation)
     ====================================================================== */
  function segmented(el, onChange) {
    const buttons = $$('button', el);
    const thumb = $('.thumb', el);
    const attr = el.getAttribute('role') === 'tablist' ? 'aria-selected' : 'aria-checked';
    const current = () => buttons.find((b) => b.getAttribute(attr) === 'true') || buttons[0];
    const place = (b) => {
      el.style.setProperty('--tx', `${b.offsetLeft - 4}px`);
      el.style.setProperty('--tw', `${b.offsetWidth}px`);
      thumb.style.left = '4px';
    };
    const select = (b, focus = false) => {
      if (b.getAttribute(attr) === 'true') return;
      buttons.forEach((x) => {
        const on = x === b;
        x.setAttribute(attr, String(on));
        x.tabIndex = on ? 0 : -1;
      });
      place(b);
      if (focus) b.focus();
      onChange(b.dataset.value);
    };
    buttons.forEach((b) => {
      b.tabIndex = b.getAttribute(attr) === 'true' ? 0 : -1;
      b.addEventListener('click', () => select(b));
    });
    el.addEventListener('keydown', (e) => {
      const i = buttons.indexOf(document.activeElement);
      if (i < 0) return;
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!step) return;
      e.preventDefault();
      select(buttons[(i + step + buttons.length) % buttons.length], true);
    });
    // Place without animating the first time and whenever layout changes.
    const settle = () => {
      thumb.style.transition = 'none';
      place(current());
      thumb.getBoundingClientRect();
      thumb.style.transition = '';
    };
    return settle;
  }

  /* ======================================================================
     Publications carousel
     ====================================================================== */
  const list = $('#pubs');
  const pager = $('.pager');
  const trackEl = $('.track');
  const cards = $$('.pub', list);

  const stepSize = () => {
    const visible = cards.filter((c) => !c.hidden);
    return visible.length > 1 ? visible[1].offsetLeft - visible[0].offsetLeft : list.clientWidth;
  };
  function updatePager() {
    const max = list.scrollWidth - list.clientWidth;
    const [prev, next] = $$('button', pager);
    prev.disabled = list.scrollLeft <= 2;
    next.disabled = list.scrollLeft >= max - 2;
    pager.hidden = max <= 2;
    trackEl.style.visibility = max <= 2 ? 'hidden' : '';
    const ratio = list.clientWidth / list.scrollWidth;
    const tw = Math.max(18, 120 * ratio);
    trackEl.style.setProperty('--tw', `${tw}px`);
    trackEl.style.setProperty('--tx', `${max > 0 ? (list.scrollLeft / max) * (120 - tw) : 0}px`);
  }
  $$('button', pager).forEach((b) => b.addEventListener('click', () => {
    list.scrollBy({ left: stepSize() * Number(b.dataset.step), behavior: reduced() ? 'auto' : 'smooth' });
  }));
  list.addEventListener('scroll', updatePager, { passive: true });
  new ResizeObserver(updatePager).observe(list);
  list.addEventListener('keydown', (e) => {
    if (e.target !== list) return;
    const dir = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!dir) return;
    e.preventDefault();
    list.scrollBy({ left: stepSize() * dir, behavior: reduced() ? 'auto' : 'smooth' });
  });

  // Mouse drag with momentum; touch and trackpads keep native scrolling.
  (() => {
    let down = false, dragging = false, startX = 0, startLeft = 0, lastX = 0, lastT = 0, vel = 0;
    list.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest('.pub-links')) return;
      down = true; dragging = false;
      startX = lastX = e.clientX; startLeft = list.scrollLeft; lastT = performance.now(); vel = 0;
    });
    list.addEventListener('pointermove', (e) => {
      if (!down) return;
      const dx = e.clientX - startX;
      if (!dragging && Math.abs(dx) > 5) {
        dragging = true;
        list.classList.add('is-dragging');
        list.setPointerCapture(e.pointerId);
      }
      if (!dragging) return;
      const now = performance.now();
      vel = 0.8 * vel + 0.2 * ((e.clientX - lastX) / Math.max(1, now - lastT));
      lastX = e.clientX; lastT = now;
      list.scrollLeft = startLeft - dx;
    });
    const end = () => {
      if (!down) return;
      down = false;
      if (!dragging) return;
      const step = stepSize();
      const projected = list.scrollLeft - vel * 260;
      const target = Math.round(projected / step) * step;
      list.classList.remove('is-dragging');
      list.scrollTo({ left: target, behavior: reduced() ? 'auto' : 'smooth' });
      // Swallow the click that ends a drag.
      list.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); }, { capture: true, once: true });
      setTimeout(() => { dragging = false; }, 0);
    };
    list.addEventListener('pointerup', end);
    list.addEventListener('pointercancel', end);
  })();

  // Filter: All / First author, morphing the reflow with a view transition.
  const settleFilter = segmented($('[data-segmented="filter"]'), (value) => {
    const visible = cards.filter((c) => !c.hidden);
    visible.forEach((c, i) => { c.style.viewTransitionName = `pub-${i}`; });
    cards.forEach((c, i) => { c.dataset.vt = `pub-${i}`; });
    transition(() => {
      cards.forEach((c) => {
        c.hidden = value === 'first' && c.dataset.first !== 'true';
        c.style.viewTransitionName = c.hidden ? '' : c.dataset.vt;
      });
      list.scrollLeft = 0;
      updatePager();
    }).finally(() => cards.forEach((c) => { c.style.viewTransitionName = ''; }));
  });


  /* ======================================================================
     Publication sheet: shared-element morph from card figure to sheet
     ====================================================================== */
  const sheet = $('#sheet');
  const panel = $('.sheet-panel', sheet);
  const sheetPlate = $('.sheet-plate', sheet);
  const sheetImg = $('img', sheetPlate);
  let lastCard = null;

  function fill(card) {
    const img = $('.plate img', card);
    sheetImg.src = img.currentSrc || img.src;
    sheetImg.alt = img.alt;
    const venue = $('.venue', card);
    const sv = $('.venue', sheet);
    sv.textContent = venue.textContent;
    sv.className = venue.className;
    const t = $('time', card);
    const st = $('time', sheet);
    st.textContent = t.textContent;
    st.dateTime = t.dateTime;
    $('#sheet-title').textContent = $('.pub-open', card).textContent;
    $('.authors', sheet).innerHTML = $('.authors', card).innerHTML;
    for (const kind of ['paper', 'pdf']) {
      $(`.sheet-actions [data-kind="${kind}"]`, sheet).href = $(`.pub-links [data-kind="${kind}"]`, card).href;
    }
  }

  function lockScroll(on) { root.style.overflow = on ? 'hidden' : ''; }

  async function openSheet(card) {
    lastCard = card;
    fill(card);
    try { await sheetImg.decode(); } catch (_) { /* render anyway */ }
    const cardPlate = $('.plate', card);
    cardPlate.style.viewTransitionName = 'figure';
    await transition(() => {
      cardPlate.style.viewTransitionName = '';
      sheetPlate.style.viewTransitionName = 'figure';
      panel.style.setProperty('--drag', '0px');
      sheet.showModal();
      lockScroll(true);
    });
  }

  function closeSheet({ animate = true } = {}) {
    if (!sheet.open) return;
    const cardPlate = lastCard && $('.plate', lastCard);
    const r = cardPlate?.getBoundingClientRect();
    const onScreen = r && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight;
    transition(() => {
      sheet.close();
      lockScroll(false);
      sheetPlate.style.viewTransitionName = '';
      if (onScreen) cardPlate.style.viewTransitionName = 'figure';
    }, { skip: !animate }).finally(() => {
      if (cardPlate) cardPlate.style.viewTransitionName = '';
      panel.style.setProperty('--drag', '0px');
      panel.style.transition = '';
      $('.pub-open', lastCard)?.focus({ preventScroll: true });
    });
  }

  $$('.pub-open').forEach((b) => b.addEventListener('click', () => openSheet(b.closest('.pub'))));
  $('.sheet-close', sheet).addEventListener('click', () => closeSheet());
  sheet.addEventListener('cancel', (e) => { e.preventDefault(); closeSheet(); });
  sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });

  // Swipe down to dismiss (touch), from the grabber or the figure.
  (() => {
    let y0 = 0, t0 = 0, dy = 0, active = false;
    const handles = [$('.grabber', sheet), sheetPlate];
    const onDown = (e) => {
      if (e.pointerType === 'mouse') return;
      active = true; y0 = e.clientY; t0 = performance.now(); dy = 0;
      panel.style.transition = 'none';
      e.currentTarget.setPointerCapture(e.pointerId);
    };
    const onMove = (e) => {
      if (!active) return;
      const raw = e.clientY - y0;
      dy = raw > 0 ? raw : raw / 4; // rubber-band upwards
      panel.style.setProperty('--drag', `${dy}px`);
    };
    const onUp = () => {
      if (!active) return;
      active = false;
      const v = dy / Math.max(1, performance.now() - t0);
      panel.style.transition = 'transform .45s var(--spring)';
      if (dy > 110 || v > 0.6) {
        panel.style.transition = 'transform .28s cubic-bezier(.4,0,1,1)';
        panel.style.setProperty('--drag', `${panel.offsetHeight + 40}px`);
        setTimeout(() => closeSheet({ animate: false }), 260);
      } else {
        panel.style.setProperty('--drag', '0px');
      }
    };
    for (const h of handles) {
      h.addEventListener('pointerdown', onDown);
      h.addEventListener('pointermove', onMove);
      h.addEventListener('pointerup', onUp);
      h.addEventListener('pointercancel', onUp);
    }
  })();

  /* ======================================================================
     Boot: one orchestrated entrance once fonts are ready
     ====================================================================== */
  const syncScrollbar = () => root.style.setProperty('--sbw', `${window.innerWidth - root.clientWidth}px`);
  const settleAll = () => { syncScrollbar(); settleFilter(); moveLens(activeLink); updatePager(); };
  window.addEventListener('resize', settleAll, { passive: true });

  const fontsReady = document.fonts?.ready ?? Promise.resolve();
  Promise.race([fontsReady, new Promise((r) => setTimeout(r, 700))]).then(() => {
    syncTheme();
    settleAll();
    requestAnimationFrame(() => {
      root.classList.add('is-ready');
      cloud?.boot();
      setTimeout(() => { root.classList.add('intro-done'); settleAll(); }, 1800);
    });
  });
})();
