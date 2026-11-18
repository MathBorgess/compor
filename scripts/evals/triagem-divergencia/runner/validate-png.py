"""Read a single studio PNG from stdin. Exit successfully only after decoding its pixels."""
from io import BytesIO
import sys
import zlib

from PIL import Image, ImageFile

EXPECTED_SIZE = (1024, 1280)
IEND = bytes.fromhex('0000000049454e44ae426082')


def check_raster_length(content):
    width, height = EXPECTED_SIZE
    depth, mode, interlace = content[24], content[25], content[28]
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[mode]
    passes = ((0, 0, 1, 1),) if interlace == 0 else (
        (0, 0, 8, 8), (4, 0, 8, 8), (0, 4, 4, 8), (2, 0, 4, 4),
        (0, 2, 2, 4), (1, 0, 2, 2), (0, 1, 1, 2))
    expected = 0
    for x, y, dx, dy in passes:
        w, h = len(range(x, width, dx)), len(range(y, height, dy))
        if w:
            expected += h * (1 + (w * channels * depth + 7) // 8)
    compressed = []
    pos = 8
    while pos + 12 <= len(content):
        size = int.from_bytes(content[pos:pos+4], 'big')
        if content[pos+4:pos+8] == b'IDAT':
            compressed.append(content[pos+8:pos+8+size])
        pos += 12 + size
    stream = zlib.decompressobj()
    data = stream.decompress(b''.join(compressed), expected + 1)
    # Some decoders paint transparent/black rows if the zlib stream ends early.
    if len(data) != expected or not stream.eof or stream.unused_data or stream.unconsumed_tail:
        raise ValueError('incomplete_png_pixels')


def validate(content):
    if not content.endswith(IEND):
        raise ValueError('invalid_png_end')
    ImageFile.LOAD_TRUNCATED_IMAGES = False
    with BytesIO(content) as stream:
        with Image.open(stream, formats=['PNG']) as image:
            if image.size != EXPECTED_SIZE or image.n_frames != 1:
                raise ValueError('invalid_studio_canvas')
            image.verify()
            # Pillow verifies chunks up to IEND, stopping before its CRC.
            if stream.tell() != len(content) - 4:
                raise ValueError('trailing_png_data')
    check_raster_length(content)
    with Image.open(BytesIO(content), formats=['PNG']) as image:
        image.load()


if __name__ == '__main__':
    validate(sys.stdin.buffer.read())
