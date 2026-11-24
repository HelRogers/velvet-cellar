"""Crop the host's portraits to one 4:5 frame, centred on the face, in one consistent tone.
Usage: python3 portraits.py <incoming dir> <guests.json> <out dir> <contact sheet>"""
import sys, json, os, glob
from PIL import Image, ImageOps, ImageDraw

incoming, guests_path, out_dir, sheet_path = sys.argv[1:5]
guests = json.load(open(guests_path))['guests']
os.makedirs(out_dir, exist_ok=True)

# Face boxes set by eye (x, y, w, h in the original's pixels) where automatic detection is unreliable,
# and whole crops (x0, y0, x1, y1) where the composition matters more than the face size.
_marks = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'portraits-faces.json')))
FACES, CROPS = _marks['faces'], _marks['crops']
FACE_SHARE, FACE_CENTRE = 0.36, 0.46   # face height as a share of the frame, and where its centre sits

def detect(im):
    return None  # no face detector is installed here: faces are marked by eye in portraits-faces.json

tiles, report = [], []
for g in guests:
    key = g['guest'].lower().replace(' ', '-')
    src = next(iter(glob.glob(os.path.join(incoming, key + '.*'))), None)
    if not src:
        report.append((g['guest'], 'no file')); continue
    im = Image.open(src).convert('RGB'); W, H = im.size
    how = 'auto'
    if key in CROPS:
        x0, y0, x1, y1 = CROPS[key]; how = 'set by eye'
    else:
        face = FACES.get(key); how = 'face set by eye' if face else 'auto'
        if not face:
            face = detect(src)
        if face is None:
            how = 'NO FACE FOUND: centred'; face = (W * 0.3, H * 0.2, W * 0.4, W * 0.4)
        fx, fy, fw, fh = [float(v) for v in face]
        ch = fh / FACE_SHARE; cw = ch * 0.8
        scale = min(1, W / cw, H / ch); cw *= scale; ch *= scale       # never wider or taller than the picture
        x0 = fx + fw / 2 - cw / 2; y0 = fy + fh / 2 - ch * FACE_CENTRE
        x0 = min(max(0, x0), W - cw); y0 = min(max(0, y0), H - ch)
        x1, y1 = x0 + cw, y0 + ch
    crop = im.crop((round(x0), round(y0), round(x1), round(y1)))
    crop = ImageOps.autocontrast(ImageOps.grayscale(crop), cutoff=0.4).resize((640, 800), Image.LANCZOS)
    name = g['slug'] + '.jpg'
    crop.save(os.path.join(out_dir, name), quality=88)
    report.append((g['guest'], f'{W}x{H} -> crop {round(x1-x0)}x{round(y1-y0)} ({how})'))
    t = crop.resize((200, 250)); ImageDraw.Draw(t).rectangle((0, 232, 200, 250), fill=0); ImageDraw.Draw(t).text((4, 235), g['guest'], fill=255)
    tiles.append(t)

cols = 7; rows = -(-len(tiles) // cols)
sheet = Image.new('L', (cols * 204, rows * 254), 60)
for i, t in enumerate(tiles):
    sheet.paste(t, ((i % cols) * 204 + 2, (i // cols) * 254 + 2))
sheet.save(sheet_path)
for r in report: print(f'{r[0]:10s} {r[1]}')
