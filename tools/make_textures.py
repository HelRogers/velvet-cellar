"""Generates the tileable material textures used by the site.
Deterministic: run `python3 tools/make_textures.py` to rebuild them.
No photographs or generated imagery are involved, only filtered noise."""
import numpy as np
from PIL import Image
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "src" / "assets" / "textures"
rng = np.random.default_rng(1925)

def noise(n, fx, fy):
    """Periodic (tileable) gaussian-filtered noise, zero mean, unit variance."""
    f = np.fft.fft2(rng.standard_normal((n, n)))
    ky = np.fft.fftfreq(n)[:, None]
    kx = np.fft.fftfreq(n)[None, :]
    out = np.real(np.fft.ifft2(f * np.exp(-((kx / fx) ** 2 + (ky / fy) ** 2))))
    return (out - out.mean()) / out.std()

def ramp(v, stops):
    """Map v in 0..1 through colour stops [(pos, (r,g,b)), ...]."""
    v = np.clip(v, 0, 1)
    pos = [s[0] for s in stops]
    out = np.zeros(v.shape + (3,))
    for c in range(3):
        out[..., c] = np.interp(v, pos, [s[1][c] for s in stops])
    return out.astype(np.uint8)

def hx(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

def save(arr, name, q=84):
    Image.fromarray(arr).save(OUT / name, quality=q, method=6)
    print(name, (OUT / name).stat().st_size // 1024, "KB")

# Burgundy velvet: short upright pile, soft crushed sheen.
n = 1024
pile = noise(n, 0.30, 0.035)
nap = noise(n, 0.05, 0.02)
sheen = noise(n, 0.0045, 0.0035)
v = 0.46 + 0.06 * pile + 0.045 * nap + 0.11 * sheen
save(ramp(v, [(0.0, hx("#1c0209")), (0.35, hx("#36030f")), (0.55, hx("#490518")),
              (0.8, hx("#641024")), (1.0, hx("#7d1a31"))]), "velvet.webp", 80)

# Champagne envelope stock: fine fibres with a faint laid pattern.
n = 512
fibre = noise(n, 0.35, 0.35)
streak = noise(n, 0.012, 0.22)
mottle = noise(n, 0.02, 0.02)
laid = np.sin(np.arange(n)[:, None] / n * 2 * np.pi * 64) * np.ones((1, n))
v = 0.5 + 0.045 * fibre + 0.035 * streak + 0.022 * mottle + 0.012 * laid
save(ramp(v, [(0.0, hx("#9c7f4a")), (0.4, hx("#c3a66d")), (0.6, hx("#d3b981")), (1.0, hx("#efdcab"))]),
     "paper-champagne.webp", 86)

# Aged parchment.
fibre = noise(n, 0.35, 0.35)
mottle = noise(n, 0.012, 0.012)
blot = noise(n, 0.004, 0.004)
v = 0.56 + 0.035 * fibre + 0.045 * mottle + 0.035 * blot
save(ramp(v, [(0.0, hx("#bfa57a")), (0.4, hx("#dcc9a4")), (0.62, hx("#e9dbbd")), (1.0, hx("#f6ecd6"))]),
     "parchment.webp", 86)

# Neutral grain, used as a mask for worn ink and as a light film over flat colour.
n = 128
g = noise(n, 0.4, 0.4) * 0.5 + noise(n, 0.06, 0.06) * 0.5
a = np.clip(0.86 + 0.5 * g, 0, 1)  # mostly solid, with worn patches
rgba = np.zeros((n, n, 4), np.uint8)
rgba[..., :3] = 255
rgba[..., 3] = (a * 255).astype(np.uint8)
Image.fromarray(rgba).save(OUT / "grain.png", optimize=True)
print("grain.png", (OUT / "grain.png").stat().st_size // 1024, "KB")
