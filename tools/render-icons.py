#!/usr/bin/env python3
"""Render the Fax Relay app icons (192, 512, maskable-512).

A flat, geometric fax machine on the housing color — matches the app's
industrial mono aesthetic. Maskable variant keeps all strokes inside the
central 80% circle safe zone.
"""
from PIL import Image, ImageDraw

HOUSING = (195, 192, 178)   # #C3C0B2
PANEL   = (230, 228, 218)   # #E6E4DA
PAPER   = (242, 240, 231)   # #F2F0E7
INK     = (25, 28, 24)      # #191C18
SIGNAL  = (42, 79, 191)     # #2A4FBF


def draw_icon(size, maskable=False):
    img = Image.new('RGB', (size, size), HOUSING)
    d = ImageDraw.Draw(img)
    u = size / 100.0

    # Maskable: content must survive a centered circle of radius 40%.
    # Shrink the machine toward the center; plain icons use more of the frame.
    if maskable:
        x0, x1 = 26 * u, 74 * u   # machine body horizontal extent
        top, bot = 34 * u, 62 * u
    else:
        x0, x1 = 16 * u, 84 * u
        top, bot = 30 * u, 66 * u

    w = max(2, round(3.2 * u))  # stroke

    # Paper sheet rising out of the slot
    sheet_w = (x1 - x0) * 0.56
    sx0 = (x0 + x1) / 2 - sheet_w / 2
    sheet_top = top - (14 * u if not maskable else 10 * u)
    d.rectangle([sx0, sheet_top, sx0 + sheet_w, top + 2 * u], fill=PAPER, outline=INK, width=w)
    # scan lines on the sheet
    for i in range(3):
        ly = sheet_top + (3.5 + i * 3.2) * u
        d.line([sx0 + 3 * u, ly, sx0 + sheet_w - 3 * u, ly], fill=INK, width=max(1, round(1.4 * u)))

    # Machine body
    d.rounded_rectangle([x0, top, x1, bot], radius=4 * u, fill=PANEL, outline=INK, width=w)
    # Paper slot
    slot_m = (x1 - x0) * 0.16
    slot_y = top + (bot - top) * 0.30
    d.line([x0 + slot_m, slot_y, x1 - slot_m, slot_y], fill=INK, width=w)
    # Keypad dots
    r = 1.9 * u
    ky = top + (bot - top) * 0.62
    for i in range(3):
        cx = x0 + (x1 - x0) * (0.30 + 0.20 * i)
        d.ellipse([cx - r, ky - r, cx + r, ky + r], fill=INK)
    # Send lamp
    lr = 2.4 * u
    lx, lyy = x1 - (x1 - x0) * 0.16, top + (bot - top) * 0.62
    d.ellipse([lx - lr, lyy - lr, lx + lr, lyy + lr], fill=SIGNAL)
    return img


base = '/tmp/claude-0/-home-user-noahjefferson/d5976abf-e881-5d58-9b1d-28db0659eafa/scratchpad/fax/public'
draw_icon(512).resize((192, 192), Image.LANCZOS).save(f'{base}/icon-192.png')
draw_icon(512).save(f'{base}/icon-512.png')
draw_icon(512, maskable=True).save(f'{base}/icon-maskable.png')
print('icons written')
