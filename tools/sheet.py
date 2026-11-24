"""Contact sheet of screenshots: python3 tools/sheet.py out.png cols height file1 file2 ..."""
import sys
from PIL import Image
out, cols, h = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
ims = []
for f in sys.argv[4:]:
    im = Image.open(f).convert('RGB')
    w = round(im.width * h / im.height)
    ims.append(im.resize((w, h)))
rows = [ims[i:i + cols] for i in range(0, len(ims), cols)]
W = max(sum(i.width for i in r) + 8 * (len(r) - 1) for r in rows)
H = len(rows) * h + 8 * (len(rows) - 1)
sheet = Image.new('RGB', (W, H), (40, 40, 40))
y = 0
for r in rows:
    x = 0
    for im in r:
        sheet.paste(im, (x, y)); x += im.width + 8
    y += h + 8
sheet.save(out)
