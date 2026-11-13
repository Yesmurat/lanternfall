import { Game } from './game.js';
import { Renderer } from './render.js';
import { UI } from './ui.js';
import { FX } from './fx.js';
import { Sfx } from './audio.js';
import { Net, HAS_RELAY, makeRoomCode } from './net.js';
import { BEATS, unlock } from './story.js';

const canvas   = document.getElementById('map');
const fx       = new FX();
const sfx      = new Sfx();
const ui       = new UI();
const renderer = new Renderer(canvas);

// ---------------------------------------------------------------- co-op plumbing
//
// Only the host simulates. Particles and sounds are side effects of that
// simulation, so the host records the ones it fires and ships them with the
// tick; the guest replays them and the run looks and sounds the same on both
// screens. The game itself knows nothing about any of this.

let mode      = 'solo';            // 'solo' | 'host' | 'guest'
let recording = false;
let lastDepth = 0;
const recFx   = [];
const recSfx  = [];

const gameFx = {
	clear: () => {

		fx.clear();

	},
	burst: (...a) => {

		fx.burst(...a);

		if (recording) {
			recFx.push(['burst', ...a]);
		}

	},
	float: (...a) => {

		fx.float(...a);

		if (recording) {
			recFx.push(['float', ...a]);
		}

	},
	tracer: (...a) => {

		fx.tracer(...a);

		if (recording) {
			recFx.push(['tracer', ...a]);
		}

	},
	shakeBy: (...a) => {

		fx.shakeBy(...a);

		if (recording) {
			recFx.push(['shakeBy', ...a]);
		}

	},
	flashBy: (...a) => {

		fx.flashBy(...a);

		if (recording) {
			recFx.push(['flashBy', ...a]);
		}

	},
};
const gameSfx = {
	play: (...a) => {

		sfx.play(...a);

		if (recording) {
			recSfx.push(a);
		}

	},
	ready: () => sfx.ready(),
	setMuted: m => sfx.setMuted(m),
};

const game = new Game(gameFx, gameSfx, ui);

function replayEffects(payload) {

	for (const call of payload.fx || []) {

		const [method, ...args] = call;

		if (typeof fx[method] === 'function') {
			fx[method](...args);
		}

	}

	for (const args of payload.sfx || []) {
		sfx.play(...args);
	}

}

function broadcast() {

	if (mode !== 'host' || !net.hasPeer) {
		return;
	}

	const payload = game.depth !== lastDepth ? game.netLevel() : game.netTick();

	lastDepth   = game.depth;
	payload.fx  = recFx.splice(0);
	payload.sfx = recSfx.splice(0);
	net.send(payload);

}

// The game only marks an inscription as read. Turning that into a page and a
// journal entry happens here, on each player's own screen, so it works the same
// for a solo run, a host and a guest: all three end up holding the same items.

//
// `quiet` is for picking a run back up (a resumed save, a guest rejoining): what
// was read before the break is noted without being announced a second time.

const shownBeats = new Set();      // seed + floor of each inscription this screen has already dealt with

function checkStory(quiet = false) {

	for (const item of game.items) {

		const key = `${game.seedText}#${item.beat}`;

		if (item.type !== 'inscription' || !item.read || shownBeats.has(key)) {
			continue;
		}

		shownBeats.add(key);

		const beat  = BEATS[item.beat];
		const fresh = beat && unlock(item.beat);

		if (!beat || quiet) {
			continue;
		}

		if (fresh) {
			ui.showBeat(item.beat);
		}

		else {
			ui.pushMessage({ text: `You have read this one before: “${beat.title}”. It is in your journal.`, cls: 'dim' });
		}

	}

	if (game.screen === 'won') {
		unlock('epilogue');
	}

}

// every action in the game funnels through here

function submit(action) {

	wake();

	if (game.screen !== 'play' || ui.beatOpen || ui.journalOpen) {
		return;
	}

	if (mode === 'guest') {
		net.send({ t: 'intent', action }); return;
	}

	game.act(action, 0);
	broadcast();
	checkStory();

}

const net = new Net({
	welcome(msg) {

		// whoever reaches an empty room first runs the game, however they got here
		if (msg.host && mode === 'guest') {
			mode      = 'host';
			recording = true;
			ui.setNet(`Nobody here yet — you are hosting room <b>${net.code}</b>`, 'warn');
		}

		else if (!msg.host && mode === 'host') {
			mode      = 'guest';
			recording = false;
			ui.setNet('Someone is already hosting that room — joining them.', 'warn');
		}

	},

	join() {

		if (mode !== 'host') {
			return;
		}

		if (game.screen === 'play' && game.coop) {

			const mate = game.players[1];

			if (mate) {
				mate.absent = false;
			}

			const level = game.netLevel();

			level.fx = []; level.sfx = [];
			net.send(level);
			game.log('Your partner is back.', 'good');
			ui.refresh(game);

		}

		else {
			startCoop();
		}

	},

	leave() {

		if (mode === 'host') {

			const mate = game.players[1];

			if (mate && !mate.dead) {
				mate.absent = true;
				mate.acted  = false;
				game.log(`${mate.name} has dropped out of the dark.`, 'bad');
				ui.refresh(game);
			}

		}

		else if (mode === 'guest') {
			ui.setNet('The host left. The run is over.', 'bad');
			game.screen = 'title';
			ui.setScreen(game);
		}

	},

	message(msg) {

		if (msg.t === 'intent' && mode === 'host') {
			game.act(msg.action, 1);
			broadcast();
			return;
		}

		if (msg.t === 'level' && mode === 'guest') {
			ui.el.log.textContent = '';
			renderer.started      = false;
			game.applyLevel(msg, net.slot);
			replayEffects(msg);
			ui.redrawLog(game);
			ui.setScreen(game);
			ui.renderInv(game);
			ui.refresh(game);
			checkStory(true);
			return;
		}

		if (msg.t === 'tick' && mode === 'guest') {

			game.applyTick(msg);
			replayEffects(msg);
			ui.refresh(game);
			checkStory();

			if (game.screen !== 'play') {
				ui.setScreen(game);
			}

		}

	},

	status(state, detail) {

		switch (state) {

			case 'connecting': {

				ui.setNet('Reaching the relay…');
				break;

			}

			case 'waiting': {

				ui.setNet(mode === 'host'
					? `Room code <b>${net.code}</b><br>Send it to your friend and keep this page open.`
					: 'Connected. Waiting for the host to start…', 'warn');
				break;

			}

			case 'ready': {

				ui.setNet('Partner connected.');
				break;

			}

			case 'full': {

				ui.setNet('That room already has two players in it.', 'bad');
				break;

			}

			case 'bad-code': {

				ui.setNet('Room codes are letters and numbers only.', 'bad');
				break;

			}

			case 'no-relay': {

				ui.setNet('No relay is configured. Deploy <b>server/</b> and set RELAY_URL in src/net-config.js.', 'bad');
				break;

			}

			case 'failed': {

				ui.setNet(`Could not reach the relay${detail ? ' — ' + detail : ''}.`, 'bad');
				break;

			}

			case 'closed': {

				if (mode !== 'solo') {
					ui.setNet('Disconnected.', 'bad');
				}

				break;

			}

			default: {

				break;

			}

		}

	},
});

function startCoop() {

	ui.el.log.textContent = '';
	renderer.started      = false;
	shownBeats.clear();
	game.newRun(ui.el.seed.value, { playerCount: 2, localIndex: 0 });
	lastDepth = game.depth;

	const level = game.netLevel();

	level.fx  = recFx.splice(0);
	level.sfx = recSfx.splice(0);
	net.send(level);
	ui.setScreen(game);
	ui.renderInv(game);
	ui.refresh(game);

}

// ---------------------------------------------------------------- sizing

const fit = () => renderer.resize();

fit();

if (window.ResizeObserver) {
	new ResizeObserver(fit).observe(canvas.parentElement);
}

window.addEventListener('resize', fit);

if (document.fonts && document.fonts.ready) {
	document.fonts.ready.then(fit);
}

// ---------------------------------------------------------------- sound

let muted = false;

try {
	muted = localStorage.getItem('lanternfall.muted') === '1';
}

catch (e) { /* no storage */ }

const paintSound = () => {

	ui.el.sound.setAttribute('aria-pressed', String(muted));
	ui.el.sound.textContent = muted ? 'muted' : 'sound';

};

paintSound();

function wake() {

	if (sfx.ready()) {
		sfx.setMuted(muted);
	}

}

ui.el.sound.addEventListener('click', () => {

	muted = !muted;
	wake();
	sfx.setMuted(muted);
	paintSound();

	try {
		localStorage.setItem('lanternfall.muted', muted ? '1' : '0');
	}

	catch (e) { /* no storage */ }

});

// ---------------------------------------------------------------- run control

function startRun(seedText) {

	wake();
	mode      = 'solo';
	recording = false;
	net.close();
	ui.setNet('');
	ui.el.log.textContent = '';
	renderer.started      = false;
	shownBeats.clear();
	game.newRun(seedText);
	lastDepth = game.depth;
	ui.setScreen(game);
	ui.renderInv(game);
	ui.refresh(game);

}

function resumeRun() {

	const data = Game.loadSave();

	if (!data) {
		return;
	}

	wake();
	mode      = 'solo';
	recording = false;
	net.close();
	renderer.started = false;

	if (game.restore(data)) {
		lastDepth = game.depth;
		ui.redrawLog(game);
		shownBeats.clear();
		checkStory(true);
		game.log('You pick the lantern back up where you set it down.', 'warm');
		ui.setScreen(game);
		ui.renderInv(game);
		ui.refresh(game);
	}

}

ui.onUse = i => submit({ type: 'use', slot: i });

document.getElementById('btn-new').addEventListener('click', () => startRun(ui.el.seed.value));
document.getElementById('btn-resume').addEventListener('click', resumeRun);
document.getElementById('btn-again').addEventListener('click', () => startRun(''));
document.getElementById('btn-same').addEventListener('click', () => startRun(game.seedText));
document.getElementById('btn-help').addEventListener('click', () => ui.showHelp(!ui.helpOpen));
document.getElementById('btn-close-help').addEventListener('click', () => ui.showHelp(false));
document.getElementById('btn-close-beat').addEventListener('click', () => ui.hideBeat());
document.getElementById('btn-journal').addEventListener('click', () => ui.showJournal(true));
document.getElementById('btn-close-journal').addEventListener('click', () => ui.showJournal(false));
document.getElementById('btn-descend').addEventListener('click', () => submit({ type: 'descend' }));

document.getElementById('btn-quit').addEventListener('click', () => {

	if (mode === 'guest') {
		net.close();
		mode        = 'solo';
		game.screen = 'title';
	}

	else if (game.screen === 'play') {
		game.die('abandoned the descent');
		broadcast();
		net.close();
		mode = 'solo';
	}

	else {
		game.screen = 'title';
	}

	ui.setScreen(game);

});

ui.el.btnHost.addEventListener('click', () => {

	wake();
	mode      = 'host';
	recording = true;
	net.connect(makeRoomCode());

});

ui.el.btnJoin.addEventListener('click', () => {

	wake();

	const code = (ui.el.joinCode.value || '').trim();

	if (!code) {
		ui.setNet('Type the room code your friend sent you.', 'bad'); return;
	}

	mode      = 'guest';
	recording = false;
	net.connect(code);

});

ui.el.joinCode.addEventListener('keydown', e => {

	if (e.key === 'Enter') {
		e.preventDefault(); ui.el.btnJoin.click();
	}

});

ui.el.seed.addEventListener('keydown', e => {

	if (e.key === 'Enter') {
		e.preventDefault(); startRun(ui.el.seed.value);
	}

});

// Without a relay there is no co-op to offer, so the title screen simply does
// not mention it. Setting RELAY_URL in src/net-config.js brings the row back.

if (!HAS_RELAY) {
	ui.el.coopBox.hidden = true;
}

// ---------------------------------------------------------------- input

const MOVES = {
	ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
	w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
	k: [0, -1], j: [0, 1], h: [-1, 0], l: [1, 0],
	q: [-1, -1], e: [1, -1], z: [-1, 1], c: [1, 1],
	y: [-1, -1], u: [1, -1], b: [-1, 1], n: [1, 1],
};

window.addEventListener('keydown', ev => {

	if (ev.metaKey || ev.ctrlKey || ev.altKey) {
		return;
	}

	if (ev.target && ev.target.tagName === 'INPUT') {
		return;
	}

	// a story page or the journal holds the keyboard until it is put away

	if (ui.beatOpen || ui.journalOpen) {

		if (ev.key === 'Escape' || ev.key === 'Enter' || ev.key === ' ') {
			ev.preventDefault();
			ui.hideBeat();
			ui.showJournal(false);
		}

		return;

	}

	if (ev.key === '?' || ev.key === '/') {
		ev.preventDefault(); ui.showHelp(!ui.helpOpen); return;
	}

	if (ev.key === 'Escape') {
		ui.showHelp(false); return;
	}

	if (ev.key === 'm' || ev.key === 'M') {
		ui.el.sound.click(); return;
	}

	if (game.screen !== 'play') {

		if (ev.key === 'Enter' || ev.key === ' ') {

			ev.preventDefault();

			if (mode === 'solo') {
				startRun(game.screen === 'title' ? ui.el.seed.value : '');
			}

		}

		return;

	}

	if (ui.helpOpen) {
		ui.showHelp(false); return;
	}

	const key = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;

	if (MOVES[key]) {
		ev.preventDefault();
		submit({ type: 'move', dx: MOVES[key][0], dy: MOVES[key][1] });
		return;
	}

	if (key === ' ' || key === '.' || key === '5') {
		ev.preventDefault();
		submit({ type: 'wait' });
		return;
	}

	if (key === 'r') {
		ev.preventDefault(); submit({ type: 'revive' }); return;
	}

	if (ev.key === '>' || key === 'g') {
		ev.preventDefault();
		submit({ type: 'descend' });
		return;
	}

	if (key >= '1' && key <= '9') {
		ev.preventDefault();
		submit({ type: 'use', slot: Number(key) - 1 });
	}

});

document.getElementById('pad').addEventListener('click', ev => {

	const btn = ev.target.closest('button');

	if (!btn || game.screen !== 'play') {
		return;
	}

	if (btn.dataset.wait) {
		submit({ type: 'wait' });
	}

	else {
		submit({ type: 'move', dx: Number(btn.dataset.dx), dy: Number(btn.dataset.dy) });
	}

});

// ---------------------------------------------------------------- loop

let last = performance.now();

function frame(now) {

	const dt = Math.min(0.05, (now - last) / 1000);

	last = now;

	if (game.players && game.players.length) {

		const k   = 1 - Math.exp(-dt * 19);
		const all = [...game.players, ...(game.entities || [])];

		for (const e of all) {

			e.ax += (e.x - e.ax) * k;
			e.ay += (e.y - e.ay) * k;

			if (Math.abs(e.x - e.ax) < 0.01) {
				e.ax = e.x;
			}

			if (Math.abs(e.y - e.ay) < 0.01) {
				e.ay = e.y;
			}

			if (e.lunge > 0) {
				e.lunge = Math.max(0, e.lunge - dt * 6.5);
			}

		}

	}

	fx.update(dt);
	renderer.draw(game, fx, dt);

	if (game.screen === 'dead' || game.screen === 'won') {

		if (!game.endShown) {
			game.endShown = true;
			setTimeout(() => ui.setScreen(game), 900);
		}

	}

	else {
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
				lastDepth = game.depth;
				checkStory(true);
				ui.redrawLog(game);
				ui.setScreen(game);
				ui.renderInv(game);
				ui.refresh(game);
			}

		}

		catch (e) { /* stale snapshot; the title screen stands */ }

	}

	requestAnimationFrame(frame);

}

const hot = window.claude && window.claude.hot;

if (hot && hot.ready) {
	hot.ready(boot);
}

else {
	boot((hot && hot.data) || {});
}

if (hot && hot.snapshot) {
	hot.snapshot(() => ({ save: mode === 'solo' && game.screen === 'play' ? game.serialize() : null }));
}
