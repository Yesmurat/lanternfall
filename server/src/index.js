// Lanternfall co-op relay.
//
// A Durable Object per room, used purely as a message relay: the game logic all
// runs in the players' browsers (the host's browser is authoritative). The room
// only assigns slots, announces arrivals and departures, and forwards messages
// between the people in it.
//
// Uses the WebSocket Hibernation API, so an idle room costs nothing: the object
// is evicted from memory while the sockets stay connected to Cloudflare's edge.
// Never use setInterval/setTimeout here — either would prevent hibernation.

const MAX_PLAYERS = 2;
const MAX_MESSAGE_BYTES = 256 * 1024;

export class GameRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('This endpoint speaks WebSocket only.', { status: 426 });
    }

    const sockets = this.ctx.getWebSockets();
    if (sockets.length >= MAX_PLAYERS) {
      // tell the latecomer why, rather than dropping the connection silently
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      server.send(JSON.stringify({ t: 'full', max: MAX_PLAYERS }));
      server.close(4001, 'room full');
      return new Response(null, { status: 101, webSocket: client });
    }

    const taken = new Set(sockets.map(ws => this.slotOf(ws)));
    let slot = 0;
    while (taken.has(slot)) slot += 1;

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);
    // survives hibernation, unlike anything held in instance fields
    server.serializeAttachment({ slot, joinedAt: Date.now() });

    server.send(JSON.stringify({
      t: 'welcome',
      slot,
      host: slot === 0,
      peers: sockets.map(ws => this.slotOf(ws)).filter(s => s !== null),
    }));
    this.broadcast(server, JSON.stringify({ t: 'join', slot }));

    return new Response(null, { status: 101, webSocket: client });
  }

  slotOf(ws) {
    const data = ws.deserializeAttachment();
    return data && typeof data.slot === 'number' ? data.slot : null;
  }

  broadcast(except, payload) {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      try {
        ws.send(payload);
      } catch (err) {
        // the peer went away mid-send; webSocketClose will tidy up
      }
    }
  }

  // a dumb relay: messages are forwarded verbatim, never parsed, so a 15 kB
  // level snapshot costs the room no CPU
  webSocketMessage(ws, message) {
    const size = typeof message === 'string' ? message.length : message.byteLength;
    if (size > MAX_MESSAGE_BYTES) {
      ws.send(JSON.stringify({ t: 'error', reason: 'message too large', size }));
      return;
    }
    this.broadcast(ws, message);
  }

  webSocketClose(ws, code, reason, wasClean) {
    const slot = this.slotOf(ws);
    if (slot !== null) this.broadcast(ws, JSON.stringify({ t: 'leave', slot }));
  }

  webSocketError(ws, error) {
    const slot = this.slotOf(ws);
    if (slot !== null) this.broadcast(ws, JSON.stringify({ t: 'leave', slot }));
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response('lanternfall relay: connect to /room/<code>\n', {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }

    const match = url.pathname.match(/^\/room\/([A-Za-z0-9-]{1,24})$/);
    if (!match) return new Response('Not found. Use /room/<code>.', { status: 404 });

    const code = match[1].toUpperCase();
    const id = env.ROOMS.idFromName(code);
    return env.ROOMS.get(id).fetch(request);
  },
};
