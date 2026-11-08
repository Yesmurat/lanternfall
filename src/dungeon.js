import { computeFOV } from './fov.js';

export const T = {
  ROCK: 0, FLOOR: 1, WALL: 2, DOOR: 3, OPEN: 4,
  STAIRS: 5, RUBBLE: 6, BRAZIER: 7, FLAME: 8, UP: 9,
};

export const MAP_W = 64;
export const MAP_H = 40;


export function blocksMove(t) {
  return t === T.ROCK || t === T.WALL || t === T.DOOR || t === T.BRAZIER;
}


export function blocksSight(t) {
  return t === T.ROCK || t === T.WALL || t === T.DOOR;
}


export function generate(rng, depth) {
  const w = MAP_W, h = MAP_H;
  const isFinal = depth >= 8;
  const tiles = new Int8Array(w * h);           // all ROCK
  const roomId = new Int16Array(w * h).fill(-1);
  const rooms = [];
  const maxRooms = isFinal ? 9 : 11 + Math.min(5, depth);

  for (let attempt = 0; attempt < 500 && rooms.length < maxRooms; attempt++) {
    const rw = rng.range(5, isFinal ? 13 : 11);
    const rh = rng.range(4, isFinal ? 9 : 8);
    const x = rng.range(2, w - rw - 3);
    const y = rng.range(2, h - rh - 3);
    const clash = rooms.some(o =>
      x - 2 < o.x + o.w && o.x - 2 < x + rw && y - 2 < o.y + o.h && o.y - 2 < y + rh);
    if (clash) continue;
    rooms.push({ x, y, w: rw, h: rh, cx: x + (rw >> 1), cy: y + (rh >> 1) });
  }

  rooms.forEach((r, idx) => {
    for (let yy = r.y; yy < r.y + r.h; yy++) {
      for (let xx = r.x; xx < r.x + r.w; xx++) {
        tiles[yy * w + xx] = T.FLOOR;
        roomId[yy * w + xx] = idx;
      }
    }
  });

  const carveH = (y, x0, x1) => {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      const i = y * w + x;
      if (tiles[i] === T.ROCK) tiles[i] = T.FLOOR;
    }
  };
  const carveV = (x, y0, y1) => {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
      const i = y * w + x;
      if (tiles[i] === T.ROCK) tiles[i] = T.FLOOR;
    }
  };
  const join = (a, b) => {
    if (rng.chance(0.5)) { carveH(a.cy, a.cx, b.cx); carveV(b.cx, a.cy, b.cy); }
    else { carveV(a.cx, a.cy, b.cy); carveH(b.cy, a.cx, b.cx); }
  };

  for (let i = 1; i < rooms.length; i++) join(rooms[i - 1], rooms[i]);
  // a couple of loops, so the dungeon is not a single thread
  for (let i = 0; i < 2 && rooms.length > 3; i++) {
    join(rng.pick(rooms), rng.pick(rooms));
  }

  // dress every rock touching open ground as a wall face
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (tiles[i] !== T.ROCK) continue;
      let touches = false;
      for (let dy = -1; dy <= 1 && !touches; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const t = tiles[ny * w + nx];
          if (t !== T.ROCK && t !== T.WALL) { touches = true; break; }
        }
      }
      if (touches) tiles[i] = T.WALL;
    }
  }

  // doors in the one-tile throats where a corridor meets a room
  const isWall = i => tiles[i] === T.WALL || tiles[i] === T.ROCK;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (tiles[i] !== T.FLOOR || roomId[i] !== -1) continue;
      const l = i - 1, r = i + 1, u = i - w, d = i + w;
      const horiz = tiles[l] === T.FLOOR && tiles[r] === T.FLOOR && isWall(u) && isWall(d);
      const vert = tiles[u] === T.FLOOR && tiles[d] === T.FLOOR && isWall(l) && isWall(r);
      if (!horiz && !vert) continue;
      const nextToRoom = [l, r, u, d].some(j => roomId[j] !== -1);
      if (!nextToRoom || !rng.chance(0.45)) continue;
      const nextToDoor = [l, r, u, d, i - w - 1, i - w + 1, i + w - 1, i + w + 1]
        .some(j => tiles[j] === T.DOOR);
      if (!nextToDoor) tiles[i] = T.DOOR;
    }
  }

  // pick start and the far room for the way down
  const startRoom = rooms[0];
  let farRoom = rooms[rooms.length - 1], farDist = -1;
  for (const r of rooms) {
    const d = Math.hypot(r.cx - startRoom.cx, r.cy - startRoom.cy);
    if (d > farDist) { farDist = d; farRoom = r; }
  }

  const start = { x: startRoom.cx, y: startRoom.cy };
  tiles[start.y * w + start.x] = T.UP;

  const freeFloorIn = room => {
    for (let k = 0; k < 60; k++) {
      const x = rng.range(room.x, room.x + room.w - 1);
      const y = rng.range(room.y, room.y + room.h - 1);
      if (tiles[y * w + x] === T.FLOOR) return { x, y };
    }
    return { x: room.cx, y: room.cy };
  };

  const stairs = freeFloorIn(farRoom);
  tiles[stairs.y * w + stairs.x] = isFinal ? T.FLAME : T.STAIRS;

  // braziers: the only light you do not have to pay for
  const openNeighbours = (x, y) => {
    let n = 0;
    for (let k = 0; k < 4; k++) {
      const nx = x + [0, 1, 0, -1][k], ny = y + [-1, 0, 1, 0][k];
      if (tiles[ny * w + nx] === T.FLOOR) n++;
    }
    return n;
  };
  const braziers = [];
  rooms.forEach((room, idx) => {
    const want = idx === rooms.indexOf(farRoom) && isFinal ? 3 : (rng.chance(0.42) ? 1 : 0);
    for (let n = 0; n < want; n++) {
      for (let k = 0; k < 40; k++) {
        const x = rng.range(room.x + 1, room.x + room.w - 2);
        const y = rng.range(room.y + 1, room.y + room.h - 2);
        const i = y * w + x;
        if (tiles[i] !== T.FLOOR || openNeighbours(x, y) < 4) continue;
        tiles[i] = T.BRAZIER;
        braziers.push({ x, y });
        break;
      }
    }
  });

  // scatter rubble for texture
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] === T.FLOOR && rng.chance(0.022)) tiles[i] = T.RUBBLE;
  }

  // bake the standing light from braziers and the Everflame
  const light = new Float32Array(w * h);
  const blocked = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? true : blocksSight(tiles[y * w + x]);
  const sources = braziers.map(b => ({ x: b.x, y: b.y, r: 6.5, power: 0.82 }));
  if (isFinal) sources.push({ x: stairs.x, y: stairs.y, r: 9, power: 1 });
  for (const s of sources) {
    computeFOV(s.x, s.y, s.r, blocked, (x, y, d) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const v = Math.max(0, 1 - d / s.r) * s.power;
      const i = y * w + x;
      if (v > light[i]) light[i] = v;
    });
  }

  return { w, h, tiles, light, rooms, roomId, start, stairs, braziers, isFinal, depth };
}
