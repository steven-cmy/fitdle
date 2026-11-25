#!/usr/bin/env python3
# /// script
# dependencies = ["pillow", "fonttools", "brotli"]
# ///
"""Generate the localized 1200x630 Open Graph cards as Pend claim files.

Run from the repository root after changing interface or department copy; uv
provides the packages, CJK and Cyrillic glyphs come from the Windows fonts:

    uv run scripts/generate-share-images.py

A card shows one closed claim file: sender, recipient, status, the six review
passes and a line from the sending department. Every word comes from js/messages
and assets/claim-departments.json. The wreck is an invented outline: a card never
contains a hull, killmail, victim or fitting.
"""
import io
import json
import math
import re
from pathlib import Path

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "share"
OUT.mkdir(parents=True, exist_ok=True)

W, H, SCALE = 1200, 630, 2
BG = (5, 8, 11)
PANEL = (10, 18, 26)
PANEL_DEEP = (7, 13, 19)
LINE = (38, 55, 67)
LINE_STRONG = (58, 85, 101)
TEXT = (226, 238, 245)
BODY = (186, 203, 214)
MUTED = (126, 148, 162)
DIM = (66, 86, 98)
AMBER = (242, 166, 59)
TEAL = (54, 200, 180)
CYAN = (85, 183, 212)
RED = (214, 92, 78)

WINDOWS = Path(r"C:\Windows\Fonts")
CJK = {
    "ja": ("YuGothB.ttc", "YuGothM.ttc"),
    "ko": ("malgunbd.ttf", "malgun.ttf"),
    "zh": ("msyhbd.ttc", "msyh.ttc"),
}
FALLBACK = ("segoeuib.ttf", "segoeui.ttf")
EVE = {"bold": "eve_sans_neuebold_700_normal.woff2", "regular": "eve_sans_neueregular_400_normal.woff2"}

# Department and line for each result; 1 and the default card use interface copy.
SOURCES = {
    "2": ("salvage", "won", 5),
    "3": ("wreck", "won", 2),
    "4": ("cargo", "won", 3),
    "5": ("fitting", "won", 3),
    "6": ("intake", "won", 4),
    "lost": ("hull", "lost", 5),
}
ENTRY = re.compile(r"^  '([^']+)': (?:'((?:[^'\\]|\\.)*)'|\"((?:[^\"\\]|\\.)*)\"),$")
departments = json.loads((ROOT / "assets" / "claim-departments.json").read_text("utf8"))["departments"]


def load_messages(locale):
    messages = {}
    for line in (ROOT / "js" / "messages" / f"{locale}.js").read_text("utf8").splitlines():
        match = ENTRY.match(line)
        if match:
            value = match[2] if match[2] is not None else match[3]
            messages[match[1]] = value.replace("\\n", "\n").replace("\\'", "'").replace('\\"', '"')
    return messages


def load_eve():
    fonts = {}
    for weight, name in EVE.items():
        face = TTFont(ROOT / "assets" / "fonts" / name)
        face.flavor = None
        data = io.BytesIO()
        face.save(data)
        fonts[weight] = (data.getvalue(), set(face.getBestCmap()))
    return fonts


EVE_FONTS = load_eve()
cache = {}


def eve_font(weight, size):
    key = ("eve", weight, size)
    if key not in cache:
        cache[key] = ImageFont.truetype(io.BytesIO(EVE_FONTS[weight][0]), round(size * SCALE))
    return cache[key]


def other_font(locale, weight, size):
    bold, regular = CJK.get(locale, FALLBACK)
    key = (locale, weight, size)
    if key not in cache:
        cache[key] = ImageFont.truetype(str(WINDOWS / (bold if weight == "bold" else regular)), round(size * SCALE))
    return cache[key]


class Card:
    """A supersampled canvas in 1200x630 units with one locale's fonts."""

    def __init__(self, locale):
        self.locale = locale
        self.messages = load_messages(locale)
        self.img = Image.new("RGB", (W * SCALE, H * SCALE), BG)
        self.draw = ImageDraw.Draw(self.img, "RGBA")

    def t(self, key, **values):
        text = self.messages[key]
        for name, value in values.items():
            text = text.replace(f"{{{name}}}", str(value))
        return text

    def line(self, points, fill, width=1.0):
        self.draw.line([(x * SCALE, y * SCALE) for x, y in points], fill=fill, width=max(1, round(width * SCALE)), joint="curve")

    def rect(self, box, fill=None, outline=None, width=1.0):
        self.draw.rectangle([v * SCALE for v in box], fill=fill, outline=outline, width=max(1, round(width * SCALE)))

    def polygon(self, points, fill=None, outline=None, width=1.0):
        scaled = [(x * SCALE, y * SCALE) for x, y in points]
        if fill:
            self.draw.polygon(scaled, fill=fill)
        if outline:
            self.draw.line(scaled + [scaled[0], scaled[1]], fill=outline, width=max(1, round(width * SCALE)), joint="curve")

    def runs(self, text, weight, size):
        """Split text into Eve Sans Neue runs and fallback runs."""
        # Cyrillic and Hangul words must not change the face inside a word.
        covered = EVE_FONTS[weight][1]
        latin = self.locale in ("en", "de", "es", "fr")
        result = []
        for part in re.findall(r"[\x21-\x7e\u00a0-\u024f]+(?:[ ]+[\x21-\x7e\u00a0-\u024f]+)*|[^\x21-\x7e\u00a0-\u024f]+", text):
            use_eve = latin and all(ord(c) in covered or c == " " for c in part)
            use_eve = use_eve or (not latin and re.fullmatch(r"[A-Za-z0-9/.\- ]+", part) is not None)
            result.append((part, eve_font(weight, size) if use_eve else other_font(self.locale, weight, size)))
        return result

    def width(self, text, size, weight="regular", spacing=0.0):
        total = sum(font.getlength(part) for part, font in self.runs(text, weight, size)) / SCALE
        return total + spacing * max(0, len(text) - 1)

    def text(self, x, y, text, size, fill, weight="regular", align="left", spacing=0.0):
        """Draw on a baseline, so every script sits on the same line."""
        width = self.width(text, size, weight, spacing)
        x -= width if align == "right" else width / 2 if align == "center" else 0
        for part, font in self.runs(text, weight, size):
            if spacing:
                for char in part:
                    self.draw.text((x * SCALE, y * SCALE), char, font=font, fill=fill, anchor="ls")
                    x += font.getlength(char) / SCALE + spacing
            else:
                self.draw.text((x * SCALE, y * SCALE), part, font=font, fill=fill, anchor="ls")
                x += font.getlength(part) / SCALE
        return width

    def fit(self, text, size, smallest, limit, weight="regular", spacing=0.0):
        while size > smallest and self.width(text, size, weight, spacing) > limit:
            size -= 1
        return size

    def wrap(self, text, size, limit, weight="regular"):
        # Break between words; Chinese and Japanese break anywhere but before punctuation.
        units = (re.findall(r"[^\u3000-\u30ff\u3400-\u9fff\uff00-\uffef ]+|[ ]|.[、。，！？；：」”）]*", text)
                 if self.locale in ("ja", "zh") else re.findall(r"\S+\s*", text))
        lines, current = [], ""
        for unit in units:
            if current and self.width((current + unit).rstrip(), size, weight) > limit:
                lines.append(current.rstrip())
                current = unit.lstrip()
            else:
                current += unit
        return lines + [current.rstrip()] if current.strip() else lines

    def paragraph(self, x, y, text, size, smallest, limit, lines, fill, weight="regular", leading=1.38):
        while size > smallest and len(self.wrap(text, size, limit, weight)) > lines:
            size -= 1
        rows = self.wrap(text, size, limit, weight)
        # Never leave a few characters alone on the last line.
        while len(rows) > 1 and self.width(rows[-1], size, weight) < limit * 0.22:
            narrower = self.wrap(text, size, limit - size, weight)
            if len(narrower) > len(rows):
                break
            limit, rows = limit - size, narrower
        for row in rows[:lines]:
            self.text(x, y, row, size, fill, weight)
            y += size * leading
        return y

    def save(self, name):
        self.img.resize((W, H), Image.LANCZOS).save(OUT / name, optimize=True)


def mark(card, x, y, size, color):
    """The FITDLE file mark of the interface (64 unit box)."""
    k = size / 64
    at = lambda points: [(x + px * k, y + py * k) for px, py in points]
    card.line(at([(13, 8), (40, 8), (51, 19), (51, 56), (13, 56), (13, 8)]), color, 1.6 * k * 1.3)
    card.line(at([(40, 8), (40, 19), (51, 19)]), color, 1.2 * k * 1.3)
    card.line(at([(23, 49), (23, 24), (40, 24)]), color, 2 * k * 1.3)
    card.line(at([(23, 35), (36, 35)]), color, 2 * k * 1.3)
    card.line(at([(23, 49), (40, 49)]), CYAN, 1.4 * k * 1.3)


def background(card):
    for x in range(0, W + 1, 40):
        card.line([(x, 0), (x, H)], (20, 40, 52, 46), 0.5)
    for y in range(15, H, 40):
        card.line([(0, y), (W, y)], (20, 40, 52, 46), 0.5)
    mark(card, 36, 24, 66, TEXT)
    card.text(106, 68, "FITDLE", 44, TEXT, "bold", spacing=3)
    brand = f"{card.t('brand.parent')} // {card.t('brand.claimDivision')}"
    card.text(107, 95, brand, card.fit(brand, 16, 11, 560), AMBER, "bold", spacing=0.4)
    record = card.t("claim.scc")
    card.text(1160, 66, record, card.fit(record, 15, 11, 330, "bold"), MUTED, "bold", "right", 0.6)
    system = "FITTING IDENTIFICATION, TESTIMONY & DAMAGE LEDGER EVALUATION"
    card.text(1160, 88, system, 9.5, MUTED, "regular", "right", 0.5)


FRAGMENTS = [
    # An invented hull seen from above, cut into seven numbered fragments.
    [(0, -8), (34, -22), (62, -18), (62, 18), (34, 22), (0, 8)],
    [(64, -18), (104, -34), (120, -30), (112, 0), (64, 0)],
    [(64, 2), (112, 2), (120, 30), (104, 34), (64, 18)],
    [(116, 0), (124, -30), (176, -26), (176, 26), (124, 30)],
    [(126, -33), (158, -72), (214, -80), (206, -58), (176, -30)],
    [(126, 33), (176, 30), (206, 58), (214, 80), (158, 72)],
    [(180, -26), (226, -34), (262, -22), (270, 0), (262, 22), (226, 34), (180, 26)],
]
DRIFT = [(-30, -6, -0.10), (-12, -20, 0.12), (-10, 22, -0.16), (4, 6, 0.2), (12, -24, -0.14), (10, 26, 0.12), (30, 4, 0.08)]


def wreck(card, box, spread, accent, missing):
    """Scan plate with the fragments; `spread` pulls the wreck apart."""
    x0, y0, x1, y1 = box
    card.rect(box, PANEL_DEEP, LINE)
    for step in range(1, 12):
        x = x0 + (x1 - x0) * step / 12
        card.line([(x, y0 + 6), (x, y1 - 6)], (54, 100, 116, 28), 0.5)
    for step in range(1, 6):
        y = y0 + (y1 - y0) * step / 6
        card.line([(x0 + 6, y), (x1 - 6, y)], (54, 100, 116, 28), 0.5)
    for cx, cy, dx, dy in [(x0, y0, 1, 1), (x1, y0, -1, 1), (x0, y1, 1, -1), (x1, y1, -1, -1)]:
        card.line([(cx + 16 * dx, cy + 6 * dy), (cx + 6 * dx, cy + 6 * dy), (cx + 6 * dx, cy + 16 * dy)], LINE_STRONG, 1.4)
    label = card.t("hero.scanLabel")
    card.text(x0 + 18, y0 + 26, label, card.fit(label, 12, 9, 190, "bold"), MUTED, "bold", spacing=0.5)
    # Up and left of the centre: the stamp covers the lower right corner.
    ox, oy = (x0 + x1) / 2 - 163, (y0 + y1) / 2
    for index, shape in enumerate(FRAGMENTS):
        px, py, angle = (value * spread for value in DRIFT[index])
        mx = sum(p[0] for p in shape) / len(shape)
        my = sum(p[1] for p in shape) / len(shape)
        cos, sin = math.cos(angle), math.sin(angle)
        points = [(ox + px + mx + (x - mx) * cos - (y - my) * sin, oy + py + my + (x - mx) * sin + (y - my) * cos) for x, y in shape]
        lost = index == 3 and missing
        if lost:
            # Fragment 04 is still missing: only its outline is on file.
            closed = points + [points[0]]
            for (ax, ay), (bx, by) in zip(closed, closed[1:]):
                length = max(1, math.hypot(bx - ax, by - ay))
                steps = int(length // 6)
                for s in range(0, steps, 2):
                    card.line([(ax + (bx - ax) * s / steps, ay + (by - ay) * s / steps),
                               (ax + (bx - ax) * (s + 1) / steps, ay + (by - ay) * (s + 1) / steps)], accent, 1.2)
        else:
            card.polygon(points, (*accent, 30), (*accent, 190), 1.3)
            card.line([points[0], points[len(points) // 2]], (*accent, 70), 0.8)
        fx = sum(p[0] for p in points) / len(points)
        fy = sum(p[1] for p in points) / len(points)
        card.text(fx, fy + 4, f"{index + 1:02d}" if not lost else "04?", 11, accent if lost else (*TEXT, 210), "bold", "center")


def check(card, x, y, color):
    card.line([(x - 7, y), (x - 2, y + 5), (x + 8, y - 6)], color, 2.4)


def cross(card, x, y, color):
    card.line([(x - 5, y - 5), (x + 5, y + 5)], color, 1.8)
    card.line([(x - 5, y + 5), (x + 5, y - 5)], color, 1.8)


def ledger(card, box, key, accent):
    """The six review passes of the file."""
    x0, y0, x1, y1 = box
    card.rect(box, PANEL_DEEP, LINE)
    solved = int(key) if key.isdigit() else 0
    used = solved or (6 if key == "lost" else 0)
    rows, gap = 3, (y1 - y0) / 3
    half = (x1 - x0) / 2
    card.line([(x0 + half, y0), (x0 + half, y1)], LINE)
    for n in range(1, 7):
        column, row = divmod(n - 1, rows)
        left, top = x0 + half * column, y0 + gap * row
        if row:
            card.line([(left, top), (left + half, top)], LINE)
        hit = n == solved
        if hit:
            card.rect((left + 1, top + 1, left + half - 1, top + gap - 1), (*accent, 34))
        label = card.t("board.attempt", n=n)
        color = accent if hit else BODY if n <= used else DIM
        card.text(left + 16, top + gap / 2 + 5, label, card.fit(label, 14, 10, half - 62, "bold"), color, "bold")
        mx, my = left + half - 24, top + gap / 2
        if hit:
            check(card, mx, my, accent)
        elif n <= used:
            cross(card, mx, my, RED if key == "lost" else (150, 112, 70))
        else:
            card.line([(mx - 6, my), (mx + 6, my)], DIM, 1.6)


def stamp(card, text, color, corner, angle, double=False):
    size = card.fit(text, 30, 16, 205, "bold", 2)
    width = card.width(text, size, "bold", 2) + 44
    height = size + 30
    layer = Image.new("RGBA", (round((width + 24) * SCALE), round((height + 24) * SCALE)), (0, 0, 0, 0))
    ink = Card.__new__(Card)
    ink.locale, ink.messages = card.locale, card.messages
    ink.img, ink.draw = layer, ImageDraw.Draw(layer, "RGBA")
    ink.rect((12, 12, 12 + width, 12 + height), (*BG, 165), (*color, 235), 3)
    if double:
        ink.rect((18, 18, 6 + width, 6 + height), None, (*color, 180), 1.2)
    ink.text(12 + width / 2, 12 + height / 2 + size * 0.36, text, size, (*color, 245), "bold", "center", 2)
    layer = layer.rotate(angle, resample=Image.BICUBIC, expand=True)
    card.img.paste(layer, (round(corner[0] * SCALE - layer.width), round(corner[1] * SCALE - layer.height)), layer)


def build(locale, key):
    card = Card(locale)
    t = card.t
    groups = {group["id"]: group for group in departments[locale]}
    if key == "lost":
        accent, status, headline = AMBER, t("claim.escalated"), t("end.defeatKicker")
    elif key == "open":
        accent, status, headline = CYAN, t("claim.pending"), t("hero.title")
    else:
        accent, status, headline = TEAL, t("claim.confirmed"), t("oneShot.kicker" if key == "1" else "end.victoryKicker")
    if key in SOURCES:
        department, kind, index = SOURCES[key]
        sender, note = groups[department]["name"], groups[department]["debriefs"][kind][index]
    elif key == "1":
        sender, note = groups["hull"]["name"], t("oneShot.body")
    else:
        sender, note = groups["intake"]["name"], groups["intake"]["memos"][0]

    background(card)

    # The letter.
    left, top, right, bottom = 40, 116, 702, 558
    card.rect((left, top, right, bottom), PANEL, LINE_STRONG)
    card.rect((left, top, left + 4, bottom), AMBER)
    fields = [("claim.from", sender, TEXT), ("claim.to", t("claim.assessor"), TEXT),
              ("claim.subject", t("claim.subjectValue"), TEXT), ("claim.status", status, accent)]
    for n, (label, value, color) in enumerate(fields):
        x = left + 28 + (n % 2) * 326
        y = top + 32 + (n // 2) * 50
        card.text(x, y, t(label), 12, MUTED, "bold", spacing=0.8)
        card.text(x, y + 23, value, card.fit(value, 19, 12, 304, "bold"), color, "bold")
    card.line([(left + 28, top + 128), (right - 24, top + 128)], LINE)

    score = {"lost": "X/6", "open": ""}.get(key, f"{key}/6")
    size = card.fit(headline, 50, 30, right - left - 56, "bold")
    if card.width(headline, size, "bold") > right - left - 56:
        rows = card.wrap(headline, 38, right - left - 56, "bold")
        for n, row in enumerate(rows[:2]):
            card.text(left + 28, top + 176 + n * 44, row, 38, TEXT, "bold")
        y = top + 176 + (len(rows[:2]) - 1) * 44
    else:
        y = top + 186
        card.text(left + 28, y, headline, size, TEXT, "bold")

    note_top = y + 46
    end = card.paragraph(left + 46, note_top, note, 23, 17, right - left - 84, 3, BODY)
    card.rect((left + 28, note_top - 22, left + 30, end - 20), AMBER)

    if score:
        card.text(left + 26, bottom - 30, score, 92, accent, "bold")
        label = t("end.attempts")
        x = left + 26 + card.width(score, 92, "bold") + 22
        card.text(x, bottom - 34, label, card.fit(label, 16, 11, right - x - 24, "bold"), MUTED, "bold", spacing=0.6)
    else:
        body = t("hero.body")
        card.paragraph(left + 28, bottom - 74, body, 19, 15, right - left - 56, 3, MUTED)

    # The evidence.
    plate = (722, 116, 1160, 366)
    spread = {"1": 0.0, "2": 0.35, "3": 0.5, "4": 0.65, "5": 0.8, "6": 0.95, "lost": 1.15, "open": 0.7}[key]
    wreck(card, plate, spread, accent, key in ("lost", "open"))
    ledger(card, (722, 382, 1160, 558), key, accent)
    text = t("oneShot.title") if key == "1" else status
    stamp(card, text, accent, (1166, 392), 7, double=key == "1")

    card.line([(40, 578), (1160, 578)], LINE)
    card.text(40, 604, t("share.tagline"), card.fit(t("share.tagline"), 15, 11, 700), MUTED)
    card.text(1160, 604, t("share.open"), 16, accent, "bold", "right")
    card.save("og.png" if key == "open" else f"og-{key}-{locale}.png")


LOCALES = ["en", "de", "es", "fr", "ja", "ko", "ru", "zh"]
for locale in LOCALES:
    for key in ["1", "2", "3", "4", "5", "6", "lost"]:
        build(locale, key)
build("en", "open")
print(f"Wrote {len(LOCALES) * 7 + 1} share cards to {OUT}")
