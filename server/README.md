# Lanternfall co-op relay

A Cloudflare Worker with one Durable Object per room. It runs **no game logic** —
the host player's browser is authoritative and this only assigns slots, announces
who joined or left, and forwards messages between the two players.

## Why Cloudflare

A co-op game needs a socket that stays open. Render's free tier sleeps after idle
(which drops the connection), Railway's free offering is a one-time credit, and
Fly.io no longer has a free tier. Durable Objects are on the Workers **Free** plan
and never sleep, and the WebSocket Hibernation API means an idle room is not billed
for duration — the object leaves memory while the sockets stay connected at the edge.

Free plan allowance: 100,000 requests/day, with incoming WebSocket messages billed
at 20:1 (100 messages = 5 requests). A two-player turn-based game sends a handful of
messages per turn, so this is far more headroom than one game needs.

## Deploying

Wrangler needs npm, which isn't installed on this machine. Install it first:

```bash
sudo apt install -y npm        # or use nvm, which avoids sudo
```

Then, from this directory:

```bash
npx wrangler login             # opens a browser to authorise
npx wrangler deploy
```

Wrangler prints the deployed URL, e.g. `https://lanternfall-relay.<subdomain>.workers.dev`.
Put that in `src/net-config.js` in the game (as `wss://...`, not `https://`).

Check it is alive:

```bash
curl https://lanternfall-relay.<subdomain>.workers.dev/health
```

## Protocol

Clients connect to `wss://<host>/room/<CODE>`. The room holds at most two.

| From   | Message | Meaning |
| --- | --- | --- |
| server | `{t:"welcome", slot, host, peers}` | your slot (0 or 1); `host:true` means your browser runs the simulation |
| server | `{t:"join", slot}` | someone arrived |
| server | `{t:"leave", slot}` | someone left |
| server | `{t:"full", max}` | room already has two players; the socket then closes |
| server | `{t:"error", reason}` | the message you sent was rejected |
| client | anything else | forwarded verbatim to the other player |

Game messages are relayed without being parsed, so a level snapshot costs the room
no CPU. The client stamps its own slot on what it sends; the relay does not verify
it, which is fine for playing with someone you invited.
