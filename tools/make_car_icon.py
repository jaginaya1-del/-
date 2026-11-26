#!/usr/bin/env python3
"""family-car-scheduler 홈 화면 아이콘 생성기.

512x512 좌표계로 도형을 정의하고 4배(2048px)로 그린 뒤 LANCZOS 로 줄여
깔끔한(안티에일리어싱된) PNG 를 만든다. 같은 도형을 SVG 로도 써 둔다.

  python3 tools/make_car_icon.py

출력: family-car-scheduler/icon-192.png, icon-512.png,
      icon-maskable-512.png (안드로이드 적응형용, 차량 84% 축소),
      icon.svg
"""
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "family-car-scheduler")
SS = 4            # supersample factor
V = 512           # design viewport
S = V * SS        # supersampled canvas

# ── 색 ──────────────────────────────────────────────────────────────
STOPS = [(0.00, (0x1d, 0x4e, 0xd8)),   # 진한 파랑
         (0.55, (0x3b, 0x82, 0xf6)),   # 파랑
         (1.00, (0x60, 0xa5, 0xfa))]   # 하늘색
CAR = (255, 255, 255, 255)
GLASS = (0x17, 0x40, 0x8f, 255)
TIRE = (0x12, 0x30, 0x6e, 255)
HUB = (0xea, 0xf2, 0xff, 255)
HUB_C = (0x1d, 0x4e, 0xd8, 255)
LAMP_F = (0xfd, 0xe6, 0x8a, 255)
LAMP_R = (0xfd, 0xa4, 0xaf, 255)

# ── 512 좌표계 도형 ─────────────────────────────────────────────────
CABIN = (160, 186, 372, 306, 52)      # x0,y0,x1,y1,radius
BODY = (70, 268, 442, 360, 32)
WIN_REAR = (182, 206, 250, 256, 13)
WIN_FRONT = (266, 206, 352, 256, 13)
LAMP_RECT_R = (74, 298, 98, 314, 7)
LAMP_RECT_F = (402, 298, 438, 316, 9)
WHEELS = [(156, 356, 50), (360, 356, 50)]
HUB_R, HUB_DOT_R = 21, 9
SHADOW = (100, 388, 412, 432)          # ellipse bbox


def sc(box):
    return [int(round(v * SS)) for v in box]


def gradient(size):
    """좌상단→우하단 파랑 그라데이션 (불투명)."""
    y, x = np.mgrid[0:size, 0:size]
    t = (x / (size - 1) + y / (size - 1)) / 2.0
    rgb = np.zeros((size, size, 3), dtype=np.float64)
    for i in range(len(STOPS) - 1):
        p0, c0 = STOPS[i]
        p1, c1 = STOPS[i + 1]
        m = (t >= p0) & (t <= p1 if i == len(STOPS) - 2 else t < p1)
        f = ((t[m] - p0) / (p1 - p0))[:, None] if m.any() else None
        if m.any():
            for k in range(3):
                rgb[..., k][m] = c0[k] + (c1[k] - c0[k]) * f[:, 0]
    arr = np.dstack([rgb, np.full((size, size, 1), 255.0)]).astype(np.uint8)
    return Image.fromarray(arr, "RGBA")


def car_layer():
    """차량 + 그림자 (512 좌표계, 투명 배경)."""
    lay = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    # 그림자 (따로 그려 블러)
    sh = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse(sc(SHADOW), fill=(10, 42, 110, 80))
    lay.alpha_composite(sh.filter(ImageFilter.GaussianBlur(radius=7 * SS)))

    d = ImageDraw.Draw(lay)
    # 실루엣: 캐빈 → 보디 (같은 흰색이라 합쳐진 한 덩어리로 보임)
    d.rounded_rectangle(sc(CABIN[:4]), radius=CABIN[4] * SS, fill=CAR)
    d.rounded_rectangle(sc(BODY[:4]), radius=BODY[4] * SS, fill=CAR)
    # 창문
    d.rounded_rectangle(sc(WIN_REAR[:4]), radius=WIN_REAR[4] * SS, fill=GLASS)
    d.rounded_rectangle(sc(WIN_FRONT[:4]), radius=WIN_FRONT[4] * SS, fill=GLASS)
    # 등화류
    d.rounded_rectangle(sc(LAMP_RECT_R[:4]), radius=LAMP_RECT_R[4] * SS, fill=LAMP_R)
    d.rounded_rectangle(sc(LAMP_RECT_F[:4]), radius=LAMP_RECT_F[4] * SS, fill=LAMP_F)
    # 바퀴
    for cx, cy, r in WHEELS:
        d.ellipse(sc((cx - r, cy - r, cx + r, cy + r)), fill=TIRE)
        d.ellipse(sc((cx - HUB_R, cy - HUB_R, cx + HUB_R, cy + HUB_R)), fill=HUB)
        d.ellipse(sc((cx - HUB_DOT_R, cy - HUB_DOT_R, cx + HUB_DOT_R, cy + HUB_DOT_R)), fill=HUB_C)
    return lay


def build(car_scale=1.0):
    """512 논리 크기의 마스터(2048px)를 만든다. 풀블리드(불투명)."""
    base = gradient(S)
    car = car_layer()
    if car_scale != 1.0:
        w = int(round(S * car_scale))
        car = car.resize((w, w), Image.LANCZOS)
        canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        canvas.alpha_composite(car, ((S - w) // 2, int(round((S - w) / 2))))
        car = canvas
    base.alpha_composite(car)
    return base


SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="가족 차량·일정">
  <title>가족 차량·일정</title>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1d4ed8"/>
      <stop offset=".55" stop-color="#3b82f6"/>
      <stop offset="1" stop-color="#60a5fa"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" ry="112" fill="url(#bg)"/>
  <ellipse cx="256" cy="410" rx="156" ry="22" fill="#0a2a6e" opacity=".24"/>
  <rect x="160" y="186" width="212" height="120" rx="52" ry="52" fill="#ffffff"/>
  <rect x="70" y="268" width="372" height="92" rx="32" ry="32" fill="#ffffff"/>
  <rect x="182" y="206" width="68" height="50" rx="13" ry="13" fill="#17408f"/>
  <rect x="266" y="206" width="86" height="50" rx="13" ry="13" fill="#17408f"/>
  <rect x="74" y="298" width="24" height="16" rx="7" ry="7" fill="#fda4af"/>
  <rect x="402" y="298" width="36" height="18" rx="9" ry="9" fill="#fde68a"/>
  <circle cx="156" cy="356" r="50" fill="#12306e"/>
  <circle cx="360" cy="356" r="50" fill="#12306e"/>
  <circle cx="156" cy="356" r="21" fill="#eaf2ff"/>
  <circle cx="360" cy="356" r="21" fill="#eaf2ff"/>
  <circle cx="156" cy="356" r="9" fill="#1d4ed8"/>
  <circle cx="360" cy="356" r="9" fill="#1d4ed8"/>
</svg>
"""


def save(img, name, size):
    img.resize((size, size), Image.LANCZOS).convert("RGB").save(
        os.path.join(OUT, name), "PNG", optimize=True)
    print("wrote", name, size)


def main():
    os.makedirs(OUT, exist_ok=True)
    master = build(1.0)
    save(master, "icon-512.png", 512)
    save(master, "icon-192.png", 192)
    save(build(0.84), "icon-maskable-512.png", 512)
    with open(os.path.join(OUT, "icon.svg"), "w", encoding="utf-8") as f:
        f.write(SVG)
    print("wrote icon.svg")


if __name__ == "__main__":
    main()
