import { CONSUMABLES, WEAPONS, ARMOUR, XP_STEPS, itemLook, DEPTH_NAMES } from './data.js';
import { Game } from './game.js';

const $ = id => document.getElementById(id);


export class UI {
  constructor() {
    this.el = {
      runTag: $('run-tag'),
      hpText: $('hp-text'), hpBar: $('hp-bar'),
      fuelText: $('fuel-text'), fuelBar: $('fuel-bar'),
      depth: $('s-depth'), level: $('s-level'), power: $('s-power'), def: $('s-def'),
      xpText: $('xp-text'), xpBar: $('xp-bar'), gear: $('gear'),
      inv: $('inv'), log: $('log'),
      veilTitle: $('veil-title'), veilOver: $('veil-over'), veilHelp: $('veil-help'),
      overTitle: $('over-title'), overKicker: $('over-kicker'), overBody: $('over-body'),
      tDepth: $('t-depth'), tKills: $('t-kills'), tTurns: $('t-turns'), tLevel: $('t-level'),
      bestLine: $('best-line'), overBest: $('over-best'),
      resume: $('btn-resume'), seed: $('seed'), sound: $('btn-sound'),
      netStatus: $('net-status'), joinCode: $('join-code'), coopBox: $('coop-box'),
      btnHost: $('btn-host'), btnJoin: $('btn-join'),
      waiting: $('waiting'), partner: $('partner'),
      pnName: $('pn-name'), pnDot: $('pn-dot'), pnHp: $('pn-hp'), pnHpBar: $('pn-hp-bar'),
      pnFuel: $('pn-fuel'), pnFuelBar: $('pn-fuel-bar'), pnNote: $('pn-note'),
    };
    this.onUse = () => {};
    this.lastInvKey = '';
  }

  pushMessage(m) {
    const p = document.createElement('p');
    if (m.cls && m.cls !== 'dim') p.className = m.cls;
    if (m.cls === 'dim') p.style.color = 'var(--bone-faint)';
    p.textContent = m.text;
    this.el.log.appendChild(p);
    while (this.el.log.children.length > 60) this.el.log.removeChild(this.el.log.firstChild);
    this.el.log.scrollTop = this.el.log.scrollHeight;
  }

  redrawLog(game) {
    this.el.log.textContent = '';
    for (const m of game.messages.slice(-40)) this.pushMessage(m);
  }

  refresh(game) {
    if (!game.player) return;
    const p = game.player;
    const hpRatio = Math.max(0, p.hp) / p.maxHp;
    this.el.hpText.textContent = `${Math.max(0, p.hp)} / ${p.maxHp}`;
    this.el.hpBar.style.width = (hpRatio * 100).toFixed(1) + '%';
    const fuelRatio = Math.max(0, p.fuel) / p.maxFuel;
    this.el.fuelText.textContent = `${Math.round(fuelRatio * 100)}% · light ${game.lightRadius()}`;
    this.el.fuelBar.style.width = (fuelRatio * 100).toFixed(1) + '%';
    this.el.depth.textContent = game.depth;
    this.el.level.textContent = p.level;
    this.el.power.textContent = game.playerPower();
    this.el.def.textContent = game.playerDef();

    const need = XP_STEPS[p.level] ?? p.xp;
    const prev = XP_STEPS[p.level - 1] ?? 0;
    this.el.xpText.textContent = p.level >= XP_STEPS.length - 1 ? `${p.xp}` : `${p.xp} / ${need}`;
    const span = Math.max(1, need - prev);
    this.el.xpBar.style.width = Math.max(0, Math.min(100, ((p.xp - prev) / span) * 100)).toFixed(1) + '%';

    const weapon = p.weapon ? WEAPONS.find(w => w.id === p.weapon) : null;
    const armour = p.armour ? ARMOUR.find(a => a.id === p.armour) : null;
    this.el.gear.innerHTML =
      `<div><span>hand</span><b>${weapon ? weapon.name : 'bare fists'}</b></div>` +
      `<div><span>worn</span><b>${armour ? armour.name : 'travel rags'}</b></div>` +
      `<div><span>lamp</span><b>${p.parts.length ? p.parts.length + ' part' + (p.parts.length > 1 ? 's' : '') + ' fitted' : 'plain tin lantern'}</b></div>`;

    const name = DEPTH_NAMES[Math.min(game.depth, DEPTH_NAMES.length - 1)] || 'the deep dark';
    this.el.runTag.textContent = `depth ${game.depth} · ${name} · seed ${game.seedText} · turn ${game.turns}`;

    this.refreshPartner(game);

    const key = game.inv.map(s => s.id + s.count).join('|');
    if (key !== this.lastInvKey) {
      this.lastInvKey = key;
      this.renderInv(game);
    }
  }

  refreshPartner(game) {
    const mate = game.players.find(q => q !== game.player);
    if (!game.coop || !mate) {
      this.el.partner.hidden = true;
      this.el.waiting.hidden = true;
      return;
    }
    this.el.partner.hidden = false;
    this.el.pnName.textContent = mate.name;
    this.el.pnHp.textContent = `${Math.max(0, mate.hp)} / ${mate.maxHp}`;
    this.el.pnHpBar.style.width = (Math.max(0, mate.hp) / mate.maxHp * 100).toFixed(1) + '%';
    const fuel = Math.max(0, mate.fuel) / mate.maxFuel;
    this.el.pnFuel.textContent = `${Math.round(fuel * 100)}% \u00b7 light ${game.lightRadius(mate)}`;
    this.el.pnFuelBar.style.width = (fuel * 100).toFixed(1) + '%';

    const dot = this.el.pnDot;
    dot.className = mate.dead || mate.absent ? 'gone' : (mate.downed ? 'down' : '');
    this.el.partner.classList.toggle('is-down', !!mate.downed);
    this.el.pnNote.textContent = mate.absent ? 'disconnected'
      : mate.dead ? 'gone'
        : mate.downed ? `bleeding out \u2014 ${mate.bleed} turns` : '';

    // whose move it is
    const pending = game.waitingFor() || [];
    const others = pending.filter(q => q !== game.player);
    if (game.screen !== 'play') this.el.waiting.hidden = true;
    else if (mate.downed && !mate.dead) {
      this.el.waiting.hidden = false;
      this.el.waiting.className = 'banner bad';
      this.el.waiting.textContent = `${mate.name} is down \u2014 ${mate.bleed} turns`;
    } else if (others.length) {
      this.el.waiting.hidden = false;
      this.el.waiting.className = 'banner';
      this.el.waiting.textContent = `waiting for ${others.map(q => q.name).join(' and ')}`;
    } else {
      this.el.waiting.hidden = true;
    }
  }

  setNet(text, tone = '') {
    this.el.netStatus.innerHTML = text || '';
    this.el.netStatus.className = 'net-status' + (tone ? ' ' + tone : '');
  }

  renderInv(game) {
    const list = this.el.inv;
    list.textContent = '';
    if (!game.inv.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'Nothing but lint.';
      list.appendChild(li);
      return;
    }
    game.inv.forEach((slot, i) => {
      const look = CONSUMABLES[slot.id] || itemLook(slot);
      const li = document.createElement('li');
      li.title = `${look.verb || 'use'} — press ${i + 1}`;
      li.innerHTML =
        `<span class="slot">${i + 1}</span>` +
        `<span class="glyph" style="color:${look.color}">${look.glyph}</span>` +
        `<span class="nm">${look.name}</span>` +
        `<span class="ct">${slot.count > 1 ? '×' + slot.count : ''}</span>`;
      li.addEventListener('click', () => this.onUse(i));
      list.appendChild(li);
    });
  }

  setScreen(game) {
    const s = game.screen;
    this.el.veilTitle.hidden = s !== 'title';
    this.el.veilOver.hidden = !(s === 'dead' || s === 'won');
    if (s === 'title') {
      const best = Game.best();
      this.el.bestLine.innerHTML = best
        ? `deepest descent <b>${best.depth}</b> · slain <b>${best.kills}</b>${best.won ? ' · <b>the Everflame burns again</b>' : ''}`
        : 'no one has carried the lantern down yet';
      this.el.resume.hidden = !Game.loadSave();
    }
    if (s === 'dead' || s === 'won') {
      const won = s === 'won';
      this.el.overTitle.textContent = won ? 'The Everflame catches' : 'The light goes out';
      this.el.overKicker.textContent = won
        ? 'depth eight · the dark falls back'
        : `${game.deathCause || 'lost in the dark'} on depth ${game.depth}`;
      this.el.overBody.textContent = won
        ? 'Light climbs the stairwell behind you, room by room, and the Sump remembers what it was. Your lantern is just a lantern again.'
        : 'The dark closes over the place where you stood. Somewhere below, the Everflame stays cold.';
      this.el.tDepth.textContent = game.depth;
      this.el.tKills.textContent = game.kills;
      this.el.tTurns.textContent = game.turns;
      this.el.tLevel.textContent = game.players.map(q => q.level).join(' / ');
      const best = Game.best();
      this.el.overBest.innerHTML = best ? `deepest descent so far <b>${best.depth}</b>` : '';
    }
  }

  showHelp(show) { this.el.veilHelp.hidden = !show; }

  get helpOpen() { return !this.el.veilHelp.hidden; }
}
