"""Replace logo backdrop (white / checkerboard / cream) with auth card navy #0a1628."""
from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image

SRC = Path.home() / "Downloads" / "updated_syndicationx_logo.png"
DST = Path(__file__).resolve().parents[1] / "src/assets/images/updated_syndicationx_logo.png"
CARD = (10, 22, 40, 255)


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


def main() -> None:
    source = SRC if SRC.is_file() else DST
    im = Image.open(source).convert("RGBA")
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

    im.save(DST, optimize=True)
    print(f"Wrote {DST} ({w}x{h}), replaced {n} backdrop pixels")


if __name__ == "__main__":
    main()
