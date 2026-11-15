/* Sign-in screen look: a desk lamp you can switch on and off (click it or pull the cord).
   Switching it on plays a soft mains "hum" with the Web Audio API. The sign-in itself is unchanged (Google sign-in in js/core/sync.js).
   Everything is cosmetic: if this file fails to load, the normal sign-in card still works. */
(E => {
  const css = `
#gate{background:radial-gradient(ellipse at 50% 38%,#2b2216 0,#15110c 55%,#0c0a07 100%)!important;overflow:auto}
#gate .gc{background:linear-gradient(180deg,#232b27,#1b211e)!important;color:#efe9dc!important;border:1px solid rgba(255,214,150,.14);border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,.55),0 0 0 1px rgba(0,0,0,.4) inset!important;text-align:left;transition:filter .5s,box-shadow .5s}
#gate .gc h2{font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:30px;margin:2px 0 6px;color:#fff}
#gate .gc .muted,#gate .gc p{color:#aaa493}
#gate .gc .gl{text-align:center}
#gate .gc .gsp{border-color:#3a342a;border-top-color:#f5a623}
#gate .gc .btn{background:#2c3530;border-color:#3d4842;color:#efe9dc}
#gate .gc .btn:hover{background:#343e38}
#gate .gc .btn.p{background:#f5a623;border-color:#f5a623;color:#1c1300;font-weight:700;letter-spacing:.2px}
#gate .gc .btn.p:hover{background:#ffb83d}
#gate .gc .gbig{margin-top:18px;padding:13px 16px;border-radius:9px;transition:transform .15s,box-shadow .2s}
#gate .gc .gbig:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(245,166,35,.35)}
#gate .gc .gbig svg{background:#fff;border-radius:50%;padding:2px;box-sizing:content-box;vertical-align:-5px}
#gate .gc .gerr{color:#ff8a7a}
body:has(#gate[style*="display: flex"]) #ai-fab{display:none!important}
.lx-eyebrow{font-size:10px;letter-spacing:2.4px;color:#f5a623;font-weight:700;margin-bottom:4px}
.lx-sub{font-size:13px;line-height:1.55;margin:4px 0 0!important}
.lx-hint{margin-top:14px;font-size:11px;color:#77715f;text-align:center}
.lx{position:relative;display:flex;align-items:center;justify-content:center;gap:34px;width:100%;max-width:760px}
.lx .gc{position:relative;z-index:2;width:100%;max-width:380px}
.lx-lamp{position:relative;z-index:2;flex:0 0 190px;width:190px;height:290px;cursor:pointer;outline:none;-webkit-tap-highlight-color:transparent;user-select:none}
.lx-lamp:focus-visible{outline:2px dashed #f5a623;outline-offset:6px}
.lx-lamp svg{width:100%;height:100%;overflow:visible}
.lx-glow{position:fixed;inset:0;z-index:1;pointer-events:none;opacity:1;transition:opacity .55s ease;
  background:radial-gradient(ellipse 640px 540px at var(--x,30%) var(--y,40%),rgba(255,200,100,.42) 0,rgba(255,170,60,.15) 38%,rgba(255,150,40,.04) 68%,transparent 100%)}
.lx-beam{position:absolute;z-index:-1;left:0;top:0;width:520px;height:330px;pointer-events:none;opacity:1;transition:opacity .55s ease;filter:blur(9px);
  background:linear-gradient(90deg,rgba(255,214,140,.46),rgba(255,214,140,.10) 78%,transparent);clip-path:polygon(78px 92px,520px 0,520px 330px)}
.lx[data-on="0"] .lx-glow,.lx[data-on="0"] .lx-beam{opacity:0}
.lx[data-on="0"] .gc{filter:brightness(.55) saturate(.8);box-shadow:0 10px 30px rgba(0,0,0,.6)!important}
.lx[data-on="0"] .lx-bulb{fill:#4a4338;filter:none}
.lx[data-on="0"] .lx-rim{opacity:.15}
.lx-bulb{fill:#ffe2a0;filter:drop-shadow(0 0 8px #ffbf5a) drop-shadow(0 0 22px #ff9f1c);transition:fill .4s}
.lx-rim{opacity:1;transition:opacity .4s}
.lx-cord{transform-box:fill-box;transform-origin:50% 0;transition:transform .12s ease-out}
.lx-lamp.pull .lx-cord{transform:translateY(12px)}
.lx.flick .lx-glow,.lx.flick .lx-beam{animation:lxflick .42s steps(1,end)}
@keyframes lxflick{0%{opacity:0}18%{opacity:.9}30%{opacity:.25}48%{opacity:1}62%{opacity:.5}100%{opacity:1}}
@media (prefers-reduced-motion:reduce){.lx.flick .lx-glow,.lx.flick .lx-beam{animation:none}.lx-cord{transition:none}}
@media (max-width:720px){.lx{flex-direction:column;gap:0}.lx-lamp{flex:0 0 auto;width:114px;height:176px;margin-bottom:6px}.lx-lamp svg{width:190px;height:290px;transform:scale(.6);transform-origin:0 0}.lx-beam{display:none}.lx-glow{background:radial-gradient(ellipse 420px 380px at var(--x,50%) var(--y,20%),rgba(255,200,100,.40) 0,rgba(255,170,60,.14) 40%,rgba(255,150,40,.04) 70%,transparent 100%)}}
`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  const LAMP = `<svg viewBox="0 0 190 290" aria-hidden="true">
  <defs>
    <linearGradient id="lxShade" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a3a3c"/><stop offset=".55" stop-color="#1b1b1d"/><stop offset="1" stop-color="#0b0b0c"/></linearGradient>
    <linearGradient id="lxArm" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2a2a2c"/><stop offset="1" stop-color="#111"/></linearGradient>
    <radialGradient id="lxRim" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="#fff3cf"/><stop offset=".6" stop-color="#ffc766"/><stop offset="1" stop-color="#e58a10"/></radialGradient>
  </defs>
  <ellipse cx="62" cy="276" rx="48" ry="8" fill="#000" opacity=".55"/>
  <path d="M18 270c0-9 20-15 44-15s44 6 44 15c0 4-18 8-44 8s-44-4-44-8z" fill="#171717"/>
  <ellipse cx="62" cy="262" rx="42" ry="8" fill="#232325"/>
  <path d="M62 262 L92 170" stroke="url(#lxArm)" stroke-width="6" stroke-linecap="round"/>
  <path d="M92 170 L58 104" stroke="url(#lxArm)" stroke-width="6" stroke-linecap="round"/>
  <circle cx="92" cy="170" r="7" fill="#c9983f"/><circle cx="92" cy="170" r="3" fill="#6b4c12"/>
  <circle cx="62" cy="262" r="5" fill="#c9983f"/>
  <g transform="rotate(-24 70 96)">
    <path d="M22 96C22 52 50 26 78 26s56 26 56 70z" fill="url(#lxShade)"/>
    <path d="M30 80C38 50 58 36 78 34" stroke="#fff" stroke-opacity=".12" stroke-width="3" fill="none" stroke-linecap="round"/>
    <ellipse class="lx-rim" cx="78" cy="97" rx="56" ry="11" fill="url(#lxRim)"/>
    <ellipse cx="78" cy="97" rx="56" ry="11" fill="none" stroke="#0c0c0c" stroke-width="2"/>
    <circle class="lx-bulb" cx="78" cy="98" r="10"/>
  </g>
  <g class="lx-cord"><line x1="128" y1="116" x2="128" y2="160" stroke="#c9983f" stroke-width="2"/><circle cx="128" cy="165" r="6" fill="#d9a948"/><circle cx="126" cy="163" r="2" fill="#fff" opacity=".55"/></g>
</svg>`;

  /* soft mains hum — the same idea as the reel: a 120 Hz sine, quick fade-in, slow fade-out */
  let ctx = null;
  const audio = () => { try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); return ctx; } catch (e) { return null; } };
  const hum = on => {
    const c = audio(); if (!c) return;
    const now = c.currentTime;
    if (on) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(120, now + 0.05);
      g.gain.setValueAtTime(0.001, now); g.gain.linearRampToValueAtTime(0.06, now + 0.08); g.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      o.connect(g); g.connect(c.destination); o.start(now + 0.05); o.stop(now + 0.38);
    }
    /* a small switch click, for both on and off */
    const k = c.createOscillator(), kg = c.createGain();
    k.type = 'square'; k.frequency.setValueAtTime(on ? 1400 : 900, now);
    kg.gain.setValueAtTime(0.025, now); kg.gain.exponentialRampToValueAtTime(0.0005, now + 0.04);
    k.connect(kg); kg.connect(c.destination); k.start(now); k.stop(now + 0.05);
  };

  E.loginFx = {
    wrap: card => '<div class="lx" data-on="1"><div class="lx-glow"></div><div class="lx-lamp" role="button" tabindex="0" aria-label="Switch the lamp on or off" title="Click the lamp"><div class="lx-beam"></div>' + LAMP + '</div>' + card + '</div>',
    bind: g => {
      const lx = g.querySelector('.lx'), lamp = g.querySelector('.lx-lamp'), glow = g.querySelector('.lx-glow'); if (!lx || !lamp) return;
      /* centre the glow on the lamp shade (about 41% across and 33% down the lamp) */
      const place = () => { const r = lamp.getBoundingClientRect(); glow.style.setProperty('--x', (r.left + r.width * 0.41) + 'px'); glow.style.setProperty('--y', (r.top + r.height * 0.33) + 'px'); };
      place(); if (g.__lxPlace) window.removeEventListener('resize', g.__lxPlace); g.__lxPlace = place; window.addEventListener('resize', place);
      const toggle = () => {
        const on = lx.dataset.on !== '1'; lx.dataset.on = on ? '1' : '0';
        lamp.classList.add('pull'); setTimeout(() => lamp.classList.remove('pull'), 140);
        if (on) { lx.classList.remove('flick'); void lx.offsetWidth; lx.classList.add('flick'); }
        hum(on);
      };
      lamp.addEventListener('click', toggle);
      lamp.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    }
  };
})(window.ERP);
