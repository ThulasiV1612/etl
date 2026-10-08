"""
Cash Flow 'distributions paid' Excel → priorDistributions payload (+ FILLED workbook).

This is the HISTORY of distributions already paid (not waterfall config).

Source sheet: "Distributions by investment"
Groups rows into distribution runs by (period_end_date, memo, distribution_type).
Each run → one POST /deals/:dealId/distribution-setup/complete body.

Usage:
  python map_paid_excel_to_prior_distributions.py
  python map_paid_excel_to_prior_distributions.py "path/to/distributions paid.xlsx"
  python map_paid_excel_to_prior_distributions.py --all-migration-deals
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import openpyxl
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

HERE = Path(__file__).resolve().parent
INPUT_DIR = HERE / "input"
OUTPUT_DIR = HERE / "output"
REPO = HERE.parent

header_fill = PatternFill("solid", fgColor="1F4E79")
header_font = Font(color="FFFFFF", bold=True)
example_fill = PatternFill("solid", fgColor="E2EFDA")
hint_fill = PatternFill("solid", fgColor="FFF2CC")
thin = Border(
    left=Side(style="thin", color="B0B0B0"),
    right=Side(style="thin", color="B0B0B0"),
    top=Side(style="thin", color="B0B0B0"),
    bottom=Side(style="thin", color="B0B0B0"),
)

MIGRATION_PAID_SOURCES = {
    "Horizon Apartments": [
        REPO
        / "Investor-Portal-main"
        / "Horizon Apartments  distributions paid from start to 07-24-2026_07_24_2026.xlsx",
        REPO / "Horizon" / "Horizon Apartments  distributions paid from start to 07-24-2026_07_24_2026.xlsx",
    ],
    "Woodland Ridge": [
        REPO / "Woodland Ridge  distributions paid from start to 07-27-2026_07_27_2026.xlsx",
        REPO
        / "Woodland_Ridge"
        / "Woodland Ridge  distributions paid from start to 07-27-2026_07_27_2026.xlsx",
    ],
    "Wildflower Assisted Living": [
        REPO / "Wildflower" / "Wildflower Assisted Living  distributions paid.xlsx",
    ],
}

DEAL_COPY = {
    "Horizon Apartments": REPO / "Investor-Portal-main",
    "Woodland Ridge": REPO / "Woodland_Ridge",
    "Wildflower Assisted Living": REPO / "Wildflower",
}

SHEET_CANDIDATES = (
    "Distributions by investment",
    "Paid_By_Investment",
)


def style_header(ws, cols: int) -> None:
    ws.row_dimensions[1].height = 36
    for c in range(1, cols + 1):
        cell = ws.cell(1, c)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(wrap_text=True, vertical="center")
        cell.border = thin


def mark(ws, row: int, cols: int) -> None:
    for c in range(1, cols + 1):
        cell = ws.cell(row, c)
        cell.fill = example_fill
        cell.border = thin


def autosize(ws, max_w: int = 32) -> None:
    for col in ws.columns:
        letter = get_column_letter(col[0].column)
        w = 12
        for cell in col[:120]:
            if cell.value is not None:
                w = max(w, min(max_w, len(str(cell.value)) + 2))
        ws.column_dimensions[letter].width = w


def cell(v) -> str:
    if v is None:
        return ""
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d")
    s = str(v).strip()
    if s in {"-", "—", "None", "null", "n/a", "N/A"}:
        return ""
    return s


def money(v) -> float:
    s = cell(v).replace("$", "").replace(",", "").strip()
    if not s:
        return 0.0
    try:
        return float(s)
    except ValueError:
        return 0.0


def to_date(v) -> str:
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d")
    s = cell(v)
    if not s:
        return ""
    # already ISO-ish
    if re.match(r"^\d{4}-\d{2}-\d{2}", s):
        return s[:10]
    for fmt in ("%m/%d/%Y", "%m-%d-%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(s[:10], fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return s[:10]


def slug(name: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "_", name).strip("_").lower()
    return s or "deal"


def infer_source(dist_type: str, pref_paid: float, roc: float, carried: float, other: float) -> str:
    t = (dist_type or "").strip().lower()
    if "return of capital" in t or "roc" == t or roc > 0 and pref_paid <= 0:
        return "capital"
    if "carried" in t or carried > 0 and pref_paid <= 0 and other <= 0:
        return "capital"
    if "acquisition" in t or "other" in t:
        return "operating"
    if pref_paid > 0 or "preferred" in t:
        return "operating"
    if roc > 0:
        return "capital"
    return "operating"


def read_distributions_by_investment(path: Path) -> list[dict]:
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    sheet_name = next((n for n in SHEET_CANDIDATES if n in wb.sheetnames), None)
    if not sheet_name:
        wb.close()
        raise KeyError(
            f"No 'Distributions by investment' sheet in {path.name}. Found: {wb.sheetnames}"
        )
    ws = wb[sheet_name]
    rows_iter = ws.iter_rows(values_only=True)
    headers_raw = [cell(h) for h in next(rows_iter)]
    # Strip optional "key [Cash Flow Name]" wrappers from ETL pack
    headers = []
    for h in headers_raw:
        m = re.match(r"^(.+?)\s*\[(.+)\]\s*$", h)
        headers.append(m.group(2) if m else h)

    out: list[dict] = []
    for row in rows_iter:
        if not row or all(c is None or str(c).strip() in ("", "-") for c in row[:4]):
            continue
        rec = {
            headers[i]: row[i]
            for i in range(len(headers))
            if headers[i]
        }
        out.append(rec)
    wb.close()
    return out


def build_runs(rows: list[dict], *, source_file: str) -> dict:
    groups: dict[tuple, list[dict]] = defaultdict(list)
    deal_name = ""

    for r in rows:
        deal = cell(r.get("Deal name"))
        if deal:
            deal_name = deal
        memo = cell(r.get("Distribution memo")) or cell(r.get("Distribution type")) or "Distribution"
        dist_type = cell(r.get("Distribution type"))
        period_end = to_date(r.get("Period end date") or r.get("Payment initiated on"))
        net = money(r.get("Net payment"))
        if net <= 0:
            # keep only real paid lines
            continue
        key = (period_end, memo, dist_type)
        groups[key].append(r)

    runs: list[dict] = []
    for (period_end, memo, dist_type), lines in sorted(
        groups.items(), key=lambda kv: (kv[0][0], kv[0][1])
    ):
        investor_lines = []
        total = 0.0
        pref_sum = roc_sum = carried_sum = other_sum = 0.0
        for r in lines:
            net = money(r.get("Net payment"))
            pref = money(r.get("Preferred return paid (by distribution)"))
            roc = money(r.get("Return of capital"))
            carried = money(
                r.get("Carried interest paid")
                if cell(r.get("Carried interest paid"))
                else 0
            )
            other = money(r.get("Other payment"))
            pref_sum += pref
            roc_sum += roc
            carried_sum += carried if carried > 0 else 0
            other_sum += other
            total += net
            capital = money(r.get("Outstanding capital") or r.get("Initial investment amount"))
            investor_lines.append(
                {
                    # UI / API PriorDistributionRecord.investorPayments fields
                    "investorId": "",
                    "contactId": "",
                    "userEmail": "",
                    "investorName": cell(r.get("Investor name")),
                    "classId": "",
                    "className": cell(r.get("Class name")),
                    "capital": str(round(capital, 2)),
                    "percentOfClass": str(
                        round(money(r.get("Percentage of offering")) * 100, 6)
                        if money(r.get("Percentage of offering")) <= 1
                        else round(money(r.get("Percentage of offering")), 6)
                    ),
                    "payment": str(round(net, 2)),
                    # ETL resolve helpers (stripped/ignored by API if unknown)
                    "source_investment_id": cell(r.get("Unique investment ID")),
                    "profileName": cell(r.get("Investment profile name")),
                    "distribution_method": cell(
                        r.get("Distribution method") or r.get("Selected distribution method")
                    ),
                }
            )

        source = infer_source(dist_type, pref_sum, roc_sum, carried_sum, other_sum)
        runs.append(
            {
                "source": source,
                "amount": round(total, 2),
                "date": period_end or datetime.now().strftime("%Y-%m-%d"),
                "name": memo,
                "notes": (
                    f"Cash Flow import | type={dist_type or '—'} | "
                    f"pref={round(pref_sum, 2)} roc={round(roc_sum, 2)} "
                    f"other={round(other_sum, 2)} carried={round(carried_sum, 2)} | "
                    f"file={source_file}"
                ),
                "period": "monthly",
                "cash_flow_distribution_type": dist_type,
                "investorPayments": investor_lines,
                "line_count": len(investor_lines),
            }
        )

    return {
        "deal_name": deal_name.strip(),
        "deal_id": "",
        "mapped_from": source_file,
        "note": (
            "Historical distributions already paid. Load via "
            "load_prior_distributions.py → POST .../distribution-setup/complete. "
            "Resolve investorId/classId on load. Does NOT replace waterfall config."
        ),
        "prior_distributions": runs,
        "run_count": len(runs),
        "total_paid": round(sum(r["amount"] for r in runs), 2),
    }


def write_filled_xlsx(payload: dict, path: Path) -> None:
    wb = Workbook()
    ws = wb.active
    ws.title = "Deal_Meta"
    ws.append(["deal_name", "deal_id", "source_file", "run_count", "total_paid", "notes"])
    style_header(ws, 6)
    ws.append(
        [
            payload["deal_name"],
            payload.get("deal_id", ""),
            payload["mapped_from"],
            payload["run_count"],
            payload["total_paid"],
            "Already-paid ledger → priorDistributions (not waterfall setup)",
        ]
    )
    mark(ws, 2, 6)
    autosize(ws)

    run_headers = [
        "run_order",
        "date",
        "name",
        "source",
        "amount",
        "cash_flow_distribution_type",
        "line_count",
        "period",
        "notes",
        "maps_to",
    ]
    ws = wb.create_sheet("Prior_Runs")
    ws.append(run_headers)
    style_header(ws, len(run_headers))
    for i, r in enumerate(payload["prior_distributions"], start=1):
        ws.append(
            [
                i,
                r["date"],
                r["name"],
                r["source"],
                r["amount"],
                r.get("cash_flow_distribution_type", ""),
                r["line_count"],
                r.get("period", ""),
                r.get("notes", ""),
                "distribution_setup_json.priorDistributions[]",
            ]
        )
        mark(ws, ws.max_row, len(run_headers))
    autosize(ws)

    line_headers = [
        "run_date",
        "run_name",
        "source_investment_id",
        "investor_name",
        "profile_name",
        "class_name",
        "class_id",
        "investor_id",
        "capital",
        "percent_of_class",
        "payment",
        "distribution_method",
        "maps_to",
    ]
    ws = wb.create_sheet("Prior_Investor_Lines")
    ws.append(line_headers)
    style_header(ws, len(line_headers))
    for r in payload["prior_distributions"]:
        for line in r["investorPayments"]:
            ws.append(
                [
                    r["date"],
                    r["name"],
                    line.get("source_investment_id", ""),
                    line.get("investorName", ""),
                    line.get("profileName", ""),
                    line.get("className", ""),
                    line.get("classId", ""),
                    line.get("investorId", ""),
                    line.get("capital", 0),
                    line.get("percentOfClass", 0),
                    line.get("payment", 0),
                    line.get("distribution_method", ""),
                    "priorDistributions[].investorPayments[]",
                ]
            )
            mark(ws, ws.max_row, len(line_headers))
    autosize(ws)

    ws = wb.create_sheet("Load_Steps")
    ws.append(["step", "action"])
    style_header(ws, 2)
    for row in [
        ["1", "Deal + Classes + investors/investments already loaded"],
        ["2", "Waterfall Dist Setup already loaded from Class_Mapping_FILLED"],
        ["3", "python load_prior_distributions.py --payload <this>.payload.json --deal-id <uuid> --token <jwt>"],
        ["4", "Each Prior_Runs row → POST /deals/:dealId/distribution-setup/complete"],
        ["5", "Confirm Deal → Distributions tab + Investing My Distributions"],
        ["6", "Acquisition fee / Other payment are ledger history — still imported"],
    ]:
        ws.append(row)
        mark(ws, ws.max_row, 2)
    autosize(ws)

    path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(path)


def resolve_input(explicit: str | None) -> Path:
    if explicit:
        p = Path(explicit).expanduser().resolve()
        if not p.exists():
            raise FileNotFoundError(p)
        return p
    files = [
        f
        for f in INPUT_DIR.glob("*.xlsx")
        if not f.name.startswith("~")
        and "distribut" in f.name.lower()
        and "ETL_" not in f.name
    ]
    if not files:
        raise FileNotFoundError(
            f"No Cash Flow distributions-paid xlsx in {INPUT_DIR}. "
            "Pass a path or drop the file into input/"
        )
    if len(files) > 1:
        newest = max(files, key=lambda f: f.stat().st_mtime)
        print("multiple paid xlsx; using newest:", newest.name)
        return newest
    return files[0]


def process_one(src: Path, out_dir: Path, *, also_copy_to: Path | None = None) -> dict:
    rows = read_distributions_by_investment(src)
    payload = build_runs(rows, source_file=src.name)
    if not payload["deal_name"]:
        payload["deal_name"] = src.stem.split("distribut")[0].strip(" _-") or "Deal"

    safe = slug(payload["deal_name"])
    deal_out = out_dir / safe
    deal_out.mkdir(parents=True, exist_ok=True)

    xlsx = deal_out / "ETL_Distributions_Paid_FILLED.xlsx"
    json_path = deal_out / "ETL_Distributions_Paid_FILLED.payload.json"
    named_xlsx = deal_out / f"ETL_Distributions_Paid_FILLED_{safe}.xlsx"
    named_json = deal_out / f"ETL_Distributions_Paid_FILLED_{safe}.payload.json"

    write_filled_xlsx(payload, xlsx)
    write_filled_xlsx(payload, named_xlsx)
    text = json.dumps(payload, indent=2)
    json_path.write_text(text, encoding="utf-8")
    named_json.write_text(text, encoding="utf-8")

    if also_copy_to:
        also_copy_to.mkdir(parents=True, exist_ok=True)
        if payload["deal_name"].startswith("Horizon"):
            dest_x = also_copy_to / "ETL_Distributions_Paid_FILLED_Horizon.xlsx"
            dest_j = also_copy_to / "ETL_Distributions_Paid_FILLED_Horizon.payload.json"
        else:
            dest_x = also_copy_to / "ETL_Distributions_Paid_FILLED.xlsx"
            dest_j = also_copy_to / "ETL_Distributions_Paid_FILLED.payload.json"
        write_filled_xlsx(payload, dest_x)
        dest_j.write_text(text, encoding="utf-8")

    print(f"source={src}")
    print(
        f"deal={payload['deal_name']} runs={payload['run_count']} "
        f"total_paid={payload['total_paid']} lines={sum(r['line_count'] for r in payload['prior_distributions'])}"
    )
    print(f"wrote={xlsx}")
    print(f"wrote={json_path}")
    return payload


def find_migration_source(deal_name: str) -> Path | None:
    for p in MIGRATION_PAID_SOURCES.get(deal_name, []):
        if p.exists():
            return p
    return None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Map Cash Flow distributions-paid Excel → priorDistributions ETL"
    )
    parser.add_argument("paid_excel", nargs="?", help="Cash Flow distributions paid xlsx")
    parser.add_argument("--out-dir", default=str(OUTPUT_DIR))
    parser.add_argument("--all-migration-deals", action="store_true")
    parser.add_argument("--no-copy", action="store_true")
    args = parser.parse_args(argv)

    INPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    if args.all_migration_deals:
        any_ok = False
        for deal_name in MIGRATION_PAID_SOURCES:
            src = find_migration_source(deal_name)
            if not src:
                print(f"\n=== {deal_name} === SKIP (no paid Excel found)")
                continue
            any_ok = True
            print(f"\n=== {deal_name} ===")
            copy_to = None if args.no_copy else DEAL_COPY.get(deal_name)
            process_one(src, out_dir, also_copy_to=copy_to)
        if not any_ok:
            raise FileNotFoundError("No migration paid Excel files found")
        print("\nDone — paid ledger mapped.")
        return 0

    src = resolve_input(args.paid_excel)
    # Peek deal name for copy target without double-processing
    peek_rows = read_distributions_by_investment(src)
    peek = build_runs(peek_rows, source_file=src.name)
    copy_to = None if args.no_copy else DEAL_COPY.get(peek["deal_name"].strip())
    process_one(src, out_dir, also_copy_to=copy_to)
    print("Done.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        raise SystemExit(1)
