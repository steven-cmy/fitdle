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
        "win": "TARGET DESTROYED", "one": "FIRST-SHOT KILL", "lost": "TARGET ESCAPED",
        "tagline": "DAILY EVE ONLINE KILLBOARD PUZZLE", "cta": "CAN YOU BEAT THIS?",
    },
    "de": {
        "badge": "DE", "font": r"C:\Windows\Fonts\segoeuib.ttf",
        "win": "ZIEL ZERSTÖRT", "one": "TREFFER BEIM ERSTEN SCHUSS", "lost": "ZIEL ENTKOMMEN",
        "tagline": "TÄGLICHES EVE-ONLINE-KILLBOARD-RÄTSEL", "cta": "SCHAFFST DU MEHR?",
    },
    "es": {
        "badge": "ES", "font": r"C:\Windows\Fonts\segoeuib.ttf",
        "win": "OBJETIVO DESTRUIDO", "one": "MUERTE AL PRIMER DISPARO", "lost": "EL OBJETIVO ESCAPÓ",
        "tagline": "PUZLE DIARIO DE KILLBOARD DE EVE ONLINE", "cta": "¿PUEDES SUPERARLO?",
    },
    "fr": {
        "badge": "FR", "font": r"C:\Windows\Fonts\segoeuib.ttf",
        "win": "CIBLE DÉTRUITE", "one": "ÉLIMINATION AU PREMIER TIR", "lost": "CIBLE ÉCHAPPÉE",
        "tagline": "PUZZLE QUOTIDIEN DE KILLBOARD EVE ONLINE", "cta": "PEUX-TU FAIRE MIEUX ?",
    },
    "ja": {
        "badge": "日本語", "font": r"C:\Windows\Fonts\YuGothB.ttc",
        "win": "目標撃破", "one": "初弾撃破", "lost": "目標逃げられました",
        "tagline": "EVE Online 毎日キルボードパズル", "cta": "スコアを超えられる？",
    },
    "ko": {
        "badge": "한국어", "font": r"C:\Windows\Fonts\malgunbd.ttf",
        "win": "목표 격파", "one": "첫 발에 격파", "lost": "목표가 도주했습니다",
        "tagline": "EVE Online 일일 킬보드 퍼즐", "cta": "내 점수를 넘을 수 있나요?",
    },
    "ru": {
        "badge": "RU", "font": r"C:\Windows\Fonts\segoeuib.ttf",
        "win": "ЦЕЛЬ УНИЧТОЖЕНА", "one": "УБИЙСТВО С ПЕРВОГО ВЫСТРЕЛА", "lost": "ЦЕЛЬ УШЛА",
        "tagline": "ЕЖЕДНЕВНАЯ ГОЛОВОЛОМКА ПО КИЛЛБОРДУ EVE ONLINE", "cta": "СМОЖЕШЬ ЛУЧШЕ?",
    },
    "zh": {
        "badge": "中文", "font": r"C:\Windows\Fonts\msyhbd.ttc",
        "win": "目标已击毁", "one": "首发命中", "lost": "目标逃逸",
        "tagline": "EVE Online 每日击杀谜题", "cta": "你能超过我吗？",
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


def card(locale, key, score):
    copy = LOCALES[locale]
    headline = copy[{"lost": "lost", "1": "one"}.get(key, "win")] if key != "lost" else copy["lost"]
    win = key != "lost"
    accent = AMBER if not win else (CYAN if key == "1" else GREEN)
    large = "0/6" if not win else f"{key}/6"

    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img, "RGBA")

    for x in range(0, W, 60):
        draw.line((x, 0, x, H), fill=(20, 50, 62, 30), width=1)
    for y in range(0, H, 60):
        draw.line((0, y, W, y), fill=(20, 50, 62, 30), width=1)

    cx, cy = 940, 310
    for r, color in [(250, (50, 200, 180, 20)), (190, (50, 200, 180, 26)),
                     (125, (242, 166, 59, 35)), (60, (242, 166, 59, 48))]:
        draw.ellipse((cx-r, cy-r, cx+r, cy+r), outline=color, width=2)
    draw.line((cx-270, cy, cx+270, cy), fill=(50, 200, 180, 22), width=1)
    draw.line((cx, cy-270, cx, cy+270), fill=(50, 200, 180, 22), width=1)

    draw.text((70, 54), "FITDLE", font=font(BASE_FONT, 66), fill=TEXT)
    draw.text((74, 126), "DAILY KILLBOARD", font=font(BASE_FONT, 22), fill=AMBER)
    badge_font = font(copy["font"], 18)
    badge_w = text_width(draw, copy["badge"], badge_font)
    draw.rounded_rectangle((W - 70 - badge_w - 30, 60, W - 70, 98), radius=3,
                           outline=(60, 110, 125, 180), width=1)
    draw.text((W - 70 - badge_w - 15, 68), copy["badge"], font=badge_font, fill=MUTED)

    # score cells
    for i in range(6):
        x = 74 + i * 42
        fill = (42, 195, 172, 220) if win and i < int(key) else (35, 57, 64, 180)
        draw.rounded_rectangle((x, 186, x+29, 215), radius=3, fill=fill)

    draw.text((70, 248), large, font=font(BASE_FONT, 154), fill=accent)

    headline_font, headline_text = adaptive_font(draw, headline, copy["font"], 46, 28, 640)
    draw.multiline_text((72, 460), headline_text, font=headline_font, fill=TEXT, spacing=6)

    # bottom strip
    draw.line((70, 574, 1130, 574), fill=(35, 72, 84, 160), width=1)
    tag_font = font(copy["font"], 14)
    draw.multiline_text((72, 590), wrap(draw, copy["tagline"], tag_font, 780), font=tag_font, fill=MUTED, spacing=2)
    cta_font = font(copy["font"], 18)
    cta_w = text_width(draw, copy["cta"], cta_font)
    draw.text((1128 - cta_w, 586), copy["cta"], font=cta_font, fill=CYAN)

    img.save(OUT / f"og-{key}-{locale}.png", optimize=True)


for locale in LOCALES:
    for key in ["1", "2", "3", "4", "5", "6", "lost"]:
        card(locale, key, key)

print(f"Wrote {len(LOCALES) * 7} share cards to {OUT}")
