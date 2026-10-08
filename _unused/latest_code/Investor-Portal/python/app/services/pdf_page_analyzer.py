"""Analyze PDF pages — locate labels and their blank/fill regions precisely."""

from __future__ import annotations

import base64
import re
from dataclasses import dataclass, field
from typing import Literal

try:
    import fitz  # pymupdf
except ImportError:  # pragma: no cover
    fitz = None

AnchorKind = Literal["signature", "date", "text", "initials"]
PartyRole = Literal["investor", "sponsor", "neutral"]

UNDERSCORE_RE = re.compile(r"^[_\-\u2014\u2013.\s]{2,}$")
INLINE_LABEL_BLANK = re.compile(
    r"^(.{1,80}?)\s*[:：]\s*([_\-\u2014\u2013.\s]{2,})\s*$",
    re.IGNORECASE,
)
TRAILING_LABEL_BLANK = re.compile(
    r"^(.{1,80}?)\s+([_\-\u2014\u2013]{2,})\s*$",
    re.IGNORECASE,
)
LABEL_ONLY_COLON = re.compile(r"^(.{1,80}?):\s*$", re.IGNORECASE)

# Text search terms for labels that may not appear as isolated lines (order matters).
LABEL_SEARCH_TERMS: tuple[tuple[str, str, AnchorKind, PartyRole], ...] = (
    ("First Name", "First Name", "text", "investor"),
    ("Last Name", "Last Name", "text", "investor"),
    ("E-mail", "Email", "text", "investor"),
    ("Email Address", "Email", "text", "investor"),
    ("Email", "Email", "text", "investor"),
    ("Telephone", "Phone", "text", "investor"),
    ("Phone Number", "Phone", "text", "investor"),
    ("Phone", "Phone", "text", "investor"),
    ("Mailing Address", "Address", "text", "investor"),
    ("Address", "Address", "text", "investor"),
    ("Social Security", "SSN", "text", "investor"),
    ("SSN", "SSN", "text", "investor"),
    ("Tax ID", "SSN", "text", "investor"),
    ("Investment Amount", "Investment Amount", "text", "investor"),
    ("Capital Commitment", "Investment Amount", "text", "investor"),
    ("Entity Legal Name", "Entity Legal Name", "text", "investor"),
    ("Legal Name of Entity", "Entity Legal Name", "text", "investor"),
    ("Entity Name", "Entity Name", "text", "investor"),
    ("Sponsor Signature", "Sponsor Signature", "signature", "sponsor"),
    ("General Partner Signature", "Sponsor Signature", "signature", "sponsor"),
    ("Investor Signature", "Investor Signature", "signature", "investor"),
    ("Subscriber Signature", "Investor Signature", "signature", "investor"),
    ("Authorized Signature", "Investor Signature", "signature", "investor"),
    ("Signature of Investor", "Investor Signature", "signature", "investor"),
    ("Signature of Sponsor", "Sponsor Signature", "signature", "sponsor"),
    ("Sponsor Date", "Sponsor Date", "date", "sponsor"),
    ("Investor Date", "Date Signed", "date", "investor"),
    ("Date Signed", "Date Signed", "date", "investor"),
    ("Sponsor Print Name", "Sponsor Print Name", "text", "sponsor"),
    ("Print Name", "Print Name", "text", "investor"),
    ("Printed Name", "Print Name", "text", "investor"),
    ("Sponsor Title", "Sponsor Title", "text", "sponsor"),
    ("Print Title", "Print Title (if applicable)", "text", "investor"),
    ("Title (if applicable)", "Print Title (if applicable)", "text", "investor"),
)


@dataclass
class TextAnchor:
    kind: AnchorKind
    label: str
    page: int
    x: float
    y: float
    width: float
    height: float
    page_width: float
    page_height: float
    role: PartyRole = "neutral"


@dataclass
class PageAnalysis:
    page: int
    width: float
    height: float
    is_w9_page: bool = False
    is_questionnaire_page: bool = False
    anchors: list[TextAnchor] = field(default_factory=list)


W9_PAGE_MARKERS = (
    "form w-9",
    "form w9",
    "fw9",
    "request for taxpayer identification",
    "taxpayer identification number",
    "certificate of foreign status",
    "internal revenue service",
    "department of the treasury",
    "substitute form w-9",
)


def _is_w9_page_text(text: str) -> bool:
    lower = text.lower()
    if "form w-9" in lower or "form w9" in lower or "substitute form w-9" in lower:
        return True
    hits = sum(1 for marker in W9_PAGE_MARKERS if marker in lower)
    return hits >= 2


def _skip_pages_for_request(
    page_count: int,
    *,
    include_questionnaire: bool,
    includes_w9_appendix: bool,
    w9_page_count: int,
) -> set[int]:
    skip: set[int] = set()
    if include_questionnaire:
        skip.add(1)
    if includes_w9_appendix and w9_page_count > 0:
        start = max(1, page_count - w9_page_count + 1)
        for page in range(start, page_count + 1):
            skip.add(page)
    return skip


@dataclass
class _Span:
    text: str
    x0: float
    y0: float
    x1: float
    y1: float


@dataclass
class _LineDetail:
    text: str
    x0: float
    y0: float
    x1: float
    y1: float
    spans: list[_Span]


@dataclass
class _FillRegion:
    x0: float
    y0: float
    x1: float
    y1: float


def _party_from_text(text: str) -> PartyRole:
    lower = text.lower()
    has_sponsor = any(
        k in lower
        for k in (
            "sponsor",
            "general partner",
            "manager",
            "managing member",
            "gp ",
            "fund manager",
        )
    )
    has_investor = any(
        k in lower
        for k in (
            "investor",
            "subscriber",
            "purchaser",
            "limited partner",
            "member",
        )
    )
    if has_sponsor and not has_investor:
        return "sponsor"
    if has_investor and not has_sponsor:
        return "investor"
    return "neutral"


def _field_meta(label_text: str) -> tuple[AnchorKind, str, PartyRole] | None:
    raw = label_text.strip()
    lower = raw.lower()
    role = _party_from_text(raw)

    if re.search(r"\binitials?\b", lower):
        return "initials", "Initials", role

    if re.search(r"\b(signature|sign here|signed by)\b", lower):
        name = "Sponsor Signature" if role == "sponsor" else "Investor Signature"
        return "signature", name, role

    if re.search(r"\b(date signed|signature date|dated)\b", lower):
        name = "Sponsor Date" if role == "sponsor" else "Date Signed"
        return "date", name, role

    if re.fullmatch(r"date\s*:?", lower) or lower == "date":
        name = "Sponsor Date" if role == "sponsor" else "Date Signed"
        return "date", name, role

    if re.search(r"\b(print name|printed name|name \(print\)|typed name)\b", lower):
        name = "Sponsor Print Name" if role == "sponsor" else "Print Name"
        return "text", name, role

    if re.search(r"\b(print title|title \(if applicable\))\b", lower):
        return (
            "text",
            "Sponsor Title" if role == "sponsor" else "Print Title (if applicable)",
            role,
        )

    if re.search(r"\btitle\b", lower) and not re.search(
        r"\b(title company|job title page|section title)\b", lower
    ):
        return (
            "text",
            "Sponsor Title" if role == "sponsor" else "Print Title (if applicable)",
            role,
        )

    if re.search(r"\bfirst name\b", lower):
        return "text", "First Name", "investor"
    if re.search(r"\blast name\b", lower):
        return "text", "Last Name", "investor"
    if re.search(r"\b(email|e-mail)\b", lower):
        return "text", "Email", "investor"
    if re.search(r"\b(phone|telephone)\b", lower):
        return "text", "Phone", "investor"
    if re.search(r"\b(mailing )?address\b", lower):
        return "text", "Address", "investor"
    if re.search(r"\b(ssn|social security|tax id|tin)\b", lower):
        return "text", "SSN", "investor"
    if re.search(r"\b(investment amount|commitment amount|capital commitment)\b", lower):
        return "text", "Investment Amount", "investor"
    if re.search(r"\b(entity name|legal name of entity|entity legal name)\b", lower):
        return "text", "Entity Legal Name", "investor"
    if re.search(r"\bname of (subscriber|investor|purchaser)\b", lower):
        return "text", "Print Name", role if role != "neutral" else "investor"
    if re.fullmatch(r"name\s*:?", lower):
        return "text", "Print Name", role if role != "neutral" else "investor"

    # W-9 internal labels — never place eSign fields (W-9 is pre-filled separately)
    if re.search(
        r"\b(employer identification number|taxpayer identification|exempt payee|"
        r"fatca|backup withholding|certification)\b",
        lower,
    ):
        return None

    return None


def _min_field_size(kind: AnchorKind) -> tuple[float, float]:
    if kind == "signature":
        return 180.0, 36.0
    if kind == "date":
        return 100.0, 20.0
    if kind == "initials":
        return 60.0, 20.0
    return 120.0, 18.0


def _region_sitting_on_underline(
    *,
    x0: float,
    x1: float,
    line_y: float,
    kind: AnchorKind,
) -> _FillRegion:
    """
    Place the field so its bottom edge sits just above the printed underline
    (matches form-fill UX — see Email field alignment, not Date-through-the-box).
    """
    min_w, min_h = _min_field_size(kind)
    width = max(min_w, max(0.0, x1 - x0))
    y1 = max(8.0, float(line_y) - 1.5)
    y0 = max(6.0, y1 - min_h)
    return _FillRegion(x0=float(x0), y0=y0, x1=float(x0) + width, y1=y1)


def _clamp_region(
    region: _FillRegion,
    *,
    page_width: float,
    page_height: float,
    min_w: float,
    min_h: float,
) -> _FillRegion:
    w = max(min_w, region.x1 - region.x0)
    h = max(min_h, region.y1 - region.y0)
    x0 = max(6.0, region.x0)
    y0 = max(6.0, region.y0)
    if x0 + w > page_width - 6:
        x0 = max(6.0, page_width - w - 6)
    if y0 + h > page_height - 6:
        y0 = max(6.0, page_height - h - 6)
    return _FillRegion(x0=x0, y0=y0, x1=x0 + w, y1=y0 + h)


def _anchor_from_region(
    *,
    kind: AnchorKind,
    label: str,
    role: PartyRole,
    page_num: int,
    page_width: float,
    page_height: float,
    region: _FillRegion,
) -> TextAnchor:
    min_w, min_h = _min_field_size(kind)
    clamped = _clamp_region(
        region,
        page_width=page_width,
        page_height=page_height,
        min_w=min_w,
        min_h=min_h,
    )
    return TextAnchor(
        kind=kind,
        label=label,
        page=page_num,
        x=clamped.x0,
        y=clamped.y0,
        width=clamped.x1 - clamped.x0,
        height=clamped.y1 - clamped.y0,
        page_width=page_width,
        page_height=page_height,
        role=role,
    )


def _lines_from_page(page: fitz.Page) -> list[_LineDetail]:
    lines: list[_LineDetail] = []
    text_dict = page.get_text("dict")
    for block in text_dict.get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            spans_raw = line.get("spans", [])
            spans: list[_Span] = []
            parts: list[str] = []
            x0 = y0 = float("inf")
            x1 = y1 = float("-inf")
            for span in spans_raw:
                t = span.get("text", "")
                bbox = span.get("bbox")
                if not t or not bbox or len(bbox) != 4:
                    continue
                sx0, sy0, sx1, sy1 = bbox
                spans.append(_Span(text=t, x0=sx0, y0=sy0, x1=sx1, y1=sy1))
                parts.append(t)
                x0 = min(x0, sx0)
                y0 = min(y0, sy0)
                x1 = max(x1, sx1)
                y1 = max(y1, sy1)
            text = "".join(parts).strip()
            if not text or x0 == float("inf"):
                continue
            lines.append(_LineDetail(text=text, x0=x0, y0=y0, x1=x1, y1=y1, spans=spans))
    return lines


def _horizontal_lines(page: fitz.Page) -> list[_FillRegion]:
    regions: list[_FillRegion] = []
    try:
        drawings = page.get_drawings()
    except Exception:
        return regions

    for drawing in drawings:
        for item in drawing.get("items", []):
            if not item or item[0] != "l":
                continue
            # line: ('l', p1, p2) where p1/p2 are Point
            p1, p2 = item[1], item[2]
            x0, y0, x1, y1 = float(p1.x), float(p1.y), float(p2.x), float(p2.y)
            if abs(y1 - y0) > 2.5:
                continue
            length = abs(x1 - x0)
            if length < 50:
                continue
            lx0, lx1 = (x0, x1) if x0 <= x1 else (x1, x0)
            ly = (y0 + y1) / 2
            # Store the rule itself — field regions are derived to sit ON the line.
            regions.append(_FillRegion(x0=lx0, y0=ly, x1=lx1, y1=ly))

    return regions


def _blank_spans_on_line(line: _LineDetail) -> list[_FillRegion]:
    regions: list[_FillRegion] = []
    for span in line.spans:
        if UNDERSCORE_RE.match(span.text.strip()):
            # Underscore baseline — callers expand into a field sitting on this line.
            line_y = span.y1
            regions.append(
                _FillRegion(x0=span.x0, y0=line_y, x1=span.x1, y1=line_y)
            )
    if regions:
        return regions

    m = INLINE_LABEL_BLANK.match(line.text.strip())
    if m:
        blank_part = m.group(2)
        # locate span(s) that form the blank
        for span in line.spans:
            if UNDERSCORE_RE.match(span.text.strip()) or blank_part in span.text:
                line_y = span.y1
                regions.append(
                    _FillRegion(x0=span.x0, y0=line_y, x1=span.x1, y1=line_y)
                )
    return regions


def _merge_nearby(regions: list[_FillRegion], gap: float = 8.0) -> list[_FillRegion]:
    if not regions:
        return []
    sorted_r = sorted(regions, key=lambda r: (r.y0, r.x0))
    merged: list[_FillRegion] = [sorted_r[0]]
    for region in sorted_r[1:]:
        prev = merged[-1]
        same_row = abs(region.y0 - prev.y0) <= gap
        touching = region.x0 <= prev.x1 + gap
        if same_row and touching:
            merged[-1] = _FillRegion(
                x0=min(prev.x0, region.x0),
                y0=min(prev.y0, region.y0),
                x1=max(prev.x1, region.x1),
                y1=max(prev.y1, region.y1),
            )
        else:
            merged.append(region)
    return merged


def _overlap_x(a: _FillRegion, b: _FillRegion) -> float:
    left = max(a.x0, b.x0)
    right = min(a.x1, b.x1)
    return max(0.0, right - left)


def _find_line_below(lines: list[_LineDetail], base: _LineDetail, max_gap: float = 28.0) -> _LineDetail | None:
    best: _LineDetail | None = None
    best_gap = max_gap
    for line in lines:
        gap = line.y0 - base.y1
        if gap < 2 or gap > max_gap:
            continue
        if abs(line.x0 - base.x0) > 220:
            continue
        if gap < best_gap:
            best_gap = gap
            best = line
    return best


def _find_hline_below(
    hlines: list[_FillRegion],
    label: _LineDetail,
    *,
    max_gap: float = 50.0,
) -> _FillRegion | None:
    label_box = _FillRegion(x0=label.x0, y0=label.y0, x1=label.x1, y1=label.y1)
    best: _FillRegion | None = None
    best_score = float("inf")
    for hline in hlines:
        gap = hline.y0 - label.y1
        if gap < -5 or gap > max_gap:
            continue
        overlap = _overlap_x(label_box, hline)
        if overlap < 20 and hline.x0 > label.x1 + 80:
            continue
        score = gap + abs(hline.x0 - label.x0) * 0.1
        if score < best_score:
            best_score = score
            best = hline
    return best


def _region_beside_or_below_label(
    line: _LineDetail,
    *,
    kind: AnchorKind,
    page_width: float,
) -> _FillRegion:
    min_w, min_h = _min_field_size(kind)
    beside_x = line.x1 + 6
    if beside_x + min_w <= page_width - 6:
        # Align field bottom with the label baseline (same as underline seating).
        return _region_sitting_on_underline(
            x0=beside_x,
            x1=beside_x + min_w,
            line_y=line.y1,
            kind=kind,
        )

    # No room beside — place on a virtual underline just below the label.
    return _region_sitting_on_underline(
        x0=line.x0,
        x1=min(line.x0 + min_w, page_width - 6),
        line_y=line.y1 + min_h + 2,
        kind=kind,
    )


def _region_from_search_rect(
    rect: fitz.Rect,
    *,
    kind: AnchorKind,
    page_width: float,
) -> _FillRegion:
    min_w, min_h = _min_field_size(kind)
    beside_x = float(rect.x1) + 4
    if beside_x + min_w <= page_width - 6:
        return _region_sitting_on_underline(
            x0=beside_x,
            x1=beside_x + min_w,
            line_y=float(rect.y1),
            kind=kind,
        )

    return _region_sitting_on_underline(
        x0=float(rect.x0),
        x1=min(float(rect.x0) + min_w, page_width - 6),
        line_y=float(rect.y1) + min_h + 2,
        kind=kind,
    )


def _anchors_from_label_search(
    page: fitz.Page,
    *,
    page_num: int,
    page_width: float,
    page_height: float,
    placed_labels: set[str],
) -> list[TextAnchor]:
    anchors: list[TextAnchor] = []
    for search_text, display_label, kind, role in LABEL_SEARCH_TERMS:
        label_key = display_label.lower()
        if label_key in placed_labels:
            continue
        try:
            rects = page.search_for(search_text)
        except Exception:
            rects = []
        if not rects:
            continue

        region = _region_from_search_rect(
            rects[0],
            kind=kind,
            page_width=page_width,
        )
        anchors.append(
            _anchor_from_region(
                kind=kind,
                label=display_label,
                role=role,
                page_num=page_num,
                page_width=page_width,
                page_height=page_height,
                region=region,
            )
        )
        placed_labels.add(label_key)
    return anchors


def _label_phrase_from_line(line: _LineDetail) -> str | None:
    text = line.text.strip()
    if not text:
        return None

    inline = INLINE_LABEL_BLANK.match(text)
    if inline:
        return inline.group(1).strip()

    trailing = TRAILING_LABEL_BLANK.match(text)
    if trailing:
        return trailing.group(1).strip()

    colon_only = LABEL_ONLY_COLON.match(text)
    if colon_only:
        return colon_only.group(1).strip()

    if text.endswith(":"):
        return text.rstrip(":").strip()

    if len(text) <= 60 and len(text.split()) <= 10 and _field_meta(text):
        return text

    return None


def _anchors_for_line(
    line: _LineDetail,
    *,
    lines: list[_LineDetail],
    hlines: list[_FillRegion],
    page_num: int,
    page_width: float,
    page_height: float,
) -> list[TextAnchor]:
    label_phrase = _label_phrase_from_line(line)
    if not label_phrase:
        return []

    meta = _field_meta(label_phrase)
    if not meta:
        return []

    kind, display_label, role = meta
    anchors: list[TextAnchor] = []

    def _append_on_line_region(region: _FillRegion) -> None:
        line_y = min(region.y0, region.y1)
        sitting = _region_sitting_on_underline(
            x0=region.x0,
            x1=region.x1,
            line_y=line_y,
            kind=kind,
        )
        anchors.append(
            _anchor_from_region(
                kind=kind,
                label=display_label,
                role=role,
                page_num=page_num,
                page_width=page_width,
                page_height=page_height,
                region=sitting,
            )
        )

    # 1) Blank/underscore on same line (use exact span coordinates)
    blank_regions = _merge_nearby(_blank_spans_on_line(line))
    if blank_regions:
        region = max(blank_regions, key=lambda r: r.x1 - r.x0)
        _append_on_line_region(region)
        return anchors

    # 2) Underscores on the next line directly below
    below = _find_line_below(lines, line)
    if below:
        below_blanks = _merge_nearby(_blank_spans_on_line(below))
        if below_blanks:
            _append_on_line_region(below_blanks[0])
            return anchors
        if UNDERSCORE_RE.match(below.text.strip()):
            _append_on_line_region(
                _FillRegion(x0=below.x0, y0=below.y1, x1=below.x1, y1=below.y1)
            )
            return anchors

    # 3) Drawn horizontal rule below label — field sits ON the rule (above the ink)
    hline = _find_hline_below(hlines, line)
    if hline:
        _append_on_line_region(hline)
        return anchors

    # 4) Recognized label without a detected blank — place beside or below label text
    region = _region_beside_or_below_label(
        line,
        kind=kind,
        page_width=page_width,
    )
    anchors.append(
        _anchor_from_region(
            kind=kind,
            label=display_label,
            role=role,
            page_num=page_num,
            page_width=page_width,
            page_height=page_height,
            region=region,
        )
    )
    return anchors


def analyze_pdf_bytes(
    pdf_bytes: bytes,
    *,
    page_count: int = 0,
    include_questionnaire: bool = False,
    includes_w9_appendix: bool = False,
    w9_page_count: int = 0,
) -> list[PageAnalysis]:
    if not fitz or not pdf_bytes:
        return []

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    analyses: list[PageAnalysis] = []
    total_pages = doc.page_count
    effective_count = page_count or total_pages
    skip_pages = _skip_pages_for_request(
        effective_count,
        include_questionnaire=include_questionnaire,
        includes_w9_appendix=includes_w9_appendix,
        w9_page_count=w9_page_count,
    )

    placed_labels: set[str] = set()

    for page_index in range(total_pages):
        page_num = page_index + 1
        page = doc[page_index]
        page_width = float(page.rect.width) or 612.0
        page_height = float(page.rect.height) or 792.0
        page_text = page.get_text()

        is_w9 = (page_num in skip_pages and includes_w9_appendix) or _is_w9_page_text(
            page_text
        )
        is_questionnaire = page_num in skip_pages and include_questionnaire and page_num == 1

        if is_w9 or is_questionnaire or page_num in skip_pages:
            analyses.append(
                PageAnalysis(
                    page=page_num,
                    width=page_width,
                    height=page_height,
                    is_w9_page=is_w9,
                    is_questionnaire_page=is_questionnaire,
                    anchors=[],
                )
            )
            continue

        lines = _lines_from_page(page)
        hlines = _horizontal_lines(page)
        anchors: list[TextAnchor] = []

        for line in lines:
            for anchor in _anchors_for_line(
                line,
                lines=lines,
                hlines=hlines,
                page_num=page_num,
                page_width=page_width,
                page_height=page_height,
            ):
                label_key = anchor.label.lower()
                if label_key in placed_labels:
                    continue
                placed_labels.add(label_key)
                anchors.append(anchor)

        anchors.extend(
            _anchors_from_label_search(
                page,
                page_num=page_num,
                page_width=page_width,
                page_height=page_height,
                placed_labels=placed_labels,
            )
        )

        deduped: list[TextAnchor] = []
        seen: set[str] = set()
        for anchor in anchors:
            key = (
                f"{anchor.page}|{anchor.label}|{anchor.kind}|"
                f"{round(anchor.x / 8)}|{round(anchor.y / 8)}"
            )
            if key in seen:
                continue
            seen.add(key)
            deduped.append(anchor)

        if deduped:
            analyses.append(
                PageAnalysis(
                    page=page_num,
                    width=page_width,
                    height=page_height,
                    is_w9_page=False,
                    is_questionnaire_page=False,
                    anchors=deduped,
                )
            )

    doc.close()
    return analyses


def analyze_pdf_base64(
    pdf_base64: str | None,
    *,
    page_count: int = 0,
    include_questionnaire: bool = False,
    includes_w9_appendix: bool = False,
    w9_page_count: int = 0,
) -> list[PageAnalysis]:
    if not pdf_base64:
        return []
    try:
        raw = base64.b64decode(pdf_base64, validate=True)
    except Exception:
        return []
    return analyze_pdf_bytes(
        raw,
        page_count=page_count,
        include_questionnaire=include_questionnaire,
        includes_w9_appendix=includes_w9_appendix,
        w9_page_count=w9_page_count,
    )
