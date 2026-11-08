import { Game } from './game.js';
import { Renderer } from './render.js';
import { UI } from './ui.js';
import { FX } from './fx.js';
import { Sfx } from './audio.js';

const canvas = document.getElementById('map');
const fx = new FX();
const sfx = new Sfx();
const ui = new UI();
const renderer = new Renderer(canvas);
const game = new Game(fx, sfx, ui);

ui.onUse = i => { wake(); game.act({ type: 'use', slot: i }); };

// ---------------------------------------------------------------- sizing

const fit = () => renderer.resize();
fit();
if (window.ResizeObserver) new ResizeObserver(fit).observe(canvas.parentElement);
window.addEventListener('resize', fit);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);

// ---------------------------------------------------------------- sound

let muted = false;
try { muted = localStorage.getItem('lanternfall.muted') === '1'; } catch (e) { /* no storage */ }
const paintSound = () => {
  ui.el.sound.setAttribute('aria-pressed', String(muted));
  ui.el.sound.textContent = muted ? 'muted' : 'sound';
};
paintSound();
function wake() {
  if (sfx.ready()) sfx.setMuted(muted);
}
ui.el.sound.addEventListener('click', () => {
  muted = !muted;
  wake();
  sfx.setMuted(muted);
  paintSound();
  try { localStorage.setItem('lanternfall.muted', muted ? '1' : '0'); } catch (e) { /* no storage */ }
});

// ---------------------------------------------------------------- run control

function startRun(seedText) {
  wake();
  ui.el.log.textContent = '';
  renderer.started = false;
  game.newRun(seedText);
  ui.setScreen(game);
  ui.renderInv(game);
  ui.refresh(game);
}

function resumeRun() {
  const data = Game.loadSave();
  if (!data) return;
  wake();
  renderer.started = false;
  if (game.restore(data)) {
    ui.redrawLog(game);
    game.log('You pick the lantern back up where you set it down.', 'warm');
    ui.setScreen(game);
    ui.renderInv(game);
    ui.refresh(game);
  }
}

document.getElementById('btn-new').addEventListener('click', () => startRun(ui.el.seed.value));
document.getElementById('btn-resume').addEventListener('click', resumeRun);
document.getElementById('btn-again').addEventListener('click', () => startRun(''));
document.getElementById('btn-same').addEventListener('click', () => startRun(game.seedText));
document.getElementById('btn-help').addEventListener('click', () => ui.showHelp(!ui.helpOpen));
document.getElementById('btn-close-help').addEventListener('click', () => ui.showHelp(false));
document.getElementById('btn-descend').addEventListener('click', () => { wake(); game.act({ type: 'descend' }); });
document.getElementById('btn-quit').addEventListener('click', () => {
  if (game.screen === 'play') game.die('abandoned the descent');
  else { game.screen = 'title'; }
  ui.setScreen(game);
});
ui.el.seed.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); startRun(ui.el.seed.value); }
});

// ---------------------------------------------------------------- input

const MOVES = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
  k: [0, -1], j: [0, 1], h: [-1, 0], l: [1, 0],
  q: [-1, -1], e: [1, -1], z: [-1, 1], c: [1, 1],
  y: [-1, -1], u: [1, -1], b: [-1, 1], n: [1, 1],
};

window.addEventListener('keydown', ev => {
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  if (ev.target && ev.target.tagName === 'INPUT') return;

  if (ev.key === '?' || ev.key === '/') { ev.preventDefault(); ui.showHelp(!ui.helpOpen); return; }
  if (ev.key === 'Escape') { ui.showHelp(false); return; }
  if (ev.key === 'm' || ev.key === 'M') { ui.el.sound.click(); return; }

  if (game.screen !== 'play') {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      if (game.screen === 'title') startRun(ui.el.seed.value); else startRun('');
    }
    return;
  }
  if (ui.helpOpen) { ui.showHelp(false); return; }

  const key = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
  if (MOVES[key]) {
    ev.preventDefault();
    wake();
    game.act({ type: 'move', dx: MOVES[key][0], dy: MOVES[key][1] });
    return;
  }
  if (key === ' ' || key === '.' || key === '5') {
    ev.preventDefault();
    wake();
    game.act({ type: 'wait' });
    return;
  }
  if (ev.key === '>' || key === 'g') {
    ev.preventDefault();
    wake();
    game.act({ type: 'descend' });
    return;
  }
  if (key >= '1' && key <= '9') {
    ev.preventDefault();
    wake();
    game.act({ type: 'use', slot: Number(key) - 1 });
  }
});

document.getElementById('pad').addEventListener('click', ev => {
  const btn = ev.target.closest('button');
  if (!btn || game.screen !== 'play') return;
  wake();
  if (btn.dataset.wait) game.act({ type: 'wait' });
  else game.act({ type: 'move', dx: Number(btn.dataset.dx), dy: Number(btn.dataset.dy) });
});

// ---------------------------------------------------------------- loop

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (game.player) {
    const k = 1 - Math.exp(-dt * 19);
    const all = [game.player, ...(game.entities || [])];
    for (const e of all) {
      e.ax += (e.x - e.ax) * k;
      e.ay += (e.y - e.ay) * k;
      if (Math.abs(e.x - e.ax) < 0.01) e.ax = e.x;
      if (Math.abs(e.y - e.ay) < 0.01) e.ay = e.y;
      if (e.lunge > 0) e.lunge = Math.max(0, e.lunge - dt * 6.5);
    }
  }
  fx.update(dt);
  renderer.draw(game, fx, dt);

  if (game.screen === 'dead' || game.screen === 'won') {
    if (!game.endShown) {
      game.endShown = true;
      setTimeout(() => ui.setScreen(game), 900);
    }
  } else {
    game.endShown = false;
  }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- boot

function boot(data) {
  ui.setScreen(game);
  if (data && data.save) {
    try {
      if (game.restore(data.save)) {
        ui.redrawLog(game);
        ui.setScreen(game);
        ui.renderInv(game);
        ui.refresh(game);
      }
    } catch (e) { /* stale snapshot; the title screen stands */ }
  }
  requestAnimationFrame(frame);
}

const hot = window.claude && window.claude.hot;
if (hot && hot.ready) hot.ready(boot);
else boot((hot && hot.data) || {});
if (hot && hot.snapshot) {
  hot.snapshot(() => ({ save: game.screen === 'play' ? game.serialize() : null }));
}
