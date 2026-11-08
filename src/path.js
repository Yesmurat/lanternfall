export const DX = [0, 1, 0, -1, 1, 1, -1, -1];
export const DY = [-1, 0, 1, 0, -1, 1, 1, -1];


// Breadth-first distance field from a tile; monsters walk it downhill.
export function flowField(w, h, sx, sy, passable) {
  const dist = new Int16Array(w * h).fill(-1);
  const queue = new Int32Array(w * h);
  let head = 0, tail = 0;
  const start = sy * w + sx;
  dist[start] = 0;
  queue[tail++] = start;
  while (head < tail) {
    const i = queue[head++];
    const d = dist[i] + 1;
    const x = i % w, y = (i / w) | 0;
    for (let k = 0; k < 8; k++) {
      const nx = x + DX[k], ny = y + DY[k];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (dist[j] !== -1 || !passable(nx, ny)) continue;
      dist[j] = d;
      queue[tail++] = j;
    }
  }
  return dist;
}


export function chebyshev(ax, ay, bx, by) {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}
