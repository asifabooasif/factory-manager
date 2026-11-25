/* SENTINEL - the unified factory agent (look and feel)
   - A living orb (Siri-style) that breathes while idle, swirls fast while it analyses, glows amber/red when something needs you.
   - A status pill with sound-wave bars that says what it is doing; pop-up notices that grow out of the orb with a soft chime.
   - One panel: Do now (step-by-step instructions) - Insights (setup progress, daily rhythm) - Ask - Controls.
   - The orb, the Guardian chip and the AI Assistant button can each be shown or hidden and dragged anywhere; they remember where you put them. */
(E => {
  'use strict';
  const SN = E.sentinel; if (!SN) return;
  const ls = { get: (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } } };
  const DEF = { orb: true, gd: false, ai: false, sound: true, motion: true, pop: true, auto: true, every: 2, eod: '17:30', pos: {} };
  const cfg = SN.cfg = Object.assign({}, DEF, ls.get('erp_sn_cfg', {}));
  const save = () => ls.set('erp_sn_cfg', cfg);
  const esc = s => E.esc(String(s == null ? '' : s));
  const $ = id => document.getElementById(id);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const calm = () => !!(!cfg.motion || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches));
  const ui = { tab: 'now', open: false, chat: [], seen: {}, queue: [], showing: null, state: 'idle', first: false };
  SN.ui = ui;

  /* ───────────────────────── styles ───────────────────────── */
  const css = document.createElement('style');
  css.textContent = `
.sn-orb{position:fixed;width:60px;height:60px;z-index:99990;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;border-radius:50%;--spd:1;--sn-a:#7c5cff;--sn-b:#19d3ff;--sn-c:#c04dff;transition:left .4s cubic-bezier(.2,1.25,.35,1),top .4s cubic-bezier(.2,1.25,.35,1),transform .2s}
.sn-orb.sn-grab{cursor:grabbing;transition:none;transform:scale(1.1)}.sn-orb.sn-hide{display:none}
.sn-orb[data-state=think],.sn-ph .mini[data-state=think]{--sn-a:#00e0ff;--sn-b:#7c5cff;--sn-c:#ff4fd8;--spd:.2}.sn-orb[data-state=ok],.sn-ph .mini[data-state=ok]{--sn-a:#22e39b;--sn-b:#19d3ff;--sn-c:#a3ff6b;--spd:.55}
.sn-orb[data-state=warn],.sn-ph .mini[data-state=warn]{--sn-a:#ffb020;--sn-b:#ff6a3d;--sn-c:#ffd86b;--spd:.8}.sn-orb[data-state=alert],.sn-ph .mini[data-state=alert]{--sn-a:#ff3d5a;--sn-b:#ff7a3d;--sn-c:#ff4fd8;--spd:.45}
.sn-glow{position:absolute;inset:-16px;border-radius:50%;background:radial-gradient(circle,var(--sn-a),transparent 66%);filter:blur(12px);opacity:.5;pointer-events:none;animation:snBreath calc(4s*var(--spd)) ease-in-out infinite}
.sn-body{position:absolute;inset:0;border-radius:50%;overflow:hidden;background:radial-gradient(circle at 30% 25%,#2b2260,#0a0720 72%);box-shadow:inset 0 0 14px rgba(255,255,255,.22),0 8px 26px rgba(20,10,60,.45),0 0 0 1px rgba(255,255,255,.2)}
.sn-blob{position:absolute;width:74%;height:74%;border-radius:50%;filter:blur(8px);mix-blend-mode:screen;will-change:transform}
.sn-b1{background:var(--sn-a);left:-8%;top:-8%;animation:snO1 calc(7s*var(--spd)) ease-in-out infinite}
.sn-b2{background:var(--sn-b);right:-10%;top:8%;animation:snO2 calc(9s*var(--spd)) ease-in-out infinite}
.sn-b3{background:var(--sn-c);left:12%;bottom:-16%;animation:snO3 calc(8s*var(--spd)) ease-in-out infinite}
.sn-shine{position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 32% 22%,rgba(255,255,255,.55),transparent 38%);pointer-events:none}
.sn-glyph{position:absolute;inset:0;display:grid;place-items:center;color:#fff;font-size:20px;text-shadow:0 0 10px rgba(255,255,255,.85);animation:snGlyph 3.2s ease-in-out infinite}
.sn-ring{position:absolute;inset:0;border-radius:50%;border:2px solid var(--sn-a);opacity:0;pointer-events:none}
.sn-orb[data-state=think] .sn-ring,.sn-orb[data-state=alert] .sn-ring{animation:snRing 1.6s ease-out infinite}.sn-ring.r2{animation-delay:.8s!important}
.sn-badge{position:absolute;right:-5px;top:-5px;min-width:21px;height:21px;padding:0 5px;border-radius:11px;background:#ff3d5a;color:#fff;font:700 11px/21px system-ui,sans-serif;text-align:center;box-shadow:0 2px 8px rgba(255,61,90,.6);transform:scale(0);transition:transform .3s cubic-bezier(.2,1.7,.4,1)}.sn-badge.on{transform:scale(1)}
@keyframes snO1{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(60%,18%) scale(1.2)}66%{transform:translate(25%,60%) scale(.85)}}
@keyframes snO2{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(-55%,25%) scale(.9)}66%{transform:translate(-20%,-30%) scale(1.25)}}
@keyframes snO3{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(40%,-45%) scale(1.15)}66%{transform:translate(-45%,-25%) scale(.9)}}
@keyframes snBreath{0%,100%{transform:scale(.9);opacity:.35}50%{transform:scale(1.18);opacity:.75}}
@keyframes snGlyph{0%,100%{transform:scale(1) rotate(0)}50%{transform:scale(1.14) rotate(12deg)}}
@keyframes snRing{0%{transform:scale(1);opacity:.75}100%{transform:scale(2.2);opacity:0}}
@keyframes snWave{0%,100%{transform:scaleY(.22)}50%{transform:scaleY(1)}}
@keyframes snPop{0%{transform:scale(.6);opacity:0}100%{transform:scale(1);opacity:1}}
.sn-pill{position:fixed;z-index:99989;display:flex;align-items:center;gap:10px;padding:8px 15px 8px 12px;border-radius:24px;background:rgba(16,10,40,.9);backdrop-filter:blur(14px) saturate(1.4);-webkit-backdrop-filter:blur(14px);color:#fff;font:600 12.5px system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.35),inset 0 0 0 1px rgba(255,255,255,.14);opacity:0;transform:scale(.6);pointer-events:none;transition:opacity .25s,transform .4s cubic-bezier(.2,1.5,.4,1);max-width:270px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sn-pill.on{opacity:1;transform:scale(1)}.sn-wave{display:flex;gap:2.5px;align-items:center;height:16px;flex:0 0 auto}
.sn-wave i{width:3px;height:100%;border-radius:2px;background:linear-gradient(#19d3ff,#c04dff);animation:snWave .9s ease-in-out infinite}.sn-wave i:nth-child(2){animation-delay:.12s}.sn-wave i:nth-child(3){animation-delay:.24s}.sn-wave i:nth-child(4){animation-delay:.36s}.sn-wave i:nth-child(5){animation-delay:.48s}
.sn-pill.rest .sn-wave i{animation:none;transform:scaleY(.3)}.sn-pill .t{overflow:hidden;text-overflow:ellipsis}
.sn-island{position:fixed;z-index:99991;width:350px;max-width:calc(100vw - 20px);background:rgba(18,11,44,.95);backdrop-filter:blur(18px) saturate(1.3);-webkit-backdrop-filter:blur(18px);color:#fff;border-radius:22px;padding:14px;box-shadow:0 18px 50px rgba(0,0,0,.5),inset 0 0 0 1px rgba(255,255,255,.14);transform:scale(.15);opacity:0;pointer-events:none;transition:transform .55s cubic-bezier(.2,1.35,.3,1),opacity .25s}
.sn-island.on{transform:scale(1);opacity:1;pointer-events:auto}.sn-island .hd{display:flex;gap:11px;align-items:flex-start}.sn-island .ic{flex:0 0 38px;height:38px;border-radius:12px;display:grid;place-items:center;font-size:19px;background:linear-gradient(135deg,#ff8a3d,#ff3d5a)}
.sn-island .ic.info{background:linear-gradient(135deg,#19d3ff,#7c5cff)}.sn-island .ic.warn{background:linear-gradient(135deg,#ffb020,#ff6a3d)}
.sn-island b{display:block;font-size:13.5px;line-height:1.35}.sn-island small{display:block;opacity:.72;font-size:11px;margin-bottom:3px;letter-spacing:.4px;text-transform:uppercase}
.sn-island p{margin:8px 0 0;font-size:12px;line-height:1.5;opacity:.88;max-height:78px;overflow:hidden}.sn-island .ac{display:flex;gap:8px;margin-top:11px}
.sn-b{border-radius:12px;padding:8px 13px;font:600 12.5px system-ui,sans-serif;cursor:pointer;border:0;background:rgba(255,255,255,.14);color:#fff}.sn-b:hover{background:rgba(255,255,255,.24)}.sn-b.p{background:linear-gradient(135deg,#7c5cff,#c04dff)}
.sn-panel{position:fixed;z-index:99992;width:410px;max-width:calc(100vw - 16px);height:min(660px,calc(100vh - 20px));background:var(--s,#fff);color:var(--t,#1a1533);border:1px solid var(--bd,#e5e1f0);border-radius:22px;box-shadow:0 28px 80px rgba(10,6,30,.5);display:flex;flex-direction:column;overflow:hidden;transform:scale(.25);opacity:0;pointer-events:none;transition:transform .5s cubic-bezier(.2,1.25,.3,1),opacity .2s}
.sn-panel.on{transform:scale(1);opacity:1;pointer-events:auto}
.sn-ph{padding:14px 16px;background:linear-gradient(135deg,#150b47,#3b1d8a 55%,#7c3aed);color:#fff;display:flex;gap:12px;align-items:center}.sn-ph .mini{--spd:.8;--sn-a:#7c5cff;--sn-b:#19d3ff;--sn-c:#c04dff;width:40px;height:40px;border-radius:50%;flex:0 0 40px;position:relative;overflow:hidden;background:#0a0720;box-shadow:0 0 0 1px rgba(255,255,255,.25)}
.sn-ph .mini .sn-blob{filter:blur(6px)}.sn-ph b{font-size:15px;display:block}.sn-ph small{opacity:.78;font-size:11.5px}.sn-ph .x{margin-left:auto;font-size:20px;opacity:.8;cursor:pointer;padding:4px 8px}
.sn-tabs{display:flex;border-bottom:1px solid var(--bd,#e5e1f0);background:var(--s2,#f6f4fb)}.sn-tabs a{flex:1;text-align:center;padding:10px 4px;font-size:12.5px;font-weight:600;color:var(--t3,#78718f);cursor:pointer;border-bottom:2px solid transparent}.sn-tabs a.on{color:var(--ac,#7c3aed);border-color:var(--ac,#7c3aed);background:var(--s,#fff)}
.sn-tabs em{font-style:normal;background:#ff3d5a;color:#fff;border-radius:9px;font-size:10px;padding:1px 6px;margin-left:4px}
.sn-bd{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:11px}
.sn-next{background:linear-gradient(135deg,#f5f0ff,#eef8ff);border:1px solid var(--bd,#e5e1f0);border-radius:16px;padding:12px 14px}[data-theme=dark] .sn-next{background:linear-gradient(135deg,#241548,#10263f)}
.sn-task{border:1px solid var(--bd,#e5e1f0);border-left-width:4px;border-radius:14px;padding:11px 13px;background:var(--s,#fff);animation:snPop .35s cubic-bezier(.2,1.4,.4,1) both}.sn-task.critical{border-left-color:#ff3d5a}.sn-task.warn{border-left-color:#ffb020}.sn-task.info{border-left-color:#19a7ff}.sn-task.z{opacity:.55}
.sn-task h5{font-size:13px;line-height:1.4;margin:0 0 4px}.sn-task .why{font-size:12px;color:var(--t2,#403a5c);line-height:1.5}.sn-task ol{margin:8px 0 0 18px;font-size:12px;color:var(--t2,#403a5c)}.sn-task ol li{margin:2px 0}
.sn-task .ac{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.sn-task .tag{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--t3,#78718f)}
.sn-k{border-radius:11px;padding:7px 12px;font:600 12px system-ui,sans-serif;cursor:pointer;border:1px solid var(--bd,#e5e1f0);background:var(--s2,#f6f4fb);color:var(--t,#1a1533)}.sn-k:hover{border-color:var(--ac,#7c3aed)}.sn-k.p{background:var(--ac,#7c3aed);color:#fff;border-color:transparent}
.sn-chk{display:flex;gap:8px;flex-wrap:wrap}.sn-chk span{font-size:11.5px;border-radius:12px;padding:4px 10px;background:var(--s2,#f6f4fb);border:1px solid var(--bd,#e5e1f0);cursor:pointer}.sn-chk span.ok{background:#dcfce7;color:#166534;border-color:#bbf7d0}.sn-chk span.no{background:#fff1e0;color:#9a4b00;border-color:#ffd9a8}
.sn-bar{height:7px;border-radius:4px;background:var(--s2,#f6f4fb);border:1px solid var(--bd,#e5e1f0);overflow:hidden}.sn-bar i{display:block;height:100%;background:linear-gradient(90deg,#7c5cff,#19d3ff);border-radius:4px;transition:width .8s cubic-bezier(.2,1,.3,1)}
.sn-row{display:flex;gap:10px;align-items:center;font-size:12.5px}.sn-row .g{flex:1}.sn-dot{display:inline-block;width:14px;height:14px;border-radius:50%;margin:1px}.sn-dot.ok{background:#22c55e}.sn-dot.gap{background:#ff3d5a;box-shadow:0 0 0 3px rgba(255,61,90,.2)}.sn-dot.none{background:var(--bd,#e5e1f0)}.sn-dot.off{background:transparent;border:1px dashed var(--bd,#e5e1f0)}.sn-dot.wait{background:#ffb020}
.sn-msg{max-width:92%;padding:9px 12px;border-radius:14px;font-size:12.5px;line-height:1.5;animation:snPop .3s both}.sn-msg.me{align-self:flex-end;background:var(--ac,#7c3aed);color:#fff;border-bottom-right-radius:4px}.sn-msg.ai{align-self:flex-start;background:var(--s2,#f6f4fb);border:1px solid var(--bd,#e5e1f0);border-bottom-left-radius:4px}
.sn-ask{display:flex;gap:8px;padding:10px 12px;border-top:1px solid var(--bd,#e5e1f0)}.sn-ask input{flex:1;border:1px solid var(--bd,#e5e1f0);border-radius:12px;padding:9px 12px;background:var(--s,#fff);font-size:13px}
.sn-sw{position:relative;display:inline-block;width:42px;height:24px;flex:0 0 42px}.sn-sw input{opacity:0;width:0;height:0}.sn-sw i{position:absolute;inset:0;border-radius:12px;background:var(--bd,#d6d1e6);transition:.25s;cursor:pointer}.sn-sw i:before{content:"";position:absolute;width:18px;height:18px;left:3px;top:3px;border-radius:50%;background:#fff;transition:.25s cubic-bezier(.2,1.5,.4,1);box-shadow:0 1px 4px rgba(0,0,0,.3)}.sn-sw input:checked+i{background:linear-gradient(135deg,#7c5cff,#19d3ff)}.sn-sw input:checked+i:before{transform:translateX(18px)}
.sn-cfg{display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--bd,#e5e1f0)}.sn-cfg .g{flex:1}.sn-cfg b{font-size:13px;display:block}.sn-cfg span{font-size:11.5px;color:var(--t3,#78718f)}
body.sn-no-gd #gdchip{display:none!important}body.sn-no-ai #ai-fab{display:none!important}
body.sn-calm .sn-blob,body.sn-calm .sn-glow,body.sn-calm .sn-ring,body.sn-calm .sn-wave i,body.sn-calm .sn-glyph{animation:none!important}
@media(max-width:600px){.sn-panel{left:8px!important;right:8px!important;width:auto!important;top:10px!important;height:calc(100vh - 20px)}}
@media print{.sn-orb,.sn-pill,.sn-island,.sn-panel{display:none!important}}`;
  document.head.appendChild(css);

  /* ───────────────────────── elements ───────────────────────── */
  let orb, pill, isl, pnl;
  function build() {
    if (orb) return;
    orb = document.createElement('div'); orb.id = 'sn-orb'; orb.className = 'sn-orb'; orb.dataset.state = 'idle'; orb.dataset.a = 'snOrb'; orb.title = 'Factory Agent - click to open, drag to move';
    orb.innerHTML = '<div class="sn-glow"></div><div class="sn-body"><i class="sn-blob sn-b1"></i><i class="sn-blob sn-b2"></i><i class="sn-blob sn-b3"></i><i class="sn-shine"></i><span class="sn-glyph">✦</span></div><i class="sn-ring"></i><i class="sn-ring r2"></i><b class="sn-badge"></b>';
    pill = document.createElement('div'); pill.id = 'sn-pill'; pill.className = 'sn-pill'; pill.innerHTML = '<span class="sn-wave"><i></i><i></i><i></i><i></i><i></i></span><span class="t"></span>';
    isl = document.createElement('div'); isl.id = 'sn-island'; isl.className = 'sn-island';
    pnl = document.createElement('div'); pnl.id = 'sn-panel'; pnl.className = 'sn-panel';
    [orb, pill, isl, pnl].forEach(x => document.body.appendChild(x));
    movable(orb, 'orb'); place(orb, 'orb', { right: 20, bottom: 96 });
    applyVis();
    window.addEventListener('resize', () => { ['orb', 'gd', 'ai'].forEach(k => { const el = elOf(k); if (el) applyPos(el, k); }); anchorAll(); });
  }
  const elOf = k => k === 'orb' ? orb : k === 'gd' ? $('gdchip') : $('ai-fab');

  /* ───────────────────────── moving things around ───────────────────────── */
  function setPos(el, x, y) { const w = el.offsetWidth || 60, h = el.offsetHeight || 60; x = Math.max(6, Math.min(innerWidth - w - 6, x)); y = Math.max(6, Math.min(innerHeight - h - 6, y)); el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.right = 'auto'; el.style.bottom = 'auto'; return [x, y]; }
  function applyPos(el, key) { const p = cfg.pos[key]; if (!p) return false; const w = el.offsetWidth || 60, h = el.offsetHeight || 60; setPos(el, p.fx * (innerWidth - w), p.fy * (innerHeight - h)); return true; }
  function place(el, key, dflt) { if (!applyPos(el, key) && dflt) { el.style.right = dflt.right + 'px'; el.style.bottom = dflt.bottom + 'px'; } }
  function remember(el, key) { const r = el.getBoundingClientRect(), w = innerWidth - r.width, h = innerHeight - r.height; cfg.pos[key] = { fx: w > 0 ? r.left / w : 0, fy: h > 0 ? r.top / h : 0 }; save(); }
  function movable(el, key) {
    if (el._snMov) return; el._snMov = 1; let id = null, sx = 0, sy = 0, ox = 0, oy = 0, drag = false;
    el.addEventListener('pointerdown', e => { if (e.button > 0) return; id = e.pointerId; sx = e.clientX; sy = e.clientY; const r = el.getBoundingClientRect(); ox = r.left; oy = r.top; drag = false; try { el.setPointerCapture(id); } catch (x) { } });
    el.addEventListener('pointermove', e => { if (id == null || e.pointerId !== id) return; const dx = e.clientX - sx, dy = e.clientY - sy; if (!drag && Math.hypot(dx, dy) > 6) { drag = true; el.classList.add('sn-grab'); el.style.transition = 'none'; hideFloaters(); } if (drag) { setPos(el, ox + dx, oy + dy); e.preventDefault(); } });
    const end = e => { if (id == null) return; try { el.releasePointerCapture(id); } catch (x) { } id = null; if (!drag) return; el.classList.remove('sn-grab'); el._snDragged = true; setTimeout(() => { el._snDragged = false; }, 350);
      const r = el.getBoundingClientRect(), left = r.left + r.width / 2 < innerWidth / 2; el.style.transition = 'left .4s cubic-bezier(.2,1.25,.35,1),top .4s cubic-bezier(.2,1.25,.35,1)'; setPos(el, left ? 10 : innerWidth - r.width - 10, r.top); setTimeout(() => { remember(el, key); el.style.transition = ''; anchorAll(); }, 420); };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    el.addEventListener('click', e => { if (el._snDragged) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
    el.addEventListener('dblclick', () => { delete cfg.pos[key]; save(); el.style.left = el.style.top = ''; if (key === 'orb') { el.style.right = '20px'; el.style.bottom = '96px'; } else if (key === 'gd') { el.style.left = '14px'; el.style.bottom = '14px'; el.style.top = 'auto'; } else { el.style.right = '20px'; el.style.bottom = '20px'; el.style.left = 'auto'; el.style.top = 'auto'; } anchorAll(); });
  }
  /* the Guardian chip and the AI button belong to other modules: wait for them, then make them movable too */
  setInterval(() => { [['gd', 'gdchip'], ['ai', 'ai-fab']].forEach(([k, id]) => { const el = $(id); if (el && !el._snMov) { movable(el, k); applyPos(el, k); } }); }, 1200);
  function applyVis() { const b = document.body; b.classList.toggle('sn-no-gd', !cfg.gd); b.classList.toggle('sn-no-ai', !cfg.ai); b.classList.toggle('sn-calm', calm()); if (orb) orb.classList.toggle('sn-hide', !cfg.orb || !E.fid); }

  /* pill / island / panel sit next to the orb, on whichever side has room */
  function anchor(el, w, h) {
    if (!orb) return; const r = orb.getBoundingClientRect(), right = r.left + r.width / 2 > innerWidth / 2, below = r.top + r.height / 2 < innerHeight / 2;
    let x = right ? r.left - w - 12 : r.right + 12, y = below ? r.top : r.bottom - h; if (x < 8) x = 8; if (x + w > innerWidth - 8) x = innerWidth - w - 8; y = Math.max(8, Math.min(innerHeight - h - 8, y));
    el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.transformOrigin = (right ? 'right ' : 'left ') + (below ? 'top' : 'bottom');
  }
  function anchorAll() { if (!pill) return; anchor(pill, pill.offsetWidth || 200, 36); if (isl.classList.contains('on')) anchor(isl, isl.offsetWidth || 350, isl.offsetHeight || 150); if (ui.open) anchor(pnl, pnl.offsetWidth || 410, pnl.offsetHeight || 600); }
  function hideFloaters() { pill && pill.classList.remove('on'); closeIsland(); }

  /* ───────────────────────── orb state, pill, sound ───────────────────────── */
  function setState(s) { ui.state = s; if (orb) orb.dataset.state = s; const m = pnl && pnl.querySelector('.mini'); if (m) m.dataset.state = s; }
  let pillTimer = null;
  function say(text, ms, rest) { if (!pill) return; pill.querySelector('.t').textContent = text; pill.classList.toggle('rest', !!rest); anchor(pill, Math.min(270, 60 + text.length * 7), 36); pill.classList.add('on'); clearTimeout(pillTimer); if (ms) pillTimer = setTimeout(() => pill.classList.remove('on'), ms); }
  let actx = null;
  function chime(kind) {
    if (!cfg.sound) return; try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); const t = actx.currentTime, n = kind === 'alert' ? [523, 392] : kind === 'ok' ? [660, 880] : [740, 988];
      n.forEach((f, i) => { const o = actx.createOscillator(), g = actx.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t + i * .12); g.gain.exponentialRampToValueAtTime(.09, t + i * .12 + .02); g.gain.exponentialRampToValueAtTime(.0001, t + i * .12 + .45); o.connect(g); g.connect(actx.destination); o.start(t + i * .12); o.stop(t + i * .12 + .5); }); } catch (e) { }
  }

  /* ───────────────────────── pop-up notices ───────────────────────── */
  function closeIsland() { if (isl) isl.classList.remove('on'); ui.showing = null; setTimeout(nextNotice, 450); }
  function nextNotice() { if (ui.showing || !ui.queue.length || ui.open || !cfg.pop || !cfg.orb) return; const t = ui.queue.shift(); if (!SN.live().some(x => x.id === t.id)) return nextNotice(); ui.showing = t.id;
    isl.innerHTML = `<div class="hd"><div class="ic ${t.sev}">${esc(t.icon)}</div><div><small>${esc(t.area)} · Factory Agent</small><b>${esc(t.title)}</b></div></div><p>${esc((t.why || '').slice(0, 220))}${(t.why || '').length > 220 ? '…' : ''}</p><div class="ac"><button class="sn-b p" data-a="snGo" data-id="${esc(t.id)}">${esc(t.act ? t.act.label : 'Open')}</button><button class="sn-b" data-a="snMore">Details</button><button class="sn-b" data-a="snLater" data-id="${esc(t.id)}">Later</button></div>`;
    anchor(isl, 350, 170); isl.classList.add('on'); chime(t.sev === 'critical' ? 'alert' : 'warn'); setState(t.sev === 'critical' ? 'alert' : 'warn');
    clearTimeout(ui.islT); if (t.sev !== 'critical') ui.islT = setTimeout(() => { if (ui.showing === t.id) closeIsland(); }, 12000); }
  function announce() {
    const day = E.today(), seen = ls.get('erp_sn_' + E.fid + '_seen', {}); let n = 0;
    SN.live().filter(t => t.sev !== 'info').forEach(t => { const k = t.id + '|' + day; if (seen[k]) return; seen[k] = 1; n++;
      try { if (E.notify && E.notify.addMessage) E.notify.addMessage({ id: 'sn:' + k, title: t.icon + ' ' + t.title, body: (t.steps && t.steps[0]) || t.why, route: 'guardian', level: t.sev === 'critical' ? 'critical' : 'warn', by: 'Factory Agent' }); if (t.sev === 'critical' && E.notify && E.notify.sys) E.notify.sys({ title: t.title, body: t.why, route: 'guardian', level: 'critical', tag: 'sn-' + t.id }); } catch (e) { }
      if (n <= 2) ui.queue.push(t); });
    Object.keys(seen).forEach(k => { if (k.split('|')[1] !== day) delete seen[k]; }); ls.set('erp_sn_' + E.fid + '_seen', seen); nextNotice();
  }

  /* ───────────────────────── the analysis cycle ───────────────────────── */
  const STEPS = ['Reading your ledger…', 'Checking today’s routine…', 'Comparing with your normal rhythm…', 'Preparing instructions…'];
  async function run(reason) {
    if (SN.state.busy || !E.fid) return; SN.state.busy = true; const loud = reason === 'manual' || reason === 'boot' || reason === 'change';
    try {
      let iv = null; if (loud && cfg.orb) { setState('think'); let i = 0; say(STEPS[0], 0); iv = setInterval(() => say(STEPS[++i % STEPS.length], 0), 520); }
      await sleep(loud && !calm() ? 1250 : 0); SN.analyze(); clearInterval(iv);
      const c = SN.state.counts, worst = c.critical ? 'alert' : c.warn ? 'warn' : 'idle', n = c.critical + c.warn + c.info;
      if (loud && cfg.orb) { if (!n || worst === 'idle') { setState('ok'); say(n ? n + ' small notice' + (n > 1 ? 's' : '') + ' for you' : 'All clear ✓', 3200, true); chime('ok'); setTimeout(() => setState('idle'), 2300); } else { setState(worst); say(n + (n === 1 ? ' thing needs' : ' things need') + ' you', 4200, true); } } else setState(worst);
      badge(); refresh(); if (cfg.orb) announce();
    } catch (e) { console.error('Sentinel', e); setState('idle'); } finally { SN.state.busy = false; }
  }
  function badge() { const b = orb && orb.querySelector('.sn-badge'); if (!b) return; const n = SN.state.counts ? SN.state.counts.critical + SN.state.counts.warn : 0; b.textContent = n; b.classList.toggle('on', n > 0); }
  let soonT = null; const soon = ms => { clearTimeout(soonT); soonT = setTimeout(() => run('quiet'), ms || 2500); };
  const _save = E.save, _post = E.post;
  E.save = async function () { const r = await _save.apply(this, arguments); if (cfg.auto) soon(2200); return r; };
  E.post = async function () { const r = await _post.apply(this, arguments); if (cfg.auto) soon(1800); return r; };
  window.addEventListener('hashchange', () => { if (cfg.auto && E.fid) soon(1500); });

  /* ───────────────────────── panel ───────────────────────── */
  const TABS = [['now', 'Do now'], ['ins', 'Insights'], ['ask', 'Ask'], ['cfg', 'Controls']];
  function taskHtml(t) {
    const act = t.act ? `<button class="sn-k p" data-a="snGo" data-id="${esc(t.id)}">${esc(t.act.label)} →</button>` : '', dc = t.decl ? `<button class="sn-k" data-a="snDecl" data-id="${esc(t.id)}">${esc(t.decl.label)}</button>` : '';
    return `<div class="sn-task ${t.sev}${t.snoozed ? ' z' : ''}"><div class="tag">${esc(t.area)} · ${t.src === 'guardian' ? 'Accounting Guardian' : 'Factory Agent'}</div><h5>${esc(t.icon)} ${esc(t.title)}</h5><div class="why">${esc(t.why)}</div>${t.steps && t.steps.length ? '<ol>' + t.steps.map(s => '<li>' + esc(s) + '</li>').join('') + '</ol>' : ''}<div class="ac">${act}${dc}${t.snoozed ? '' : `<button class="sn-k" data-a="snSnz" data-id="${esc(t.id)}">Snooze 1 day</button>`}</div></div>`;
  }
  function tabNow() {
    const S = SN.state, live = SN.live(), snz = S.tasks.filter(t => t.snoozed), td = S.stats ? S.stats.today : [];
    const top = live[0], head = top ? `<div class="sn-next"><div class="tag" style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--t3)">Do this next</div><b style="font-size:14px">${esc(top.icon)} ${esc(top.title)}</b><div style="margin-top:8px"><button class="sn-k p" data-a="snGo" data-id="${esc(top.id)}">${esc(top.act ? top.act.label : 'Open')} →</button></div></div>` : `<div class="sn-next"><b style="font-size:14px">✅ You’re on track</b><div class="why" style="font-size:12px;margin-top:4px;color:var(--t2)">Nothing needs you right now. I’m watching, and I’ll tell you the moment something looks off.</div></div>`;
    const today = `<div><div class="tag" style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--t3);margin-bottom:6px">Today</div><div class="sn-chk">${td.map(x => `<span class="${x.ok ? 'ok' : 'no'}" data-a="snNav" data-id="${esc(Array.isArray(x.route) ? x.route[0] : x.route)}" title="${esc(x.detail)}">${x.ok ? '✓' : '○'} ${esc(x.label)}: ${esc(x.detail)}</span>`).join('')}</div></div>`;
    return head + today + live.map(taskHtml).join('') + (snz.length ? `<div class="muted" style="font-size:11.5px">Snoozed until tomorrow: ${snz.length}</div>` + snz.map(taskHtml).join('') : '');
  }
  function tabIns() {
    const S = SN.state, r = S.ready, rh = S.rhythm, b = S.stats ? S.stats.base : null; if (!r || !rh) return '<p class="muted">Analysing…</p>';
    const steps = r.steps.map(s => `<div><div class="sn-row"><span class="g">${s.done ? '✅' : '⬜'} ${esc(s.label)}</span><span class="muted" style="font-size:11.5px">${Math.round(s.pct * 100)}%</span></div><div class="sn-bar"><i style="width:${Math.round(s.pct * 100)}%"></i></div><div class="muted" style="font-size:11.5px;margin:2px 0 6px">${esc(s.detail)}${s.done ? '' : ` · <a data-a="snNav" data-id="${esc(s.route)}" style="cursor:pointer;color:var(--ac)">open</a>`}</div></div>`).join('');
    const grid = `<div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:11px"><tr><td></td>${rh.days.map(d => `<td style="text-align:center;color:var(--t3);padding:0 1px">${d.slice(8)}</td>`).join('')}</tr>${rh.grid.map(g => `<tr><td style="padding-right:8px;white-space:nowrap">${esc(g.l)}</td>${g.cells.map(c => `<td title="${esc(c.d + ': ' + (c.st === 'ok' ? 'recorded' : c.st === 'gap' ? 'MISSING' : c.st === 'off' ? 'non-working day' : 'nothing'))}"><span class="sn-dot ${c.st}"></span></td>`).join('')}</tr>`).join('')}</table></div><div class="muted" style="font-size:11px;margin-top:6px"><span class="sn-dot ok"></span>recorded <span class="sn-dot gap"></span>missing <span class="sn-dot none"></span>nothing <span class="sn-dot off"></span>holiday</div>`;
    const g = E.guardian ? `<div class="sn-row"><span class="g">🛡️ Accounting Guardian health</span><b>${E.guardian.score()}/100</b></div>` : '';
    return `<div><div class="sn-row" style="margin-bottom:8px"><b class="g" style="font-size:14px">Start-up progress</b><b style="font-size:20px;color:var(--ac)">${r.score}%</b></div>${steps}</div><div><b style="font-size:14px">Last 14 days - what was recorded</b><div style="margin-top:8px">${grid}</div></div><div class="muted" style="font-size:12px">${b && b.expRate != null ? `🧠 Learned: you normally record expenses on <b>${Math.round(b.expRate * 100)}%</b> of working days (${b.expDays} of ${b.bizDays} in the last 60 days). I compare each new day with this.` : '🧠 I am still learning your rhythm - after about 2 weeks of daily use I will know what is normal for you.'}</div>${g}`;
  }
  function tabAsk() {
    const chips = ['What should I do next?', 'What is missing?', 'Today', 'Cash balance', 'Who owes us?', 'Profit this month'];
    const log = ui.chat.length ? ui.chat.map(m => m.me ? `<div class="sn-msg me">${esc(m.t)}</div>` : `<div class="sn-msg ai">${m.html}${(m.actions || []).length ? `<div class="ac" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${m.actions.map(a => `<button class="sn-k" data-a="snNav" data-id="${esc(a.route)}">${esc(a.label)}</button>`).join('')}</div>` : ''}</div>`).join('') : `<div class="sn-msg ai">Hi 👋 I know your ledger, stock, wages and daily routine. Ask me anything, or tap a question.</div>`;
    return `<div class="sn-chk">${chips.map(c => `<span data-a="snChip" data-id="${esc(c)}">${esc(c)}</span>`).join('')}</div>${log}${E.AI ? `<div><button class="sn-k" data-a="snAI">Open the full AI assistant (guided tours)</button></div>` : ''}`;
  }
  const sw = (k, l, d) => `<div class="sn-cfg"><div class="g"><b>${l}</b><span>${d}</span></div><label class="sn-sw"><input type="checkbox" data-sn="${k}" ${cfg[k] ? 'checked' : ''}><i></i></label></div>`;
  function tabCfg() {
    return `<div><b style="font-size:14px">Icons on screen</b><p class="muted" style="font-size:11.5px;margin:2px 0 4px">Drag any icon to move it - it snaps to the nearest edge and remembers its place. Double-click an icon to send it back home.</p>
      ${sw('orb', '✦ Factory Agent orb', 'The unified agent (Guardian + AI + daily intelligence)')}${sw('gd', '🛡️ Guardian chip', 'The separate health-score chip (already inside the orb)')}${sw('ai', '🤖 AI Assistant button', 'The separate chat and tours button (also available in the Ask tab)')}</div>
      <div><b style="font-size:14px">How I behave</b>${sw('pop', 'Pop-up notices', 'Notices that grow out of the orb when something needs you')}${sw('sound', 'Sound', 'A soft chime with each notice')}${sw('motion', 'Animations', 'Turn off for a calm, static orb (also follows your device’s reduce-motion setting)')}${sw('auto', 'Watch after every entry', 'Re-check a moment after anything is saved, and every few minutes')}
      <div class="sn-cfg"><div class="g"><b>End-of-day time</b><span>After this time I treat today as finished and ask about missing entries</span></div><input class="fs" type="time" data-sn="eod" value="${esc(cfg.eod)}" style="border:1px solid var(--bd);border-radius:9px;padding:5px 8px"></div>
      <div class="sn-cfg"><div class="g"><b>Check every</b><span>Minutes between automatic checks</span></div><select class="fs" data-sn="every" style="border:1px solid var(--bd);border-radius:9px;padding:5px 8px">${[1, 2, 5, 10].map(m => `<option value="${m}" ${+cfg.every === m ? 'selected' : ''}>${m} min</option>`).join('')}</select></div></div>
      <div class="ac" style="display:flex;gap:8px;flex-wrap:wrap"><button class="sn-k p" data-a="snRun">Check everything now</button><button class="sn-k" data-a="snResetPos">Reset icon positions</button></div>
      <div class="muted" style="font-size:11.5px;line-height:1.55">🔒 <b>What I will and will not do.</b> I watch your records, learn your normal routine, explain problems with real numbers and tell you exactly what to do next. I open the right screen for you. I never post accounting entries, pay anyone or change records by myself - you stay in control.</div>`;
  }
  function render() {
    const S = SN.state, c = S.counts || { critical: 0, warn: 0, info: 0 }, n = c.critical + c.warn;
    pnl.innerHTML = `<div class="sn-ph"><div class="mini" data-state="${ui.state}" style="--spd:.8"><i class="sn-blob sn-b1"></i><i class="sn-blob sn-b2"></i><i class="sn-blob sn-b3"></i><i class="sn-shine"></i></div><div><b>Factory Agent</b><small>${S.at ? (n ? n + ' need' + (n === 1 ? 's' : '') + ' your attention' : 'Watching - all on track') + ' · checked ' + new Date(S.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Starting…'}</small></div><span class="x" data-a="snClose">×</span></div>
      <div class="sn-tabs">${TABS.map(t => `<a data-a="snTab" data-id="${t[0]}" class="${ui.tab === t[0] ? 'on' : ''}">${t[1]}${t[0] === 'now' && n ? `<em>${n}</em>` : ''}</a>`).join('')}</div>
      <div class="sn-bd" id="sn-bd">${ui.tab === 'now' ? tabNow() : ui.tab === 'ins' ? tabIns() : ui.tab === 'ask' ? tabAsk() : tabCfg()}</div>
      ${ui.tab === 'ask' ? '<div class="sn-ask"><input id="sn-q" placeholder="Ask about your factory…" autocomplete="off"><button class="sn-k p" data-a="snAsk">Ask</button></div>' : ''}`;
  }
  function refresh() { if (ui.open && pnl) { const sc = $('sn-bd') ? $('sn-bd').scrollTop : 0; render(); if ($('sn-bd')) $('sn-bd').scrollTop = sc; } }
  function openPanel() { ui.open = true; hideFloaters(); render(); anchor(pnl, Math.min(410, innerWidth - 16), Math.min(660, innerHeight - 20)); pnl.classList.add('on'); if (!SN.state.at) run('manual'); }
  function closePanel() { ui.open = false; pnl.classList.remove('on'); setTimeout(nextNotice, 500); }

  /* ───────────────────────── navigation & actions ───────────────────────── */
  function nav(route) {
    if (!route) return; closePanel(); closeIsland();
    if (String(route).startsWith('rs:') && E.RS) { const [, id, item] = route.split(':'); E.RS.hist = []; E.RS.cur = ''; E.RS.open(id, item ? { item } : null, false); return; }
    if (route === '#ai') { E.AI && E.AI.open(); return; }
    SN.go(route);
  }
  const task = id => SN.state.tasks.find(t => t.id === id);
  E.A.snOrb = () => { if (orb._snDragged) return; ui.open ? closePanel() : openPanel(); };
  E.A.snClose = () => closePanel();
  E.A.snMore = () => { closeIsland(); ui.tab = 'now'; openPanel(); };
  E.A.snTab = t => { ui.tab = t; render(); };
  E.A.snGo = id => { const t = task(id); nav(t ? (t.act ? t.act.route : 'guardian') : id); };
  E.A.snNav = r => nav(r);
  E.A.snLater = id => { SN.snooze(id, 1); closeIsland(); SN.analyze(); badge(); refresh(); };
  E.A.snSnz = id => { SN.snooze(id, 1); SN.analyze(); badge(); refresh(); setState(SN.state.counts.critical ? 'alert' : SN.state.counts.warn ? 'warn' : 'idle'); };
  E.A.snDecl = async id => { const t = task(id); if (!t || !t.decl) return; await SN.declare(t.decl.key, t.decl.days, t.decl.items); run('manual'); E.toast && E.toast(t.decl.key === 'stockZero' ? 'Noted - those items are counted as having no stock' : 'Got it - I will not ask about those days again', 'success'); };
  E.A.snRun = () => run('manual');
  E.A.snResetPos = () => { cfg.pos = {}; save(); ['orb', 'gd', 'ai'].forEach(k => { const el = elOf(k); if (!el) return; el.style.left = el.style.top = el.style.right = el.style.bottom = ''; if (k === 'orb') { el.style.right = '20px'; el.style.bottom = '96px'; } else if (k === 'gd') { el.style.left = '14px'; el.style.bottom = '14px'; } else { el.style.right = '20px'; el.style.bottom = '20px'; } }); anchorAll(); E.toast && E.toast('Icons are back in their default places', 'success'); };
  E.A.snAI = () => { closePanel(); E.AI && E.AI.open(); };
  function ask(q) { q = String(q || '').trim(); if (!q) return; ui.chat.push({ me: true, t: q }); const a = SN.ask(q); ui.chat.push(a); ui.tab = 'ask'; render(); const b = $('sn-bd'); if (b) b.scrollTop = b.scrollHeight; if (a.auto) setTimeout(() => nav(a.auto), 700); }
  E.A.snAsk = () => { const i = $('sn-q'); ask(i ? i.value : ''); const j = $('sn-q'); if (j) { j.value = ''; j.focus(); } };
  E.A.snChip = t => ask(t);
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target && e.target.id === 'sn-q') E.A.snAsk(); if (e.key === 'Escape' && ui.open) closePanel(); });
  E.hooks.push(e => {
    const t = e.target; if (!t || !t.dataset || !t.dataset.sn) return; const k = t.dataset.sn, v = t.type === 'checkbox' ? t.checked : t.value;
    cfg[k] = k === 'every' ? +v : v; save(); SN.cfg = cfg; applyVis(); if (k === 'orb') { if (!v) { closePanel(); hideFloaters(); } else run('manual'); } if (k === 'gd' || k === 'ai') { const el = elOf(k); if (el && v) applyPos(el, k); } if (k === 'eod') soon(500);
  });
  document.addEventListener('click', e => { if (ui.open && pnl && !pnl.contains(e.target) && !(orb && orb.contains(e.target)) && !e.target.closest('[data-a^=sn]')) { /* keep the panel open while working elsewhere */ } });

  /* ───────────────────────── start ───────────────────────── */
  SN.show = () => { build(); applyVis(); };
  SN.run = run; SN.open = openPanel; SN.close = closePanel; SN.say = say; SN.setState = setState;
  let booted = false;
  setInterval(() => {
    if (!E.fid) { if (orb) applyVis(); booted = false; return; }
    if (!booted && E.rows('coa').length) { booted = true; build(); applyVis(); run('boot'); if (!ls.get('erp_sn_welcomed', 0)) { ls.set('erp_sn_welcomed', 1); setTimeout(() => say('Hi, I’m your factory agent. Drag me anywhere ✦', 6000, true), 4000); } }
    else if (booted && cfg.auto && Date.now() - (SN.state.at ? Date.parse(SN.state.at) : 0) > cfg.every * 60000) run('tick');
  }, 1000);
})(window.ERP);
