"""
Load ETL_Distributions_Paid_FILLED.payload.json → priorDistributions.

For each prior run:
  POST /deals/:dealId/distribution-setup/complete
  { source, amount, date, name, notes, period, investorPayments }

Resolves:
  className → class UUID (GET class-setup)
  profileName / investorName / source_investment_id → investment id (GET deal investors)

Usage:
  python load_prior_distributions.py --payload output/.../ETL_Distributions_Paid_FILLED.payload.json \\
    --deal-id <uuid> --token <jwt>

  python load_prior_distributions.py --all-migration-deals --deals-map migration_deal_ids.json --token <jwt>
  python load_prior_distributions.py ... --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
OUTPUT_DIR = HERE / "output"

DEFAULT_PAYLOADS = {
    "Horizon Apartments": [
        OUTPUT_DIR / "horizon_apartments" / "ETL_Distributions_Paid_FILLED.payload.json",
        REPO / "Investor-Portal-main" / "ETL_Distributions_Paid_FILLED_Horizon.payload.json",
    ],
    "Woodland Ridge": [
        OUTPUT_DIR / "woodland_ridge" / "ETL_Distributions_Paid_FILLED.payload.json",
        REPO / "Woodland_Ridge" / "ETL_Distributions_Paid_FILLED.payload.json",
    ],
    "Wildflower Assisted Living": [
        OUTPUT_DIR / "wildflower_assisted_living" / "ETL_Distributions_Paid_FILLED.payload.json",
        REPO / "Wildflower" / "ETL_Distributions_Paid_FILLED.payload.json",
    ],
}


def die(msg: str, code: int = 1) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    raise SystemExit(code)


def load_json(path: Path) -> dict:
    if not path.is_file():
        die(f"Payload not found: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def http_json(method: str, url: str, token: str, body: dict | None = None) -> dict:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            raw = res.read().decode("utf-8")
            return json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        die(f"{method} {url} → HTTP {e.code}: {detail}")
    except urllib.error.URLError as e:
        die(f"{method} {url} → {e.reason}")


def first_existing(paths: list[Path]) -> Path | None:
    for p in paths:
        if p.is_file():
            return p
    return None


def fetch_class_map(api_base: str, deal_id: str, token: str) -> dict[str, str]:
    data = http_json("GET", f"{api_base.rstrip('/')}/deals/{deal_id}/class-setup", token)
    bundle = data.get("classSetup") or data.get("class_setup") or data
    classes = bundle.get("classes") if isinstance(bundle, dict) else None
    out: dict[str, str] = {}
    if not isinstance(classes, list):
        return out
    for c in classes:
        if not isinstance(c, dict):
            continue
        name = str(c.get("name") or "").strip()
        cid = str(c.get("id") or "").strip()
        if name and cid:
            out[name] = cid
            out[name.casefold()] = cid
    return out


def _norm(s: str) -> str:
    return " ".join(str(s or "").strip().casefold().split())


def fetch_investor_index(api_base: str, deal_id: str, token: str) -> list[dict]:
    """Return list of investment-ish rows for matching."""
    url = f"{api_base.rstrip('/')}/deals/{deal_id}/investors"
    data = http_json("GET", url, token)
    # Response shapes vary: { investors: [] } or { investments: [] } or { data: [] }
    rows = (
        data.get("investors")
        or data.get("investments")
        or data.get("items")
        or data.get("data")
        or []
    )
    if isinstance(data.get("lpInvestors"), list):
        rows = list(rows) + data["lpInvestors"]
    if not isinstance(rows, list):
        return []
    out = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        out.append(
            {
                "id": str(
                    r.get("id")
                    or r.get("investmentId")
                    or r.get("investment_id")
                    or ""
                ).strip(),
                "contactId": str(r.get("contactId") or r.get("contact_id") or "").strip(),
                "userEmail": str(r.get("userEmail") or r.get("user_email") or "").strip().lower(),
                "displayName": str(
                    r.get("displayName")
                    or r.get("display_name")
                    or r.get("investorName")
                    or r.get("name")
                    or ""
                ).strip(),
                "profileName": str(
                    r.get("profileName")
                    or r.get("investmentProfileName")
                    or r.get("entityName")
                    or ""
                ).strip(),
                "className": str(
                    r.get("investorClass")
                    or r.get("className")
                    or r.get("class_name")
                    or ""
                ).strip(),
                "sourceInvestmentId": str(
                    r.get("sourceInvestmentId")
                    or r.get("source_investment_id")
                    or r.get("externalId")
                    or r.get("external_id")
                    or ""
                ).strip(),
            }
        )
    return [x for x in out if x["id"]]


def match_investor(line: dict, index: list[dict]) -> dict | None:
    src_id = str(line.get("source_investment_id") or "").strip()
    if src_id:
        for row in index:
            if row["sourceInvestmentId"] and row["sourceInvestmentId"] == src_id:
                return row
            if row["id"] == src_id:
                return row

    profile = _norm(line.get("profileName") or "")
    investor = _norm(line.get("investorName") or "")
    class_name = _norm(line.get("className") or "")

    # Exact profile + class
    if profile:
        for row in index:
            if _norm(row["profileName"]) == profile and (
                not class_name or _norm(row["className"]) == class_name
            ):
                return row
    # Investor display name + class
    if investor:
        for row in index:
            if _norm(row["displayName"]) == investor and (
                not class_name or _norm(row["className"]) == class_name
            ):
                return row
        for row in index:
            if _norm(row["displayName"]) == investor:
                return row
    if profile:
        for row in index:
            if _norm(row["profileName"]) == profile:
                return row
    return None


def resolve_run_payments(
    run: dict,
    class_map: dict[str, str],
    investor_index: list[dict],
) -> tuple[list[dict], list[str]]:
    warnings: list[str] = []
    payments: list[dict] = []
    for line in run.get("investorPayments") or []:
        class_name = str(line.get("className") or "").strip()
        class_id = (
            str(line.get("classId") or "").strip()
            or class_map.get(class_name)
            or class_map.get(class_name.casefold())
            or ""
        )
        matched = match_investor(line, investor_index)
        investor_id = str(line.get("investorId") or "").strip()
        contact_id = ""
        email = ""
        if matched:
            investor_id = matched["id"]
            contact_id = matched["contactId"]
            email = matched["userEmail"]
        else:
            # Keep a stable placeholder so the complete API still stores exact payment lines.
            investor_id = investor_id or str(line.get("source_investment_id") or "").strip()
            if not investor_id:
                warnings.append(
                    f"unmatched line {line.get('investorName')!r} / {line.get('profileName')!r}"
                )
                continue
            warnings.append(
                f"unresolved investor for {line.get('profileName') or line.get('investorName')} "
                f"— using source id {investor_id}"
            )

        payment = float(line.get("payment") or 0)
        if payment < 0:
            continue
        payments.append(
            {
                "investorId": investor_id,
                "contactId": contact_id or None,
                "userEmail": email or None,
                "investorName": str(line.get("investorName") or line.get("profileName") or "—"),
                "classId": class_id,
                "className": class_name or "—",
                "capital": float(line.get("capital") or 0),
                "percentOfClass": float(line.get("percentOfClass") or 0),
                "payment": payment,
            }
        )
    # strip Nones for JSON cleanliness
    cleaned = []
    for p in payments:
        row = {k: v for k, v in p.items() if v is not None and v != ""}
        cleaned.append(row)
    return cleaned, warnings


def post_complete(api_base: str, deal_id: str, token: str, body: dict) -> dict:
    url = f"{api_base.rstrip('/')}/deals/{deal_id}/distribution-setup/complete"
    return http_json("POST", url, token, body)


def load_one(
    *,
    payload_path: Path,
    deal_id: str,
    api_base: str,
    token: str,
    dry_run: bool,
) -> None:
    payload = load_json(payload_path)
    deal_name = payload.get("deal_name") or payload_path.stem
    runs = payload.get("prior_distributions") or payload.get("priorDistributions") or []
    if not isinstance(runs, list) or not runs:
        die(f"No prior_distributions in {payload_path}")

    print(f"==> {deal_name}")
    print(f"    payload: {payload_path}")
    print(f"    deal_id: {deal_id}")
    print(f"    runs: {len(runs)}")

    class_map = fetch_class_map(api_base, deal_id, token)
    investor_index = fetch_investor_index(api_base, deal_id, token)
    print(f"    classes: {len({k for k in class_map if k != k.casefold()})}")
    print(f"    investments indexed: {len(investor_index)}")

    resolved_runs = []
    for i, run in enumerate(runs, start=1):
        payments, warnings = resolve_run_payments(run, class_map, investor_index)
        body = {
            "source": run.get("source") or "operating",
            "amount": run.get("amount"),
            "date": run.get("date"),
            "name": run.get("name"),
            "notes": run.get("notes"),
            "period": run.get("period") or "monthly",
            "investorPayments": payments,
        }
        resolved_runs.append(body)
        print(
            f"    [{i}/{len(runs)}] {body['date']} {body['name']!r} "
            f"amount={body['amount']} lines={len(payments)} source={body['source']}"
        )
        for w in warnings[:5]:
            print(f"      warn: {w}")
        if len(warnings) > 5:
            print(f"      warn: … +{len(warnings) - 5} more")

    out_path = payload_path.with_suffix(".resolved.json")
    out_path.write_text(
        json.dumps(
            {
                "deal_name": deal_name,
                "deal_id": deal_id,
                "complete_bodies": resolved_runs,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"    wrote: {out_path}")

    if dry_run:
        print("    dry-run: skipped POST complete")
        return

    for i, body in enumerate(resolved_runs, start=1):
        result = post_complete(api_base, deal_id, token, body)
        record = result.get("record") or {}
        print(
            f"    POST complete [{i}/{len(resolved_runs)}] ok id={record.get('id', '?')}"
        )
    print(f"    loaded {len(resolved_runs)} prior distribution run(s)")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Load paid-distribution ETL into priorDistributions via complete API"
    )
    parser.add_argument("--payload", type=Path)
    parser.add_argument("--deal-id", default=os.environ.get("DEAL_ID", ""))
    parser.add_argument(
        "--api-base",
        default=os.environ.get("API_BASE", "http://localhost:4000/api/v1"),
    )
    parser.add_argument(
        "--token",
        default=os.environ.get("API_TOKEN") or os.environ.get("BEARER_TOKEN") or "",
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--all-migration-deals", action="store_true")
    parser.add_argument(
        "--deals-map",
        type=Path,
        default=HERE / "migration_deal_ids.json",
    )
    args = parser.parse_args()

    if not args.token:
        die("Missing --token (or API_TOKEN / BEARER_TOKEN env)")

    if args.all_migration_deals:
        if not args.deals_map.is_file():
            die(
                f"Deals map not found: {args.deals_map}\n"
                "Copy migration_deal_ids.example.json → migration_deal_ids.json and fill UUIDs."
            )
        deals_map = json.loads(args.deals_map.read_text(encoding="utf-8"))
        for deal_name, deal_id in deals_map.items():
            if str(deal_id).startswith("REPLACE"):
                print(f"SKIP {deal_name}: deal id not filled")
                continue
            payload_path = first_existing(DEFAULT_PAYLOADS.get(str(deal_name), []))
            if not payload_path:
                print(f"SKIP {deal_name}: no paid payload (run map_paid_excel_to_prior_distributions.py)")
                continue
            load_one(
                payload_path=payload_path,
                deal_id=str(deal_id).strip(),
                api_base=args.api_base,
                token=args.token,
                dry_run=args.dry_run,
            )
        print("Done.")
        return

    if not args.payload:
        die("Provide --payload or --all-migration-deals")
    deal_id = (args.deal_id or "").strip()
    if not deal_id:
        payload = load_json(args.payload)
        deal_id = str(payload.get("deal_id") or "").strip()
    if not deal_id:
        die("Missing --deal-id")

    load_one(
        payload_path=args.payload,
        deal_id=deal_id,
        api_base=args.api_base,
        token=args.token,
        dry_run=args.dry_run,
    )
    print("Done.")


if __name__ == "__main__":
    main()
