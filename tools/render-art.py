#!/usr/bin/env python3
"""Replay the game's recorded canvas calls into Cairo and write PNGs.

The art is never redrawn here: tools/record-art.mjs captures what
src/creatures.js and src/render.js actually draw, and this replays it.
Run `node tools/record-art.mjs` first.
"""

import json, math, os, re, sys
import cairo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OPS = os.path.join(ROOT, 'tools', 'art-ops.json')
ART = os.path.join(ROOT, 'art')
MONSTERS = os.path.join(ART, 'monsters')

BG = (0x0a / 255, 0x0e / 255, 0x16 / 255)
BONE = (0xea / 255, 0xe2 / 255, 0xd1 / 255)
FAINT = (0x5c / 255, 0x64 / 255, 0x76 / 255)
FLAME = (0xf0 / 255, 0xa9 / 255, 0x3c / 255)
HOT = (0xff / 255, 0xdf / 255, 0xa0 / 255)

ORDER = ['hero', 'rat', 'slug', 'goblin', 'wick', 'skeleton',
         'fletcher', 'ghoul', 'acolyte', 'ogre', 'shade', 'snuffer']


# ---------------------------------------------------------------- colour

def parse_color(spec):
    if isinstance(spec, dict):
        return spec
    s = str(spec).strip()
    m = re.match(r'^#([0-9a-fA-F]{6})$', s)
    if m:
        n = int(m.group(1), 16)
        return ((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255, 1.0)
    m = re.match(r'^#([0-9a-fA-F]{3})$', s)
    if m:
        d = m.group(1)
        return (int(d[0] * 2, 16) / 255, int(d[1] * 2, 16) / 255, int(d[2] * 2, 16) / 255, 1.0)
    m = re.match(r'^rgba?\(([^)]*)\)$', s)
    if m:
        parts = [p.strip() for p in m.group(1).split(',')]
        r, g, b = (float(p) / 255 for p in parts[:3])
        a = float(parts[3]) if len(parts) > 3 else 1.0
        return (r, g, b, a)
    raise ValueError('unparsed colour: ' + s)


# ---------------------------------------------------------------- replay

class Replay:
    def __init__(self, cr):
        self.cr = cr
        self.gradients = {}
        self.state = {'fillStyle': '#000', 'strokeStyle': '#000', 'lineWidth': 1.0,
                      'globalAlpha': 1.0, 'globalCompositeOperation': 'source-over'}
        self.stack = []

    def source(self, spec):
        cr, alpha = self.cr, float(self.state['globalAlpha'])
        if isinstance(spec, dict) and 'grad' in spec:
            grad, stops = self.gradients[spec['grad']]
            pat = grad
            pat_stops = stops
            g = cairo.LinearGradient(*pat['args']) if pat['kind'] == 'linear' \
                else cairo.RadialGradient(*pat['args'])
            for offset, color in pat_stops:
                r, gg, b, a = parse_color(color)
                g.add_color_stop_rgba(offset, r, gg, b, a * alpha)
            cr.set_source(g)
        else:
            r, g, b, a = parse_color(spec)
            cr.set_source_rgba(r, g, b, a * alpha)
        cr.set_operator(cairo.OPERATOR_ADD
                        if self.state['globalCompositeOperation'] == 'lighter'
                        else cairo.OPERATOR_OVER)

    def run(self, ops):
        cr = self.cr
        for o in ops:
            op, args = o['op'], o.get('args', [])
            if op == 'set':
                self.state[o['prop']] = o['value']
            elif op == 'gradient':
                self.gradients[o['id']] = ({'kind': o['kind'], 'args': args}, [])
            elif op == 'stop':
                self.gradients[o['id']][1].append((o['offset'], o['color']))
            elif op == 'save':
                cr.save()
                self.stack.append(dict(self.state))
            elif op == 'restore':
                cr.restore()
                if self.stack:
                    self.state = self.stack.pop()
            elif op == 'beginPath':
                cr.new_path()
            elif op == 'closePath':
                cr.close_path()
            elif op == 'moveTo':
                cr.move_to(*args)
            elif op == 'lineTo':
                cr.line_to(*args)
            elif op == 'quadraticCurveTo':
                qx, qy, x, y = args
                if not cr.has_current_point():
                    cr.move_to(qx, qy)
                px, py = cr.get_current_point()
                cr.curve_to(px + 2 / 3 * (qx - px), py + 2 / 3 * (qy - py),
                            x + 2 / 3 * (qx - x), y + 2 / 3 * (qy - y), x, y)
            elif op == 'arc':
                x, y, r, a0, a1 = args[:5]
                ccw = len(args) > 5 and args[5]
                (cr.arc_negative if ccw else cr.arc)(x, y, r, a0, a1)
            elif op == 'ellipse':
                x, y, rx, ry, rot, a0, a1 = args[:7]
                cr.save()
                cr.translate(x, y)
                cr.rotate(rot)
                cr.scale(max(rx, 1e-6), max(ry, 1e-6))
                cr.arc(0, 0, 1, a0, a1)
                cr.restore()
            elif op == 'rect':
                cr.rectangle(*args)
            elif op == 'fillRect':
                saved = cr.copy_path()                 # canvas fillRect leaves the path alone
                cr.new_path()
                cr.rectangle(*args)
                self.source(self.state['fillStyle'])
                cr.fill()
                cr.new_path()
                cr.append_path(saved)
            elif op == 'fill':
                self.source(self.state['fillStyle'])
                cr.fill_preserve()
            elif op == 'stroke':
                self.source(self.state['strokeStyle'])
                cr.set_line_width(float(self.state.get('lineWidth', 1)))
                cap = self.state.get('lineCap', 'butt')
                cr.set_line_cap({'round': cairo.LINE_CAP_ROUND, 'square': cairo.LINE_CAP_SQUARE}
                                .get(cap, cairo.LINE_CAP_BUTT))
                join = self.state.get('lineJoin', 'miter')
                cr.set_line_join({'round': cairo.LINE_JOIN_ROUND, 'bevel': cairo.LINE_JOIN_BEVEL}
                                 .get(join, cairo.LINE_JOIN_MITER))
                cr.stroke_preserve()
            elif op == 'clip':
                cr.clip_preserve()
            elif op == 'translate':
                cr.translate(*args)
            elif op == 'rotate':
                cr.rotate(*args)
            elif op == 'scale':
                cr.scale(*args)
            elif op in ('fillText', 'strokeText', 'setTransform', 'drawImage'):
                pass
            else:
                raise ValueError('unhandled op: ' + op)
        cr.set_operator(cairo.OPERATOR_OVER)


# ---------------------------------------------------------------- helpers

def bbox(surface):
    surface.flush()
    w, h, stride = surface.get_width(), surface.get_height(), surface.get_stride()
    data = memoryview(surface.get_data())
    minx, miny, maxx, maxy = w, h, -1, -1
    for y in range(h):
        alphas = bytes(data[y * stride: y * stride + w * 4][3::4])
        first = next((i for i, v in enumerate(alphas) if v), None)
        if first is None:
            continue
        last = len(alphas) - 1 - next(i for i, v in enumerate(reversed(alphas)) if v)
        minx, maxx = min(minx, first), max(maxx, last)
        miny, maxy = min(miny, y), max(maxy, y)
    return None if maxx < 0 else (minx, miny, maxx, maxy)


def text(cr, s, x, y, size, color, family='serif', bold=False, align='left',
         spacing=0.0, max_width=None):
    cr.select_font_face(family, cairo.FONT_SLANT_NORMAL,
                        cairo.FONT_WEIGHT_BOLD if bold else cairo.FONT_WEIGHT_NORMAL)

    def measure(sz):
        cr.set_font_size(sz)
        if spacing:
            return sum(cr.text_extents(ch).x_advance + spacing for ch in s) - spacing
        return cr.text_extents(s).x_advance

    width = measure(size)
    if max_width and width > max_width:          # shrink rather than spill into the next cell
        size = max(12.0, size * max_width / width)
        width = measure(size)
    if align == 'center':
        x -= width / 2
    elif align == 'right':
        x -= width
    cr.set_source_rgba(*color, 1)
    cr.move_to(x, y)
    if spacing:
        for ch in s:
            cr.show_text(ch)
            cr.rel_move_to(spacing, 0)
    else:
        cr.show_text(s)
    return width


# ---------------------------------------------------------------- build

def main():
    if not os.path.exists(OPS):
        sys.exit('missing tools/art-ops.json — run: node tools/record-art.mjs')
    sheet = json.load(open(OPS))
    figures, TILE, CX, CY = sheet['figures'], sheet['tile'], sheet['cx'], sheet['cy']
    os.makedirs(MONSTERS, exist_ok=True)

    W, H = int(TILE * 4.4), int(TILE * 4.0)
    written = []
    boxes = {}

    # 1. one transparent PNG per creature, cropped to the figure
    for key in ORDER:
        fig = figures[key]
        surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, W, H)
        cr = cairo.Context(surf)
        Replay(cr).run(fig['ops'])
        box = bbox(surf)
        if not box:
            sys.exit('figure rendered empty: ' + key)
        pad = 10
        x0, y0, x1, y1 = box
        cw, ch = x1 - x0 + 1 + pad * 2, y1 - y0 + 1 + pad * 2
        out = cairo.ImageSurface(cairo.FORMAT_ARGB32, cw, ch)
        oc = cairo.Context(out)
        oc.set_source_surface(surf, pad - x0, pad - y0)
        oc.paint()
        path = os.path.join(MONSTERS, key + '.png')
        out.write_to_png(path)
        boxes[key] = box
        written.append((key, cw, ch, os.path.getsize(path)))

    # 2. the bestiary sheet
    cols, rows = 4, 3
    cell_w, cell_h = 320, 380
    pad_top, pad_bottom = 152, 76
    bw, bh = cols * cell_w, pad_top + rows * cell_h + pad_bottom
    surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, bw, bh)
    cr = cairo.Context(surf)
    cr.set_source_rgb(*BG)
    cr.paint()

    glow = cairo.RadialGradient(bw / 2, pad_top * 0.5, 0, bw / 2, pad_top * 0.5, bw * 0.62)
    glow.add_color_stop_rgba(0, *FLAME, 0.11)
    glow.add_color_stop_rgba(1, *FLAME, 0)
    cr.set_source(glow)
    cr.paint()

    text(cr, 'LANTERNFALL', bw / 2, 80, 56, HOT, 'serif', True, 'center', 12)
    text(cr, 'what waits in the eight depths', bw / 2, 120, 24, FAINT, 'serif', False, 'center', 3)

    # one scale for every creature, so the sheet reports their real relative size
    tallest = max(boxes[k][3] - boxes[k][1] for k in ORDER)
    scale = (cell_h - 132) / tallest

    for i, key in enumerate(ORDER):
        col, row = i % cols, i // cols
        cx = col * cell_w + cell_w / 2
        top = pad_top + row * cell_h
        area_mid = top + (cell_h - 108) / 2 + 10
        x0, y0, x1, y1 = boxes[key]
        cr.save()
        cr.translate(cx, area_mid)
        cr.scale(scale, scale)
        cr.translate(-(x0 + x1) / 2, -(y0 + y1) / 2)
        Replay(cr).run(figures[key]['ops'])
        cr.restore()
        base = top + cell_h - 76
        text(cr, figures[key]['label'], cx, base, 24, BONE,
             'serif', key == 'hero', 'center', 1, cell_w - 30)
        text(cr, figures[key].get('note', ''), cx, base + 28, 18, FAINT,
             'serif', False, 'center', 1, cell_w - 30)

    cr.set_source_rgba(*FAINT, 0.3)
    cr.set_line_width(1)
    for c in range(1, cols):
        cr.move_to(c * cell_w, pad_top + 18)
        cr.line_to(c * cell_w, bh - pad_bottom + 14)
    for r in range(1, rows):
        cr.move_to(28, pad_top + r * cell_h)
        cr.line_to(bw - 28, pad_top + r * cell_h)
    cr.stroke()

    text(cr, 'yesmurat.github.io/lanternfall', bw / 2, bh - 26, 21, FLAME,
         'serif', False, 'center', 2)
    p = os.path.join(ART, 'bestiary.png')
    surf.write_to_png(p)
    written.append(('bestiary', bw, bh, os.path.getsize(p)))

    # 3. itch.io cover, 630x500
    cw, ch = 630, 500
    surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, cw, ch)
    cr = cairo.Context(surf)
    cr.set_source_rgb(*BG)
    cr.paint()

    ground = ch * 0.86
    lamp = cairo.RadialGradient(cw * 0.3, ground - 70, 0, cw * 0.3, ground - 70, cw * 0.56)
    lamp.add_color_stop_rgba(0, *FLAME, 0.30)
    lamp.add_color_stop_rgba(1, *FLAME, 0)
    cr.set_source(lamp)
    cr.paint()

    # the floor they stand on, lit near the lantern and lost further off
    floor = cairo.LinearGradient(0, ground - 10, 0, ch)
    floor.add_color_stop_rgba(0, 0.30, 0.22, 0.13, 0.55)
    floor.add_color_stop_rgba(1, 0.02, 0.03, 0.05, 0.9)
    cr.rectangle(0, ground - 6, cw, ch - ground + 6)
    cr.set_source(floor)
    cr.fill()

    vig = cairo.RadialGradient(cw * 0.34, ch * 0.56, cw * 0.16, cw * 0.34, ch * 0.56, cw * 0.82)
    vig.add_color_stop_rgba(0, 0, 0, 0, 0)
    vig.add_color_stop_rgba(1, 0.012, 0.016, 0.031, 0.95)
    cr.set_source(vig)
    cr.paint()

    def place(key, x, s_, alpha):
        x0, y0, x1, y1 = boxes[key]
        cr.save()
        cr.translate(cw * x, ground)
        cr.scale(s_, s_)
        cr.translate(-(x0 + x1) / 2, -y1)          # stand it on the floor line
        if alpha >= 1:
            Replay(cr).run(figures[key]['ops'])
        else:
            cr.push_group()
            Replay(cr).run(figures[key]['ops'])
            cr.pop_group_to_source()
            cr.paint_with_alpha(alpha)
        cr.restore()

    for key, x, s_, a in (('ogre', 0.90, 0.56, 0.42),
                          ('ghoul', 0.70, 0.52, 0.72),
                          ('rat', 0.55, 0.40, 0.8)):
        place(key, x, s_, a)
    place('hero', 0.28, 0.78, 1)

    text(cr, 'LANTERNFALL', cw / 2, 84, 54, HOT, 'serif', True, 'center', 11)
    text(cr, 'your lantern is your field of view', cw / 2, 122, 22, BONE,
         'serif', False, 'center', 2)
    p = os.path.join(ART, 'cover.png')
    surf.write_to_png(p)
    written.append(('cover', cw, ch, os.path.getsize(p)))

    print('  %-12s %11s %10s' % ('file', 'size', 'bytes'))
    for name, w, h, b in written:
        print('  %-12s %5dx%-5d %9s' % (name, w, h, f'{b:,}'))


main()
