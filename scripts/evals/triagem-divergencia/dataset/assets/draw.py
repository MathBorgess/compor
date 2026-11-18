"""Draw the original, purely synthetic reference cards for the two reserved briefs."""
import math
import struct
import zlib
from pathlib import Path

SIZE = 96
CREAM = (250, 244, 219)
INK = (40, 50, 62)
GREEN = (42, 115, 79)
OCHRE = (193, 133, 47)


def rgb(name, x, y):
    if name == 'cais-acorde':
        return (((80, 31, 49), (238, 155, 141)), (CREAM, (80, 31, 49)))[y >= 48][x >= 48]
    if name == 'cais-arco':
        r = math.hypot(x - 48, y - 46)
        arch = 23 < r < 32 and y < 46
        legs = 23 < abs(x - 48) < 32 and 46 <= y < 80
        return (45, 81, 139) if arch or legs else CREAM
    if name == 'cais-moldura':
        return INK if 9 <= min(x, y, 95 - x, 95 - y) <= 14 else CREAM
    if name == 'cais-ondas':
        return INK if (y - int(4 * math.sin(x / 8))) % 15 < 3 else CREAM
    if name == 'cais-fios':
        return INK if 8 <= x <= 87 and (y in (48, 49, 55, 56)) else CREAM
    if name == 'horta-folha':
        long, short = (x - y) / 2, (x + y - 96) / 2
        return GREEN if (long / 31)**2 + (short / 14)**2 < 1 and abs(short) > 1 else CREAM
    if name == 'horta-vazio':
        return GREEN if 12 <= x <= 83 and 60 <= y <= 86 else CREAM
    if name == 'horta-acorde':
        return (75, 103, 124) if x < 56 else (167, 213, 201)
    if name == 'horta-grade':
        return INK if x % 16 < 2 or y % 16 < 2 else CREAM
    if name == 'horta-graos':
        u, v = x % 23 - 11, y % 19 - 9
        tilt = 1 if x // 23 % 2 else -1
        return OCHRE if ((u + tilt*v) / 5)**2 + ((u - tilt*v) / 9)**2 < 1 else CREAM
    if name == 'horta-dois':
        return OCHRE if min((x - 27)**2, (x - 69)**2) + (y - 48)**2 < 15**2 else CREAM
    raise ValueError(name)


def chunk(tag, data):
    return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data))


def draw(name):
    rows = b''.join(b'\0' + bytes(c for x in range(SIZE) for c in rgb(name, x, y)) for y in range(SIZE))
    header = struct.pack('>2I5B', SIZE, SIZE, 8, 2, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b'')


if __name__ == '__main__':
    names = ('cais-acorde', 'cais-arco', 'cais-moldura', 'cais-ondas', 'cais-fios',
             'horta-folha', 'horta-vazio', 'horta-acorde', 'horta-grade', 'horta-graos', 'horta-dois')
    for name in names:
        Path(__file__).with_name(name + '.png').write_bytes(draw(name))
