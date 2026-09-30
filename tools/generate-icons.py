"""Generate dependency-free PNG icons with a pen mark."""
from pathlib import Path
import math
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1] / "icons"
ROOT.mkdir(exist_ok=True)


def chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))


def generate(size, name):
    rows = bytearray()
    for y in range(size):
        rows.append(0)
        for x in range(size):
            px, py = x / size, y / size
            u = ((px - 0.5) - (py - 0.47)) / math.sqrt(2)
            v = ((px - 0.5) + (py - 0.47)) / math.sqrt(2)
            pen = -0.22 < u < 0.22 and abs(v) < 0.045
            nib = -0.30 < u <= -0.22 and abs(v) < (u + 0.30) * 0.56
            line = 0.29 < px < 0.71 and 0.72 < py < 0.745
            rows.extend((255, 255, 255) if pen or nib or line else (31, 122, 77))
    data = b"\x89PNG\r\n\x1a\n"
    data += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
    data += chunk(b"IDAT", zlib.compress(rows))
    data += chunk(b"IEND", b"")
    (ROOT / name).write_bytes(data)


for size, name in [(192, "icon-192.png"), (512, "icon-512.png"),
                   (512, "maskable-512.png"), (180, "apple-touch-icon.png")]:
    generate(size, name)
