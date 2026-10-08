"""Parse Cash Flow 'Edit classes and waterfalls' text → DealClasses."""

from __future__ import annotations

import re
from datetime import datetime

from class_workbook import ClassRow, DealClasses, FinalTierRow, HurdleRow

MONEY_RE = re.compile(r"\$\s*([\d,]+(?:\.\d+)?)")
PCT_RE = re.compile(r"([\d.]+)\s*%")
DATE_RE = re.compile(r"(\d{1,2}/\d{1,2}/\d{4})")

# Strict headers (clean text PDFs)
CLASS_HEADER_RE = re.compile(
    r"^("
    r"Class [A-Z]\+?\d*\s*-\s*LP\s*\([^)]+\)"
    r"|Class [A-Z]\+?\d*\s*-\s*Limited\s+partners"
    r"|Class [A-Z]\+\s*LP"
    r"|Class [A-Z]\+?\d*\s*-\s*General\s+partners"
    r"|Class [A-Z]\+?\d*\s*-\s*GP"
    r"|Class [A-Z]\+?\d*\s*-\s*Loan"
    r"|Class [A-Z]\+?\d*\s*-\s*Mezzanine"
    r"|Class [A-Z]\+?\d*\s+Shares"
    r"|Class [A-Z]\+?\d*\s*-\s*.+"
    r"|General\s+partners"
    r"|Temporary\s+Loan\s+\d+(?:\.\d+)?%"
    r"|\d+(?:\.\d+)?%\s*Loan"
    r"|Loan\s*\(\s*mezzanine\s*\)"
    r"|TIC\s+Class"
    r")$",
    re.IGNORECASE,
)

# OCR-tolerant headers (screenshot PDFs)
CLASS_HEADER_LOOSE_RE = re.compile(
    r"^("
    r"Class\s+[A-Z]\+?\d*\s*[-–]?\s*LP\s*\([^)]+\)"
    r"|Class\s+[A-Z]\+?\d*\s*[-–]?\s*L[il1m]+ted\s+partners?"
    r"|Class\s+[A-Z]\+?\d*\s*[-–]?\s*Limited\s+partners?"
    r"|Class\s+[A-Z]\+?\d*\s*[-–]?\s*General\s+partners?"
    r"|Class\s+[A-Z]\+?\d*\s*[-–]?\s*GP"
    r"|Class\s+[A-Z]\+?\d*\s*[-–]?\s*Loan"
    r"|Class\s+[A-Z]\+?\d*\s*[-–]?\s*Mezzanine"
    r"|Class\s+[A-Z]\+?\d*\s+Shares"
    r"|Class\s+[A-Z]\+?\d*\s*[-–]\s*.+"
    r"|General\s+partners?"
    r"|Temporary\s*Loan\s*\d+(?:\.\d+)?%"
    r"|\d+(?:\.\d+)?%\s*Loan"
    r"|Loan\s*\(\s*mezzanine\s*\)"
    r"|TIC\s*Class"
    r")$",
    re.IGNORECASE,
)

CLASS_HEADER_SKIP = (
    "class or bucket",
    "class type",
    "equity class name",
    "class ownership",
    "new class",
    "add class",
    "add hurdle",
    "create classes",
    "buckets&classes",
    "buckets & classes",
)


def _reject_class_header_candidate(stripped: str) -> bool:
    low = stripped.lower()
    if len(stripped) > 90 or len(stripped) < 2:
        return True
    if any(skip in low for skip in CLASS_HEADER_SKIP):
        return True
    if low.startswith("to class") or low.startswith("until class"):
        return True
    if re.match(r"^bucket\s+\d+", low):
        return True
    if re.match(r"^hurdle\s*\d", low):
        return True
    if re.search(
        r"\b(class type|equity class name|raise amount|distribution share|"
        r"ownership of entity|investment type|preferred return start)\b",
        low,
    ):
        return True
    return False


def _universal_class_title_match(stripped: str) -> bool:
    """Cash Flow class/bucket card titles — broad match for any PDF layout."""
    if _reject_class_header_candidate(stripped):
        return False
    if CLASS_HEADER_RE.match(stripped) or CLASS_HEADER_LOOSE_RE.match(stripped):
        return True
    # Any "Class <letter>…" card title (LP, GP, Loan, Shares, Income Class, etc.)
    if re.match(r"^Class\s+[A-Z]", stripped, re.IGNORECASE):
        return True
    if re.match(r"^(?:General\s+partners?|TIC\s+Class)$", stripped, re.IGNORECASE):
        return True
    if re.match(
        r"^(?:Temporary\s+)?\d+(?:\.\d+)?%\s*Loan$",
        stripped,
        re.IGNORECASE,
    ):
        return True
    if re.match(r"^Temporary\s+Loan\s+\d+(?:\.\d+)?%$", stripped, re.IGNORECASE):
        return True
    return False


def _line_has_class_card_context(lines: list[str], idx: int) -> bool:
    """True when nearby lines look like an expanded class card (not a stray label)."""
    window = lines[idx : min(len(lines), idx + 18)]
    blob = "\n".join(window).lower()
    markers = (
        "class type",
        "equity class name",
        "minimum investment",
        "raise amount (for ownership)",
        "raise amount for ownership",
        "preferred return start",
        "investment type",
        "hurdles",
    )
    hits = sum(1 for m in markers if m.replace(" ", "") in blob.replace(" ", "") or m in blob)
    return hits >= 2


def find_expected_class_count(lines: list[str]) -> int | None:
    """Read 'Number of classes' from the deal summary header when OCR captured it."""
    for i, line in enumerate(lines):
        if not label_matches(line, "number of classes"):
            continue
        for j in range(i + 1, min(i + 10, len(lines))):
            m = re.match(r"^(\d+)\s*$", str(lines[j]).strip())
            if m:
                return int(m.group(1))
    return None


def normalize_ocr_line(line: str) -> str:
    s = str(line or "").strip()
    s = re.sub(r"^[^A-Za-z0-9$%]+", "", s)
    s = s.replace("—", "-").replace("–", "-").replace("−", "-")
    # OCR often reads $0 as $O
    s = re.sub(r"\$\s*[Oo]\b", "$0", s)
    s = re.sub(r"\s*-\s*", " - ", s)
    s = re.sub(r"\s+", " ", s).strip()
    # Glue fixes from FireShot / screenshot OCR
    s = re.sub(r"\bClass([A-Z]\+?\d*)(Shares)\b", r"Class \1 \2", s)
    s = re.sub(r"\bClass([A-Z]\+?\d*)\b", r"Class \1", s)
    s = re.sub(r"\bClass ([A-Z]\+?\d*)Shares\b", r"Class \1 Shares", s)
    s = re.sub(r"\b(Upside\s+split)(\d)", r"\1 \2", s, flags=re.IGNORECASE)
    s = re.sub(r"\bLimit(\d)", r"Limit \1", s, flags=re.IGNORECASE)
    s = re.sub(r"\bLimitedpartners\b", "Limited partners", s, flags=re.IGNORECASE)
    s = re.sub(r"\bGeneralpartners\b", "General partners", s, flags=re.IGNORECASE)
    s = re.sub(r"\bLmlted\b", "Limited", s, flags=re.IGNORECASE)
    s = re.sub(r"\bLimsited\b", "Limited", s, flags=re.IGNORECASE)
    s = re.sub(r"\bL[il1]m[il1]?ted\b", "Limited", s, flags=re.IGNORECASE)
    s = re.sub(r"\bpartmers\b", "partners", s, flags=re.IGNORECASE)
    s = re.sub(r"\bApartnents\b", "Apartments", s, flags=re.IGNORECASE)
    s = re.sub(r"\bHurdlle\b", "Hurdle", s, flags=re.IGNORECASE)
    s = re.sub(r"\bHurdle(\d)", r"Hurdle \1", s, flags=re.IGNORECASE)
    s = re.sub(r"\bCless\b", "Class", s, flags=re.IGNORECASE)
    s = re.sub(r"\bcssh\b", "cash", s, flags=re.IGNORECASE)
    s = re.sub(r"(\d+(?:\.\d+)?%)\s*Loan\b", r"\1 Loan", s, flags=re.IGNORECASE)
    s = re.sub(r"\b(\d+(?:\.\d+)?)%\s*Loan\b", r"\1% Loan", s, flags=re.IGNORECASE)
    s = re.sub(r"\bTICClass\b", "TIC Class", s, flags=re.IGNORECASE)
    s = re.sub(r"\bMezzanlne\b", "Mezzanine", s, flags=re.IGNORECASE)
    s = re.sub(r"\b(Income|Growth)Class\b", r"\1 Class", s, flags=re.IGNORECASE)
    s = re.sub(r"\bTemporaryLoan\s*(\d+(?:\.\d+)?)%", r"Temporary Loan \1%", s, flags=re.IGNORECASE)
    s = re.sub(r"\bTemporary\s+Loan(\d)", r"Temporary Loan \1", s, flags=re.IGNORECASE)
    s = re.sub(r"\bClass([A-Z]\d?\+?)\s*-\s*Mezzanine\b", r"Class \1 - Mezzanine", s, flags=re.IGNORECASE)
    # Roman numeral II often OCR'd as Il
    s = re.sub(r"\bPortfolio\s+Il\b", "Portfolio II", s, flags=re.IGNORECASE)
    return s


def fold_ocr_label(s: str) -> str:
    """Collapse OCR letter noise so label matching still works."""
    t = normalize_ocr_line(s).lower()
    t = t.replace("*", " ")
    t = re.sub(r"[^a-z0-9%]+", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    # Common Cash Flow label OCR typos
    replacements = (
        ("amcunt", "amount"),
        ("amoumt", "amount"),
        ("smount", "amount"),
        ("rsise", "raise"),
        ("ralse", "raise"),
        ("cwnenship", "ownership"),
        ("owmership", "ownership"),
        ("ownenshlp", "ownership"),
        ("ownenship", "ownership"),
        ("enity", "entity"),
        ("dietribution", "distribution"),
        ("distriburion", "distribution"),
        ("preferrec", "preferred"),
        ("prefered", "preferred"),
        ("returm", "return"),
        ("retum", "return"),
        ("dste", "date"),
        ("cate", "date"),
        ("bilingl", "billing"),
        ("biling", "billing"),
        ("frekze", "freeze"),
        ("upsld e", "upside"),
        ("upslde", "upside"),
        ("spilt", "split"),
        ("limsited", "limited"),
        ("mezzanlne", "mezzanine"),
    )
    for bad, good in replacements:
        t = t.replace(bad, good)
    return t


def fold_compact(s: str) -> str:
    """Space-insensitive fold for glued OCR labels (Raiseamountforownership)."""
    return re.sub(r"[^a-z0-9%]+", "", fold_ocr_label(s))


def label_matches(line: str, *needles: str) -> bool:
    folded = fold_ocr_label(line)
    compact = fold_compact(line)
    for n in needles:
        if fold_ocr_label(n) in folded:
            return True
        if fold_compact(n) and fold_compact(n) in compact:
            return True
    return False


def canonicalize_class_title(title: str) -> str:
    t = normalize_ocr_line(title)
    loan = re.match(r"^(\d+(?:\.\d+)?%\s*Loan)$", t, re.IGNORECASE)
    if loan:
        return re.sub(r"\s+", " ", loan.group(1)).strip()
    m = re.match(r"Temporary\s+Loan\s+(\d+(?:\.\d+)?)%", t, re.IGNORECASE)
    if m:
        return f"Temporary Loan {m.group(1)}%"
    m = re.match(r"Class\s+([A-Z]\d?\+?)\s*-\s*Loan\b", t, re.IGNORECASE)
    if m:
        return f"Class {m.group(1).upper()} - Loan"
    m = re.match(r"Class\s+([A-Z]\d?\+?)\s*-\s*Mezzanine\b", t, re.IGNORECASE)
    if m:
        return f"Class {m.group(1).upper()} - Mezzanine"
    if re.search(r"^TIC\s*Class$", t, re.IGNORECASE):
        return "TIC Class"
    if re.search(r"general\s+partners?", t, re.IGNORECASE):
        return "General partners"
    m = re.match(
        r"Class\s+([A-Z]\d?\+?)\s*-\s*LP\s*\(([^)]+)\)",
        t,
        re.IGNORECASE,
    )
    if m:
        return f"Class {m.group(1)} - LP ({m.group(2).strip()})"
    m = re.match(
        r"Class\s+([A-Z]\+?\d*)\s*-\s*Limited\s+partners?",
        t,
        re.IGNORECASE,
    )
    if m:
        return f"Class {m.group(1)} - Limited partners"
    m = re.match(r"Class\s+([A-Z]\+?\d*)\s+Shares\b", t, re.IGNORECASE)
    if m:
        return f"Class {m.group(1)} Shares"
    m = re.match(
        r"Class\s+([A-Z]\d?\+?)\s*-\s*(Income|Growth)\s*Class\b",
        t,
        re.IGNORECASE,
    )
    if m:
        kind = m.group(2).title()
        return f"Class {m.group(1)} - {kind} Class"
    m = re.match(
        r"Class\s+([A-Z]\+?\d*)\s*-\s*(.+)$",
        t,
        re.IGNORECASE,
    )
    if m:
        suffix = re.sub(r"\s+", " ", m.group(2)).strip()
        if re.search(r"general\s+partners?", suffix, re.I):
            return "General partners"
        return f"Class {m.group(1)} - {suffix}"
    return t


def is_class_header_line(line: str) -> str | None:
    """Return canonical class title if this line is a class card header."""
    stripped = normalize_ocr_line(line)
    if _universal_class_title_match(stripped):
        return canonicalize_class_title(stripped)
    return None


def money(raw: str) -> str:
    text = raw or ""
    text = re.sub(r"\$\s*[Oo]\b", "$0", text)
    # Ignore date-like tokens so years (e.g. 2026) are not treated as amounts
    scrubbed = DATE_RE.sub(" ", text)
    candidates: list[str] = [m.group(1) for m in MONEY_RE.finditer(scrubbed)]
    candidates.extend(
        m.group(1)
        for m in re.finditer(r"(?<!\d)((?:\d{1,3},)+\d{3}|\d{4,})(?:\.\d+)?", scrubbed)
    )
    # Prefer explicit $ amounts; drop 4-digit year-like values without $ or comma
    dollar_vals = [m.group(1) for m in MONEY_RE.finditer(scrubbed)]
    if dollar_vals:
        best = max(dollar_vals, key=lambda a: int(a.replace(",", "").split(".")[0] or "0"))
        return best.replace(",", "").split(".")[0]
    filtered = []
    for a in candidates:
        n = a.replace(",", "").split(".")[0]
        if not n.isdigit():
            continue
        # Bare 4-digit values are usually years, not raise amounts
        if len(n) == 4 and "," not in a and int(n) >= 1900:
            continue
        filtered.append(a)
    if not filtered:
        return ""
    best = max(filtered, key=lambda a: int(a.replace(",", "").split(".")[0] or "0"))
    return best.replace(",", "").split(".")[0]


def pct(raw: str) -> str:
    m = PCT_RE.search(raw or "")
    if m:
        return m.group(1)
    # OCR sometimes flips "70.00%" into "%00.07" / "%00°0"
    flipped = re.search(r"%\s*0{1,2}[°.]?\s*0{0,2}(\d{1,2})", raw or "")
    if flipped:
        return flipped.group(1)
    return ""


def norm_date(raw: str) -> str:
    m = DATE_RE.search(raw or "")
    if not m:
        return ""
    try:
        return datetime.strptime(m.group(1), "%m/%d/%Y").strftime("%Y-%m-%d")
    except ValueError:
        return m.group(1)


def line_value(lines: list[str], *labels: str) -> str:
    needles = [fold_ocr_label(lab) for lab in labels if lab]
    compact_needles = [fold_compact(lab) for lab in labels if lab]
    for i, line in enumerate(lines):
        folded = fold_ocr_label(line)
        compact = fold_compact(line)
        matched = next((n for n in needles if n and n in folded), None)
        if not matched:
            matched_c = next((n for n in compact_needles if n and n in compact), None)
            if not matched_c:
                continue
            matched = matched_c
        # Exact / near-exact label → value on next line(s)
        if (
            folded == matched
            or folded.rstrip(":").strip() == matched
            or compact == matched
            or any(compact == n for n in compact_needles)
        ):
            for j in range(i + 1, min(i + 4, len(lines))):
                cand = lines[j].strip()
                if not cand or label_matches(
                    cand,
                    "class type",
                    "equity class name",
                    "raise amount",
                    "preferred return",
                    "distribution share",
                    "entity legal",
                    "ownership of",
                    "minimum investment",
                    "maximum investment",
                    "hurdle",
                    "advanced",
                ):
                    continue
                return cand
        if ":" in line:
            tail = line.split(":", 1)[1].strip(" *")
            if tail:
                return tail
        # Same-line trailing value after label text
        idx = folded.find(matched) if matched in needles else -1
        if idx >= 0:
            # Use original line length heuristic: strip matched region roughly
            rhs = re.sub(r"(?i)" + re.escape(labels[0]), "", line, count=1).strip(" :-*")
            if rhs and fold_ocr_label(rhs) != matched:
                return rhs
    return ""


def first_money_after_labels(lines: list[str], *labels: str, look_ahead: int = 12) -> str:
    """Summary cards list several labels then a stack of $-amounts."""
    for i, line in enumerate(lines):
        if not label_matches(line, *labels):
            continue
        for j in range(i + 1, min(i + look_ahead, len(lines))):
            val = money(lines[j])
            if val:
                return val
    return ""


def first_pct_after_labels(lines: list[str], *labels: str, look_ahead: int = 12) -> str:
    for i, line in enumerate(lines):
        if not label_matches(line, *labels):
            continue
        for j in range(i, min(i + look_ahead, len(lines))):
            # Skip the label line itself unless it already has a %
            if j == i and not pct(lines[j]):
                continue
            val = pct(lines[j])
            if val:
                return val
    return ""


def find_deal_name(lines: list[str]) -> str:
    for i, line in enumerate(lines):
        low = line.lower()
        if "edit classes and waterfalls" in low and i > 0:
            candidate = normalize_ocr_line(lines[i - 1])
            if candidate and "home" not in candidate.lower():
                return candidate
        if low.startswith("deals") and i + 1 < len(lines):
            nxt = normalize_ocr_line(lines[i + 1])
            if nxt and "edit" not in nxt.lower():
                return nxt
    for line in lines[:20]:
        norm = normalize_ocr_line(line)
        if (
            "assisted living" in norm.lower()
            or "apartments" in norm.lower()
            or "ridge" in norm.lower()
        ):
            return norm
    return ""


def find_deal_target_raise(lines: list[str]) -> str:
    header = lines[
        : max(1, next((i for i, l in enumerate(lines) if is_class_header_line(l)), 30))
    ]
    for i, line in enumerate(header):
        if label_matches(line, "raise amount for ownership", "raise amount for"):
            val = money(line) or (money(header[i + 1]) if i + 1 < len(header) else "")
            if not val:
                # Labels often stack, then amounts appear a few lines later
                for j in range(i + 1, min(i + 10, len(header))):
                    val = money(header[j])
                    if val:
                        break
            if val:
                return val
        if label_matches(line, "total raised"):
            val = money(line) or (money(header[i + 1]) if i + 1 < len(header) else "")
            if val:
                return val
    return ""


def is_bucket_header_line(line: str) -> bool:
    s = normalize_ocr_line(line)
    if re.search(r"^Bucket\s+\d+\s*[-–].*Limited\s+partners?", s, re.I):
        return True
    if label_matches(s, "Equity bucket name"):
        return True
    return False


def split_class_blocks(text: str) -> list[tuple[str, str]]:
    """Return list of (class_title, block_text) using class card headers only."""
    lines = text.splitlines()
    starts: list[tuple[int, str]] = []
    for i, line in enumerate(lines):
        title = is_class_header_line(line)
        if not title:
            continue
        # Prefer first occurrence of each class title (summary row before expanded form)
        if any(existing == title for _, existing in starts):
            continue
        starts.append((i, title))

    # Backup: "N hurdles" summary rows sit directly under the class card title
    if len(starts) < 2:
        for i, line in enumerate(lines):
            if not re.search(r"\b\d+\s*hurdles?\b", line, re.I):
                continue
            for j in range(max(0, i - 6), i):
                title = is_class_header_line(lines[j])
                if not title:
                    continue
                if any(existing == title for _, existing in starts):
                    break
                if _line_has_class_card_context(lines, j):
                    starts.append((j, title))
                break
        starts.sort(key=lambda x: x[0])

    if not starts:
        return []

    blocks: list[tuple[str, str]] = []
    for j, (start_idx, title) in enumerate(starts):
        end_idx = starts[j + 1][0] if j + 1 < len(starts) else len(lines)
        # Do not let a GP/class card absorb the following LP bucket card fields
        for k in range(start_idx + 1, end_idx):
            if is_bucket_header_line(lines[k]):
                end_idx = k
                break
        block = "\n".join(lines[start_idx:end_idx])
        blocks.append((title, block))
    return blocks


def _hurdle_pref_type(kind: str) -> str:
    k = (kind or "").lower()
    if "irr" in k:
        return "irr"
    if "final" in k:
        return "cash_on_cash"
    return "cash_on_cash"


def _hurdle_display_name(order: int, kind: str) -> str:
    k = (kind or "").strip()
    if not k:
        return f"Hurdle {order}"
    if k.lower() == "final":
        return f"Hurdle {order} - Final"
    if k.lower() in ("pref", "preferred"):
        return f"Hurdle {order} - Pref"
    if k.upper() == "IRR" or k.lower() == "irr":
        return f"Hurdle {order} - IRR"
    return f"Hurdle {order} - {k}"


def _parse_upside_split(section: str) -> tuple[str, str]:
    """
    Extract LP/GP upside split. Never treat dates (10/01/2024) as 10/01 splits.
    Prefer labeled Upside split, then '% to Class … % to … GP', then X/Y that sum to 100.
    """
    labeled = re.search(
        r"Upside\s+sp(?:l|i)it\s*[:\-]?\s*(\d{1,3})\s*/\s*(\d{1,3})",
        section,
        re.IGNORECASE,
    )
    if labeled:
        return labeled.group(1), labeled.group(2)

    to_lp = re.search(
        r"(\d{1,3})\s*%\s*to\s+Class\b",
        section,
        re.IGNORECASE,
    )
    to_gp = re.search(
        r"(\d{1,3})\s*%\s*(?:to|Io)\s+(?:Class\s*[A-Z0-9+]*.*?)?(?:General\s+partners?|GP)\b",
        section,
        re.IGNORECASE,
    )
    if to_lp and to_gp:
        return to_lp.group(1), to_gp.group(1)

    # Bare N/M only when both look like a percent split (sum 100) and not a date N/M/YYYY
    for match in re.finditer(r"(\d{1,3})\s*/\s*(\d{1,3})(?!\s*/\s*\d)", section):
        a, b = int(match.group(1)), int(match.group(2))
        if a + b == 100 and 0 <= a <= 100 and 0 <= b <= 100:
            return str(a), str(b)

    return "100", "0"


HURDLE_CARD_RE = re.compile(
    r"Upside\s+sp(?:l|i)it\s*(\d{1,3})\s*/\s*(\d{1,3})\s+"
    r"Limit\s*([\d.]+)\s*%\s+"
    r"Type\s*(CoC|IRR|Final|Cash on cash)",
    re.IGNORECASE,
)


def _hurdle_limit_text(raw: str) -> str:
    try:
        f = float(raw)
        return str(int(f)) if f == int(f) else str(f)
    except ValueError:
        return raw


def _hurdles_from_cards(
    equity_name: str, block: str
) -> tuple[list[HurdleRow], list[FinalTierRow], str]:
    """Parse stacked Cash Flow hurdle summary cards (Limit / Type / split)."""
    hurdles: list[HurdleRow] = []
    finals: list[FinalTierRow] = []
    pref_rate = ""
    seen: set[tuple[str, str, str, str]] = set()
    order = 0
    for match in HURDLE_CARD_RE.finditer(block):
        lp_pct, gp_pct = match.group(1), match.group(2)
        limit = _hurdle_limit_text(match.group(3))
        kind = match.group(4)
        key = (limit, lp_pct, gp_pct, kind.lower())
        if key in seen:
            continue
        seen.add(key)
        order += 1
        if kind.lower() == "final":
            finals.append(
                FinalTierRow(
                    class_name=equity_name,
                    final_lp_pct=lp_pct,
                    final_gp_pct=gp_pct,
                    hurdle_name="Final",
                    load_notes="Parsed final hurdle Yes",
                )
            )
            continue
        pref_type = _hurdle_pref_type(kind)
        name = _hurdle_display_name(order, "Pref" if pref_type == "cash_on_cash" else kind)
        if limit and not pref_rate:
            pref_rate = limit
        hurdles.append(
            HurdleRow(
                class_name=equity_name,
                tier_order=order,
                hurdle_name=name,
                hurdle_rate_pct=limit,
                lp_pct=lp_pct,
                gp_pct=gp_pct,
                preferred_return_type=pref_type,
                is_final="no",
                load_notes=f"Parsed {name} {limit}% {pref_type} {lp_pct}/{gp_pct}".strip(),
            )
        )
    return hurdles, finals, pref_rate


def parse_hurdles_from_block(
    equity_name: str, block: str
) -> tuple[list[HurdleRow], list[FinalTierRow], str]:
    """
    Parse all class hurdles (Pref, IRR, Final, …).
    Returns (hurdles, final_tiers, first_pref_rate_for_class_row).
    """
    card_hurdles, card_finals, card_pref = _hurdles_from_cards(equity_name, block)
    if len(card_hurdles) + len(card_finals) >= 2 or (
        card_hurdles and not re.search(r"(?m)^Hurdle\s*\d+\s*[-–]?\s*Final\b", block, re.I)
    ):
        # Share-class PDFs often omit "Hurdle 2" headers and only repeat Limit/Type cards.
        if card_hurdles or card_finals:
            return card_hurdles, card_finals, card_pref

    hurdles: list[HurdleRow] = []
    finals: list[FinalTierRow] = []
    pref_rate = ""

    header_re = re.compile(
        r"(?m)^Hurdle\s*(\d+)\s*[-–]?\s*(?:[\d.]+\s*%\s*)?(Pref|Preferred|IRR|Final)\b[^\n]*",
        re.IGNORECASE,
    )
    matches = list(header_re.finditer(block))
    # Keep first section per hurdle number (summary card has Limit / Upside split)
    deduped: list[re.Match[str]] = []
    seen_orders: set[int] = set()
    for match in matches:
        order = int(match.group(1))
        if order in seen_orders:
            continue
        seen_orders.add(order)
        deduped.append(match)
    matches = deduped
    if not matches:
        # Fallback: CoC / cash-on-cash only (older single-hurdle PDFs)
        coc = re.search(
            r"(?:achieves|until).*?([\d.]+)\s*%\s*(?:cssh|cash)\s+on\s+cash"
            r"|([\d.]+)\s*%\s*(?:cssh|cash)\s+on\s+cash"
            r"|Limit\s*([\d.]+)\s*%\s*Type\s*CoC",
            block,
            re.IGNORECASE | re.DOTALL,
        )
        if coc:
            rate = next((g for g in coc.groups() if g), "") or ""
            if rate:
                pref_rate = rate
                hurdles.append(
                    HurdleRow(
                        class_name=equity_name,
                        tier_order=1,
                        hurdle_name="Hurdle 1 - Pref",
                        hurdle_rate_pct=rate,
                        lp_pct="100",
                        gp_pct="0",
                        preferred_return_type="cash_on_cash",
                        load_notes=f"Parsed pref hurdle {rate}% CoC",
                    )
                )
        return hurdles, finals, pref_rate

    for i, match in enumerate(matches):
        order = int(match.group(1))
        kind = match.group(2)
        start = match.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(block)
        section = block[start:end]
        # Pref/IRR cards must not swallow the next Final card when OCR drops
        # "Hurdle N - Final" (Houston: 80/20 + Type Final + Final hurdle Yes).
        if kind.lower() != "final":
            cut = re.search(
                r"(?is)"
                r"(?:Upside\s+sp(?:l|i)it\s+Limit\s+Type\s+\d{1,3}\s*/\s*\d{1,3}\s+Final\b"
                r"|Final\s+hurdle\s*\*?)",
                section,
            )
            if cut and cut.start() > 20:
                section = section[: cut.start()]

        limit = ""
        lim = re.search(
            r"Limit\s*([\d.]+)\s*%|([\d.]+)\s*%\s*Type\s*(?:CoC|IRR|Final)",
            section,
            re.IGNORECASE,
        )
        if lim:
            limit = next((g for g in lim.groups() if g), "") or ""
        if not limit:
            # "achieves 12.0% cash on cash" / "achieves 8% internal rate of return"
            ach = re.search(
                r"achieves\s*([\d.]+)\s*%"
                r"|(?:cash on cash|internal rate)[^\d]{0,20}([\d.]+)\s*%"
                r"|([\d.]+)\s*%\s*(?:cash on cash|internal rate|irr|coc)",
                section,
                re.IGNORECASE,
            )
            if ach:
                limit = next((g for g in ach.groups() if g), "") or ""
        if limit:
            # Normalize 12.0 → 12 when whole number
            try:
                f = float(limit)
                limit = str(int(f)) if f == int(f) else str(f)
            except ValueError:
                pass

        lp_pct, gp_pct = _parse_upside_split(section)

        type_line = ""
        tm = re.search(r"Type\s*(CoC|IRR|Final|Cash on cash)", section, re.I)
        if tm:
            type_line = tm.group(1)
        kind_for_type = type_line or kind

        final_flag = "no"
        # Explicit Final hurdle Yes under this section, or hurdle kind is Final
        if re.search(r"Final\s+hurdle\s*\*?\s*Yes|\bis_final\b\s*yes", section, re.I):
            final_flag = "yes"
        if kind.lower() == "final":
            # Bella-style Hurdle N - Final
            finals.append(
                FinalTierRow(
                    class_name=equity_name,
                    final_lp_pct=lp_pct,
                    final_gp_pct=gp_pct,
                    hurdle_name="Final",
                    load_notes="Parsed final hurdle Yes",
                )
            )
            continue

        # Warner-style: Hurdle 2 - IRR with Final hurdle = No → still a normal hurdle
        if re.search(r"Final\s+hurdle\s*\*?\s*No", section, re.I):
            final_flag = "no"

        pref_type = _hurdle_pref_type(kind_for_type)
        name = _hurdle_display_name(order, kind)
        if limit and not pref_rate and pref_type == "cash_on_cash":
            pref_rate = limit
        elif limit and not pref_rate and order == 1:
            pref_rate = limit

        hurdles.append(
            HurdleRow(
                class_name=equity_name,
                tier_order=order,
                hurdle_name=name,
                hurdle_rate_pct=limit,
                lp_pct=lp_pct,
                gp_pct=gp_pct,
                preferred_return_type=pref_type,
                is_final=final_flag,
                load_notes=f"Parsed {name} {limit}% {pref_type} {lp_pct}/{gp_pct}".strip(),
            )
        )

    # OCR often drops "Hurdle N - Final" and only leaves Type Final / Final hurdle Yes
    if not finals:
        tail = block[matches[-1].end() :] if matches else block
        if re.search(
            r"Final\s+hurdle\s*\*?\s*Yes|(?m)^Final\s*$|Type\s*Final",
            tail,
            re.I,
        ):
            lp_pct, gp_pct = "100", "0"
            marked = re.search(
                r"(\d{1,3})\s*/\s*(\d{1,3})\s+Final\b",
                tail,
                re.I,
            )
            if marked:
                lp_pct, gp_pct = marked.group(1), marked.group(2)
            else:
                near_final = re.search(
                    r"(?is)(?:Type\s*Final|Final\s+hurdle).*$",
                    tail,
                )
                chunk = near_final.group(0) if near_final else tail
                lp_pct, gp_pct = _parse_upside_split(chunk)
            finals.append(
                FinalTierRow(
                    class_name=equity_name,
                    final_lp_pct=lp_pct,
                    final_gp_pct=gp_pct,
                    hurdle_name="Final",
                    load_notes="Parsed final hurdle Yes",
                )
            )
            for hurdle in hurdles:
                hurdle.is_final = "no"

    return hurdles, finals, pref_rate


def parse_class_block(title: str, block: str, order: int) -> tuple[ClassRow, list[HurdleRow], list[FinalTierRow]]:
    lines = [ln.strip() for ln in block.splitlines() if ln.strip()]
    class_type_raw = line_value(lines, "Class type").upper()
    class_type = class_type_raw
    if not class_type:
        if "general partner" in title.lower():
            class_type = "GP"
        elif re.search(r"loan|mezzanine", title, re.I) or re.search(
            r"\bMezzanine\b", block, re.I
        ):
            class_type = "MEZZANINE"
        else:
            class_type = "LP"
    # OCR may put "LP" / "GP" / "Mezzanine" alone; also trust title
    if class_type not in ("LP", "GP", "MEZZANINE", "MEZZ"):
        for ln in lines[:20]:
            folded = fold_ocr_label(ln)
            if folded in ("lp", "gp"):
                class_type = folded.upper()
                break
            if "mezzanine" in folded or folded == "mezz":
                class_type = "MEZZANINE"
                break
        if class_type not in ("LP", "GP", "MEZZANINE", "MEZZ"):
            if "general partner" in title.lower():
                class_type = "GP"
            elif re.search(r"loan|mezz", title, re.I):
                class_type = "MEZZANINE"
            else:
                class_type = "LP"

    if class_type in ("MEZZANINE", "MEZZ") or "mezzanine" in class_type.lower():
        sub_type = "mezzanine"
    elif class_type == "GP":
        sub_type = "gp"
    else:
        sub_type = "lp"
    equity_name = canonicalize_class_title(title)

    raise_own = (
        money(line_value(lines, "Raise amount (for ownership)", "Raise amount for ownership"))
        or first_money_after_labels(
            lines, "Raise amount (for ownership)", "Raise amount for ownership"
        )
    )
    raise_dist = (
        money(
            line_value(
                lines,
                "Raise amount (for distributions)",
                "Raise amount for distribution",
                "Raise amount for distributions",
            )
        )
        or first_money_after_labels(
            lines,
            "Raise amount (for distributions)",
            "Raise amount for distribution",
        )
        or raise_own
    )
    billing = money(line_value(lines, "Raise quota (for billing)", "Raise quota (for biling)"))
    min_inv = money(line_value(lines, "Minimum investment"))
    # OCR often stacks "Raise quota" + "Minimum investment" then $quota / $min
    if not billing or not min_inv or billing == min_inv:
        for i, line in enumerate(lines):
            if not label_matches(line, "minimum investment"):
                continue
            moneys: list[str] = []
            for j in range(max(0, i - 2), min(i + 6, len(lines))):
                mval = money(lines[j])
                if mval and mval not in moneys:
                    moneys.append(mval)
            if len(moneys) >= 2:
                billing = billing or moneys[0]
                nonzero = [m for m in moneys if m not in ("0", "0.0", "0.00")]
                # Prefer a real minimum over OCR $0 placeholders stacked before it
                if nonzero:
                    min_inv = nonzero[-1]
                else:
                    min_inv = min(moneys, key=lambda a: int(a.split(".")[0] or "0"))
            elif len(moneys) == 1 and (not min_inv or min_inv in ("0", "0.0")):
                min_inv = moneys[0]
            break
    if min_inv in ("0", "0.0", "0.00") and sub_type == "mezzanine":
        # Mezz raise can be $0; minimum is usually the first non-zero $ after the label
        for i, line in enumerate(lines):
            if not label_matches(line, "minimum investment"):
                continue
            for j in range(i + 1, min(i + 8, len(lines))):
                mval = money(lines[j])
                if mval and mval not in ("0", "0.0", "0.00"):
                    min_inv = mval
                    break
            break
    start_date = norm_date(
        line_value(lines, "Preferred return start date", "Preferred return start dste")
    )
    if not start_date:
        for ln in lines:
            start_date = norm_date(ln)
            if start_date:
                break

    own_entity = (
        pct(line_value(lines, "Ownership of entity"))
        or first_pct_after_labels(lines, "Ownership of entity")
    )
    dist_share = (
        pct(line_value(lines, "Distribution share"))
        or first_pct_after_labels(lines, "Distribution share")
    )
    legal_own = pct(line_value(lines, "Entity legal ownership")) or own_entity
    if not legal_own:
        # Value may be a few lines under the label (OCR puts Class type / name in between)
        legal_own = first_pct_after_labels(lines, "Entity legal ownership", look_ahead=8) or ""
    if not own_entity and sub_type == "gp":
        # Collapsed summary row: Class B header then 30% / 30% before Class type
        for ln in lines[1:15]:
            if label_matches(ln, "class type", "equity class name", "preferred return start"):
                break
            p = pct(ln)
            if p and p not in ("100", "100.00"):
                own_entity = p
                break
    if not dist_share and own_entity and sub_type == "gp":
        dist_share = own_entity
    legal_own = legal_own or own_entity

    entity_short = ""
    m_ent = re.match(r"Class\s+([A-Z]\+?\d*)\b", equity_name, re.I)
    if sub_type == "gp" and re.search(r"Class\s+B\b", block, re.I):
        entity_short = "Class B"
    elif re.search(r"^TIC\s*Class$", equity_name, re.I):
        entity_short = "TIC"
    elif sub_type == "mezzanine":
        if re.search(r"Mezzanine|Temporary\s+Loan|Loan", equity_name, re.I):
            entity_short = equity_name
        elif m_ent:
            entity_short = f"Class {m_ent.group(1)}"
        else:
            entity_short = equity_name
    elif m_ent:
        entity_short = f"Class {m_ent.group(1)}"
    elif sub_type == "gp":
        entity_short = "GP"

    price_per_unit = money(line_value(lines, "Price per unit", "Price per unit?")) or ""
    if not price_per_unit and sub_type == "mezzanine":
        price_per_unit = first_money_after_labels(lines, "Price per unit", "Price per unit?") or ""

    hurdles, finals, pref_rate = parse_hurdles_from_block(equity_name, block)
    if not pref_rate and sub_type == "mezzanine":
        # Mezz cards often show Preferred return % without hurdle cards
        pref_rate = (
            pct(line_value(lines, "Preferred return", "Preferred return*"))
            or first_pct_after_labels(lines, "Preferred return", "Preferred return*")
            or ""
        )
        if not pref_rate:
            m = re.search(
                r"(?:Temporary\s+Loan\s+)?(\d+(?:\.\d+)?)%\s*Loan|^Temporary\s+Loan\s+(\d+(?:\.\d+)?)%",
                equity_name,
                re.I,
            )
            if m:
                pref_rate = next((g for g in m.groups() if g), "") or ""
        if pref_rate:
            hurdles.append(
                HurdleRow(
                    class_name=equity_name,
                    tier_order=1,
                    hurdle_name="Hurdle 1 - Pref",
                    hurdle_rate_pct=pref_rate,
                    lp_pct="100",
                    gp_pct="0",
                    preferred_return_type="cash_on_cash",
                    load_notes=f"Parsed mezz pref {pref_rate}% CoC",
                )
            )
    pref_enabled = "yes" if pref_rate else "no"

    equity_pct = legal_own if sub_type == "gp" else (own_entity or legal_own)
    notes = []
    if sub_type == "lp" and not hurdles:
        notes.append("no pref hurdles on PDF")
    if sub_type == "gp":
        notes.append("GP class")
    if sub_type == "mezzanine":
        notes.append("Mezzanine / loan class")

    return (
        ClassRow(
            name=equity_name,
            subscription_type=sub_type,
            source_class_name=equity_name,
            display_order=order,
            entity_name=entity_short,
            start_date=start_date,
            offering_size=raise_own,
            raise_amount_distributions=raise_dist,
            billing_raise_quota=billing,
            minimum_investment=min_inv,
            price_per_unit=price_per_unit,
            equity_pct=equity_pct,
            distribution_share_pct=dist_share or equity_pct,
            pref_enabled=pref_enabled,
            pref_rate=pref_rate,
            load_notes="; ".join(notes),
        ),
        hurdles,
        finals,
    )


def parse_bucket_defaults(text: str) -> dict[str, str]:
    """
    LP classes nested under a Cash Flow bucket often omit raise/ownership on the
    class card — those values live on the bucket card (e.g. Bucket 1 - Limited partners).
    """
    out = {"raise": "", "ownership": "", "distribution_share": "", "bucket_name": ""}
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    bucket_idx = -1
    for i, line in enumerate(lines):
        if re.search(r"\bBucket\s+\d+\s*[-–].*Limited\s+partners?", line, re.I):
            bucket_idx = i
            out["bucket_name"] = normalize_ocr_line(line)
            break
        if label_matches(line, "Equity bucket name") and i + 1 < len(lines):
            bucket_idx = i
            out["bucket_name"] = normalize_ocr_line(lines[i + 1])
            break
    if bucket_idx < 0:
        return out

    window = lines[bucket_idx : min(len(lines), bucket_idx + 40)]
    # Stop early if we hit an LP class card header
    trimmed: list[str] = []
    for ln in window:
        if is_class_header_line(ln) and "general" not in ln.lower():
            break
        trimmed.append(ln)
    window = trimmed or window

    out["raise"] = (
        first_money_after_labels(
            window,
            "Raise amount (for ownership)",
            "Raise amount for ownership",
            "Raise amount (for distributions)",
        )
        or money("\n".join(window[:15]))
    )
    out["ownership"] = (
        first_pct_after_labels(window, "Ownership of entity", "Entity legal ownership")
        or ""
    )
    out["distribution_share"] = (
        first_pct_after_labels(window, "Distribution share") or out["ownership"]
    )
    return out


def parse_cashflow_classes_text(text: str, *, deal_name: str = "") -> DealClasses:
    text = text.replace("—", "-").replace("–", "-")
    # Line-level OCR cleanup helps header detection
    text = "\n".join(normalize_ocr_line(ln) for ln in text.splitlines() if ln.strip())
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]

    deal = normalize_ocr_line(deal_name) if deal_name else find_deal_name(lines)
    target_raise = find_deal_target_raise(lines)
    bucket = parse_bucket_defaults(text)

    classes: list[ClassRow] = []
    hurdles: list[HurdleRow] = []
    finals: list[FinalTierRow] = []

    for order, (title, block) in enumerate(split_class_blocks(text)):
        cls, hs, fs = parse_class_block(title, block, order)
        if cls.subscription_type == "lp":
            if not cls.offering_size:
                cls.offering_size = bucket.get("raise") or target_raise
            if not cls.raise_amount_distributions:
                cls.raise_amount_distributions = (
                    cls.offering_size or bucket.get("raise") or target_raise
                )
            if not cls.billing_raise_quota:
                cls.billing_raise_quota = (
                    cls.offering_size or bucket.get("raise") or target_raise
                )
            if not cls.equity_pct and bucket.get("ownership"):
                cls.equity_pct = bucket["ownership"]
            if not cls.distribution_share_pct and (
                bucket.get("distribution_share") or bucket.get("ownership")
            ):
                cls.distribution_share_pct = (
                    bucket.get("distribution_share") or bucket.get("ownership")
                )
            if bucket.get("bucket_name") and not cls.bucket_name:
                cls.bucket_name = bucket["bucket_name"]
        classes.append(cls)
        hurdles.extend(hs)
        finals.extend(fs)

    if not target_raise:
        target_raise = bucket.get("raise") or ""
        for cls in classes:
            if cls.subscription_type == "lp" and cls.offering_size:
                target_raise = cls.offering_size
                break

    return DealClasses(
        deal_name=deal,
        deal_target_raise=target_raise,
        classes=classes,
        hurdles=hurdles,
        final_tiers=finals,
    )
