"""Give the owner's logo a transparent background (plan KTD11, requirement 0.3.2).

Run in the dev-env container from the repo root:

    pip install --break-system-packages pillow numpy   # once per container
    python3 scripts/logo/make_transparent.py

Input:  scripts/logo/logo-source.png (the logo on a white background)
Output: public/brand/logo-full.png  (ring and words)
        public/brand/logo-mark.png  (ring only)
        src/app/icon.png            (ring only, square, 256 x 256)

Method (masking, not "colour to alpha"):

1. Background: every near-white, neutral region of 4-connected pixels. This is
   the white that touches the image border, the white disc in the ring centre,
   and the counters of the letters (the inside of "O", "A", "B", "R" ...). The
   logo has no white design element, so all of these are background. They get
   alpha 0.
2. Shadow: every neutral grey pixel (the drop shadows of the words and the grey
   shadow edges of the ring). A grey shadow on white is a partly transparent
   black, so alpha = (255 - grey) / 255 and the colour is black. On a black
   page the shadow then shows as a darker area, not as a grey patch.
3. Edge band: coloured pixels within EDGE_BAND px of the background or of a
   shadow are blends of a logo colour P and that neighbour. P is the colour of
   the nearest interior pixel. The blend fraction comes from a projection on
   the line from the neighbour to P, and the colour is un-blended from the
   neighbour. This removes the white halo without a change to P.
4. Interior: every other pixel keeps its exact colour and alpha 255. This keeps
   the light lavender highlights of the ring, which "colour to alpha" thins.
"""

from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "scripts" / "logo" / "logo-source.png"
OUT_FULL = ROOT / "public" / "brand" / "logo-full.png"
OUT_MARK = ROOT / "public" / "brand" / "logo-mark.png"
OUT_ICON = ROOT / "src" / "app" / "icon.png"

WHITE_MIN = 240  # a background pixel has every channel >= this value
WHITE_CHROMA = 8  # ... and max - min of its channels <= this value
NEUTRAL_CHROMA = 10  # a shadow pixel has max - min <= this value
EDGE_BAND = 2  # px of coloured pixels next to background or shadow to un-blend
PAD = 4  # px of transparent margin around the cropped content
ICON_SIZE = 256


def label_components(mask: np.ndarray) -> np.ndarray:
    """Return a boolean mask of every 4-connected True region (all of them)."""
    # Every white region is background (see the module docstring), so a plain
    # flood fill from each unvisited seed is enough. The labels are not needed.
    h, w = mask.shape
    flat = mask.ravel()
    seen = np.zeros(h * w, dtype=bool)
    for start in np.flatnonzero(flat):
        if seen[start]:
            continue
        seen[start] = True
        queue = deque([start])
        while queue:
            p = queue.popleft()
            x = p % w
            for q in (p - w, p + w, p - 1 if x > 0 else -1, p + 1 if x < w - 1 else -1):
                if 0 <= q < h * w and flat[q] and not seen[q]:
                    seen[q] = True
                    queue.append(q)
    return seen.reshape(h, w)


def dilate(mask: np.ndarray, radius: int) -> np.ndarray:
    """8-connected binary dilation by `radius` px."""
    out = mask.copy()
    for _ in range(radius):
        grown = out.copy()
        grown[1:, :] |= out[:-1, :]
        grown[:-1, :] |= out[1:, :]
        grown[:, 1:] |= out[:, :-1]
        grown[:, :-1] |= out[:, 1:]
        grown[1:, 1:] |= out[:-1, :-1]
        grown[1:, :-1] |= out[:-1, 1:]
        grown[:-1, 1:] |= out[1:, :-1]
        grown[:-1, :-1] |= out[1:, 1:]
        out = grown
    return out


def propagate(values: np.ndarray, known: np.ndarray, target: np.ndarray) -> np.ndarray:
    """Fill each target pixel with the value of a near known pixel (8-neighbour steps)."""
    vals = values.astype(np.float64).copy()
    have = known.copy()
    shifts = [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)]
    for _ in range(4 * EDGE_BAND + 4):
        todo = target & ~have
        if not todo.any():
            break
        acc = np.zeros_like(vals)
        cnt = np.zeros(have.shape, dtype=np.float64)
        for dy, dx in shifts:
            src_have = np.roll(np.roll(have, dy, axis=0), dx, axis=1)
            src_vals = np.roll(np.roll(vals, dy, axis=0), dx, axis=1)
            acc[src_have] += src_vals[src_have]
            cnt[src_have] += 1
        fill = todo & (cnt > 0)
        vals[fill] = acc[fill] / cnt[fill][..., None]
        have = have | fill
    return vals


def make_transparent(rgb: np.ndarray) -> np.ndarray:
    c = rgb.astype(np.float64)
    mn = c.min(axis=2)
    chroma = c.max(axis=2) - mn

    background = label_components((mn >= WHITE_MIN) & (chroma <= WHITE_CHROMA))
    shadow = ~background & (chroma <= NEUTRAL_CHROMA)
    coloured = ~background & ~shadow
    edge = coloured & dilate(background | shadow, EDGE_BAND)
    interior = coloured & ~edge

    alpha = np.ones(mn.shape)
    out = c.copy()

    # 1. Background.
    alpha[background] = 0.0
    out[background] = 0.0

    # 2. Shadow: partly transparent black.
    grey = c.mean(axis=2)
    alpha[shadow] = (255.0 - grey[shadow]) / 255.0
    out[shadow] = 0.0

    # 3. Edge band. P = nearest interior colour; O = the grey level of the
    #    nearest background (255) or shadow pixel.
    level = np.where(background, 255.0, grey)
    p = propagate(c, interior, edge)
    o = propagate(level[..., None], background | shadow, edge)[..., 0]
    o3 = np.repeat(o[..., None], 3, axis=2)

    d = p - o3
    dd = (d * d).sum(axis=2)
    t = np.where(dd > 400.0, ((c - o3) * d).sum(axis=2) / np.maximum(dd, 1e-9), 1.0)
    t = np.clip(t, 0.0, 1.0)

    # Un-blend the logo colour from the neighbour where the fraction is large
    # enough to be stable; use P where it is small.
    safe_t = np.maximum(t, 1e-6)[..., None]
    unblended = np.clip((c - (1.0 - safe_t) * o3) / safe_t, 0.0, 255.0)
    fg = np.where((t >= 0.5)[..., None], unblended, p)

    # The neighbour itself is black with alpha a_o (white: a_o = 0).
    a_o = (255.0 - o) / 255.0
    a_edge = t + (1.0 - t) * a_o
    col_edge = (t[..., None] * fg) / np.maximum(a_edge, 1e-6)[..., None]

    alpha[edge] = a_edge[edge]
    out[edge] = col_edge[edge]

    # 4. Interior: unchanged (out = c, alpha = 1).

    rgba = np.dstack([np.clip(np.rint(out), 0, 255), np.clip(np.rint(alpha * 255.0), 0, 255)])
    return rgba.astype(np.uint8)


def crop_to_content(rgba: np.ndarray, x0: int = 0, x1: int | None = None) -> np.ndarray:
    a = rgba[:, x0:x1, 3]
    ys, xs = np.nonzero(a > 0)
    top, bottom = max(ys.min() - PAD, 0), min(ys.max() + PAD + 1, a.shape[0])
    left, right = max(xs.min() - PAD, 0), min(xs.max() + PAD + 1, a.shape[1])
    return rgba[top:bottom, x0 + left : x0 + right]


def ring_right_edge(rgba: np.ndarray) -> int:
    """Return the first empty column after the ring (the gap before the words)."""
    cols = (rgba[:, :, 3] > 0).any(axis=0)
    first = int(np.argmax(cols))
    in_ring = False
    for x in range(first, cols.size):
        if cols[x]:
            in_ring = True
        elif in_ring:
            return x
    raise SystemExit("No gap between the ring and the words was found.")


def square(rgba: np.ndarray) -> np.ndarray:
    h, w = rgba.shape[:2]
    side = max(h, w)
    canvas = np.zeros((side, side, 4), dtype=np.uint8)
    y, x = (side - h) // 2, (side - w) // 2
    canvas[y : y + h, x : x + w] = rgba
    return canvas


def main() -> None:
    rgb = np.asarray(Image.open(SOURCE).convert("RGB"))
    rgba = make_transparent(rgb)

    full = crop_to_content(rgba)
    mark = crop_to_content(rgba, 0, ring_right_edge(rgba))
    # Pillow resamples RGBA with premultiplied alpha, so no dark fringe appears.
    icon = Image.fromarray(square(mark), "RGBA").resize((ICON_SIZE, ICON_SIZE), Image.LANCZOS)

    for path in (OUT_FULL, OUT_MARK, OUT_ICON):
        path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(full, "RGBA").save(OUT_FULL, optimize=True)
    Image.fromarray(mark, "RGBA").save(OUT_MARK, optimize=True)
    icon.save(OUT_ICON, optimize=True)
    for path, img in ((OUT_FULL, full), (OUT_MARK, mark)):
        print(f"{path.relative_to(ROOT)}: {img.shape[1]} x {img.shape[0]}")
    print(f"{OUT_ICON.relative_to(ROOT)}: {ICON_SIZE} x {ICON_SIZE}")


if __name__ == "__main__":
    main()
