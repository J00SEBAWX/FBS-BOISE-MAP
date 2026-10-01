# FBS Jerry v3 pipeline (stylised, built from scratch) - Sep 29, 2026

Run order (cloud Blender = pip bpy 5.0.1, numpy, scipy, scikit-image): `cd jerry3; python3 head.py 0.0011; python3 hair.py; python3 body.py; python3 apron.py; cd ..; python3 place_jerry3.py` (start from a copy of the store file without Jerry v3 - the script removes older Jerrys). Previews: `jerry3/prev3.py` (head) and `jerry3/prevbody.py` (full body). Renders: `TIME_LIMIT=210 python3 render_v10.py 100 64 <outdir> "CAM 16" ...` in the background (~4 min per view on 2 CPU cores).

Gotchas: marching-cubes faces come out inward - flip winding (done in sdf.py). Blender 5.0 Subdivision with 'Use Limit Surface' blew memory to OOM - turned off. Device transfers cap at 20 MB per file - Jerry meshes are decimated to ~200k verts total (store file ~18.9 MB).

## jerry3/sdf.py - signed-distance sculpting kit
```python
"""Tiny signed-distance sculpting kit (numpy). Shapes are blended with smooth unions/subtractions on a voxel grid,
then turned into a mesh with marching cubes. Units: metres. Negative = inside."""
import numpy as np
from skimage.measure import marching_cubes

f32 = np.float32


def smin(a, b, k):
    if k <= 0: return np.minimum(a, b)
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b + (a - b) * h - k * h * (1 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


def rot(axis, deg):
    a = np.radians(deg); c, s = np.cos(a), np.sin(a)
    if axis == "x": return np.array([[1, 0, 0], [0, c, -s], [0, s, c]], f32)
    if axis == "y": return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]], f32)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]], f32)


def R(*rs):
    """compose rotations: R(('z',10),('x',5)) applies x first then z"""
    M = np.eye(3, dtype=f32)
    for ax, d in rs: M = M @ rot(ax, d)
    return M


def local(X, Y, Z, c, M):
    """world -> local coordinates for a frame whose axes are the columns of M, origin c"""
    x, y, z = X - c[0], Y - c[1], Z - c[2]
    if M is None: return x, y, z
    return (M[0, 0] * x + M[1, 0] * y + M[2, 0] * z,
            M[0, 1] * x + M[1, 1] * y + M[2, 1] * z,
            M[0, 2] * x + M[1, 2] * y + M[2, 2] * z)


class Prim:
    def __init__(self, f, lo, hi):
        self.f, self.lo, self.hi = f, np.asarray(lo, f32), np.asarray(hi, f32)

    def __call__(self, X, Y, Z): return self.f(X, Y, Z)


def sphere(c, r):
    c = np.asarray(c, f32)
    return Prim(lambda X, Y, Z: np.sqrt((X - c[0]) ** 2 + (Y - c[1]) ** 2 + (Z - c[2]) ** 2) - r, c - r, c + r)


def ellipsoid(c, rad, M=None):
    c = np.asarray(c, f32); rad = np.asarray(rad, f32)

    def f(X, Y, Z):
        x, y, z = local(X, Y, Z, c, M)
        k0 = np.sqrt((x / rad[0]) ** 2 + (y / rad[1]) ** 2 + (z / rad[2]) ** 2)
        k1 = np.sqrt((x / rad[0] ** 2) ** 2 + (y / rad[1] ** 2) ** 2 + (z / rad[2] ** 2) ** 2)
        return k0 * (k0 - 1) / np.maximum(k1, 1e-9)
    m = rad.max()
    return Prim(f, c - m, c + m)


def capsule(a, b, ra, rb=None, groove=None):
    """round cone from a (radius ra) to b (radius rb). groove=(amp, count, phase) carves lengthwise ridges (hair)."""
    a = np.asarray(a, f32); b = np.asarray(b, f32); rb = ra if rb is None else rb
    ba = b - a; L2 = float(ba @ ba)
    if groove:
        t = ba / np.sqrt(L2); u = np.cross(t, [0.3, 0.2, 1.0]); u /= np.linalg.norm(u); v = np.cross(t, u)

    def f(X, Y, Z):
        px, py, pz = X - a[0], Y - a[1], Z - a[2]
        h = np.clip((px * ba[0] + py * ba[1] + pz * ba[2]) / L2, 0, 1)
        qx, qy, qz = px - ba[0] * h, py - ba[1] * h, pz - ba[2] * h
        d = np.sqrt(qx * qx + qy * qy + qz * qz) - (ra + (rb - ra) * h)
        if groove:
            amp, n, ph = groove
            ang = np.arctan2(qx * v[0] + qy * v[1] + qz * v[2], qx * u[0] + qy * u[1] + qz * u[2])
            d = d + amp * (ra + (rb - ra) * h) * (0.5 + 0.5 * np.sin(n * ang + ph))
        return d
    m = max(ra, rb)
    return Prim(f, np.minimum(a, b) - m, np.maximum(a, b) + m)


def roundbox(c, half, r, M=None):
    c = np.asarray(c, f32); half = np.asarray(half, f32)

    def f(X, Y, Z):
        x, y, z = local(X, Y, Z, c, M)
        qx, qy, qz = np.abs(x) - half[0] + r, np.abs(y) - half[1] + r, np.abs(z) - half[2] + r
        out = np.sqrt(np.maximum(qx, 0) ** 2 + np.maximum(qy, 0) ** 2 + np.maximum(qz, 0) ** 2)
        return out + np.minimum(np.maximum(qx, np.maximum(qy, qz)), 0) - r
    m = float(np.linalg.norm(half))
    return Prim(f, c - m, c + m)


def torus(c, Rr, r, M=None):
    """ring in the local XY plane"""
    c = np.asarray(c, f32)

    def f(X, Y, Z):
        x, y, z = local(X, Y, Z, c, M)
        return np.sqrt((np.sqrt(x * x + y * y) - Rr) ** 2 + z * z) - r
    m = Rr + r
    return Prim(f, c - m, c + m)


def plane_clip(p, n, lo, hi):
    """half-space: negative on the side opposite the normal (use with intersect/subtract)"""
    p = np.asarray(p, f32); n = np.asarray(n, f32) / np.linalg.norm(n)
    return Prim(lambda X, Y, Z: (X - p[0]) * n[0] + (Y - p[1]) * n[1] + (Z - p[2]) * n[2], lo, hi)


def catmull(pts, n):
    """sample a Catmull-Rom spline through pts with n samples"""
    P = np.asarray(pts, f32)
    P = np.vstack([2 * P[0] - P[1], P, 2 * P[-1] - P[-2]])
    out = []
    segs = len(P) - 3
    for i in range(n):
        t = i / (n - 1) * segs; s = min(int(t), segs - 1); u = t - s
        p0, p1, p2, p3 = P[s], P[s + 1], P[s + 2], P[s + 3]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u ** 3))
    return np.array(out, f32)


class Grid:
    def __init__(self, lo, hi, h):
        self.lo = np.asarray(lo, f32); self.h = f32(h)
        self.n = (np.ceil((np.asarray(hi, f32) - self.lo) / h).astype(int) + 1)
        self.d = np.full(tuple(self.n), 1.0, f32)
        self.ax = [self.lo[i] + self.h * np.arange(self.n[i], dtype=f32) for i in range(3)]

    def region(self, lo, hi):
        sl = []
        for i in range(3):
            a = max(int(np.floor((lo[i] - self.lo[i]) / self.h)), 0)
            b = min(int(np.ceil((hi[i] - self.lo[i]) / self.h)) + 1, self.n[i])
            if a >= b: return None
            sl.append(slice(a, b))
        return (tuple(sl), self.ax[0][sl[0]][:, None, None], self.ax[1][sl[1]][None, :, None], self.ax[2][sl[2]][None, None, :])

    def apply(self, p, op="add", k=0.0, pad=0.0):
        m = max(2 * k, getattr(self, "min_margin", 0.03) if op == "add" else 0.0) + 4 * self.h + pad
        r = self.region(p.lo - m, p.hi + m)
        if r is None: return
        sl, X, Y, Z = r
        dp = p(X, Y, Z).astype(f32)
        cur = self.d[sl]
        if op == "add": self.d[sl] = smin(cur, dp, k)
        elif op == "sub": self.d[sl] = smax(cur, -dp, k)
        elif op == "int": self.d[sl] = smax(cur, dp, k)

    def add(self, p, k=0.0): self.apply(p, "add", k)
    def sub(self, p, k=0.0): self.apply(p, "sub", k)

    def displace(self, fn, lo=None, hi=None):
        """d += fn(X,Y,Z) inside the box (whole grid if none)"""
        lo = self.lo if lo is None else np.asarray(lo, f32)
        hi = self.lo + self.h * (self.n - 1) if hi is None else np.asarray(hi, f32)
        r = self.region(lo, hi)
        if r is None: return
        sl, X, Y, Z = r
        self.d[sl] += fn(X, Y, Z).astype(f32)

    def intersect_all(self, fn, k=0.0):
        sl, X, Y, Z = self.region(self.lo, self.lo + self.h * (self.n - 1))
        self.d = smax(self.d, fn(X, Y, Z).astype(f32), k)

    def mesh(self):
        v, f, _, _ = marching_cubes(self.d, level=0.0, spacing=(float(self.h),) * 3, gradient_direction="ascent")
        return (v + self.lo).astype(f32), f[:, [0, 2, 1]].astype(np.int32)      # outward winding


def save_mesh(path, v, f, **extra):
    np.savez_compressed(path, v=v, f=f, **extra)
```

## jerry3/head.py - head, face, eye sockets/lids, mouth, ears, neck
```python
"""New Jerry (v3) head, sculpted from scratch with blended shapes. Head-local frame: origin ~ ear level at the head
centre, front = -Y, up = +Z, metres. Writes head.npz (mesh + per-vertex paint masks + eye placement)."""
import numpy as np, sys, time
sys.path.insert(0, "/home/claude/work/jerry3")
from sdf import *

H = float(sys.argv[1]) if len(sys.argv) > 1 and not sys.argv[1].startswith("-") else 0.001
t0 = time.time()
G = Grid((-0.115, -0.14, -0.215), (0.115, 0.13, 0.13), H)


def front_y(x, z):
    """y of the first surface hit when looking from the front at (x, z)"""
    i = int(round((x - G.lo[0]) / G.h)); k = int(round((z - G.lo[2]) / G.h)); c = G.d[i, :, k]
    j = int(np.argmax(c < 0))
    t = c[j - 1] / (c[j - 1] - c[j])
    return float(G.ax[1][j - 1] + t * G.h)


# ---- skull + broad face masses (few, simple shapes = cleaner stylised read) ----
G.add(ellipsoid((0, 0.018, 0.028), (0.08, 0.094, 0.09)))                          # cranium
G.add(ellipsoid((0, 0.01, 0.07), (0.072, 0.08, 0.052)), 0.03)                      # fuller top of the skull
G.add(ellipsoid((0, -0.036, -0.024), (0.07, 0.068, 0.076)), 0.035)                  # face
G.add(roundbox((0, -0.022, -0.072), (0.051, 0.05, 0.024), 0.024), 0.03)            # soft square jaw
G.add(ellipsoid((0, -0.076, -0.091), (0.025, 0.017, 0.016)), 0.02)                # chin
G.add(ellipsoid((0, -0.072, 0.034), (0.056, 0.016, 0.014)), 0.02)                  # brow
for s in (-1, 1):
    G.add(ellipsoid((s * 0.058, -0.056, -0.004), (0.02, 0.021, 0.017)), 0.02)       # cheekbones
    G.add(ellipsoid((s * 0.035, -0.082, -0.027), (0.017, 0.013, 0.014)), 0.014)    # smile cheeks
G.add(ellipsoid((0, -0.075, -0.055), (0.031, 0.022, 0.02)), 0.016)                # mouth mound

# ---- eyes (placed from the measured face surface) ----
EYE_R = 0.0146
EX, EZ = 0.0335, 0.0115
EYES = []
for s in (-1, 1):
    fy = front_y(s * EX, EZ)
    EYES.append(np.array((s * EX, fy + EYE_R - 0.0016, EZ), f32))
print("eye front surface", round(fy, 4), "eye centre y", round(float(EYES[0][1]), 4))
for c in EYES:
    G.sub(ellipsoid(c + np.array((0, -EYE_R * 0.55, 0.0018), f32), (0.0172, 0.0095, 0.0118)), 0.005)   # orbit opening
    G.sub(sphere(c, EYE_R + 0.0006), 0.002)


def lid(c, n, off, thick=0.0022, k=0.0011):
    n = np.asarray(n, f32); n /= np.linalg.norm(n)
    rr = EYE_R + 0.0005 + thick / 2

    def f(X, Y, Z):
        x, y, z = X - c[0], Y - c[1], Z - c[2]
        sh = np.abs(np.sqrt(x * x + y * y + z * z) - rr) - thick / 2
        cut = off - (x * n[0] + y * n[1] + z * n[2])
        return smax(smax(sh, cut, k), y - 0.003, 0.002)
    m = rr + thick
    return Prim(f, c - m, c + m)


for i, c in enumerate(EYES):
    s = -1 if i == 0 else 1
    G.add(lid(c, (s * -0.1, 0.3, 1.0), 0.0037, thick=0.0024), 0.003)                            # upper lid
    G.add(lid(c, (s * 0.06, 0.2, -1.0), 0.0068, thick=0.002), 0.003)               # lower lid (smile lifts it)

# ---- nose ----
G.add(capsule((0, -0.087, 0.015), (0, -0.1005, -0.016), 0.0082, 0.0105), 0.012)
G.add(sphere((0, -0.1065, -0.027), 0.0148), 0.008)
for s in (-1, 1):
    G.add(ellipsoid((s * 0.0148, -0.098, -0.033), (0.0098, 0.0085, 0.0085)), 0.006)
for s in (-1, 1):
    G.sub(ellipsoid((s * 0.008, -0.1055, -0.0402), (0.0042, 0.005, 0.0025)), 0.0022)

# ---- mouth: modest lips + a carved smile line, all measured from the surface ----
ULZ, LLZ = -0.0538, -0.0666
UL = ellipsoid((0, front_y(0, ULZ) + 0.0038, ULZ), (0.02, 0.0052, 0.0036))
LL = ellipsoid((0, front_y(0, LLZ) + 0.0042, LLZ), (0.0175, 0.006, 0.0048))
G.add(LL, 0.007)
pts = [(-0.0318, -0.0492), (-0.017, -0.0586), (0, -0.0606), (0.017, -0.0586), (0.0318, -0.0492)]
line = catmull([(x, front_y(x, z) + 0.0007, z) for x, z in pts], 21)
for a, b in zip(line[:-1], line[1:]):
    G.sub(capsule(a, b, 0.00095), 0.0012)
for s in (-1, 1):
    x, z = s * 0.033, -0.0482
    G.sub(sphere((x, front_y(x, z) + 0.0012, z), 0.0018), 0.0025)                   # smile corners

# ---- upper-lid crease + soft groove under the lower lip ----
for i, c in enumerate(EYES):
    s = -1 if i == 0 else 1
    n = np.array((s * -0.1, 0.3, 1.0), f32); n /= np.linalg.norm(n)
    off = 0.0037 + 0.0042; rr = EYE_R + 0.0035
    cc = c + n * off; rad = np.sqrt(rr * rr - off * off)
    u = np.cross(n, (0, 1, 0)); u /= np.linalg.norm(u); w = np.cross(n, u)
    pts = [cc + rad * (np.cos(t) * u + np.sin(t) * w) for t in np.linspace(0, 2 * np.pi, 200)]
    pts = [p for p in pts if p[1] < c[1] - 0.006]
    pts = sorted(pts, key=lambda p: p[0])
    pts = [np.array((p[0], front_y(p[0], p[2]) + 0.0007, p[2]), f32) for p in pts]
    for k in range(len(pts) - 1):
        tt = k / max(len(pts) - 2, 1)
        G.sub(capsule(pts[k], pts[k + 1], 0.0007 * np.sin(np.pi * tt) ** 0.5 + 0.0001), 0.0016)
mz = -0.0775
cl = catmull([(x, front_y(x, mz) + 0.0012, mz + 0.004 * (abs(x) / 0.012) ** 2) for x in (-0.012, -0.006, 0, 0.006, 0.012)], 11)
for a_, b_ in zip(cl[:-1], cl[1:]):
    G.sub(capsule(a_, b_, 0.001), 0.005)

# ---- ears ----
for s in (-1, 1):
    M = R(("z", s * 18), ("x", -10))
    G.add(ellipsoid((s * 0.081, 0.016, -0.002), (0.0085, 0.018, 0.029), M), 0.006)
    G.sub(ellipsoid((s * 0.0875, 0.014, -0.006), (0.005, 0.0115, 0.0175), M), 0.004)

# ---- neck ----
G.add(capsule((0, 0.024, -0.075), (0, 0.03, -0.215), 0.059), 0.014)
print("sdf done", round(time.time() - t0, 1), "s", G.n)
np.savez_compressed("/home/claude/work/jerry3/head_sdf.npz", d=G.d.astype(np.float16), lo=G.lo, h=G.h)
v, f = G.mesh()
print("mesh", len(v), "verts", len(f), "tris")


def near(p, fall):
    d = p(v[:, 0], v[:, 1], v[:, 2])
    return np.clip(1 - d / fall, 0, 1).astype(f32)


ULm = ellipsoid((0, front_y(0, ULZ) + 0.0042, ULZ + 0.0008), (0.019, 0.0048, 0.0026))
lips = np.maximum(0.7 * near(ULm, 0.0016), near(LL, 0.0018))
blush = np.maximum(near(sphere((-0.042, -0.082, -0.028), 0.004), 0.028), near(sphere((0.042, -0.082, -0.028), 0.004), 0.028))
nose = near(sphere((0, -0.11, -0.027), 0.01), 0.016)
ears = np.maximum(near(sphere((-0.085, 0.014, -0.004), 0.02), 0.012), near(sphere((0.085, 0.014, -0.004), 0.02), 0.012))
lidm = np.zeros(len(v), f32)
for c in EYES:
    lidm = np.maximum(lidm, np.clip(1 - (np.linalg.norm(v - c, axis=1) - EYE_R) / 0.006, 0, 1))
save_mesh("/home/claude/work/jerry3/head.npz", v, f, lips=lips, blush=blush, nose=nose, ears=ears, lids=lidm,
          eyes=np.array(EYES), eye_r=EYE_R)
print("saved", round(time.time() - t0, 1), "s")
```

## jerry3/hair.py - hair clumps, eyebrows, lashes
```python
"""Jerry v3 hair, brows and lashes, sculpted as clumps with strand grooves (stylised animated-film look).
Copper-auburn, short on the sides, soft swept-up quiff with a side part on his left (+X). Head-local metres."""
import numpy as np, sys, time
from scipy.ndimage import map_coordinates
sys.path.insert(0, "/home/claude/work/jerry3")
from sdf import *

t0 = time.time()
rng = np.random.default_rng(7)
Z = np.load("/home/claude/work/jerry3/head_sdf.npz"); HD = Z["d"].astype(np.float32); HLO = Z["lo"]; HH = float(Z["h"])
HZ = np.load("/home/claude/work/jerry3/head.npz"); HV = HZ["v"]; EYES = HZ["eyes"]; EYE_R = float(HZ["eye_r"])


HHI = HLO + HH * (np.array(HD.shape) - 1)


def head_d(p):
    p = np.atleast_2d(p); idx = ((p - HLO) / HH).T
    out = np.linalg.norm(np.maximum(np.maximum(HLO - p, p - HHI), 0), axis=1)     # distance beyond the stored box
    return map_coordinates(HD, idx, order=1, mode="nearest") + out


def head_n(p):
    p = np.atleast_2d(p); e = 0.0008; g = np.zeros_like(p)
    for i in range(3):
        dp = np.zeros(3, np.float32); dp[i] = e
        g[:, i] = (head_d(p + dp) - head_d(p - dp)) / (2 * e)
    return g / np.maximum(np.linalg.norm(g, axis=1, keepdims=True), 1e-9)


# ---- hairline (by azimuth around the head: 0 = front, 90 = side, 180 = back) ----
PHI = np.array([0, 25, 42, 55, 63, 69, 74, 79, 90, 104, 115, 135, 180])
ZL = np.array([0.079, 0.081, 0.078, 0.064, 0.046, 0.012, -0.004, 0.03, 0.037, 0.03, 0.006, -0.036, -0.058])


def zline(x, y):
    phi = np.degrees(np.abs(np.arctan2(x, -(y - 0.012))))
    return np.interp(phi, PHI, ZL)


def region(x, y, z):
    """>0 inside the hair area"""
    return z - zline(x, y)


PART_X = 0.03          # side part on his left


def flow(p, n):
    x, y, z = p
    top = np.clip((z - 0.05) / 0.03, 0, 1)
    side = np.clip((0.06 - z) / 0.04, 0, 1) if y < 0.05 else 0.0
    if x > PART_X:        # small side: combed down towards his left ear
        f = np.array((0.8, 0.45, -0.3))
    else:                 # big side: swept across and back, front lifted into a soft quiff
        front = np.clip((-0.02 - y) / 0.05, 0, 1)
        f = np.array((-0.55, 0.85, 0.15)) * (1 - front) + np.array((-0.35, 0.45, 0.9)) * front
    f = f * top + np.array((0.0, 0.55, -1.0)) * (1 - top)
    if y > 0.05: f = f * 0.4 + np.array((0.0, 0.25, -1.0)) * 0.6 * (1 - top)
    f = f - (f @ n) * n
    return f / max(np.linalg.norm(f), 1e-9)


def thick(p):
    x, y, z = p
    t = 0.0035 + 0.0075 * np.clip((z - 0.03) / 0.05, 0, 1)
    edge = np.clip(region(x, y, z) / 0.008, 0, 1)
    return t * (0.35 + 0.65 * edge)


# ================= HAIR =================
G = Grid((-0.108, -0.13, -0.08), (0.108, 0.13, 0.17), 0.0008)
G.min_margin = 0.004


def cap_f(X, Y, Z):
    X, Y, Z = np.broadcast_arrays(X, Y, Z)
    P = np.stack([X.ravel(), Y.ravel(), Z.ravel()], 1)
    d = head_d(P).reshape(X.shape)
    t = 0.0035 + 0.0075 * np.clip((Z - 0.03) / 0.05, 0, 1)
    reg = Z - zline(X, Y)
    t = t * (0.35 + 0.65 * np.clip(reg / 0.008, 0, 1))
    return smax(d - t, -reg, 0.0015)


# evaluate the cap slab-by-slab to keep memory low
for k0 in range(0, G.n[2], 40):
    sl = (slice(None), slice(None), slice(k0, min(k0 + 40, G.n[2])))
    X = G.ax[0][:, None, None]; Y = G.ax[1][None, :, None]; Zc = G.ax[2][sl[2]][None, None, :]
    G.d[sl] = np.minimum(G.d[sl], cap_f(X, Y, Zc))
print("cap", round(time.time() - t0, 1))

# roots: scalp vertices inside the hair area, thinned to ~5 mm spacing
sel = HV[region(HV[:, 0], HV[:, 1], HV[:, 2]) > 0.002]
rng.shuffle(sel)
keep, occ = [], set()
for p in sel:
    key = tuple((p // 0.0048).astype(int))
    if key in occ: continue
    occ.add(key); keep.append(p)
roots = np.array(keep)
print("roots", len(roots))
n_clumps = 0
for r0 in roots:
    x, y, z = r0
    top = z > 0.05
    front = (y < -0.03) and x <= PART_X and top
    L = (0.055 + 0.02 * rng.random()) if top else (0.012 + 0.008 * rng.random())
    if front: L += 0.012
    rad = (0.0042 if top else 0.0026) * (0.8 + 0.4 * rng.random())
    Q = (0.021 * np.clip((-0.01 - y) / 0.06, 0, 1) + 0.003) if (top and x <= PART_X) else (0.002 if top else 0.0)
    steps = 9 if top else 5
    p = r0.copy(); pts = []
    jit = rng.normal(0, 0.18, 3)
    for i in range(steps + 1):
        s = i / steps
        nrm = head_n(p)[0]
        h = thick(p) + rad * (1 - 0.7 * s) * 0.55 + Q * np.sin(np.pi * min(s * 1.25, 1.0)) ** 0.8 * (1 - 0.3 * s)
        pts.append(p + nrm * (h - head_d(p)[0]))
        f = flow(p, nrm) + jit * 0.5; f -= (f @ nrm) * nrm; f /= np.linalg.norm(f)
        p = p + f * (L / steps)
        p = p - head_n(p)[0] * head_d(p)[0]          # stay on the scalp
        if not top and region(*p) < 0.001: break
    if len(pts) < 2: continue
    pts = catmull(pts, len(pts) * 2 - 1)
    ph = rng.random() * 6.28
    for i in range(len(pts) - 1):
        s0, s1 = i / (len(pts) - 1), (i + 1) / (len(pts) - 1)
        G.apply(capsule(pts[i], pts[i + 1], rad * (1 - 0.72 * s0), rad * (1 - 0.72 * s1), groove=(0.22, 5, ph)), "add", 0.0012)
    n_clumps += 1
print("clumps", n_clumps, round(time.time() - t0, 1))
v, f = G.mesh()
dep = np.clip(head_d(v) / 0.02, 0, 1).astype(np.float32)             # 0 at scalp -> 1 at the outer layer
fl = np.array([flow(p, nn) for p, nn in zip(v[::1], head_n(v))], np.float32)
save_mesh("/home/claude/work/jerry3/hair.npz", v, f, depth=dep, flow=fl)
print("hair mesh", len(v), round(time.time() - t0, 1))

# ================= BROWS =================
# solid tapered brow shapes with fine lengthwise hair grooves, plus a few short upward hairs at the inner ends
B = Grid((-0.075, -0.12, 0.012), (0.075, -0.05, 0.065), 0.0004)
B.min_margin = 0.003


def skin_front(x, z):
    ys = np.linspace(-0.12, -0.05, 281); P = np.stack([np.full_like(ys, x), ys, np.full_like(ys, z)], 1)
    k = int(np.argmax(head_d(P) < 0)); return ys[max(k - 1, 0)]


for s in (-1, 1):
    arc = [(s * 0.0125, 0.0332), (s * 0.022, 0.0368), (s * 0.034, 0.0388), (s * 0.047, 0.0382), (s * 0.057, 0.0352), (s * 0.0615, 0.0322)]
    ac = catmull(arc, 30)
    N = len(ac)
    HT = np.array([0.0036 * (0.85 + 0.35 * np.sin(np.pi * min(u * 1.5, 1.0))) * (1 - 0.72 * u ** 1.3) for u in np.linspace(0, 1, N)])   # half-height
    for j in np.linspace(-1, 1, 5):                       # 5 lengthwise rows stacked across the brow height -> a flat, tapered shape
        SP = np.array([(x, skin_front(x, z + j * h_), z + j * h_) for (x, z), h_ in zip(ac, HT)], np.float32)
        NR = head_n(SP)
        rr = 0.00105 + 0.0005 * (1 - abs(j)) - 0.0003 * np.linspace(0, 1, N)
        P = SP + NR * (rr * 0.35)[:, None]
        ph = rng.random() * 6
        for i in range(N - 1):
            B.apply(capsule(P[i], P[i + 1], rr[i], rr[i + 1], groove=(0.3, 5, ph)), "add", 0.0009)
    for j in range(7):                                     # inner-end hairs flicking up
        t = j / 6
        x = s * (0.0125 + 0.004 * t); z = 0.0305 + 0.0015 * t
        p0 = np.array((x, skin_front(x, z) + 0.0008, z), np.float32)
        d = np.array((s * (0.15 + 0.5 * t), -0.1, 1.0)); d /= np.linalg.norm(d)
        B.apply(capsule(p0, p0 + d * (0.0045 + 0.001 * rng.random()), 0.0008, 0.0002), "add", 0.0004)
bv, bf = B.mesh()
save_mesh("/home/claude/work/jerry3/brows.npz", bv, bf)
print("brows", len(bv))

# ================= LASHES (upper lid line) =================
Lg = Grid((-0.06, -0.105, -0.006), (0.06, -0.06, 0.03), 0.00025)
Lg.min_margin = 0.002
for i, c in enumerate(EYES):
    s = -1 if i == 0 else 1
    n = np.array((s * -0.1, 0.3, 1.0)); n /= np.linalg.norm(n)
    off = 0.0042; rr = EYE_R + 0.0005 + 0.0022
    cc = c + n * off; rad = np.sqrt(rr * rr - off * off)
    u = np.cross(n, (0, 1, 0)); u /= np.linalg.norm(u); w = np.cross(n, u)
    pts = []
    for th in np.linspace(0, 2 * np.pi, 360):
        p = cc + rad * (np.cos(th) * u + np.sin(th) * w)
        if p[1] < c[1] - 0.0035: pts.append(p)
    pts = np.array(pts); pts = pts[np.argsort(pts[:, 0])]
    xs = pts[:, 0]; t = (xs - xs.min()) / (xs.max() - xs.min())
    outer = t if s > 0 else 1 - t
    for k in range(len(pts) - 1):
        a, b = pts[k], pts[k + 1]
        r = 0.0008 + 0.0006 * outer[k]
        Lg.apply(capsule(a + np.array((0, -0.0003, 0.0003)), b + np.array((0, -0.0003, 0.0003)), r), "add", 0.0003)
    for k in range(0, len(pts), max(len(pts) // 9, 1)):        # a few soft flicks, longer at the outer corner
        if outer[k] < 0.35: continue
        a = pts[k] + np.array((0, -0.0003, 0.0004))
        d = np.array((s * 0.9 * outer[k], -0.6, 0.55)); d /= np.linalg.norm(d)
        Lg.apply(capsule(a, a + d * (0.0018 + 0.0022 * outer[k]), 0.00045, 0.00012), "add", 0.0003)
lv, lf = Lg.mesh()
save_mesh("/home/claude/work/jerry3/lashes.npz", lv, lf)
print("lashes", len(lv), round(time.time() - t0, 1))
```

## jerry3/body.py - shirt, tee, trousers, belt, boots, forearms + hands
```python
"""Jerry v3 body + clothes, sculpted from scratch (world metres, feet on z=0, facing -Y).
Chambray work shirt (sleeves rolled), heather-grey tee in the open collar, khaki work trousers, brown leather belt,
brown leather work boots, bare forearms + stylised hands. Each part -> its own npz mesh."""
import numpy as np, json, sys, time
sys.path.insert(0, "/home/claude/work/jerry3")
from sdf import *

OUT = "/home/claude/work/jerry3/"
ONLY = sys.argv[1:] or ["shirt", "tee", "pants", "belt", "boots", "armR", "armL"]
t0 = time.time()
V = lambda *a: np.array(a, f32)
nrm = lambda v: v / np.linalg.norm(v)

# ---------------- skeleton (weight on his right leg; relaxed arms) ----------------
S = dict(
    head=V(0, -0.004, 1.668), neck=V(0, 0.03, 1.49),
    shR=V(-0.19, 0.022, 1.44), shL=V(0.19, 0.022, 1.45),
    elR=V(-0.245, 0.05, 1.15), elL=V(0.25, 0.04, 1.16),
    wrR=V(-0.262, -0.002, 0.905), wrL=V(0.27, -0.015, 0.918),
    hipR=V(-0.09, 0.012, 0.935), hipL=V(0.09, 0.012, 0.928),
    knR=V(-0.098, 0.002, 0.515), knL=V(0.098, -0.022, 0.52),
    anR=V(-0.104, 0.03, 0.095), anL=V(0.126, 0.018, 0.095),
)
YAW = dict(R=-9.0, L=16.0)          # toes turned out a little
json.dump({k: v.tolist() for k, v in S.items()} | {"yaw": YAW}, open(OUT + "skeleton.json", "w"), indent=1)


def grid_for(prims, h, pad=0.012):
    lo = np.min([p.lo for p in prims], 0) - pad; hi = np.max([p.hi for p in prims], 0) + pad
    return Grid(lo, hi, h)


def frame(fwd, side_hint):
    """rotation whose local -Z runs along fwd and local +X is as close as possible to side_hint"""
    ez = -nrm(np.asarray(fwd, f32)); ex = np.asarray(side_hint, f32); ex = nrm(ex - (ex @ ez) * ez); ey = np.cross(ez, ex)
    return np.stack([ex, ey, ez], 1).astype(f32)


def fold_wave(G, fn, lo, hi):
    G.displace(fn, lo, hi)


def done(name, G, **extra):
    v, f = G.mesh()
    save_mesh(OUT + name + ".npz", v, f, **{k: (fn(v) if callable(fn) else fn) for k, fn in extra.items()})
    print(name, len(v), "verts", round(time.time() - t0, 1), "s")
    return v


# ---------------- shared torso shape (outer surface of the shirt) ----------------
def torso_prims(off=0.0):
    P = [(ellipsoid(V(0, 0.0, 1.29), V(0.172, 0.118, 0.17) + off), 0.0),
         (ellipsoid(V(0, 0.02, 1.402), V(0.198, 0.104, 0.07) + off), 0.05),
         (ellipsoid(V(0, -0.006, 1.1), V(0.166, 0.126, 0.15) + off), 0.06),
         (ellipsoid(V(0, 0.01, 1.0), V(0.168, 0.121, 0.08) + off), 0.04)]
    for s, sh in ((-1, S["shR"]), (1, S["shL"])):
        P.append((capsule(V(s * 0.048, 0.03, 1.502), sh + V(-s * 0.02, 0, 0.0), 0.048 + off), 0.04))
        P.append((sphere(sh + V(0, 0, -0.012), 0.06 + off), 0.04))
    return P


# ================= SHIRT =================
if "shirt" in ONLY:
    prims = torso_prims()
    G = Grid((-0.33, -0.19, 0.95), (0.33, 0.2, 1.56), 0.002)
    for p, k in prims: G.add(p, k)
    for s, sh, el, wr in ((-1, S["shR"], S["elR"], S["wrR"]), (1, S["shL"], S["elL"], S["wrL"])):
        fa = nrm(wr - el)
        G.add(capsule(sh + V(0, 0, -0.01), el, 0.056, 0.048), 0.025)                   # sleeve
        G.add(capsule(el, el + fa * 0.045, 0.05, 0.049), 0.012)
        M = frame(fa, (1, 0, 0))
        for j, (dd, rr) in enumerate(((0.052, 0.0135), (0.066, 0.0125), (0.078, 0.0105))):   # rolled cuff layers
            G.add(torus(el + fa * dd, 0.0415 + 0.002 * j, rr, M @ R(("x", 0))), 0.004)
        G.sub(capsule(el + fa * 0.083, el + fa * 0.2, 0.05), 0.002)                     # open end of the roll
        # soft folds in the elbow crook
        ax = nrm(el - sh)

        def crook(X, Y, Z, el=el, ax=ax, s=s):
            dx, dy, dz = X - el[0], Y - el[1], Z - el[2]
            u = dx * ax[0] + dy * ax[1] + dz * ax[2]
            inner = np.clip(-(dy + 0.02) / 0.05, 0, 1)                                   # front/inner side of the arm
            env = np.exp(-(u / 0.07) ** 2) * inner
            return 0.0032 * env * np.sin(u * 150 + 1.3)
        G.displace(crook, el - 0.1, el + 0.1)
    # neck opening (cylinder round the neck, above the shoulder line) + open V
    N = S["neck"]

    def rn(X, Y): return np.sqrt(X * X + ((Y - N[1]) / 0.95) ** 2)

    def th(X, Y): return np.arctan2(X, -(Y - N[1]))           # 0 = front, +-pi = back
    G.sub(Prim(lambda X, Y, Z: smax(rn(X, Y) - 0.075, 1.455 - Z, 0.004), V(-0.1, -0.1, 1.4), V(0.1, 0.13, 1.6)), 0.004)
    vcut = Prim(lambda X, Y, Z: smax(smax(np.abs(X) - np.clip((Z - 1.37) * 0.6, 0, 1), Y + 0.04, 0.004), 1.37 - Z, 0.004),
                V(-0.08, -0.2, 1.34), V(0.08, 0.0, 1.56))
    G.sub(vcut, 0.004)
    D0 = G.d.copy()
    reg = G.region(V(-0.2, -0.2, 1.36), V(0.2, 0.16, 1.58))
    sl, X, Y, Z = reg
    X, Y, Z = np.broadcast_arrays(X, Y, Z)
    r = rn(X, Y); t = np.abs(th(X, Y))
    # stand-up band: higher at the back, open at the front
    zb = 1.487 + 0.034 * (1 - np.cos(t)) / 2
    band = smax(np.abs(r - 0.0785) - 0.0027, np.maximum(zb - 0.075 - Z, Z - zb - 0.0145), 0.002)
    band = smax(band, (0.3 - t) * r, 0.003)
    # collar leaves lying on the shirt, spreading into points at the front
    w = 0.027 + 0.038 * np.clip((1.3 - t) / 0.9, 0, 1)
    outline = smax(0.075 - r, r - 0.075 - w, 0.004)
    outline = smax(outline, (0.36 + 0.75 * np.clip(r - 0.075, 0, 1) * 6 * 0.1 - t) * r, 0.003)
    outline = smax(outline, 1.395 - Z, 0.004)
    leaf = smax(np.abs(D0[sl] - 0.0038) - 0.0022, outline, 0.0015)
    G.d[sl] = smin(G.d[sl], smin(band, leaf, 0.004), 0.002)
    # placket + 2 buttons (visible above the apron bib), seams
    G.add(roundbox(V(0, -0.118, 1.33), V(0.013, 0.004, 0.05), 0.003), 0.004)
    for s in (-1, 1):
        sh = S["shR"] if s < 0 else S["shL"]; el = S["elR"] if s < 0 else S["elL"]
        G.sub(torus(sh + V(-s * 0.012, 0, -0.02), 0.062, 0.0011, frame(nrm(el - sh), (0, 1, 0))), 0.0012)   # armhole seam
    # fabric: tucked-in blousing above the belt + a few long drape folds
    def drape(X, Y, Z):
        blouse = np.exp(-((Z - 1.055) / 0.035) ** 2)
        side = np.clip((np.abs(X) - 0.08) / 0.06, 0, 1)
        return (0.0028 * blouse * np.sin(np.arctan2(X, Y) * 22 + Z * 30)
                + 0.0022 * side * np.sin(Z * 55 + np.abs(X) * 40) * np.clip((1.25 - Z) / 0.2, 0, 1))
    G.displace(drape, V(-0.33, -0.19, 0.95), V(0.33, 0.2, 1.3))
    G.d[:, :, :3] = np.maximum(G.d[:, :, :3], 0.001)                                    # open at the tuck (hidden in the pants)
    BUT = [V(0, -0.1235, 1.345), V(0, -0.1225, 1.29)]
    done("shirt", G)
    Gb = Grid((-0.02, -0.14, 1.26), (0.02, -0.1, 1.37), 0.0005)
    for c in BUT:
        Gb.add(Prim(lambda X, Y, Z, c=c: smax(np.sqrt((X - c[0]) ** 2 + (Z - c[2]) ** 2) - 0.0058, np.abs(Y - c[1]) - 0.0012, 0.0008), c - 0.01, c + 0.01))
        for dx in (-0.0017, 0.0017):
            Gb.sub(capsule(c + V(dx, -0.003, 0), c + V(dx, 0.003, 0), 0.0007))
    done("buttons", Gb)

# ================= TEE (heather grey, shows in the open collar) =================
if "tee" in ONLY:
    G = Grid((-0.2, -0.15, 1.3), (0.2, 0.15, 1.53), 0.0015)
    for p, k in torso_prims(-0.006): G.add(p, k)
    N = S["neck"]
    G.sub(capsule(N + V(0, 0.004, -0.02), N + V(0, 0.01, 0.2), 0.07), 0.003)
    # rib collar band hugging the neck (lower at the front)
    def rib(X, Y, Z):
        r = np.sqrt(X * X + ((Y - 0.029) / 0.97) ** 2); t = np.arctan2(X, -(Y - 0.029))
        zc = 1.462 + 0.02 * (1 - np.cos(t)) / 2
        return smax(np.abs(r - 0.0728) - 0.0032, np.abs(Z - zc) - 0.0065, 0.0015)
    G.add(Prim(rib, V(-0.1, -0.08, 1.43), V(0.1, 0.12, 1.5)), 0.002)
    done("tee", G)

WAISTBAND = Prim(lambda X, Y, Z: smax(np.sqrt((X / 0.174) ** 2 + ((Y - 0.012) / 0.133) ** 2) * 0.15 - 0.15, np.abs(Z - 1.02) - 0.047, 0.012),
                 V(-0.2, -0.15, 0.95), V(0.2, 0.17, 1.08))
PELVIS = ellipsoid(V(0, 0.02, 0.945), V(0.172, 0.125, 0.112))

# ================= PANTS =================
if "pants" in ONLY:
    G = Grid((-0.29, -0.2, 0.08), (0.29, 0.21, 1.075), 0.002)
    G.add(PELVIS)
    G.add(WAISTBAND, 0.03)                                                                  # waistband
    for s in (-1, 1):
        G.add(sphere(V(s * 0.066, 0.06, 0.905), 0.074), 0.04)
    for hip, kn, an, s in ((S["hipR"], S["knR"], S["anR"], -1), (S["hipL"], S["knL"], S["anL"], 1)):
        G.add(capsule(hip + V(s * 0.005, 0, 0.02), kn, 0.1, 0.073), 0.05)
        hem = an + V(0, -0.008, 0.035)
        G.add(capsule(kn, hem, 0.073, 0.066), 0.02)
        G.add(ellipsoid(hem + V(0, -0.006, 0.02), V(0.066, 0.072, 0.045)), 0.02)          # break over the boot
        # hem: slanted cut, lower at the back
        cutoff = an[2] + 0.02

        def hemcut(X, Y, Z, an=an, cutoff=cutoff):
            return (cutoff - 0.08 * (Y - an[1])) - Z
        r = G.region(an - V(0.12, 0.12, 0.2), an + V(0.12, 0.12, 0.06))
        sl, X, Y, Z = r
        G.d[sl] = smax(G.d[sl], hemcut(X, Y, Z), 0.003)
        G.sub(capsule(an + V(0, 0, -0.1), an + V(0, 0, 0.035), 0.052), 0.004)            # open leg (boot goes in)

        def legfolds(X, Y, Z, kn=kn, an=an):
            brk = np.exp(-((Z - (an[2] + 0.06)) / 0.05) ** 2)
            knee = np.exp(-((Z - kn[2]) / 0.06) ** 2) * np.clip((Y - kn[1] + 0.01) / 0.05, 0, 1)
            ang = np.arctan2(X - an[0], Y - an[1])
            return 0.004 * brk * np.sin(Z * 170 + ang * 3) + 0.003 * knee * np.sin(Z * 130 + ang * 2)
        G.displace(legfolds, an - V(0.12, 0.12, 0.1), kn + V(0.12, 0.12, 0.1))
    # crotch / thigh drape
    def crotch(X, Y, Z):
        env = np.exp(-((Z - 0.8) / 0.08) ** 2) * np.exp(-(X / 0.06) ** 2)
        return 0.003 * env * np.sin(np.arctan2(Z - 0.85, X) * 9)
    pass
    G.d[:, :, -2:] = np.maximum(G.d[:, :, -2:], 0.001)
    done("pants", G)

# ================= BELT =================
if "belt" in ONLY:
    G = Grid((-0.2, -0.15, 0.98), (0.2, 0.16, 1.06), 0.001)
    Wg = Grid((-0.2, -0.15, 0.98), (0.2, 0.16, 1.08), 0.001)
    Wg.min_margin = 0.06
    Wg.add(PELVIS); Wg.add(WAISTBAND, 0.03)
    ZZ = Wg.ax[2][None, None, :]
    G = Wg
    G.d = smax(np.abs(Wg.d - 0.0026) - 0.0024, np.abs(ZZ - 1.045) - 0.0165, 0.0015)
    fy = -0.128
    G.add(roundbox(V(0, fy - 0.004, 1.045), V(0.028, 0.004, 0.022), 0.004), 0.001)       # buckle
    G.sub(roundbox(V(0, fy - 0.009, 1.045), V(0.019, 0.004, 0.013), 0.003), 0.001)
    done("belt", G, buckle=lambda v: (np.abs(v[:, 0]) < 0.03) * (v[:, 1] < fy - 0.001) * 1.0)

# ================= BOOTS =================
if "boots" in ONLY:
    for side in ("R", "L"):
        an = S["an" + side]; M = R(("z", YAW[side]))
        Pp = []
        def L(p): return an * V(1, 1, 0) + (M @ V(*p))
        G = Grid(an * V(1, 1, 0) + V(-0.14, -0.26, 0.0), an * V(1, 1, 0) + V(0.14, 0.16, 0.2), 0.0012)
        G.add(roundbox(L((0, 0.008, 0.105)), V(0.05, 0.058, 0.07), 0.034, M))              # ankle shaft
        G.add(roundbox(L((0, -0.055, 0.045)), V(0.047, 0.105, 0.04), 0.03, M), 0.02)        # foot
        G.add(ellipsoid(L((0, -0.138, 0.038)), V(0.046, 0.052, 0.032), M), 0.02)            # rounded toe
        G.add(roundbox(L((0, 0.045, 0.045)), V(0.046, 0.042, 0.044), 0.03, M), 0.015)      # heel
        G.add(torus(L((0, 0.006, 0.172)), 0.052, 0.006, M), 0.004)                          # padded collar
        # sole: slightly wider slab under everything
        Zg = G.ax[2][None, None, :]
        sole = smax(smax(G.d - 0.0065, Zg - 0.024, 0.0015), -Zg, 0.0)
        G.d = smin(G.d, sole, 0.0015)
        # lacing: little ridges across the instep
        for i in range(6):
            t = i / 5
            c = L((0, -0.075 + 0.12 * t, 0.085 + 0.055 * t))
            G.add(capsule(c + M @ V(-0.02, 0, 0), c + M @ V(0.02, 0, 0.0), 0.0032), 0.0015)
        G.sub(capsule(L((0, 0.02, 0.2)), L((0, 0.02, 0.3)), 0.042), 0.004)                 # open top (leg goes in)
        done("boot" + side, G, sole=lambda v: (v[:, 2] < 0.0245) * 1.0, lace=lambda v, M=M, an=an: np.clip(1 - np.abs((np.linalg.inv(M) @ (v - an * V(1, 1, 0)).T)[0]) / 0.024, 0, 1) * (v[:, 2] > 0.07) * ((np.linalg.inv(M) @ (v - an * V(1, 1, 0)).T)[1] < -0.02))


# ================= FOREARMS + HANDS =================
def hand_prims(side):
    el, wr = S["el" + side], S["wr" + side]
    mirror = 1 if side == "R" else -1
    fa = nrm(wr - el)
    fdir = nrm(fa + V(0, -0.05, -0.1))
    M = frame(fdir, (-mirror * -1.0, 0, 0))          # local +X = palm normal, towards the body
    Mw = M.copy(); Mw[:, 1] *= mirror                  # mirror thumb side for the left hand

    def W(p): return wr + Mw @ (V(*p) * 1.12)
    P = []
    # forearm (starts inside the rolled cuff)
    a = el + fa * 0.05
    P.append((capsule(a, wr, 0.045, 0.033), 0.0))
    P.append((ellipsoid(el + fa * 0.1 + V(0, -0.006, 0), V(0.043, 0.043, 0.07), frame(fa, (1, 0, 0))), 0.03))
    P.append((capsule(wr + fa * 0.02, W((0.0, 0, -0.02)), 0.028, 0.027), 0.015))
    # palm
    P.append((roundbox(W((0.0, 0.0, -0.052)), V(0.0145, 0.044, 0.044) * 1.12, 0.014, Mw), 0.018))
    P.append((ellipsoid(W((0.01, -0.024, -0.04)), V(0.012, 0.018, 0.024) * 1.12, Mw), 0.012))     # thumb pad
    nails = []
    fingers = [(-0.028, (0.041, 0.024, 0.019), 0.0106, (20, 30, 18)),
               (-0.0093, (0.044, 0.027, 0.021), 0.0109, (24, 34, 20)),
               (0.0093, (0.042, 0.025, 0.02), 0.0105, (28, 38, 22)),
               (0.0265, (0.034, 0.02, 0.018), 0.0095, (32, 40, 24))]
    for fy, segs, rad, curls in fingers:
        p = np.array((0.0, fy, -0.093), f32); ang = 0.0; spread = fy * 0.35
        for j, (ln, cu) in enumerate(zip(segs, curls)):
            ang += np.radians(cu)
            d = nrm(V(np.sin(ang), spread, -np.cos(ang)))
            q = p + d * ln
            r0 = rad * 1.12 * (1 - 0.1 * j); r1 = rad * 1.12 * (1 - 0.1 * (j + 1))
            P.append((capsule(W(p), W(q), r0, r1), 0.004 if j else 0.009))
            if j == 0: P.append((sphere(W(p + V(-0.004, 0, 0)), rad * 1.14), 0.006))       # knuckle
            if j == 2:
                mid = (p + q) / 2 + V(-rad * 0.62, 0, 0) + d * 0.002
                nails.append((W(mid), Mw @ frame_local(d)))
            p = q
    # thumb
    p = np.array((0.013, -0.03, -0.018), f32)
    for j, (ln, rr) in enumerate(((0.036, 0.0125), (0.03, 0.0112), (0.026, 0.0102))):
        d = nrm(V(0.3 + 0.12 * j, -0.42 + 0.12 * j, -0.85))
        q = p + d * ln
        P.append((capsule(W(p), W(q), rr * 1.12, rr * 1.04), 0.008 if j == 0 else 0.004))
        if j == 2:
            nails.append((W((p + q) / 2 + V(-0.005, -0.006, 0)), Mw @ frame_local(d, (-0.6, -0.8, 0))))
        p = q
    return P, nails


def frame_local(d, side=(-1, 0, 0)):
    return frame(d, side)


for side in ("R", "L"):
    if "arm" + side not in ONLY: continue
    P, nails = hand_prims(side)
    G = grid_for([p for p, _ in P], 0.0008)
    for p, k in P: G.add(p, k)
    NP = [ellipsoid(c, V(0.003, 0.0068, 0.0094), M) for c, M in nails]
    for n_ in NP: G.add(n_, 0.0012)
    done("arm" + side, G, nails=lambda v: np.max([np.clip(1 - n_(v[:, 0], v[:, 1], v[:, 2]) / 0.0008, 0, 1) for n_ in NP], 0))
print("all done", round(time.time() - t0, 1))
```

## jerry3/apron.py - fitted apron, pocket, straps, ties
```python
"""Jerry v3 work apron: charcoal canvas bib apron that rests on his chest, cinches at the waist ties and hangs to
the knees; front pocket with compartments; leather neck strap, fabric waist ties with a bow at the back.
Everything is fitted to the actual shirt / trouser / belt meshes (never inside them)."""
import numpy as np, json, sys
from scipy.ndimage import gaussian_filter, distance_transform_edt, map_coordinates
from scipy.spatial import cKDTree
sys.path.insert(0, "/home/claude/work/jerry3")
OUT = "/home/claude/work/jerry3/"
L = lambda n: np.load(OUT + n + ".npz")

body = {n: L(n) for n in ("shirt", "pants", "belt", "tee")}
# ---------- front depth map ----------
DX = 0.004
xs = np.arange(-0.3, 0.3001, DX); zs = np.arange(0.44, 1.46, DX)
depth = np.full((len(xs), len(zs)), np.nan)
for n in ("shirt", "pants", "belt"):
    v = body[n]["v"]
    if n == "shirt": v = v[np.abs(v[:, 0]) < 0.178]              # torso only - the sleeves must not hold the apron up
    ix = np.round((v[:, 0] - xs[0]) / DX).astype(int); iz = np.round((v[:, 2] - zs[0]) / DX).astype(int)
    ok = (ix >= 0) & (ix < len(xs)) & (iz >= 0) & (iz < len(zs))
    for a, b, y in zip(ix[ok], iz[ok], v[ok, 1]):
        if not (y >= depth[a, b]): depth[a, b] = y
valid = ~np.isnan(depth)
# half-width of the body per row (for the wrap-back beyond the silhouette)
body_hw = np.array([np.abs(xs[valid[:, k]]).max() if valid[:, k].any() else 0.15 for k in range(len(zs))])
idx = distance_transform_edt(~valid, return_distances=False, return_indices=True)
depth = depth[tuple(idx)]
CLR = 0.0048
ysurf = gaussian_filter(depth, 1.5) - CLR
ysurf = np.minimum(ysurf, depth - CLR)
ysurf[~valid] = 1.0                                     # nothing behind: no constraint


def lower_hull(x, y, xe=None):
    """front-most convex envelope of y(x) (a sheet pulled across the front can't dip in between bumps)"""
    xe = x if xe is None else xe
    pts = sorted(zip(x, y)); hull = []
    for p in pts:
        while len(hull) >= 2 and (hull[-1][0] - hull[-2][0]) * (p[1] - hull[-2][1]) - (hull[-1][1] - hull[-2][1]) * (p[0] - hull[-2][0]) >= 0:
            hull.pop()
        hull.append(p)
    hx, hy = zip(*hull)
    return np.interp(xe, hx, hy)


Y = np.zeros_like(ysurf)
TIE = 1.04
for k in range(len(zs) - 1, -1, -1):
    z = zs[k]
    vk = valid[:, k]
    row = lower_hull(xs[vk], ysurf[vk, k], xs) if vk.sum() > 2 else np.full(len(xs), -0.12)
    if k < len(zs) - 1:
        hang = np.minimum(row, Y[:, k + 1])                       # fabric hangs straight down from what's above
        w = np.exp(-((z - TIE) / 0.035) ** 2)                      # the waist ties pull it back in
        row = w * row + (1 - w) * hang
    # wrap back a little beyond the body's silhouette
    over = np.clip(np.abs(xs) - body_hw[k] * 0.92, 0, None)
    row = row + 1.6 * over ** 2
    Y[:, k] = np.minimum(row, ysurf[:, k] + 1.6 * over ** 2)
Y = gaussian_filter(Y, (1.2, 2.0))
Y = np.minimum(Y, ysurf)

TOP, HEM = 1.362, 0.515


def hw(z):
    z = np.asarray(z, float)
    h = np.where(z >= 1.262, 0.108, np.where(z >= 1.18, 0.2 - np.sqrt(np.clip(0.092 ** 2 - (z - 1.262) ** 2, 0, None)), 0.0))
    skirt = 0.188 + 0.03 * np.clip((1.05 - z) / 0.53, 0, 1)
    h = np.where(z < 1.18, np.minimum(0.2, skirt), h)
    r = 0.014
    h = h - np.where(z > TOP - r, r - np.sqrt(np.clip(r * r - (z - (TOP - r)) ** 2, 0, None)), 0)
    h = h - np.where(z < HEM + r, r - np.sqrt(np.clip(r * r - (HEM + r - z) ** 2, 0, None)), 0)
    return np.maximum(h, 0.004)


def yat(x, z):
    ix = (np.asarray(x) - xs[0]) / DX; iz = (np.asarray(z) - zs[0]) / DX
    return map_coordinates(Y, np.array([ix.ravel(), iz.ravel()]), order=1, mode="nearest").reshape(np.shape(x))


def skirt_folds(x, z):
    f = np.clip((1.02 - z) / 0.3, 0, 1)
    return -0.0045 * f * np.sin(x * 58 + 0.8 + 3 * z) - 0.002 * f * np.sin(x * 131 + 2.1)


def sheet(zlo, zhi, nz, nu, width_fn, off=0.0, extra=None):
    zz = np.linspace(zlo, zhi, nz); uu = np.linspace(-1, 1, nu)
    V = []
    for z in zz:
        h = width_fn(z)
        for u in uu:
            x = u * h
            y = yat(x, z) + skirt_folds(x, z) - off
            if extra is not None: y = y - extra(x, z)
            V.append((x, y, z))
    V = np.array(V, np.float32)
    F = []
    for i in range(nz - 1):
        for j in range(nu - 1):
            a = i * nu + j; b = a + 1; c = a + nu; d = c + 1
            F += [(a, b, d), (a, d, c)]
    return V, np.array(F, np.int32)


# ---------- apron sheet ----------
av, af = sheet(HEM, TOP, 150, 76, hw)
edge = np.minimum.reduce([hw(av[:, 2]) - np.abs(av[:, 0]), TOP - av[:, 2], av[:, 2] - HEM])
np.savez_compressed(OUT + "apron.npz", v=av, f=af, edge=edge.astype(np.float32))
print("apron", len(av))

# ---------- front pocket (3 compartments) ----------
PZ0, PZ1, PX = 0.705, 0.885, 0.165


def pocket_bulge(x, z):
    t = np.clip((z - PZ0) / (PZ1 - PZ0), 0, 1)
    cells = np.abs(np.sin((x + PX) / (2 * PX) * 3 * np.pi))
    return 0.0035 + 0.0075 * np.sin(0.5 * np.pi * np.clip(t, 0, 1)) ** 0.8 * cells        # gapes open at the top


pv, pf = sheet(PZ0, PZ1, 36, 72, lambda z: PX, off=0.0, extra=pocket_bulge)
pedge = np.minimum.reduce([PX - np.abs(pv[:, 0]), PZ1 - pv[:, 2], pv[:, 2] - PZ0])
div = np.min([np.abs(pv[:, 0] - d) for d in (-PX / 3, PX / 3)], 0)
np.savez_compressed(OUT + "pocket.npz", v=pv, f=pf, edge=pedge.astype(np.float32), div=div.astype(np.float32))

# ---------- straps (ribbons that follow the clothes surface) ----------
cloud = np.vstack([body[n]["v"] for n in ("shirt", "tee", "pants", "belt")])
av_tree_pts = np.vstack([cloud, av])
tree = cKDTree(av_tree_pts)


def vnormals(v, f):
    n = np.zeros_like(v); fn = np.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]])
    for i in range(3): np.add.at(n, f[:, i], fn)
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)


NRM = np.vstack([vnormals(body[n]["v"], body[n]["f"]) for n in ("shirt", "tee", "pants", "belt")] + [vnormals(av, af)])


def catmull(P, n):
    P = np.asarray(P, float); P = np.vstack([2 * P[0] - P[1], P, 2 * P[-1] - P[-2]]); out = []
    segs = len(P) - 3
    for i in range(n):
        t = i / (n - 1) * segs; s = min(int(t), segs - 1); u = t - s
        p0, p1, p2, p3 = P[s:s + 4]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u ** 3))
    return np.array(out)


def ribbon(ctrl, n, width, lift, name, taper_end=False):
    P = catmull(ctrl, n)
    # push onto the surface: nearest points' normal, keep `lift` above
    for it in range(3):
        d, i = tree.query(P, k=12)
        nn = NRM[i].mean(1); nn /= np.linalg.norm(nn, axis=1, keepdims=True)
        base = av_tree_pts[i].mean(1)
        h = ((P - base) * nn).sum(1)
        P = P + nn * (lift - h)[:, None]
        P = catmull(P[:: max(n // 24, 1)].tolist() + [P[-1].tolist()], n)
    d, i = tree.query(P, k=12)
    nn = NRM[i].mean(1); nn /= np.linalg.norm(nn, axis=1, keepdims=True)
    T = np.gradient(P, axis=0); T /= np.linalg.norm(T, axis=1, keepdims=True)
    B = np.cross(T, nn); B /= np.linalg.norm(B, axis=1, keepdims=True)
    V, F = [], []
    for k in range(n):
        w = width * (1 - 0.4 * (k / (n - 1)) ** 3 if taper_end else 1)
        V += [P[k] - B[k] * w / 2, P[k] + B[k] * w / 2]
    for k in range(n - 1):
        a = 2 * k
        F += [(a, a + 1, a + 3), (a, a + 3, a + 2)]
    np.savez_compressed(OUT + name + ".npz", v=np.array(V, np.float32), f=np.array(F, np.int32), nrm=nn.astype(np.float32), path=P.astype(np.float32))
    return P, nn


RIV = []
for s in (-1, 1):
    x0 = s * (0.108 - 0.016)
    p0 = (x0, float(yat(x0, TOP - 0.02)) - 0.003, TOP - 0.02)
    ctrl = [p0, (s * 0.094, -0.1, 1.41), (s * 0.098, -0.05, 1.49), (s * 0.085, 0.02, 1.525), (s * 0.05, 0.085, 1.52), (0.0, 0.112, 1.505)]
    ribbon(ctrl, 60, 0.022, 0.0032, "strap_neck_" + ("R" if s < 0 else "L"))
    RIV.append(p0)
    # waist tie: from the apron's side edge around the back to the bow
    xe = s * (float(hw(TIE)) - 0.012)
    q0 = (xe, float(yat(xe, TIE)) - 0.003, TIE)
    ang = np.radians(np.linspace(60, 172, 7))
    ctrl = [q0] + [(s * 0.2 * np.sin(a), 0.012 - 0.16 * np.cos(a), TIE) for a in ang] + [(s * 0.012, 0.158, TIE)]
    ribbon(ctrl, 70, 0.024, 0.0035, "tie_" + ("R" if s < 0 else "L"))
    RIV.append(q0)
json.dump({"rivets": [list(map(float, r)) for r in RIV], "top": TOP, "hem": HEM, "tie": TIE,
           "tag": [0.052, float(min(yat(x_, 1.3) for x_ in np.linspace(0.052 - 0.042, 0.052 + 0.042, 15))), 1.3,
                   float(np.degrees(np.arctan2(yat(0.092, 1.3) - yat(0.012, 1.3), 0.08)))], "pocket": [PZ0, PZ1, PX],
           "pencil": [0.11, float(yat(0.11, 0.86)) - 0.0048, 0.86], "tape": [-0.105, float(yat(-0.105, 0.86)) - 0.01, 0.86]},
          open(OUT + "apron.json", "w"), indent=1)
# a quick "never inside the clothes" check
d, i = cKDTree(cloud).query(av)
inside = ((av - cloud[i]) * np.vstack([vnormals(body[n]["v"], body[n]["f"]) for n in ("shirt", "tee", "pants", "belt")])[i]).sum(1)
print("apron min clearance (m):", round(float(inside.min()), 4), "verts behind cloth:", int((inside < 0).sum()))
```

## jerry3/j3lib.py - Blender materials + assembly
```python
"""Blender helpers for Jerry v3: mesh import from npz, materials (skin, eyes, cornea), eyeballs."""
import bpy, bmesh, numpy as np, math
from mathutils import Vector, Matrix, Euler

D = "/home/claude/work/jerry3/"


def srgb(h):
    h = h.lstrip("#"); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c) + (1.0,)


def mesh_from_npz(name, path, attrs=(), M=None, smooth=True, col=None):
    z = np.load(path)
    v, f = z["v"].astype(np.float64), z["f"]
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(v)); me.vertices.foreach_set("co", v.ravel())
    me.loops.add(f.size); me.loops.foreach_set("vertex_index", f.ravel())
    me.polygons.add(len(f)); me.polygons.foreach_set("loop_start", np.arange(0, f.size, 3)); me.polygons.foreach_set("loop_total", np.full(len(f), 3))
    me.update(); me.validate()
    for a in attrs:
        if a in z:
            arr = z[a].astype(np.float32)
            if arr.ndim == 2:
                at = me.attributes.new(a, "FLOAT_VECTOR", "POINT"); at.data.foreach_set("vector", arr.ravel())
            else:
                at = me.attributes.new(a, "FLOAT", "POINT"); at.data.foreach_set("value", arr)
    if smooth: me.shade_smooth()
    ob = bpy.data.objects.new(name, me)
    (col or bpy.context.scene.collection).objects.link(ob)
    if M is not None: ob.matrix_world = M
    return ob, z


def nodes(mat):
    mat.use_nodes = True; nt = mat.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial"); b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(b.outputs[0], out.inputs[0])
    return nt, b, out


def attr(nt, name):
    a = nt.nodes.new("ShaderNodeAttribute"); a.attribute_name = name; a.attribute_type = "GEOMETRY"; return a.outputs["Fac"]


def mix(nt, fac, a, b, blend="MIX"):
    m = nt.nodes.new("ShaderNodeMix"); m.data_type = "RGBA"; m.blend_type = blend
    L = nt.links
    if isinstance(fac, (int, float)): m.inputs["Factor"].default_value = fac
    else: L.new(fac, m.inputs["Factor"])
    for sock, val in ((m.inputs[6], a), (m.inputs[7], b)):
        if isinstance(val, tuple): sock.default_value = val
        else: L.new(val, sock)
    return m.outputs[2]


def math_node(nt, op, a, b=None, clamp=False):
    m = nt.nodes.new("ShaderNodeMath"); m.operation = op; m.use_clamp = clamp
    for i, x in enumerate((a, b)):
        if x is None: continue
        if isinstance(x, (int, float)): m.inputs[i].default_value = x
        else: nt.links.new(x, m.inputs[i])
    return m.outputs[0]


def skin_material(name="Jerry3 skin", base_hex="#e6b08f"):
    mat = bpy.data.materials.new(name); nt, b, _ = nodes(mat); L = nt.links
    base = srgb(base_hex)
    col = mix(nt, math_node(nt, "MULTIPLY", attr(nt, "blush"), 0.42), base, srgb("#e0877a"))
    col = mix(nt, math_node(nt, "MULTIPLY", attr(nt, "nose"), 0.3), col, srgb("#e08a7c"))
    col = mix(nt, math_node(nt, "MULTIPLY", attr(nt, "ears"), 0.35), col, srgb("#e0897c"))
    col = mix(nt, math_node(nt, "MULTIPLY", attr(nt, "lids"), 0.18), col, srgb("#d69888"))
    col = mix(nt, math_node(nt, "MULTIPLY", attr(nt, "lips"), 0.6), col, srgb("#c9796b"))
    # very soft mottling so the skin isn't plastic-flat
    mt = nt.nodes.new("ShaderNodeTexNoise"); mt.inputs["Scale"].default_value = 90.0; mt.inputs["Detail"].default_value = 4.0
    L.new(nt.nodes.new("ShaderNodeTexCoord").outputs["Object"], mt.inputs["Vector"])
    col = mix(nt, math_node(nt, "MULTIPLY", math_node(nt, "SUBTRACT", mt.outputs["Fac"], 0.45), 0.25, clamp=True), col, srgb("#d9967c"))
    # freckles: sparse soft dots across nose + cheeks
    tc = nt.nodes.new("ShaderNodeTexCoord"); vor = nt.nodes.new("ShaderNodeTexVoronoi"); vor.feature = "F1"
    vor.inputs["Scale"].default_value = 520.0; vor.inputs["Randomness"].default_value = 1.0
    L.new(tc.outputs["Object"], vor.inputs["Vector"])
    dots = math_node(nt, "LESS_THAN", vor.outputs["Distance"], 0.16)
    keep = math_node(nt, "GREATER_THAN", vor.outputs["Color"], 0.72)  # only some cells
    fr = math_node(nt, "MULTIPLY", math_node(nt, "MULTIPLY", dots, keep), math_node(nt, "ADD", attr(nt, "blush"), attr(nt, "nose")))
    col = mix(nt, math_node(nt, "MULTIPLY", fr, 0.28, clamp=True), col, srgb("#b0674a"))
    L.new(col, b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.5
    b.inputs["Subsurface Weight"].default_value = 0.35
    b.inputs["Subsurface Radius"].default_value = (1.0, 0.35, 0.18)
    b.inputs["Subsurface Scale"].default_value = 0.006
    b.inputs["Specular IOR Level"].default_value = 0.45
    b.inputs["Sheen Weight"].default_value = 0.15; b.inputs["Sheen Roughness"].default_value = 0.4
    rough = math_node(nt, "SUBTRACT", 0.5, math_node(nt, "MULTIPLY", attr(nt, "lips"), 0.18))
    L.new(rough, b.inputs["Roughness"])
    return mat


def eye_material(name="Jerry3 eye", R=0.0132):
    """painted eyeball: sclera, hazel-green iris with fibres + limbal ring, pupil. local -Y is the gaze."""
    mat = bpy.data.materials.new(name); nt, b, _ = nodes(mat); L = nt.links
    tc = nt.nodes.new("ShaderNodeTexCoord"); sep = nt.nodes.new("ShaderNodeSeparateXYZ"); L.new(tc.outputs["Object"], sep.inputs[0])
    x, y, z = sep.outputs
    r = math_node(nt, "DIVIDE", math_node(nt, "SQRT", math_node(nt, "ADD", math_node(nt, "MULTIPLY", x, x), math_node(nt, "MULTIPLY", z, z))), R)
    front = math_node(nt, "LESS_THAN", y, 0.0)
    ang = math_node(nt, "ARCTAN2", z, x)
    comb = nt.nodes.new("ShaderNodeCombineXYZ")
    L.new(math_node(nt, "MULTIPLY", ang, 6.0), comb.inputs[0]); L.new(math_node(nt, "MULTIPLY", r, 3.0), comb.inputs[1])
    nz = nt.nodes.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 3.5; nz.inputs["Detail"].default_value = 6
    L.new(comb.outputs[0], nz.inputs["Vector"])
    IR, PR = 0.66, 0.25
    t = math_node(nt, "DIVIDE", math_node(nt, "SUBTRACT", r, PR), IR - PR)     # 0 at pupil edge -> 1 at limbus
    irc = mix(nt, math_node(nt, "POWER", math_node(nt, "MAXIMUM", t, 0.0), 0.6), srgb("#b98a3a"), srgb("#4f8a5a"))
    irc = mix(nt, math_node(nt, "SUBTRACT", nz.outputs["Fac"], 0.25), srgb("#1f3a26"), irc)
    limb = math_node(nt, "MINIMUM", 1.0, math_node(nt, "MULTIPLY", math_node(nt, "MAXIMUM", math_node(nt, "SUBTRACT", t, 0.78), 0.0), 5.0))
    irc = mix(nt, limb, irc, srgb("#12211a"))
    sclera = mix(nt, math_node(nt, "POWER", math_node(nt, "DIVIDE", r, 1.0), 3.0), srgb("#f1ece6"), srgb("#e6c9c0"))
    in_iris = math_node(nt, "MULTIPLY", front, math_node(nt, "LESS_THAN", r, IR))
    in_pupil = math_node(nt, "MULTIPLY", front, math_node(nt, "LESS_THAN", r, PR))
    c = mix(nt, in_iris, sclera, irc)
    c = mix(nt, in_pupil, c, srgb("#050505"))
    L.new(c, b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.3
    b.inputs["Subsurface Weight"].default_value = 0.15; b.inputs["Subsurface Scale"].default_value = 0.002
    return mat


def cornea_material(name="Jerry3 cornea"):
    mat = bpy.data.materials.new(name); mat.use_nodes = True; nt = mat.node_tree; nt.nodes.clear(); L = nt.links
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    g = nt.nodes.new("ShaderNodeBsdfPrincipled"); g.inputs["Transmission Weight"].default_value = 1.0
    g.inputs["IOR"].default_value = 1.376; g.inputs["Roughness"].default_value = 0.0; g.inputs["Base Color"].default_value = (1, 1, 1, 1)
    tr = nt.nodes.new("ShaderNodeBsdfTransparent"); lp = nt.nodes.new("ShaderNodeLightPath")
    mx = nt.nodes.new("ShaderNodeMixShader")
    # camera + glossy rays see a thin glossy shell; everything else passes straight through (no dark eyes)
    L.new(lp.outputs["Is Camera Ray"], mx.inputs[0]); L.new(tr.outputs[0], mx.inputs[1])
    gl = nt.nodes.new("ShaderNodeBsdfGlossy"); gl.inputs["Roughness"].default_value = 0.02
    fr = nt.nodes.new("ShaderNodeFresnel"); fr.inputs["IOR"].default_value = 1.376
    m2 = nt.nodes.new("ShaderNodeMixShader"); L.new(fr.outputs[0], m2.inputs[0]); L.new(tr.outputs[0], m2.inputs[1]); L.new(gl.outputs[0], m2.inputs[2])
    L.new(m2.outputs[0], mx.inputs[2])
    L.new(mx.outputs[0], out.inputs[0])
    return mat


def eyeball(name, center, R, look_at, col, eye_mat, cornea_mat, head_M=Matrix()):
    """eye sphere + cornea shell, local -Y aimed at look_at (world). center is head-local."""
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=32, radius=R)
    for f in bm.faces: f.smooth = True
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.materials.append(eye_mat)
    ob = bpy.data.objects.new(name, me); col.objects.link(ob)
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=32, radius=R * 1.02)
    for v in bm.verts:
        n = v.co.normalized(); rr = math.hypot(n.x, n.z)
        if n.y < 0 and rr < 0.72:                   # cornea bulge over the iris
            v.co += Vector((0, -1, 0)) * (R * 0.11 * (1 - (rr / 0.72) ** 2) ** 1.5)
    for f in bm.faces: f.smooth = True
    cm = bpy.data.meshes.new(name + " cornea"); bm.to_mesh(cm); bm.free(); cm.materials.append(cornea_mat)
    co = bpy.data.objects.new(name + " cornea", cm); col.objects.link(co)
    cw = head_M @ Vector(center)
    d = (Vector(look_at) - cw).normalized()
    q = (-d).to_track_quat("Y", "Z")          # local +Y points away from the target, so -Y looks at it
    M = Matrix.Translation(cw) @ q.to_matrix().to_4x4() @ Matrix.Scale(head_M.to_scale()[0], 4)
    ob.matrix_world = M; co.matrix_world = M
    return ob, co


def hair_material(name="Jerry3 hair (copper auburn)", root="#2e160c", mid="#6e3a1f", tip="#a8683c"):
    mat = bpy.data.materials.new(name); nt, b, _ = nodes(mat); L = nt.links
    dep = attr(nt, "depth")
    c = mix(nt, math_node(nt, "POWER", dep, 0.7), srgb(root), srgb(mid))
    tc = nt.nodes.new("ShaderNodeTexCoord"); nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 180.0; nz.inputs["Detail"].default_value = 3.0
    L.new(tc.outputs["Object"], nz.inputs["Vector"])
    c = mix(nt, math_node(nt, "MULTIPLY", math_node(nt, "MULTIPLY", nz.outputs["Fac"], dep), 0.55), c, srgb(tip))
    ao = nt.nodes.new("ShaderNodeAmbientOcclusion"); ao.inputs["Distance"].default_value = 0.006; ao.samples = 8
    L.new(c, ao.inputs["Color"])
    c2 = mix(nt, 0.55, c, ao.outputs["Color"], "MULTIPLY")
    L.new(c2, b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.46
    b.inputs["Anisotropic"].default_value = 0.45
    fa = nt.nodes.new("ShaderNodeAttribute"); fa.attribute_name = "flow"; fa.attribute_type = "GEOMETRY"
    L.new(fa.outputs["Vector"], b.inputs["Tangent"])
    b.inputs["Sheen Weight"].default_value = 0.15; b.inputs["Sheen Tint"].default_value = srgb(tip)
    b.inputs["Specular Tint"].default_value = srgb("#ffd9b0"); b.inputs["Specular IOR Level"].default_value = 0.32
    return mat


def simple_material(name, hexcol, rough=0.5, **kw):
    mat = bpy.data.materials.new(name); nt, b, _ = nodes(mat)
    b.inputs["Base Color"].default_value = srgb(hexcol); b.inputs["Roughness"].default_value = rough
    for k, v in kw.items(): b.inputs[k].default_value = v
    return mat


def fabric_material(name, hexcol, rough=0.8, sheen=0.3, weave=900.0, var=0.08, hexcol2=None):
    """cloth: base colour with a fine weave/heather breakup + sheen"""
    mat = bpy.data.materials.new(name); nt, b, _ = nodes(mat); L = nt.links
    tc = nt.nodes.new("ShaderNodeTexCoord")
    nz = nt.nodes.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = weave; nz.inputs["Detail"].default_value = 2.0
    L.new(tc.outputs["Object"], nz.inputs["Vector"])
    nz2 = nt.nodes.new("ShaderNodeTexNoise"); nz2.inputs["Scale"].default_value = 25.0; nz2.inputs["Detail"].default_value = 3.0
    L.new(tc.outputs["Object"], nz2.inputs["Vector"])
    c2 = srgb(hexcol2) if hexcol2 else tuple(min(1, x * 1.25) for x in srgb(hexcol)[:3]) + (1,)
    c = mix(nt, math_node(nt, "MULTIPLY", math_node(nt, "SUBTRACT", nz.outputs["Fac"], 0.35), var * 6), srgb(hexcol), c2)
    c = mix(nt, math_node(nt, "MULTIPLY", math_node(nt, "SUBTRACT", nz2.outputs["Fac"], 0.5), 0.35), c, tuple(x * 0.85 for x in srgb(hexcol)[:3]) + (1,))
    ao = nt.nodes.new("ShaderNodeAmbientOcclusion"); ao.inputs["Distance"].default_value = 0.02; ao.samples = 6
    L.new(c, ao.inputs["Color"])
    L.new(mix(nt, 0.45, c, ao.outputs["Color"], "MULTIPLY"), b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = rough
    b.inputs["Sheen Weight"].default_value = sheen; b.inputs["Sheen Roughness"].default_value = 0.5
    bump = nt.nodes.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.15; bump.inputs["Distance"].default_value = 0.0005
    L.new(nz.outputs["Fac"], bump.inputs["Height"]); L.new(bump.outputs[0], b.inputs["Normal"])
    return mat


def masked_material(name, attr_name, a_hex, b_hex, a_rough=0.5, b_rough=0.5, b_metal=0.0):
    mat = bpy.data.materials.new(name); nt, b, _ = nodes(mat); L = nt.links
    m = attr(nt, attr_name)
    L.new(mix(nt, m, srgb(a_hex), srgb(b_hex)), b.inputs["Base Color"])
    r = nt.nodes.new("ShaderNodeMapRange"); L.new(m, r.inputs[0]); r.inputs[3].default_value = a_rough; r.inputs[4].default_value = b_rough
    L.new(r.outputs[0], b.inputs["Roughness"])
    if b_metal:
        L.new(math_node(nt, "MULTIPLY", m, b_metal), b.inputs["Metallic"])
    return mat


def build_jerry(col, gaze=(0.0, -2.2, 1.62)):
    """assemble every Jerry v3 part into collection col (world metres, feet at origin). returns objects"""
    import json
    S = json.load(open(D + "skeleton.json"))
    HM = Matrix.Translation(S["head"]) @ Euler((math.radians(-2.0), math.radians(-3.0), math.radians(4.0))).to_matrix().to_4x4() @ Matrix.Scale(1.18, 4)
    obs = []
    skin = skin_material()
    o, z = mesh_from_npz("Jerry head", D + "head.npz", ("lips", "blush", "nose", "ears", "lids"), M=HM, col=col); o.data.materials.append(skin); obs.append(o)
    em, cm = eye_material(R=float(z["eye_r"])), cornea_material()
    for i, c in enumerate(z["eyes"]):
        obs += list(eyeball(("Jerry eye R", "Jerry eye L")[i], c, float(z["eye_r"]), gaze, col, em, cm, HM))
    o, _ = mesh_from_npz("Jerry hair", D + "hair.npz", ("depth", "flow"), M=HM, col=col); o.data.materials.append(hair_material()); obs.append(o)
    o, _ = mesh_from_npz("Jerry eyebrows", D + "brows.npz", M=HM, col=col); o.data.materials.append(simple_material("Jerry eyebrows", "#5a2c17", 0.55, **{"Sheen Weight": 0.3})); obs.append(o)
    o, _ = mesh_from_npz("Jerry eyelashes", D + "lashes.npz", M=HM, col=col); o.data.materials.append(simple_material("Jerry eyelashes", "#2a160e", 0.5)); obs.append(o)
    mats = dict(
        shirt=fabric_material("Jerry shirt - chambray", "#6f8fb5", 0.78, 0.35, 1400.0, 0.1, "#9db5d2"),
        tee=fabric_material("Jerry tee - heather grey", "#8f8f8c", 0.85, 0.3, 1200.0, 0.14, "#b5b5b1"),
        pants=fabric_material("Jerry trousers - khaki twill", "#a88f68", 0.82, 0.25, 1100.0, 0.07, "#bca47d"),
    )
    o, _ = mesh_from_npz("Jerry shirt buttons", D + "buttons.npz", col=col); o.data.materials.append(simple_material("Jerry buttons", "#e9e4da", 0.25)); obs.append(o)
    for part in ("shirt", "tee", "pants"):
        o, _ = mesh_from_npz("Jerry " + part, D + part + ".npz", col=col); o.data.materials.append(mats[part]); obs.append(o)
    o, _ = mesh_from_npz("Jerry belt", D + "belt.npz", ("buckle",), col=col)
    o.data.materials.append(masked_material("Jerry belt - leather + brass", "buckle", "#4a2c1a", "#b08d57", 0.42, 0.3, 1.0)); obs.append(o)
    bm = masked_material("Jerry boots - brown leather", "lace", "#5a3620", "#2e2118", 0.45, 0.7)
    sm = simple_material("Jerry boot soles", "#2a2522", 0.85)
    for sd in ("R", "L"):
        o, _ = mesh_from_npz("Jerry boot " + sd, D + "boot" + sd + ".npz", ("sole", "lace"), col=col)
        o.data.materials.append(bm); o.data.materials.append(sm)
        so = np.zeros(len(o.data.vertices), np.float32); o.data.attributes["sole"].data.foreach_get("value", so)
        mi = np.array([1 if so[p.vertices[0]] > 0.5 and so[p.vertices[1]] > 0.5 else 0 for p in o.data.polygons], np.int32)
        o.data.polygons.foreach_set("material_index", mi); obs.append(o)
    nail = skin_material("Jerry skin (arms)", "#d89c7a")
    nt = nail.node_tree; bsdf = [n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"][0]
    src = bsdf.inputs["Base Color"].links[0].from_socket
    nt.links.new(mix(nt, attr(nt, "nails"), src, srgb("#eab8aa")), bsdf.inputs["Base Color"])
    for sd in ("R", "L"):
        o, _ = mesh_from_npz("Jerry arm " + sd, D + "arm" + sd + ".npz", ("nails",), col=col); o.data.materials.append(nail); obs.append(o)
    return obs


def canvas_material(name, hexcol="#383b3f", thread="#c8ae84", edge_attr="edge", div_attr=None):
    """heavy canvas with binding + contrast stitching near the edges (and pocket dividers)"""
    mat = fabric_material(name, hexcol, 0.86, 0.25, 900.0, 0.12, "#4b4f54")
    nt = mat.node_tree; L = nt.links
    b = [n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"][0]
    src = b.inputs["Base Color"].links[0].from_socket
    e = attr(nt, edge_attr)
    tc = nt.nodes.new("ShaderNodeTexCoord"); sep = nt.nodes.new("ShaderNodeSeparateXYZ"); L.new(tc.outputs["Object"], sep.inputs[0])
    dash = math_node(nt, "GREATER_THAN", math_node(nt, "SINE", math_node(nt, "MULTIPLY", math_node(nt, "ADD", sep.outputs[0], sep.outputs[2]), 700.0)), 0.1)
    line = math_node(nt, "LESS_THAN", math_node(nt, "ABSOLUTE", math_node(nt, "SUBTRACT", e, 0.0065)), 0.0008)
    st = math_node(nt, "MULTIPLY", line, dash)
    if div_attr:
        dl = math_node(nt, "LESS_THAN", attr(nt, div_attr), 0.0008)
        st = math_node(nt, "MAXIMUM", st, math_node(nt, "MULTIPLY", dl, math_node(nt, "GREATER_THAN", math_node(nt, "SINE", math_node(nt, "MULTIPLY", sep.outputs[2], 700.0)), 0.1)))
    band = math_node(nt, "LESS_THAN", e, 0.011)
    c = mix(nt, math_node(nt, "MULTIPLY", band, 0.35), src, tuple(x * 0.7 for x in srgb(hexcol)[:3]) + (1,))
    c = mix(nt, st, c, srgb(thread))
    L.new(c, b.inputs["Base Color"])
    return mat


def add_apron(col, HMx=None):
    import json
    A = json.load(open(D + "apron.json"))
    obs = []
    cm = canvas_material("Jerry apron - charcoal canvas")
    o, _ = mesh_from_npz("Jerry apron", D + "apron.npz", ("edge",), col=col); o.data.materials.append(cm)
    m = o.modifiers.new("thickness", "SOLIDIFY"); m.thickness = 0.0032; m.offset = 1.0; m.use_even_offset = True
    o.modifiers.new("smooth", "SUBSURF").levels = 1; obs.append(o)
    pm = canvas_material("Jerry apron pocket", div_attr="div")
    o, _ = mesh_from_npz("Jerry apron pocket", D + "pocket.npz", ("edge", "div"), col=col); o.data.materials.append(pm)
    m = o.modifiers.new("thickness", "SOLIDIFY"); m.thickness = 0.0028; m.offset = 1.0
    o.modifiers.new("smooth", "SUBSURF").levels = 1; obs.append(o)
    leather = simple_material("Jerry apron straps - tan leather", "#8a5a32", 0.42, **{"Coat Weight": 0.25, "Coat Roughness": 0.35})
    tie_m = fabric_material("Jerry apron ties - canvas", "#383b3f", 0.86, 0.25, 900.0, 0.12, "#4b4f54")
    for n in ("strap_neck_R", "strap_neck_L", "tie_R", "tie_L"):
        o, _ = mesh_from_npz("Jerry " + n.replace("_", " "), D + n + ".npz", col=col)
        o.data.materials.append(leather if "neck" in n else tie_m)
        m = o.modifiers.new("thickness", "SOLIDIFY"); m.thickness = 0.0028 if "neck" in n else 0.0022; m.offset = 0.0
        o.modifiers.new("smooth", "SUBSURF").levels = 1; obs.append(o)
    brass = simple_material("Jerry brass rivets", "#b08a4e", 0.28, **{"Metallic": 1.0})
    for i, p in enumerate(A["rivets"]):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.0052, segments=24, ring_count=12, location=p)
        r = bpy.context.object; r.name = f"Jerry rivet {i}"; r.scale = (1, 0.45, 1); r.data.materials.append(brass)
        for c in r.users_collection: c.objects.unlink(r)
        col.objects.link(r); r.data.shade_smooth(); obs.append(r)
    # bow at the back: two soft loops + knot
    tie = A["tie"]
    for s in (-1, 1):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.026, minor_radius=0.007, major_segments=36, minor_segments=12,
                                         location=(s * 0.03, 0.167, tie + 0.004), rotation=(math.radians(90), math.radians(s * 12), 0))
        t = bpy.context.object; t.name = f"Jerry apron bow loop {s}"; t.scale = (1.15, 0.55, 1.0)
        t.data.materials.append(tie_m); t.data.shade_smooth()
        for c in t.users_collection: c.objects.unlink(t)
        col.objects.link(t); obs.append(t)
        bpy.ops.mesh.primitive_cube_add(size=1, location=(s * 0.016, 0.168, tie - 0.055), rotation=(0, math.radians(s * 8), 0))
        tl = bpy.context.object; tl.name = f"Jerry apron bow tail {s}"; tl.scale = (0.022, 0.003, 0.095)
        bv = tl.modifiers.new("b", "BEVEL"); bv.width = 0.0012; bv.segments = 2
        tl.data.materials.append(tie_m)
        for c in tl.users_collection: c.objects.unlink(tl)
        col.objects.link(tl); obs.append(tl)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.011, location=(0, 0.166, tie))
    k = bpy.context.object; k.name = "Jerry apron bow knot"; k.scale = (1.0, 0.7, 1.25); k.data.materials.append(tie_m); k.data.shade_smooth()
    for c in k.users_collection: c.objects.unlink(k)
    col.objects.link(k); obs.append(k)
    # name tag on the bib
    tx, ty, tz, tyaw = A["tag"]
    bpy.ops.mesh.primitive_cube_add(size=1, location=(tx, ty - 0.0028, tz), rotation=(0, 0, math.radians(tyaw)))
    tg = bpy.context.object; tg.name = "Jerry name tag"; tg.scale = (0.078, 0.003, 0.027)
    bv = tg.modifiers.new("b", "BEVEL"); bv.width = 0.004; bv.segments = 4; bv.affect = "EDGES"
    tg.data.materials.append(simple_material("Jerry name tag", "#f3f1ec", 0.35))
    for c in tg.users_collection: c.objects.unlink(tg)
    col.objects.link(tg); obs.append(tg)
    cu = bpy.data.curves.new("Jerry name tag text", "FONT"); cu.body = "JERRY"; cu.size = 0.0145; cu.align_x = "CENTER"; cu.align_y = "CENTER"
    cu.extrude = 0.0004; cu.space_character = 1.12
    try:
        cu.font = bpy.data.fonts.load("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")
    except Exception:
        pass
    te = bpy.data.objects.new("Jerry name tag text", cu); col.objects.link(te)
    te.location = (tx, ty - 0.0046, tz - 0.0005); te.rotation_euler = (math.radians(90), 0, math.radians(tyaw))
    te.data.materials.append(simple_material("Jerry name tag ink", "#1f2a36", 0.4)); obs.append(te)
    # pencil in the pocket
    px, py, pz = A["pencil"]
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.0042, depth=0.15, location=(px, py, pz + 0.02), rotation=(math.radians(-6), math.radians(9), 0))
    pc = bpy.context.object; pc.name = "Jerry pencil"; pc.data.materials.append(simple_material("Jerry pencil paint", "#e3b22c", 0.35))
    bv = pc.modifiers.new("b", "BEVEL"); bv.width = 0.0006; bv.segments = 2
    for c in pc.users_collection: c.objects.unlink(pc)
    col.objects.link(pc); obs.append(pc)
    up = pc.matrix_world.to_3x3() @ Vector((0, 0, 1))
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.0044, depth=0.009, location=Vector((px, py, pz + 0.02)) + up * 0.079)
    fe = bpy.context.object; fe.name = "Jerry pencil ferrule"; fe.rotation_euler = pc.rotation_euler
    fe.data.materials.append(simple_material("Jerry pencil ferrule", "#bfc3c7", 0.3, **{"Metallic": 1.0}))
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.0041, depth=0.008, location=Vector((px, py, pz + 0.02)) + up * 0.0875)
    er = bpy.context.object; er.name = "Jerry pencil eraser"; er.rotation_euler = pc.rotation_euler
    er.data.materials.append(simple_material("Jerry pencil eraser", "#e58c86", 0.7))
    for ob in (fe, er):
        for c in ob.users_collection: c.objects.unlink(ob)
        col.objects.link(ob); ob.data.shade_smooth(); obs.append(ob)
    # small notepad in the other pocket
    tx2, ty2, tz2 = A["tape"]
    bpy.ops.mesh.primitive_cube_add(size=1, location=(tx2, ty2 + 0.0055, tz2 + 0.03), rotation=(math.radians(-4), math.radians(-5), 0))
    nb = bpy.context.object; nb.name = "Jerry notepad"; nb.scale = (0.07, 0.005, 0.1)
    bv = nb.modifiers.new("b", "BEVEL"); bv.width = 0.0015; bv.segments = 2
    nb.data.materials.append(simple_material("Jerry notepad cover", "#2f4d6b", 0.55))
    for c in nb.users_collection: c.objects.unlink(nb)
    col.objects.link(nb); obs.append(nb)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(tx2, ty2 + 0.0055, tz2 + 0.078), rotation=(math.radians(-4), math.radians(-5), 0))
    pg = bpy.context.object; pg.name = "Jerry notepad pages"; pg.scale = (0.066, 0.0047, 0.006)
    pg.data.materials.append(simple_material("Jerry notepad pages", "#f2efe6", 0.8))
    for c in pg.users_collection: c.objects.unlink(pg)
    col.objects.link(pg); obs.append(pg)
    return obs
```

## place_jerry3.py - into the store (decimate, collision check, lights, cameras, eye contact) + standalone file
```python
"""Swap Jerry v2 out of the v10 store file for the brand-new Jerry v3 (stylised, built from scratch in jerry3/).
Jerry v3 is modelled in metres; one empty scales him to the store's feet and is the single handle to move him.
Also: decimate the dense sculpt meshes, collision check against fixtures, Jerry-only fill/rim lights, re-aim CAM 15-17,
and save a standalone Jerry v3 file."""
import bpy, math, sys
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
sys.path.insert(0, "/home/claude/work/jerry3")
from j3lib import build_jerry, add_apron

F = "/home/claude/work/out/FBS Boise Store Map v10.blend"
STANDALONE = "/home/claude/work/out/Jerry v3 (stylised).blend"
FT = 3.28084
POS, ROT = Vector((86.3, 43.6, 0.0)), 100.0

bpy.ops.wm.open_mainfile(filepath=F)
sc = bpy.context.scene
# ---- remove every earlier Jerry ----
old = [o for o in bpy.data.objects if o.name.startswith("Jerry")]
for o in old: bpy.data.objects.remove(o, do_unlink=True)
for c in list(bpy.data.collections):
    if c.name.startswith("Jerry v2") or c.name.startswith("Jerry v3"): bpy.data.collections.remove(c)
for _ in range(3):
    for blk in (bpy.data.meshes, bpy.data.materials, bpy.data.curves, bpy.data.hair_curves, bpy.data.images, bpy.data.node_groups, bpy.data.lights):
        for d in list(blk):
            if d.users == 0: blk.remove(d)
people = next(c for c in bpy.data.collections if c.name.startswith("5 People"))
people.name = "5 People (Jerry)"
col = bpy.data.collections.new("Jerry v3 parts"); people.children.link(col)

obs = build_jerry(col) + add_apron(col)

# ---- lighter meshes: marching-cubes sculpts are far denser than needed ----
# target vertex counts (the file has to stay under the 20 MB transfer cap; subdivision smooths them back at render time)
TARGET = {"Jerry head": 38000, "Jerry hair": 44000, "Jerry eyebrows": 6000, "Jerry eyelashes": 4500, "Jerry arm R": 19000, "Jerry arm L": 19000,
          "Jerry shirt": 24000, "Jerry pants": 19000, "Jerry tee": 5000, "Jerry belt": 5000, "Jerry boot R": 8500, "Jerry boot L": 8500}
SUBD = {"Jerry head": 1, "Jerry arm R": 1, "Jerry arm L": 1, "Jerry shirt": 1, "Jerry pants": 1, "Jerry boot R": 1, "Jerry boot L": 1}
RATIO = {}
bpy.context.view_layer.update()
for o in obs:
    t = TARGET.get(o.name)
    if not t: continue
    bpy.context.view_layer.objects.active = o
    m = o.modifiers.new("decimate", "DECIMATE"); m.ratio = min(1.0, t / len(o.data.vertices))
    with bpy.context.temp_override(object=o, active_object=o):
        bpy.ops.object.modifier_apply(modifier=m.name)
    import bmesh
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.join_triangles(bm, faces=bm.faces[:], angle_face_threshold=math.radians(40), angle_shape_threshold=math.radians(40))
    bm.to_mesh(o.data); bm.free()
    o.data.shade_smooth()
    if o.name in SUBD:
        sd = o.modifiers.new("smooth", "SUBSURF"); sd.levels = 0; sd.render_levels = SUBD[o.name]

# limit-surface subdivision explodes memory in Blender 5.0 on these meshes -> plain Catmull-Clark (looks the same)
for o in obs:
    for m in o.modifiers:
        if m.type == "SUBSURF": m.use_limit_surface = False; m.quality = 1

# ---- world-unit shader settings must follow the x3.28 scale (feet) ----
for m in bpy.data.materials:
    if not m.name.startswith(("Jerry", "Jerry3")) or not m.node_tree: continue
    for n in m.node_tree.nodes:
        if n.type == "BSDF_PRINCIPLED": n.inputs["Subsurface Scale"].default_value *= FT
        if n.type == "AMBIENT_OCCLUSION": n.inputs["Distance"].default_value *= FT
        if n.type == "BUMP": n.inputs["Distance"].default_value *= FT

root = bpy.data.objects.new("Jerry - move me (6ft)", None); root.empty_display_type = "ARROWS"; root.empty_display_size = 1.5
people.objects.link(root)
root.location = POS; root.rotation_euler = (0, 0, math.radians(ROT)); root.scale = (FT, FT, FT)
for o in obs:
    o.parent = root; o.matrix_parent_inverse = Matrix.Identity(4)
bpy.context.view_layer.update()

# ---- eye contact with the close-up camera ----
cam16 = bpy.data.objects.get("CAM 16 Jerry close-up")
def aim_eyes(target_world):
    inv = root.matrix_world.inverted(); tl = inv @ Vector(target_world)
    for nm in ("Jerry eye R", "Jerry eye L"):
        for suffix in ("", " cornea"):
            e = bpy.data.objects[nm + suffix]
            loc, rot, scl = e.matrix_local.decompose()
            q = (-(tl - loc).normalized()).to_track_quat("Y", "Z")
            e.matrix_local = Matrix.Translation(loc) @ q.to_matrix().to_4x4() @ Matrix.Diagonal(scl).to_4x4()
bpy.context.view_layer.update()

# ---- collision check: Jerry vs walls / fixtures ----
dg = bpy.context.evaluated_depsgraph_get()


def bvh_world(o):
    ev = o.evaluated_get(dg); me = ev.to_mesh(); mw = o.matrix_world
    vs = [mw @ v.co for v in me.vertices]; ps = [tuple(p.vertices) for p in me.polygons]; ev.to_mesh_clear()
    return BVHTree.FromPolygons(vs, ps), vs


jm = [o for o in obs if o.type == "MESH"]
jb = [bvh_world(o) for o in jm]
xs = [v.x for _, vs in jb for v in vs]; ys = [v.y for _, vs in jb for v in vs]
box = (min(xs) - 0.5, max(xs) + 0.5, min(ys) - 0.5, max(ys) + 0.5)
hits = []
for o in bpy.data.objects:
    if o.type != "MESH" or o in jm or o.hide_render or o.name.startswith("Ceiling") or "floor" in o.name.lower() or o.name.startswith(("Front room", "Von's", "Sales floor")): continue
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
    if max(p.x for p in bb) < box[0] or min(p.x for p in bb) > box[1] or max(p.y for p in bb) < box[2] or min(p.y for p in bb) > box[3]: continue
    ob, _ = bvh_world(o)
    for (t, _), j in zip(jb, jm):
        if t.overlap(ob): hits.append((j.name, o.name))
low = min(v.z for _, vs in jb for v in vs); top = max(v.z for _, vs in jb for v in vs)
print("Jerry v3 footprint", [round(v, 2) for v in box], "overlaps:", hits or "none", "lowest z", round(low, 3), "height ft", round(top - low, 2))

# ---- flattering Jerry-only lights (bounce-card style) ----
fwd = Vector((math.sin(math.radians(ROT)), -math.cos(math.radians(ROT)), 0))    # the way he faces
side = Vector((-fwd.y, fwd.x, 0))
head = POS + Vector((0, 0, 5.5))


def jlight(name, loc, energy, size, color):
    ld = bpy.data.lights.new(name, "AREA"); ld.energy = energy; ld.size = size; ld.color = color
    lo = bpy.data.objects.new(name, ld); people.objects.link(lo); lo.location = loc
    lo.rotation_euler = (head - loc).to_track_quat("-Z", "Y").to_euler(); lo.visible_camera = False
    try: lo.light_linking.receiver_collection = col
    except Exception as e: print("light linking not available:", e)
    return lo


jlight("Jerry fill (lights only Jerry)", POS + fwd * 5.0 + side * 1.5 + Vector((0, 0, 6.8)), 120, 3.5, (1.0, 0.96, 0.9))
jlight("Jerry rim (lights only Jerry)", POS - fwd * 3.5 - side * 2.0 + Vector((0, 0, 8.4)), 90, 2.0, (1.0, 0.97, 0.92))


# ---- cameras on the new, slightly shorter Jerry (eyes ~5.5 ft) ----
def aim(name, loc, tgt, lens=None, res=None):
    c = bpy.data.objects.get(name)
    if not c: return
    c.location = loc; c.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    if lens: c.data.lens = lens
    if res: c["res"] = res
    if c.data.dof.use_dof: c.data.dof.focus_distance = (Vector(tgt) - Vector(loc)).length


aim("CAM 16 Jerry close-up", POS + fwd * 3.3 + side * 0.9 + Vector((0, 0, 5.55)), POS + Vector((0, 0, 5.42)), 50, [720, 900])
aim("CAM 17 Jerry waist-up (3/4)", POS + fwd * 5.2 + side * 3.0 + Vector((0, 0, 5.2)), POS + Vector((0, 0, 4.4)), 35)
aim("CAM 15 Jerry at the back desk", Vector((93.6, 46.1, 5.3)), POS + Vector((0, 0, 3.4)), 22)
bpy.context.view_layer.update()
aim_eyes(bpy.data.objects["CAM 16 Jerry close-up"].matrix_world.translation)
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=F, compress=True)
print("saved store with Jerry v3")

# ---- standalone file: Jerry alone, feet at the origin, with a camera + 3 lights ----
for o in list(bpy.data.objects):
    if o not in obs and o is not root and not o.name.startswith("Jerry "): bpy.data.objects.remove(o, do_unlink=True)
root.location = (0, 0, 0); root.rotation_euler = (0, 0, 0)
for c in list(bpy.data.collections):
    if c not in (people, col): bpy.data.collections.remove(c)
for _ in range(3):
    for blk in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.lights, bpy.data.cameras, bpy.data.node_groups):
        for d in list(blk):
            if d.users == 0: blk.remove(d)
for o in list(bpy.data.objects):
    if o.type == "LIGHT": bpy.data.objects.remove(o, do_unlink=True)


def light(name, loc, energy, size):
    ld = bpy.data.lights.new(name, "AREA"); ld.energy = energy; ld.size = size
    lo = bpy.data.objects.new(name, ld); people.objects.link(lo); lo.location = loc
    lo.rotation_euler = (Vector((0, 0, 3.5)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()


light("Key", (-5, -8, 9), 2500, 5); light("Fill", (8, -6, 5), 700, 6); light("Rim", (4, 7, 9), 1400, 3)
cd = bpy.data.cameras.new("Jerry camera"); cd.lens = 50
cam = bpy.data.objects.new("Jerry camera", cd); people.objects.link(cam)
cam.location = (-6.5, -12.5, 4.6); cam.rotation_euler = (Vector((0, 0, 3.2)) - cam.location).to_track_quat("-Z", "Y").to_euler()
sc.camera = cam
bpy.ops.wm.save_as_mainfile(filepath=STANDALONE, compress=True)
print("saved standalone")
```

## jerry3/prevbody.py - full-body preview renders
```python
"""Full-body previews of Jerry v3. usage: python3 prevbody.py out_prefix views samples res"""
import bpy, sys, math, os
sys.path.insert(0, "/home/claude/work/jerry3")
from j3lib import *
from mathutils import Vector
a = sys.argv[1:]
out, views, samples, res = a[0], a[1].split(","), int(a[2]), int(a[3])
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene; col = sc.collection
sc.render.engine = "CYCLES"; sc.cycles.samples = samples; sc.cycles.use_denoising = True
sc.view_settings.view_transform = "AgX"; sc.view_settings.look = "AgX - Medium High Contrast"
w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[1].default_value = 0.4; w.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.57, 0.6, 1)
build_jerry(col)
add_apron(col)
bpy.ops.mesh.primitive_plane_add(size=8); fl = bpy.context.object
fl.data.materials.append(simple_material("floor", "#9a9690", 0.6))
def area(name, loc, target, energy, size, color=(1, 1, 1)):
    ld = bpy.data.lights.new(name, "AREA"); ld.energy = energy; ld.size = size; ld.color = color
    o = bpy.data.objects.new(name, ld); col.objects.link(o); o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
area("key", (-2.2, -3.0, 3.2), (0, 0, 1.2), 900, 2.0, (1, 0.96, 0.9))
area("fill", (2.8, -2.2, 1.6), (0, 0, 1.1), 250, 2.5, (0.9, 0.95, 1))
area("rim", (1.5, 2.6, 2.8), (0, 0, 1.4), 500, 1.5)
cd = bpy.data.cameras.new("cam"); cd.lens = float(os.environ.get("LENS", "50")); cam = bpy.data.objects.new("cam", cd); col.objects.link(cam); sc.camera = cam
VIEWS = {"front": (0, -1, 0.05), "q": (-0.62, -0.78, 0.08), "side": (-1, 0, 0.05), "back": (0.3, 1, 0.08), "q2": (0.62, -0.78, 0.08)}
tz = float(os.environ.get("TZ_", "0.95")); dist = float(os.environ.get("DIST", "4.2"))
sc.render.resolution_x = int(res * float(os.environ.get("ASPECT", "0.6"))); sc.render.resolution_y = res
for v in views:
    d = Vector(VIEWS[v]).normalized(); tgt = Vector((0, 0, tz))
    cam.location = tgt + d * dist; cam.rotation_euler = (tgt - cam.location).to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = f"{out}_{v}.png"; bpy.ops.render.render(write_still=True)
```
