"""Install a batch of mood board photographs.
Usage: python3 tools/moodboard.py <board id> <items.json>
items.json: [{"source": path, "original": name as sent, "name": short-name, "alt": description, "trim": true if it has screenshot margins}, ...] in display order.
Keeps the original in originals/moodboards/<board>/, trims plain black or white screenshot margins,
saves a JPG to src/assets/moodboards/<board>/ and lists the images in src/content/moodboards.json."""
import sys, json, shutil, os
from PIL import Image, ImageOps
import numpy as np

board_id, items_path = sys.argv[1:3]
items = json.load(open(items_path))
os.makedirs(f'originals/moodboards/{board_id}', exist_ok=True)
os.makedirs(f'src/assets/moodboards/{board_id}', exist_ok=True)

def trim(im):
    a = np.asarray(im.convert('L')).astype(int)
    def keep(axis):
        black = (a < 14).mean(axis=axis) >= 0.985
        white = (a > 243).mean(axis=axis) >= 0.985
        idx = np.where(~(black | white))[0]
        return (int(idx[0]), int(idx[-1]) + 1) if len(idx) else (0, a.shape[1 - axis])
    (y0, y1), (x0, x1) = keep(1), keep(0)
    box = (x0, y0, x1, y1)
    return (im.crop(box), True) if box != (0, 0, im.width, im.height) else (im, False)

listed = []
for n, item in enumerate(items, 1):
    ext = os.path.splitext(item['source'])[1].lower()
    shutil.copyfile(item['source'], f"originals/moodboards/{board_id}/{item['original']}{ext}")
    im = ImageOps.exif_transpose(Image.open(item['source'])).convert('RGB')
    # Only where the item asks for it: dark photographs have genuinely black edges that must not be cut.
    im, trimmed = trim(im) if item.get('trim') else (im, False)
    name = f"{n:02d}-{item['name']}.jpg"
    im.save(f'src/assets/moodboards/{board_id}/{name}', quality=92)
    entry = {'file': name, 'alt': item['alt']}
    if item.get('caption'): entry['caption'] = item['caption']
    listed.append(entry)
    print(f"{item['original']:12s} -> {name:30s} {im.width}x{im.height} height/width {im.height/im.width:.2f}{'  (margin trimmed)' if trimmed else ''}")

p = 'src/content/moodboards.json'; d = json.load(open(p))
next(b for b in d['boards'] if b['id'] == board_id)['images'] = listed
open(p, 'w').write(json.dumps(d, indent=2, ensure_ascii=False) + '\n')
