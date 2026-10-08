"""
Prepare updated_syndicationx_logo.png for auth + sidenav:
1. Navy card backdrop (#0a1628)
2. White tagline (ULTIMATE / CAPITAL RAISING MACHINE)
"""
from __future__ import annotations

import shutil
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = Path.home() / "Downloads" / "updated_syndicationx_logo.png"
DST = ROOT / "src/assets/images/updated_syndicationx_logo.png"
CARD = (10, 22, 40, 255)
WHITE = (255, 255, 255, 255)


def is_backdrop(r: int, g: int, b: int, a: int) -> bool:
    if a < 8:
        return True
    chroma = max(r, g, b) - min(r, g, b)
    lum = (r + g + b) / 3
    if lum >= 175 and chroma < 35:
        return True
    if 190 <= r <= 255 and 190 <= g <= 255 and 190 <= b <= 255 and chroma < 12:
        return True
    return False


def is_gold(r: int, g: int, b: int) -> bool:
    return r > 115 and g > 75 and b < 155 and (r - b) > 18


def is_navy(r: int, g: int, b: int) -> bool:
    return r <= 28 and g <= 38 and b <= 58


def is_tagline_band(y: int, h: int) -> bool:
    return h * 0.50 <= y <= h * 0.86


def should_whiten(r: int, g: int, b: int, a: int, y: int, h: int) -> bool:
    if not is_tagline_band(y, h):
        return False
    if a < 40 or is_navy(r, g, b) or is_gold(r, g, b):
        return False
    lum = (r + g + b) / 3
    chroma = max(r, g, b) - min(r, g, b)
    return lum >= 50 and chroma < 75


def apply_backdrop(im: Image.Image) -> int:
    px = im.load()
    w, h = im.size
    seen = [[False] * w for _ in range(h)]
    q: deque[tuple[int, int]] = deque()

    for x in range(w):
        for y in (0, h - 1):
            if is_backdrop(*px[x, y]) and not seen[y][x]:
                seen[y][x] = True
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if is_backdrop(*px[x, y]) and not seen[y][x]:
                seen[y][x] = True
                q.append((x, y))

    n = 0
    while q:
        x, y = q.popleft()
        px[x, y] = CARD
        n += 1
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and is_backdrop(*px[nx, ny]):
                seen[ny][nx] = True
                q.append((nx, ny))
    return n


def apply_white_tagline(im: Image.Image) -> int:
    px = im.load()
    w, h = im.size
    n = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if should_whiten(r, g, b, a, y, h):
                px[x, y] = WHITE
                n += 1
    return n


def main() -> None:
    source = SRC if SRC.is_file() else DST
    if SRC.is_file():
        shutil.copy2(SRC, DST)

    im = Image.open(DST).convert("RGBA")
    backdrop_n = apply_backdrop(im)
    white_n = apply_white_tagline(im)
    im.save(DST, optimize=True)
    print(f"Saved {DST} ({im.size[0]}x{im.size[1]}): backdrop={backdrop_n}, whitened={white_n}")


if __name__ == "__main__":
    main()
