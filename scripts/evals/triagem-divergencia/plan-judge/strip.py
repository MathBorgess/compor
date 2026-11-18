"""Monta as referências autorizadas de um caso sintético, na ordem do manifesto."""
import base64
import io
import json
import re
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps

folder = Path(sys.argv[1])
for group in json.load(sys.stdin):
    if not re.fullmatch(r'P[0-9a-f]{8}\.png', group["file"]):
        raise ValueError("Nome de anexo inválido")
    images = group["images"]
    if not 1 <= len(images) <= 20:
        raise ValueError("Quantidade de referências inválida")
    width = min(5, len(images))
    out = Image.new("RGB", (width*168, ((len(images)+width-1)//width)*184), "white")
    draw = ImageDraw.Draw(out)
    for index, encoded in enumerate(images):
        with Image.open(io.BytesIO(base64.b64decode(encoded, validate=True))) as img:
            card = ImageOps.contain(img.convert("RGB"), (160,160), Image.Resampling.NEAREST)
        x,y=(index%width)*168,(index//width)*184
        out.paste(card,(x+(168-card.width)//2,y))
        draw.text((x+5,y+162), "R"+str(index+1), fill="black")
    out.save(folder / group["file"])
