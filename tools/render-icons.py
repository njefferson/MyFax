#!/usr/bin/env python3
"""Render the Fax Relay app icons (192, 512, maskable-512) and the repo's
social-preview banner (1280x640).

A flat, geometric fax machine in the app's palette, recreated in code from
Noah's wordless ChatGPT reference art (2026-07-25): handset on the left with
a coiled cord, paper rising from the feed, vent grille, three keypad dots,
blue send lamp; the banner adds the perforated transmission tape flowing out
the right side. Lettering is overlaid here, never AI-generated (doctrine §3),
and its contrast is computed at render time — the script fails below 4.5:1.

Maskable variant keeps all strokes inside the central 80% circle safe zone.
Run from the repo root: python3 tools/render-icons.py
"""
import math
from PIL import Image, ImageDraw, ImageFont

HOUSING = (195, 192, 178)   # #C3C0B2 — background
PANEL   = (230, 228, 218)   # #E6E4DA — machine body
PAPER   = (242, 240, 231)   # #F2F0E7 — sheet and tape
INK     = (25, 28, 24)      # #191C18
SIGNAL  = (42, 79, 191)     # #2A4FBF — send lamp

MONO_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf'


def contrast(fg, bg):
    def lum(c):
        def ch(v):
            v /= 255.0
            return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
        r, g, b = (ch(v) for v in c)
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
    la, lb = lum(fg), lum(bg)
    lo, hi = min(la, lb), max(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def draw_fax(d, x0, y0, s, w):
    """Front view of the machine in a box of width s (height ~= 0.82*s),
    top-left at (x0, y0), stroke width w. Returns (slot_x, slot_y) where the
    tape leaves the machine (right edge, front-panel height) for the banner."""
    u = s / 100.0
    thin = max(1, round(w * 0.45))

    # Layout (unit coords). Handset column on the left, body to its right.
    hand_x0, hand_x1 = 0 * u, 13 * u
    body_x0, body_x1 = 10 * u, 100 * u
    deck_y = 34 * u            # top of the main body
    panel_y0, panel_y1 = 52 * u, 76 * u   # front panel band
    base_y0, base_y1 = 76 * u, 82 * u     # wider base tier

    # Paper sheet rising from the feed, three address lines
    sheet_w = 42 * u
    sx0 = body_x0 + (body_x1 - body_x0 - sheet_w) / 2
    sy0, sy1 = 0 * u, 30 * u
    d.rectangle([x0 + sx0, y0 + sy0, x0 + sx0 + sheet_w, y0 + sy1],
                fill=PAPER, outline=INK, width=w)
    for i in range(3):
        ly = y0 + sy0 + (8 + i * 5) * u
        d.line([x0 + sx0 + 6 * u, ly, x0 + sx0 + sheet_w - 6 * u, ly],
               fill=INK, width=thin)
    # Feed cheeks either side of the sheet
    for cx in (sx0 - 5 * u, sx0 + sheet_w):
        d.rectangle([x0 + cx, y0 + 24 * u, x0 + cx + 5 * u, y0 + deck_y],
                    fill=PANEL, outline=INK, width=w)

    # Main body, front panel band, wider base
    d.rounded_rectangle([x0 + body_x0, y0 + deck_y, x0 + body_x1, y0 + base_y0],
                        radius=2.5 * u, fill=PANEL, outline=INK, width=w)
    d.line([x0 + body_x0, y0 + panel_y0, x0 + body_x1, y0 + panel_y0],
           fill=INK, width=w)
    d.rounded_rectangle([x0 + body_x0 - 3 * u, y0 + base_y0, x0 + body_x1 + 3 * u, y0 + base_y1],
                        radius=1.5 * u, fill=PANEL, outline=INK, width=w)
    # Feet
    for fx in (body_x0 + 6 * u, body_x1 - 10 * u):
        d.rectangle([x0 + fx, y0 + base_y1, x0 + fx + 5 * u, y0 + base_y1 + 2.2 * u],
                    fill=INK)

    # Vent grille on the panel, left of center
    g_x0, g_x1 = body_x0 + 12 * u, body_x0 + 34 * u
    for i in range(5):
        gy = y0 + panel_y0 + (4.5 + i * 3.2) * u
        d.line([x0 + g_x0, gy, x0 + g_x1, gy], fill=INK, width=thin)
    d.line([x0 + g_x1 + 6 * u, y0 + panel_y0, x0 + g_x1 + 6 * u, y0 + base_y0],
           fill=INK, width=thin)

    # Keypad dots and the send lamp
    r = 2.2 * u
    ky = y0 + (panel_y0 + panel_y1) / 2 - 2 * u
    for i in range(3):
        cx = x0 + body_x0 + (48 + i * 10) * u
        d.ellipse([cx - r, ky - r, cx + r, ky + r], fill=INK)
    lr = 2.6 * u
    lx = x0 + body_x0 + 80 * u
    d.ellipse([lx - lr, ky - lr, lx + lr, ky + lr], fill=SIGNAL, outline=INK, width=thin)

    # Handset: vertical bar with earpiece bulge, overlapping the body's left
    d.rounded_rectangle([x0 + hand_x0, y0 + 28 * u, x0 + hand_x1, y0 + 66 * u],
                        radius=3.5 * u, fill=PANEL, outline=INK, width=w)
    d.rounded_rectangle([x0 + hand_x0 + 1.5 * u, y0 + 28 * u, x0 + hand_x1 + 2 * u, y0 + 38 * u],
                        radius=3 * u, fill=PANEL, outline=INK, width=w)
    # Coiled cord: descending chain of small circles
    ccx, ccy = x0 + hand_x0 + 5 * u, y0 + 68 * u
    cr = 2.6 * u
    for i in range(6):
        ox = math.sin(i * 1.05) * 2.2 * u
        d.ellipse([ccx + ox - cr, ccy - cr, ccx + ox + cr, ccy + cr],
                  outline=INK, width=thin)
        ccy += 2.6 * u

    return x0 + body_x1 + 3 * u, (y0 + panel_y0, y0 + base_y0)


def draw_icon(size, maskable=False):
    img = Image.new('RGB', (size, size), HOUSING)
    d = ImageDraw.Draw(img)
    # Maskable: everything inside the centered 80% circle; the machine box is
    # widest corner-to-corner, so keep it well inside.
    s = size * (0.52 if maskable else 0.68)
    x0 = (size - s) / 2
    h = s * 0.90
    y0 = (size - h) / 2
    w = max(2, round(size * 0.014))
    draw_fax(d, x0, y0, s, w)
    return img


def tracked_text(d, xy, text, font, tracking, fill):
    x, y = xy
    for ch in text:
        d.text((x, y), ch, font=font, fill=fill)
        x += d.textlength(ch, font=font) + tracking
    return x - tracking


def tracked_width(d, text, font, tracking):
    return sum(d.textlength(ch, font=font) for ch in text) + tracking * (len(text) - 1)


def draw_banner():
    W, H = 1280, 640
    img = Image.new('RGB', (W, H), HOUSING)
    d = ImageDraw.Draw(img)
    w = 5

    s = 340
    fx0, fy0 = 110, 150
    tape_x, (ty0, ty1) = draw_fax(d, fx0, fy0, s, w)

    # Perforated tape: a gently waving band from the machine to the right edge
    def edge(t, base):
        return base + 26 * math.sin(t * math.pi * 1.6) * t
    top_pts, bot_pts = [], []
    n = 60
    for i in range(n + 1):
        t = i / n
        x = tape_x + t * (W - tape_x)
        top_pts.append((x, edge(t, ty0)))
        bot_pts.append((x, edge(t, ty1)))
    d.polygon(top_pts + bot_pts[::-1], fill=PAPER)
    d.line(top_pts, fill=INK, width=3)
    d.line(bot_pts, fill=INK, width=3)
    # Perforation dots inset from each edge
    for pts, off in ((top_pts, 14), (bot_pts, -14)):
        for i in range(2, n, 3):
            x, y = pts[i]
            r = 3
            d.ellipse([x - r, y + off - r, x + r, y + off + r], fill=INK)

    # Lettering — overlaid here, mono caps, ink on housing (doctrine §3)
    ratio = contrast(INK, HOUSING)
    assert ratio >= 4.5, f'banner lettering contrast {ratio:.2f} < 4.5'
    title_f = ImageFont.truetype(MONO_BOLD, 84)
    sub_f = ImageFont.truetype(MONO_BOLD, 30)
    title, sub = 'FAX RELAY', 'FREE FAX FROM YOUR PHONE'
    t_track, s_track = 10, 6
    # Right-aligned block in the open space above the tape
    right = W - 90
    ty = 120
    tw = tracked_width(d, title, title_f, t_track)
    tracked_text(d, (right - tw, ty), title, title_f, t_track, INK)
    sw_ = tracked_width(d, sub, sub_f, s_track)
    tracked_text(d, (right - sw_, ty + 108), sub, sub_f, s_track, INK)
    print(f'banner lettering contrast {ratio:.2f}:1 (ink on housing)')
    return img


draw_icon(512).resize((192, 192), Image.LANCZOS).save('public/icon-192.png')
draw_icon(512).save('public/icon-512.png')
draw_icon(512, maskable=True).save('public/icon-maskable.png')
draw_banner().save('social-preview.png')
print('icons + social-preview written')
