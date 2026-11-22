#!/usr/bin/env python3
"""Generate localized, score-specific 1200x630 Open Graph cards.

Requires Pillow. Run from the repository root after changing share copy:

    python scripts/generate-share-images.py

Every card is generic: it shows only FITDLE, the score, and localized copy.
It never contains the target hull, killmail, victim, or fittings.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "share"
OUT.mkdir(parents=True, exist_ok=True)

W, H = 1200, 630
BG = "#05080c"
TEXT = "#eef9fc"
MUTED = "#7b9eaa"
AMBER = "#f2a63b"
CYAN = "#36c8b4"
GREEN = "#2ac3ac"
DIM = "#28414b"

LOCALES = {
    "en": {
        "badge": "EN", "font": r"C:\Windows\Fonts\segoeuib.ttf",
        "win": "CLAIM APPROVED", "one": "SINGLE-PASS APPROVAL", "lost": "CLAIM ESCALATED",
        "oneTag": "ONE PASS", "lostTag": "ESCALATED",
        "tagline": "PEND INSURANCE // CLAIMS ASSESSMENT", "cta": "CAN YOU MATCH IT?",
    },
    "de": {
        "badge": "DE", "font": r"C:\Windows\Fonts\segoeuib.ttf",
        "win": "AKTE GENEHMIGT", "one": "IN EINER PRÜFUNG GENEHMIGT", "lost": "AKTE ESKALIERT",
        "oneTag": "EINE PRÜFUNG", "lostTag": "ESKALIERT",
        "tagline": "PEND INSURANCE // SCHADENSBEWERTUNG", "cta": "SCHAFFST DU DAS AUCH?",
    },
    "es": {
        "badge": "ES", "font": r"C:\Windows\Fonts\segoeuib.ttf",
        "win": "EXPEDIENTE APROBADO", "one": "APROBADO EN UNA REVISIÓN", "lost": "EXPEDIENTE ESCALADO",
        "oneTag": "UNA REVISIÓN", "lostTag": "ESCALADO",
        "tagline": "PEND INSURANCE // EVALUACIÓN DE SINIESTROS", "cta": "¿PUEDES IGUALARLO?",
    },
    "fr": {
        "badge": "FR", "font": r"C:\Windows\Fonts\segoeuib.ttf",
        "win": "DOSSIER APPROUVÉ", "one": "APPROUVÉ EN UN EXAMEN", "lost": "DOSSIER ESCALADÉ",
        "oneTag": "UN EXAMEN", "lostTag": "ESCALADÉ",
        "tagline": "PEND INSURANCE // ÉVALUATION DES SINISTRES", "cta": "POUVEZ-VOUS FAIRE AUTANT ?",
    },
    "ja": {
        "badge": "日本語", "font": r"C:\Windows\Fonts\YuGothB.ttc",
        "win": "クレーム承認", "one": "一発承認", "lost": "クレーム上申",
        "oneTag": "一回の査定", "lostTag": "上申",
        "tagline": "PEND INSURANCE // クレーム査定", "cta": "同じ査定ができますか？",
    },
    "ko": {
        "badge": "한국어", "font": r"C:\Windows\Fonts\malgunbd.ttf",
        "win": "클레임 승인", "one": "한 번에 승인", "lost": "클레임 이관",
        "oneTag": "한 번의 검토", "lostTag": "이관",
        "tagline": "PEND INSURANCE // 클레임 평가", "cta": "같은 평가를 할 수 있나요?",
    },
    "ru": {
        "badge": "RU", "font": r"C:\Windows\Fonts\segoeuib.ttf",
        "win": "ДЕЛО УТВЕРЖДЕНО", "one": "УТВЕРЖДЕНО ЗА ОДНУ ПРОВЕРКУ", "lost": "ДЕЛО ПЕРЕДАНО",
        "oneTag": "ОДНА ПРОВЕРКА", "lostTag": "ПЕРЕДАНО",
        "tagline": "PEND INSURANCE // ОЦЕНКА УБЫТКОВ", "cta": "СМОЖЕТЕ ТАК ЖЕ?",
    },
    "zh": {
        "badge": "中文", "font": r"C:\Windows\Fonts\msyhbd.ttc",
        "win": "理赔通过", "one": "一次复核通过", "lost": "案卷升级",
        "oneTag": "一次复核", "lostTag": "已升级",
        "tagline": "PEND INSURANCE // 理赔评估", "cta": "你能匹配这次评估吗？",
    },
}

BASE_FONT = r"C:\Windows\Fonts\segoeuib.ttf"
MONO_FONT = r"C:\Windows\Fonts\consola.ttf"


def font(path, size):
    return ImageFont.truetype(path, size, index=0)


def text_width(draw, text, fnt):
    box = draw.textbbox((0, 0), text, font=fnt)
    return box[2] - box[0]


def wrap(draw, text, fnt, max_width):
    if text_width(draw, text, fnt) <= max_width:
        return text
    if " " in text:
        words = text.split()
        lines, current = [], ""
        for word in words:
            candidate = f"{current} {word}".strip()
            if text_width(draw, candidate, fnt) <= max_width:
                current = candidate
            else:
                if current:
                    lines.append(current)
                current = word
        if current:
            lines.append(current)
        return "\n".join(lines)
    # CJK/other long unspaced strings: character wrap.
    lines, current = [], ""
    for char in text:
        if text_width(draw, current + char, fnt) <= max_width:
            current += char
        else:
            lines.append(current)
            current = char
    if current:
        lines.append(current)
    return "\n".join(lines)


def adaptive_font(draw, text, path, start, minimum, max_width):
    size = start
    while size > minimum:
        fnt = font(path, size)
        wrapped = wrap(draw, text, fnt, max_width)
        if "\n" in wrapped:
            # Two lines are acceptable for long German/Russian headlines.
            if all(text_width(draw, line, fnt) <= max_width for line in wrapped.split("\n")):
                return fnt, wrapped
        elif text_width(draw, text, fnt) <= max_width:
            return fnt, text
        size -= 2
    fnt = font(path, minimum)
    return fnt, wrap(draw, text, fnt, max_width)


def frame(draw, copy):
    for x in range(0, W, 60):
        draw.line((x, 0, x, H), fill=(20, 50, 62, 30), width=1)
    for y in range(0, H, 60):
        draw.line((0, y, W, y), fill=(20, 50, 62, 30), width=1)
    draw.text((70, 54), "FITDLE", font=font(BASE_FONT, 66), fill=TEXT)
    draw.text((74, 126), "PEND INSURANCE // CLAIMS ASSESSMENT", font=font(BASE_FONT, 20), fill=AMBER)
    badge_font = font(copy["font"], 18)
    badge_w = text_width(draw, copy["badge"], badge_font)
    draw.rounded_rectangle((W - 70 - badge_w - 30, 60, W - 70, 98), radius=3,
                           outline=(60, 110, 125, 180), width=1)
    draw.text((W - 70 - badge_w - 15, 68), copy["badge"], font=badge_font, fill=MUTED)


def bottom(draw, copy, accent):
    draw.line((70, 574, 1130, 574), fill=(35, 72, 84, 160), width=1)
    tag_font = font(copy["font"], 14)
    draw.multiline_text((72, 590), wrap(draw, copy["tagline"], tag_font, 780),
                        font=tag_font, fill=MUTED, spacing=2)
    cta_font = font(copy["font"], 18)
    cta_w = text_width(draw, copy["cta"], cta_font)
    draw.text((1128 - cta_w, 586), copy["cta"], font=cta_font, fill=accent)


def cells(draw, key, win):
    for i in range(6):
        x = 74 + i * 42
        fill = (42, 195, 172, 220) if win and i < int(key) else (35, 57, 64, 180)
        draw.rounded_rectangle((x, 186, x+29, 215), radius=3, fill=fill)


def one_shot(draw, copy):
    import math
    frame(draw, copy)
    cx, cy = 885, 300
    for angle in range(0, 360, 12):
        rad = math.radians(angle)
        inner = 92
        outer = 330 if angle % 36 == 0 else 235
        alpha = 86 if angle % 36 == 0 else 34
        draw.line((cx + math.cos(rad) * inner, cy + math.sin(rad) * inner,
                   cx + math.cos(rad) * outer, cy + math.sin(rad) * outer),
                  fill=(54, 228, 200, alpha), width=2 if angle % 36 == 0 else 1)
    for r, alpha in [(92, 90), (160, 55), (230, 35)]:
        draw.ellipse((cx-r, cy-r, cx+r, cy+r), outline=(54, 228, 200, alpha), width=2)
    draw.line((cx-330, cy, cx+330, cy), fill=(54, 228, 200, 40), width=1)
    draw.line((cx, cy-330, cx, cy+330), fill=(54, 228, 200, 40), width=1)
    draw.ellipse((cx-12, cy-12, cx+12, cy+12), fill=(54, 228, 200, 230))
    draw.ellipse((cx-38, cy-38, cx+38, cy+38), outline=(54, 228, 200, 120), width=2)
    draw.text((cx-104, cy+248), "01 / 06", font=font(MONO_FONT, 16), fill=(123, 190, 185))

    cells(draw, "1", True)
    tag_font = font(copy["font"], 18)
    draw.text((74, 236), copy["oneTag"], font=tag_font, fill=CYAN)
    draw.text((66, 264), "1/6", font=font(BASE_FONT, 150), fill=CYAN)
    headline_font, headline_text = adaptive_font(draw, copy["one"], copy["font"], 52, 30, 640)
    draw.multiline_text((72, 430), headline_text, font=headline_font, fill=TEXT, spacing=6)
    bottom(draw, copy, CYAN)


def escaped(draw, copy):
    import math
    frame(draw, copy)
    cx, cy = 900, 300
    # Broken rings and a fading sweep communicate an escalated file.
    for r, start, extent, alpha in [(235, 205, 255, 32), (160, 20, 250, 48), (92, 120, 230, 62)]:
        draw.arc((cx-r, cy-r, cx+r, cy+r), start=start, end=start+extent,
                 fill=(242, 166, 59, alpha), width=2)
    for step in range(18):
        rad = math.radians(198 - step * 1.5)
        alpha = max(10, 80 - step * 4)
        draw.line((cx, cy, cx + math.cos(rad) * 290, cy + math.sin(rad) * 290),
                  fill=(242, 166, 59, alpha), width=1)
    draw.line((cx-280, cy, cx-90, cy), fill=(242, 166, 59, 42), width=1)
    draw.line((cx+110, cy, cx+280, cy), fill=(242, 166, 59, 42), width=1)
    draw.line((cx, cy-280, cx, cy-110), fill=(242, 166, 59, 42), width=1)
    draw.line((cx, cy+110, cx, cy+280), fill=(242, 166, 59, 42), width=1)
    # Off-screen contact trace.
    bx, by = cx + 170, cy - 105
    draw.ellipse((bx-9, by-9, bx+9, by+9), outline=(242, 166, 59, 210), width=2)
    draw.ellipse((bx-26, by-26, bx+26, by+26), outline=(242, 166, 59, 60), width=1)
    draw.text((cx-102, cy+248), "ESCALATED // 06", font=font(MONO_FONT, 16), fill=(140, 112, 78))

    cells(draw, "lost", False)
    tag_font = font(copy["font"], 18)
    draw.text((74, 236), copy["lostTag"], font=tag_font, fill=AMBER)
    draw.text((66, 264), "0/6", font=font(BASE_FONT, 150), fill=AMBER)
    headline_font, headline_text = adaptive_font(draw, copy["lost"], copy["font"], 52, 30, 640)
    draw.multiline_text((72, 430), headline_text, font=headline_font, fill=TEXT, spacing=6)
    bottom(draw, copy, AMBER)


def card(locale, key, score):
    copy = LOCALES[locale]
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img, "RGBA")

    if key == "1":
        one_shot(draw, copy)
        img.save(OUT / f"og-{key}-{locale}.png", optimize=True)
        return
    if key == "lost":
        escaped(draw, copy)
        img.save(OUT / f"og-{key}-{locale}.png", optimize=True)
        return

    win = True
    accent = GREEN
    large = f"{key}/6"
    frame(draw, copy)
    cx, cy = 940, 310
    for r, color in [(250, (50, 200, 180, 20)), (190, (50, 200, 180, 26)),
                     (125, (242, 166, 59, 35)), (60, (242, 166, 59, 48))]:
        draw.ellipse((cx-r, cy-r, cx+r, cy+r), outline=color, width=2)
    draw.line((cx-270, cy, cx+270, cy), fill=(50, 200, 180, 22), width=1)
    draw.line((cx, cy-270, cx, cy+270), fill=(50, 200, 180, 22), width=1)

    cells(draw, key, win)
    draw.text((70, 248), large, font=font(BASE_FONT, 154), fill=accent)
    headline_font, headline_text = adaptive_font(draw, copy["win"], copy["font"], 46, 28, 640)
    draw.multiline_text((72, 460), headline_text, font=headline_font, fill=TEXT, spacing=6)
    bottom(draw, copy, accent)

    img.save(OUT / f"og-{key}-{locale}.png", optimize=True)


for locale in LOCALES:
    for key in ["1", "2", "3", "4", "5", "6", "lost"]:
        card(locale, key, key)


def default_card():
    copy = LOCALES["en"]
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img, "RGBA")
    frame(draw, copy)
    cells(draw, "0", False)
    draw.text((70, 246), "SIX REVIEW PASSES // ONE CLAIM", font=font(BASE_FONT, 22), fill=AMBER)
    draw.text((66, 286), "VERIFY", font=font(BASE_FONT, 96), fill=TEXT)
    draw.text((66, 382), "THE HULL", font=font(BASE_FONT, 96), fill=CYAN)
    bottom(draw, copy, AMBER)
    img.save(OUT / "og.png", optimize=True)


default_card()
print(f"Wrote {len(LOCALES) * 7 + 1} share cards to {OUT}")
