// Recursive shadowcasting over eight octants.
const MULT = [
  [1, 0, 0, 1], [0, 1, 1, 0], [0, -1, 1, 0], [-1, 0, 0, 1],
  [-1, 0, 0, -1], [0, -1, -1, 0], [0, 1, -1, 0], [1, 0, 0, -1],
];


export function computeFOV(cx, cy, radius, blocked, visit) {
  visit(cx, cy, 0);
  for (let i = 0; i < 8; i++) {
    const m = MULT[i];
    cast(cx, cy, 1, 1, 0, radius, m[0], m[1], m[2], m[3], blocked, visit);
  }
}


function cast(cx, cy, row, start, end, radius, xx, xy, yx, yy, blocked, visit) {
  if (start < end) return;
  const r2 = radius * radius;
  let newStart = 0;
  for (let i = row; i <= radius; i++) {
    let wasBlocked = false;
    const dy = -i;
    for (let dx = -i; dx <= 0; dx++) {
      const lSlope = (dx - 0.5) / (dy + 0.5);
      const rSlope = (dx + 0.5) / (dy - 0.5);
      if (start < rSlope) continue;
      if (end > lSlope) break;
      const X = cx + dx * xx + dy * xy;
      const Y = cy + dx * yx + dy * yy;
      const d2 = dx * dx + dy * dy;
      if (d2 <= r2) visit(X, Y, Math.sqrt(d2));
      if (wasBlocked) {
        if (blocked(X, Y)) { newStart = rSlope; continue; }
        wasBlocked = false;
        start = newStart;
      } else if (blocked(X, Y) && i < radius) {
        wasBlocked = true;
        cast(cx, cy, i + 1, start, lSlope, radius, xx, xy, yx, yy, blocked, visit);
        newStart = rSlope;
      }
    }
    if (wasBlocked) break;
  }
}


// Bresenham line of sight between two tiles.
export function hasLine(x0, y0, x1, y1, blocked) {
  let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, x = x0, y = y0;
  for (let guard = 0; guard < 400; guard++) {
    if (x === x1 && y === y1) return true;
    if (!(x === x0 && y === y0) && blocked(x, y)) return false;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
  return false;
}
