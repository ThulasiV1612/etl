"""
Load ETL_Distribution_Setup_FILLED.payload.json into Syndication API.

Same load step as class / investor ETL:
  1. Classes already exist for the deal
  2. Resolve payTo class NAMES → deal_investor_class.id UUIDs
  3. PUT /deals/:dealId/distribution-setup { waterfalls }

Usage:
  python load_distribution_setup.py --payload output/ETL_Distribution_Setup_FILLED.payload.json --deal-id <uuid> --token <jwt>
  python load_distribution_setup.py --all-migration-deals --deals-map migration_deal_ids.json --token <jwt>
  python load_distribution_setup.py ... --dry-run   # write .resolved.json only

Env: API_BASE, API_TOKEN / BEARER_TOKEN, DEAL_ID
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
        OUTPUT_DIR / "horizon_apartments" / "ETL_Distribution_Setup_FILLED.payload.json",
        REPO / "Investor-Portal-main" / "ETL_Distribution_Setup_FILLED_Horizon.payload.json",
    ],
    "Wildflower Assisted Living": [
        OUTPUT_DIR / "wildflower_assisted_living" / "ETL_Distribution_Setup_FILLED.payload.json",
        REPO / "Wildflower" / "ETL_Distribution_Setup_FILLED.payload.json",
        REPO / "ETL_Distribution_Setup_FILLED_Wildflower.payload.json",
    ],
    "Woodland Ridge": [
        OUTPUT_DIR / "woodland_ridge" / "ETL_Distribution_Setup_FILLED.payload.json",
        REPO / "Woodland_Ridge" / "ETL_Distribution_Setup_FILLED.payload.json",
        REPO / "ETL_Distribution_Setup_FILLED_Woodland_Ridge.payload.json",
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
        with urllib.request.urlopen(req, timeout=60) as res:
            raw = res.read().decode("utf-8")
            return json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        die(f"{method} {url} → HTTP {e.code}: {detail}")
    except urllib.error.URLError as e:
        die(f"{method} {url} → {e.reason}")


def fetch_class_name_map(api_base: str, deal_id: str, token: str) -> dict[str, str]:
    url = f"{api_base.rstrip('/')}/deals/{deal_id}/class-setup"
    data = http_json("GET", url, token)
    bundle = data.get("classSetup") or data.get("class_setup") or data
    classes = bundle.get("classes") if isinstance(bundle, dict) else None
    if not isinstance(classes, list):
        die(f"No classes in class-setup response for deal {deal_id}")
    out: dict[str, str] = {}
    for c in classes:
        if not isinstance(c, dict):
            continue
        name = str(c.get("name") or "").strip()
        cid = str(c.get("id") or "").strip()
        if name and cid:
            out[name] = cid
            out[name.casefold()] = cid
    if not out:
        die(f"Class setup returned zero named classes for deal {deal_id}")
    return out


def resolve_pay_to(names: list, name_map: dict[str, str]) -> list[str]:
    resolved: list[str] = []
    missing: list[str] = []
    for raw in names:
        key = str(raw or "").strip()
        if not key:
            continue
        if len(key) >= 32 and " " not in key and key.count("-") >= 4:
            resolved.append(key)
            continue
        cid = name_map.get(key) or name_map.get(key.casefold())
        if not cid:
            missing.append(key)
        else:
            resolved.append(cid)
    if missing:
        known = sorted({k for k in name_map if k != k.casefold()})
        die(
            "Unknown payTo class name(s): "
            + ", ".join(missing)
            + "\nKnown class names: "
            + ", ".join(known)
        )
    return resolved


def resolve_waterfalls(waterfalls: dict, name_map: dict[str, str]) -> dict:
    out = {"operating": [], "capital": []}
    for source in ("operating", "capital"):
        rows = waterfalls.get(source) or []
        if not isinstance(rows, list):
            die(f"waterfalls.{source} must be a list")
        for row in rows:
            if not isinstance(row, dict):
                die(f"Invalid row in waterfalls.{source}")
            pay_to = row.get("payTo") or row.get("pay_to") or []
            if not isinstance(pay_to, list):
                die(f"payTo must be a list on row {row.get('id')}")
            new_row = dict(row)
            new_row["payTo"] = resolve_pay_to(pay_to, name_map)
            out[source].append(new_row)
    return out


def put_distribution_setup(api_base: str, deal_id: str, token: str, waterfalls: dict) -> dict:
    url = f"{api_base.rstrip('/')}/deals/{deal_id}/distribution-setup"
    return http_json("PUT", url, token, {"waterfalls": waterfalls})


def first_existing(paths: list[Path]) -> Path | None:
    for p in paths:
        if p.is_file():
            return p
    return None


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
    print(f"==> {deal_name}")
    print(f"    payload: {payload_path}")
    print(f"    deal_id: {deal_id}")

    waterfalls = payload.get("waterfalls")
    if not isinstance(waterfalls, dict):
        die("Payload missing waterfalls object")

    name_map = fetch_class_name_map(api_base, deal_id, token)
    print(f"    classes: {len({k for k in name_map if k != k.casefold()})}")

    resolved = resolve_waterfalls(waterfalls, name_map)
    out_path = payload_path.with_suffix(".resolved.json")
    out_doc = {
        "deal_name": deal_name,
        "deal_id": deal_id,
        "waterfalls": resolved,
        "note": "payTo resolved to deal_investor_class.id UUIDs",
    }
    out_path.write_text(json.dumps(out_doc, indent=2), encoding="utf-8")
    print(f"    wrote: {out_path}")

    if dry_run:
        print("    dry-run: skipped PUT")
        return

    result = put_distribution_setup(api_base, deal_id, token, resolved)
    bundle = result.get("distributionSetup") or result
    wf = (bundle or {}).get("waterfalls") if isinstance(bundle, dict) else None
    op = len((wf or {}).get("operating") or []) if isinstance(wf, dict) else "?"
    cap = len((wf or {}).get("capital") or []) if isinstance(wf, dict) else "?"
    print(f"    PUT ok — operating={op} capital={cap}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Load Distribution Setup ETL payload into Syndication API"
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
        if not isinstance(deals_map, dict) or not deals_map:
            die("deals-map must be a non-empty JSON object")
        for deal_name, deal_id in deals_map.items():
            paths = DEFAULT_PAYLOADS.get(str(deal_name), [])
            payload_path = first_existing(paths)
            if not payload_path:
                die(f"No payload for {deal_name}. Run map_class_to_distribution_setup.py --all-migration-deals first.")
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
        die("Missing --deal-id (or deal_id in payload / DEAL_ID env)")

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
