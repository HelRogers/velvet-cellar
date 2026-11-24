"""Split a tall full-page screenshot into side-by-side strips for review.
python3 tools/strips.py in.png out_prefix strips_per_sheet sheets [skip_top_px]"""
import sys
from PIL import Image
src, prefix, per, sheets = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
skip = int(sys.argv[5]) if len(sys.argv) > 5 else 0
im = Image.open(src).convert('RGB')
im = im.crop((0, skip, im.width, im.height))
n = per * sheets
seg = -(-im.height // n)
for s in range(sheets):
    sheet = Image.new('RGB', (im.width * per + 12 * (per - 1), seg), (60, 60, 60))
    for i in range(per):
        k = s * per + i
        part = im.crop((0, k * seg, im.width, min(im.height, (k + 1) * seg)))
        sheet.paste(part, (i * (im.width + 12), 0))
    sheet.thumbnail((2000, 2000))
    sheet.save(f'{prefix}-{s + 1}.png')
