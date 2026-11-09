// Co-op transport. The relay only moves messages; all the game logic runs in
// the host's browser, so this layer stays small and has no opinions about play.

import { RELAY_URL } from './net-config.js';

export const HAS_RELAY = !!RELAY_URL;

const CONNECT_TIMEOUT = 9000;
const SYLLABLES       = ['ash', 'mor', 'vel', 'kith', 'dun', 'bram', 'orn', 'sel', 'wick', 'gloam', 'rue', 'fen'];

export function makeRoomCode() {

	const pick = () => SYLLABLES[Math.floor(Math.random() * SYLLABLES.length)];

	return (pick() + pick() + (10 + Math.floor(Math.random() * 90))).toUpperCase();

}

export class Net {

	constructor(handlers = {}) {

		this.on     = handlers;
		this.ws     = null;
		this.slot   = null;
		this.isHost = false;
		this.code   = null;
		this.peers  = [];
		this.status = 'idle';
		this.timer  = null;

	}

	get connected() {

		return !!this.ws && this.ws.readyState === WebSocket.OPEN;

	}

	get hasPeer() {

		return this.peers.length > 0;

	}

	setStatus(status, detail) {

		this.status = status;

		if (this.on.status) {
			this.on.status(status, detail);
		}

	}

	connect(code) {

		if (!HAS_RELAY) {
			this.setStatus('no-relay'); return false;
		}

		this.close();
		this.code = String(code || '').trim().toUpperCase();

		if (!/^[A-Z0-9-]{1,24}$/.test(this.code)) {
			this.setStatus('bad-code'); return false;
		}

		const base = RELAY_URL.replace(/\/+$/, '');
		let ws;

		try {
			ws = new WebSocket(`${base}/room/${encodeURIComponent(this.code)}`);
		}

		catch (err) {
			this.setStatus('failed', 'the relay address is not a valid WebSocket URL');
			return false;
		}

		this.ws = ws;
		this.setStatus('connecting');

		// a sandbox that blocks outbound sockets never fires an error, it just hangs
		this.timer = setTimeout(() => {

			if (!this.connected) {
				this.setStatus('failed', 'no answer from the relay');
				this.close();
			}

		}, CONNECT_TIMEOUT);

		ws.onopen = () => {

			clearTimeout(this.timer);
			this.setStatus('waiting');

		};

		ws.onmessage = ev => {

			let msg;

			try {
				msg = JSON.parse(ev.data);
			}

			catch (err) {
				return;
			}

			switch (msg.t) {

				case 'welcome': {

					this.slot   = msg.slot;
					this.isHost = !!msg.host;
					this.peers  = msg.peers || [];

					if (this.on.welcome) {
						this.on.welcome(msg);
					}

					this.setStatus(this.hasPeer ? 'ready' : 'waiting');
					break;

				}

				case 'join': {

					if (!this.peers.includes(msg.slot)) {
						this.peers.push(msg.slot);
					}

					if (this.on.join) {
						this.on.join(msg.slot);
					}

					this.setStatus('ready');
					break;

				}

				case 'leave': {

					this.peers = this.peers.filter(s => s !== msg.slot);

					if (this.on.leave) {
						this.on.leave(msg.slot);
					}

					this.setStatus('waiting');
					break;

				}

				case 'full': {

					this.setStatus('full');
					break;

				}

				case 'error': {

					this.setStatus('failed', msg.reason);
					break;

				}

				default: {

					if (this.on.message) {
						this.on.message(msg);
					}

				}

			}

		};

		ws.onerror = () => {

			clearTimeout(this.timer);

			if (this.status !== 'closed') {
				this.setStatus('failed', 'could not reach the relay');
			}

		};

		ws.onclose = () => {

			clearTimeout(this.timer);

			if (this.status !== 'failed' && this.status !== 'full') {
				this.setStatus('closed');
			}

			this.ws    = null;
			this.peers = [];

		};
		return true;

	}

	send(obj) {

		if (!this.connected) {
			return false;
		}

		try {
			this.ws.send(JSON.stringify(obj));
			return true;
		}

		catch (err) {
			return false;
		}

	}

	close() {

		clearTimeout(this.timer);

		const ws = this.ws;

		this.ws     = null;
		this.peers  = [];
		this.slot   = null;
		this.isHost = false;

		if (ws) {

			ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;

			try {
				ws.close();
			}

			catch (err) { /* already gone */ }

		}

		if (this.status !== 'idle') {
			this.setStatus('closed');
		}

	}

}
