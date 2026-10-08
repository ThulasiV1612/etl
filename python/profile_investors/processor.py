"""
Cash Flow Portal investments Excel → Profile + Add Investor ETL mapping files.

Integrated processor for the SyndicationX ETL backend.
Reads Investors (profile) (+ optional questionnaire enrichment) and generates:
  - Add_Profile_FILLED.xlsx
  - Add_Investor_Mapping_FILLED.xlsx
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path

import openpyxl
from openpyxl.worksheet.worksheet import Worksheet

HERE = Path(__file__).resolve().parent
TEMPLATES = HERE / "templates"
BLANK = {"", "-", "—", "n/a", "N/A", "None", "null"}
# Cash Flow often puts a lone hyphen in address/ZIP when the value is redacted.
HYPHEN_PLACEHOLDER = {"-", "—", "–"}
PROFILE_SHEET = "Investors (profile)"
QUESTIONNAIRE_SHEET = "Investors (questionnaire)"
REDACTED_EMAIL = "redacted"


def cell(v) -> str:
    if v is None:
        return ""
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d %H:%M") if (v.hour or v.minute) else v.strftime("%Y-%m-%d")
    s = str(v).strip()
    if s in BLANK:
        return ""
    return s


def cell_keep_hyphen(v) -> str:
    """Like cell(), but keep lone '-' so redacted ZIP/address still maps."""
    if v is None:
        return ""
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d %H:%M") if (v.hour or v.minute) else v.strftime("%Y-%m-%d")
    s = str(v).strip()
    if s in HYPHEN_PLACEHOLDER:
        return "-"
    if s in BLANK:
        return ""
    return s


def is_placeholder_email(value: str) -> bool:
    raw = cell(value).lower()
    if not raw:
        return True
    if "@" in raw:
        return False
    if raw.startswith("redacted__"):
        return True
    return raw in {
        "redacted",
        "radicated",
        "[redacted]",
        "(redacted)",
        "n/a",
        "na",
        "-",
        "none",
        "null",
    }


def to_contact_email(value: str) -> str:
    raw = cell(value)
    if not raw or is_placeholder_email(raw):
        return REDACTED_EMAIL
    return raw


def normalize_phone(value: str) -> str:
    digits = re.sub(r"\D", "", cell(value))
    if len(digits) >= 10:
        return digits[-10:]
    return digits if len(digits) >= 7 else ""


def roster_person_key(inv: dict) -> str:
    """
    Identity for Add Investors roster person (without class).
    Real email → email. Redacted/blank → name + phone + profile id (never collapse all redacted together).
    """
    email = to_contact_email(inv.get("contact_email") or "")
    if not is_placeholder_email(email):
        return email.lower()

    profile_id = cell(inv.get("source_profile_id")).lower()
    name = cell(inv.get("contact_display_name")).lower()
    phone = normalize_phone(inv.get("contact_phone") or "")
    first = cell(inv.get("first_name")).lower()
    last = cell(inv.get("last_name")).lower()
    person = profile_id or "|".join(p for p in (name, first, last, phone) if p)
    return f"redacted:{person}" if person else ""


def roster_person_family_key(inv: dict) -> str:
    """
    Same human across multiple Unique profile ids (IRA + LLC + individual).
    Real email → email. Redacted → name/first/last/phone only (ignores profile id).
    """
    email = to_contact_email(
        inv.get("contact_email") or inv.get("user_email") or ""
    )
    if not is_placeholder_email(email):
        return f"email:{email.lower()}"

    name = cell(
        inv.get("contact_display_name") or inv.get("profile_name") or ""
    ).lower()
    phone = normalize_phone(inv.get("contact_phone") or inv.get("phone") or "")
    first = cell(inv.get("first_name")).lower()
    last = cell(inv.get("last_name")).lower()
    person = "|".join(p for p in (first, last, name, phone) if p)
    return f"person:{person}" if person else ""


def profile_family_key(profile: dict) -> str:
    return roster_person_family_key(
        {
            "user_email": profile.get("user_email") or "",
            "contact_email": profile.get("user_email") or "",
            "profile_name": profile.get("profile_name") or "",
            "contact_display_name": profile.get("profile_name") or "",
            "first_name": profile.get("first_name") or "",
            "last_name": profile.get("last_name") or "",
            "phone": profile.get("phone") or "",
            "contact_phone": profile.get("phone") or "",
        }
    )


def roster_seat_key(inv: dict) -> str:
    """
    One Add Investors row per (identity + class).

    Prefer Cash Flow Unique profile id so the same email can hold multiple
    book profiles in the same class (e.g. Dayna Christie ROTH + IRA).
    Fall back to person key when profile id is missing.
    """
    profile_id = cell(inv.get("source_profile_id")).lower()
    person = roster_person_key(inv)
    if not profile_id and not person:
        return ""
    klass = cell(inv.get("investor_class_name")).lower()
    head = f"profile:{profile_id}" if profile_id else f"person:{person}"
    return f"{head}|class:{klass}"

def resolve_person_names(inv: dict) -> tuple[str, str]:
    """Prefer explicit first/last; else split profile/display name."""
    first = cell(inv.get("first_name"))
    last = cell(inv.get("last_name"))
    if first or last:
        return first, last
    parts = cell(inv.get("contact_display_name")).split()
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], " ".join(parts[1:])


def build_investor_name(first_name: str = "", last_name: str = "", fallback: str = "") -> str:
    """Concat first + last for investor_name; fall back to display/profile name."""
    joined = " ".join(p for p in (cell(first_name), cell(last_name)) if p).strip()
    return joined or cell(fallback)


def money(v) -> str:
    s = cell(v).replace("$", "").replace(",", "").strip()
    if not s:
        return ""
    try:
        return str(float(s)) if "." in s else str(int(float(s)))
    except ValueError:
        return s


def _normalize_zip_token(raw: str) -> str:
    """Keep lone '-', keep ZIP+4 (12345-6789), normalize en/em dashes."""
    s = str(raw or "").strip()
    if not s:
        return ""
    if s in HYPHEN_PLACEHOLDER:
        return "-"
    s = s.replace("—", "-").replace("–", "-")
    s = re.sub(r"\s*-\s*", "-", s)
    m = re.fullmatch(r"(\d{5})(?:-(\d{4}))?", s)
    if m:
        return f"{m.group(1)}-{m.group(2)}" if m.group(2) else m.group(1)
    # State + ZIP on one token: "CA 92620-7353"
    m2 = re.search(r"\b(\d{5}(?:-\d{4})?)\b", s)
    if m2:
        return m2.group(1)
    return s


def parse_address(raw: str) -> dict[str, str]:
    t = cell_keep_hyphen(raw)
    if not t:
        return {
            "street1": "",
            "street2": "",
            "city": "",
            "state": "",
            "zip": "",
            "country": "",
        }
    if t in HYPHEN_PLACEHOLDER or t == "-":
        return {
            "street1": "",
            "street2": "",
            "city": "",
            "state": "",
            "zip": "-",
            "country": "US",
        }
    parts = [p.strip() for p in t.split(",")]
    if len(parts) >= 5:
        return {
            "street1": parts[0],
            "street2": "",
            "city": parts[1],
            "state": parts[2],
            "zip": _normalize_zip_token(parts[3]),
            "country": parts[4],
        }
    if len(parts) == 4:
        return {
            "street1": parts[0],
            "street2": "",
            "city": parts[1],
            "state": parts[2],
            "zip": _normalize_zip_token(parts[3]),
            "country": "US",
        }
    if len(parts) == 3:
        state_token = parts[2]
        zip_from_state = ""
        state_only = state_token
        m = re.match(r"^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$", state_token)
        if m:
            state_only = m.group(1)
            zip_from_state = m.group(2)
        return {
            "street1": parts[0],
            "street2": "",
            "city": parts[1],
            "state": state_only,
            "zip": _normalize_zip_token(zip_from_state),
            "country": "US",
        }
    return {
        "street1": t,
        "street2": "",
        "city": "",
        "state": "",
        "zip": "",
        "country": "",
    }


def split_other_investor(raw: str) -> tuple[str, str]:
    t = cell(raw)
    if not t:
        return "", ""
    bits = t.split()
    if len(bits) == 1:
        return bits[0], ""
    return bits[0], " ".join(bits[1:])


def map_profile_id(profile_type: str, entity_name: str, ira_acct: str) -> str:
    pt = cell(profile_type).lower()
    if "joint" in pt:
        return "joint_tenancy"
    if "ira" in pt or "401" in pt or cell(ira_acct):
        return "custodian_ira_401k"
    if pt in {"entity", "llc", "trust", "corp", "corporation", "partnership"}:
        return "llc_corp_trust_etc"
    if cell(entity_name) and pt != "individual":
        return "llc_corp_trust_etc"
    if pt == "individual" or not pt:
        return "individual"
    return "llc_corp_trust_etc" if cell(entity_name) else "individual"


def map_distribution_method(raw: str) -> str:
    t = cell(raw).lower()
    if t == "ach":
        return "ach"
    if t == "check":
        return "check"
    if not t:
        return ""
    return "other"


def map_bank_account_type(raw: str) -> str:
    t = cell(raw).lower()
    if "sav" in t:
        return "savings"
    if "check" in t:
        return "checking"
    return t


def map_funding_method(raw: str) -> str:
    t = cell(raw).lower()
    if "wire" in t:
        return "wire_transfer"
    if "ach" in t:
        return "ach"
    if "check" in t:
        return "check"
    return t.replace(" ", "_") if t else ""


def norm_lookup_key(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().lower())


def load_sponsor_email_lookup(members_path: Path) -> dict[str, str]:
    """
    Deal Members Excel → lookup sponsor display name / email → users email.

    Accepts the same template as Upload Hub Deal Members:
      Email | Deal Member Role | Deal Member Name | Deal Member Sponsor Name |
      Deal Member Sponsor Type | First Name | Last Name | Phone | Send Invitation
    """
    if not members_path or not members_path.exists():
        return {}

    wb = openpyxl.load_workbook(members_path, read_only=True, data_only=True)
    try:
        ws = wb.active
        if ws is None:
            return {}

        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            return {}

        headers = [norm_lookup_key(str(h or "")) for h in rows[0]]
        col = {}
        for idx, header in enumerate(headers):
            if not header:
                continue
            if "email" in header and "invitation" not in header:
                col.setdefault("email", idx)
            elif header in {
                "deal member name",
                "deal_member_name",
                "member name",
                "full name",
                "name",
            }:
                col.setdefault("full_name", idx)
            elif header in {
                "deal member sponsor name",
                "deal_member_sponsor_name",
                "sponsor name",
                "sponsor_name",
            }:
                col.setdefault("sponsor_name", idx)
            elif header in {"first name", "first_name"}:
                col.setdefault("first_name", idx)
            elif header in {"last name", "last_name"}:
                col.setdefault("last_name", idx)
            elif "role" in header:
                col.setdefault("role", idx)

        if "email" not in col:
            return {}

        lookup: dict[str, str] = {}
        for row in rows[1:]:
            if not row:
                continue
            email_raw = cell(row[col["email"]]) if col["email"] < len(row) else ""
            email = email_raw.strip().lower()
            if not email or "@" not in email:
                continue

            first = cell(row[col["first_name"]]) if "first_name" in col and col["first_name"] < len(row) else ""
            last = cell(row[col["last_name"]]) if "last_name" in col and col["last_name"] < len(row) else ""
            full = cell(row[col["full_name"]]) if "full_name" in col and col["full_name"] < len(row) else ""
            sponsor = (
                cell(row[col["sponsor_name"]])
                if "sponsor_name" in col and col["sponsor_name"] < len(row)
                else ""
            )

            if not full and (first or last):
                full = f"{first} {last}".strip()

            lookup[norm_lookup_key(email)] = email
            if full:
                lookup[norm_lookup_key(full)] = email
            if sponsor:
                lookup[norm_lookup_key(sponsor)] = email
            if first and last:
                lookup[norm_lookup_key(f"{first} {last}")] = email

        return lookup
    finally:
        wb.close()


def resolve_selected_sponsors(raw: str, lookup: dict[str, str]) -> tuple[str, list[str]]:
    """
    Cash Flow 'Selected sponsors' often has names. Map to emails via Deal Members lookup.
    Returns (resolved cell value, warnings for unresolved tokens).
    """
    text = cell(raw)
    if not text:
        return "", []

    if not lookup:
        return text, []

    warnings: list[str] = []
    resolved: list[str] = []
    for token in re.split(r"[,;/|]+", text):
        part = token.strip()
        if not part:
            continue

        if "@" in part:
            email = part.strip().lower()
            resolved.append(lookup.get(norm_lookup_key(email), email))
            continue

        embedded = re.search(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", part, re.I)
        if embedded:
            email = embedded.group(0).lower()
            resolved.append(lookup.get(norm_lookup_key(email), email))
            continue

        email = lookup.get(norm_lookup_key(part))
        if email:
            resolved.append(email)
        else:
            warnings.append(f"Sponsor name not found in Deal Members Excel: {part}")
            resolved.append(part)

    deduped: list[str] = []
    seen: set[str] = set()
    for item in resolved:
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)

    return ", ".join(deduped), warnings


def fund_approved(status: str) -> str:
    s = cell(status).lower()
    if "fully received" in s or s in {"funded", "approved", "funds received"}:
        return "yes"
    return "no"


def yes_no_disregarded(raw: str) -> str:
    t = cell(raw).lower()
    if t in {"yes", "true", "1", "y"}:
        return "yes"
    if t in {"no", "false", "0", "n"}:
        return "no"
    return ""


def clear_data_rows(ws: Worksheet) -> None:
    if ws.max_row and ws.max_row > 1:
        ws.delete_rows(2, ws.max_row - 1)


def write_row(ws: Worksheet, row_num: int, mapping: dict[str, str], headers: list[str]) -> None:
    for col, h in enumerate(headers, start=1):
        key = h
        base = key.split(" [", 1)[0].strip()
        val = mapping.get(key, mapping.get(base, ""))
        ws.cell(row=row_num, column=col, value=val if val != "" else None)


def load_questionnaire(path: Path) -> dict[str, dict]:
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    if QUESTIONNAIRE_SHEET not in wb.sheetnames:
        wb.close()
        return {}
    ws = wb[QUESTIONNAIRE_SHEET]
    rows = ws.iter_rows(values_only=True)
    try:
        first = [cell(h) for h in next(rows)]
        # Cash Flow often has a group-header row then real column headers.
        if "Unique profile id" in first or "Email address" in first:
            headers = first
        else:
            headers = [cell(h) for h in next(rows)]
    except StopIteration:
        wb.close()
        return {}
    cols = {h: i for i, h in enumerate(headers) if h}

    def g(row, name: str):
        i = cols.get(name)
        return cell(row[i]) if i is not None else ""

    by_pid: dict[str, dict] = {}
    for row in rows:
        if not row or row[0] is None:
            continue
        pid = g(row, "Unique profile id")
        if not pid:
            continue
        q = {
            "first_name": g(row, "Individual first name"),
            "last_name": g(row, "Individual last name"),
            "individual_address": g(row, "Individual address"),
            "entity_address": g(row, "Entity address"),
            "ein": g(row, "EIN"),
            "ssn": g(row, "SSN"),
            "bene_name": g(row, "Beneficial owner name"),
            "entity_name": g(row, "Entity name"),
            "birth_date": g(row, "Birth date"),
            "accreditation_status": g(row, "Accreditation status"),
        }
        existing = by_pid.get(pid)
        if not existing:
            by_pid[pid] = q
        else:
            for k, v in q.items():
                if v and not existing.get(k):
                    existing[k] = v
    wb.close()
    return by_pid


def load_cashflow(path: Path) -> tuple[list[dict], list[dict], list[str]]:
    warnings: list[str] = []
    questionnaire = load_questionnaire(path)
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    if PROFILE_SHEET not in wb.sheetnames:
        wb.close()
        raise ValueError(f"{PROFILE_SHEET} sheet not found.")

    ws = wb[PROFILE_SHEET]
    rows = ws.iter_rows(values_only=True)
    try:
        next(rows)
        headers = [cell(h) for h in next(rows)]
    except StopIteration as exc:
        wb.close()
        raise ValueError("Invalid Cash Flow Portal workbook.") from exc

    cols = {h: i for i, h in enumerate(headers) if h}
    if "Unique profile id" not in cols and "Email address" not in cols:
        wb.close()
        raise ValueError("Invalid Cash Flow Portal workbook.")

    def g(row, name: str):
        i = cols.get(name)
        return cell(row[i]) if i is not None else ""

    def g_addr(row, name: str):
        """Address fields: keep lone '-' so redacted ZIP/address still maps."""
        i = cols.get(name)
        return cell_keep_hyphen(row[i]) if i is not None else ""

    def gm(row, name: str):
        i = cols.get(name)
        return money(row[i]) if i is not None else ""

    def g_pct(row, *names: str) -> str:
        """Cash Flow percent columns → plain percent text (e.g. 30.5)."""
        for name in names:
            raw = g(row, name)
            if not raw or raw in {"-", "—"}:
                continue
            s = raw.replace("%", "").replace(",", "").strip()
            if not s:
                continue
            try:
                n = float(s)
            except ValueError:
                return s
            if 0 < n <= 1:
                n *= 100
            text = f"{n:.6f}".rstrip("0").rstrip(".")
            return text
        return ""

    investments: list[dict] = []
    profiles_by_id: dict[str, dict] = {}
    excel_row = 2

    for row in rows:
        excel_row += 1
        if not row or row[0] is None:
            continue
        pid = g(row, "Unique profile id")
        iid = g(row, "Unique investment id")
        if not pid and not iid:
            continue

        email_raw = g(row, "Email address")
        email = to_contact_email(email_raw)
        if not email_raw or is_placeholder_email(email_raw):
            warnings.append(
                f"Missing/redacted investor email (Row {excel_row}) — kept using name/phone/profile id"
            )

        other = g(row, "Other investor")
        sp_first, sp_last = split_other_investor(other)
        dist = map_distribution_method(g(row, "Distribution method"))
        tax = g_addr(row, "Tax address")
        mail = g_addr(row, "Mailing address")
        check_addr = g_addr(row, "Check mailing address")
        note_parts = [g(row, "Bank distribution note"), g(row, "Bank for further credit")]
        bank_query = " | ".join(p for p in note_parts if p)
        payment_raw = g(row, "Payment method")
        funding_method = map_funding_method(payment_raw)
        if not funding_method:
            warnings.append(f"Missing funding method (Row {excel_row})")

        q = questionnaire.get(pid) or {}
        if not tax:
            tax = q.get("individual_address") or q.get("entity_address") or ""
        if not mail and q.get("individual_address"):
            mail = q.get("individual_address") or ""

        first_name = g(row, "First name") or q.get("first_name") or ""
        last_name = g(row, "Last name") or q.get("last_name") or ""
        phone = g(row, "Phone number") or q.get("phone") or ""

        inv = {
            "source_investment_id": iid,
            "source_profile_id": pid,
            "deal_name": g(row, "Deal name"),
            "contact_email": email,
            "contact_display_name": g(row, "Profile name"),
            "contact_phone": phone,
            "first_name": first_name,
            "last_name": last_name,
            "investor_class_name": g(row, "Class"),
            "profile_id": map_profile_id(
                g(row, "Profile type"),
                g(row, "Entity name") or q.get("entity_name") or "",
                g(row, "IRA account number") or g(row, "Individual IRA number"),
            ),
            "commitment_amount": gm(row, "Invested amount"),
            "funded_amount": gm(row, "Funded amount"),
            "fund_approved": fund_approved(g(row, "Status")),
            "funding_method": funding_method,
            "status": g(row, "Status"),
            "doc_signed_date": g(row, "Document signed on"),
            "received_date": g(row, "Received date"),
            "date_placed": g(row, "Date placed"),
            "selected_sponsors": g(row, "Selected sponsors"),
            "percent_of_class_ownership": g_pct(
                row,
                "Percent of class (by total raised)",
                "Percent of class or bucket (by target raise)",
            ),
            "percent_of_class_distributions": g_pct(
                row,
                "Percent of class or bucket (by target raise)",
                "Percent of class (by total raised)",
            ),
            "entity_ownership_percent": g_pct(row, "Ownership percentage"),
            "distribution_allocation_percent": g_pct(row, "Ownership percentage"),
            "accreditation_status": q.get("accreditation_status")
            or g(row, "Accreditation status")
            or "",
            "birth_date": q.get("birth_date") or g(row, "Birth date") or "",
        }
        investments.append(inv)

        ssn = g(row, "SSN") or q.get("ssn") or ""
        ein = g(row, "EIN") or q.get("ein") or ""
        entity_name = g(row, "Entity name") or q.get("entity_name") or ""
        bene_name = g(row, "Beneficial owner name") or q.get("bene_name") or ""

        prof = {
            "source_profile_id": pid,
            "user_email": email,
            "profile_name": g(row, "Profile name"),
            "profile_type": g(row, "Profile type"),
            "added_by": "etl",
            "is_draft": "no",
            "first_name": first_name,
            "middle_name": "",
            "last_name": last_name,
            "email1": email,
            "phone": phone,
            "ssn": ssn,
            "spouse_first_name": sp_first,
            "spouse_last_name": sp_last,
            "spouse_email": g(row, "Other investor's email address"),
            "spouse_ssn": g(row, "Spouse SSN"),
            "entity_legal_name": entity_name,
            "entity_sub_type": g(row, "Profile type") if entity_name else "",
            "entity_ein": ein,
            "federal_tax_classification": g(row, "Federal tax classification"),
            "llc_tax_classification": g(row, "LLC tax classification"),
            "entity_disregarded": yes_no_disregarded(g(row, "Is disregarded entity")),
            "entity_member_count": g(row, "Number of members"),
            "ira_account_number": g(row, "IRA account number"),
            "individual_ira_number": g(row, "Individual IRA number"),
            "custodian_ira": "yes"
            if (g(row, "IRA account number") or g(row, "Individual IRA number"))
            else "",
            "legal_ira_name": entity_name
            if (g(row, "IRA account number") or g(row, "Individual IRA number"))
            else "",
            "ira_company": "",
            "distribution_method": dist,
            "ach_bank_name": g(row, "Bank name"),
            "ach_bank_account_type": map_bank_account_type(g(row, "Bank account type")),
            "ach_routing_number": re.sub(r"\D", "", g(row, "Bank routing number"))[:9],
            "ach_account_number": g(row, "Account number"),
            "ach_bank_address": "",
            "bank_account_query": bank_query,
            "check_payee_name": g(row, "Profile name") if dist == "check" else "",
            "tax_raw": tax,
            "mail_raw": mail,
            "check_raw": check_addr,
            "bene_name": bene_name,
            "bene_tax_id": g(row, "Beneficial owner Tax ID"),
            "deal_name": g(row, "Deal name"),
            "investor_class_name": g(row, "Class"),
            "mailing_address_mode": "same_as_tax"
            if tax and mail and tax == mail
            else ("add_new" if mail else "same_as_tax"),
            "birth_date": q.get("birth_date") or "",
            "accreditation_status": q.get("accreditation_status")
            or g(row, "Accreditation status")
            or "",
        }

        existing = profiles_by_id.get(pid) if pid else None
        if pid and not existing:
            profiles_by_id[pid] = prof
        elif pid and existing:
            for k, v in prof.items():
                if v and not existing.get(k):
                    existing[k] = v

    wb.close()
    return list(profiles_by_id.values()), investments, warnings


def fill_profile_workbook(template: Path, profiles: list[dict], out: Path) -> dict:
    wb = openpyxl.load_workbook(template)
    ws_p = wb["Profiles"]
    ws_a = wb["Addresses"]
    ws_b = wb["Beneficiaries"]
    ensure_column(
        ws_p,
        "source_profile_id [Unique profile id]",
        after_header_prefix="user_id",
    )
    ensure_column(
        ws_p,
        "accreditation_status [Accreditation status]",
        after_header_prefix="profile_type",
    )
    ensure_column(
        ws_p,
        "birth_date [Birth date]",
        after_header_prefix="accreditation_status",
    )
    ensure_column(
        ws_a,
        "source_profile_id [Unique profile id]",
        after_header_prefix="user_id",
    )
    ensure_column(
        ws_a,
        "address_key [Unique profile id + role]",
        after_header_prefix="archived",
    )
    ensure_column(
        ws_b,
        "source_profile_id [Unique profile id]",
        after_header_prefix="user_id",
    )
    ensure_column(
        ws_b,
        "beneficiary_key [Unique profile id + bene]",
        after_header_prefix="link_to_profile",
    )
    clear_data_rows(ws_p)
    clear_data_rows(ws_a)
    clear_data_rows(ws_b)

    p_headers = [cell(c.value) for c in ws_p[1]]
    a_headers = [cell(c.value) for c in ws_a[1]]
    b_headers = [cell(c.value) for c in ws_b[1]]

    addr_row = 2
    bene_row = 2
    addr_count = 0
    bene_count = 0

    for i, p in enumerate(profiles, start=2):
        pid = p["source_profile_id"]
        tax_key = f"{pid}_tax" if p.get("tax_raw") else ""
        mail_key = (
            tax_key
            if p.get("mailing_address_mode") == "same_as_tax" and tax_key
            else (f"{pid}_mail" if p.get("mail_raw") else "")
        )
        check_key = f"{pid}_check" if p.get("check_raw") else ""
        bene_key = f"{pid}_bene" if p.get("bene_name") else ""

        write_row(
            ws_p,
            i,
            {
                **p,
                "tax_address_key": tax_key,
                "mailing_address_key": mail_key,
                "check_mailing_address_key": check_key,
                "beneficiary_key": bene_key,
                "user_id": "",
            },
            p_headers,
        )

        display = p.get("profile_name") or p.get("entity_legal_name") or ""
        for role, raw, key in [
            ("tax", p.get("tax_raw") or "", tax_key),
            ("mailing", p.get("mail_raw") or "", mail_key),
            ("check_mailing", p.get("check_raw") or "", check_key),
        ]:
            if not raw:
                continue
            if (
                role == "mailing"
                and p.get("mailing_address_mode") == "same_as_tax"
                and p.get("tax_raw") == raw
            ):
                continue
            parsed = parse_address(raw)
            write_row(
                ws_a,
                addr_row,
                {
                    "user_email": p.get("user_email") or "",
                    "user_id": "",
                    "source_profile_id": pid,
                    "address_role": role,
                    "source_raw_address": raw,
                    "full_name_or_company": display,
                    **parsed,
                    "check_memo": "",
                    "distribution_note": "",
                    "archived": "no",
                    "address_key": key,
                },
                a_headers,
            )
            addr_row += 1
            addr_count += 1

        if p.get("bene_name"):
            write_row(
                ws_b,
                bene_row,
                {
                    "user_email": p.get("user_email") or "",
                    "user_id": "",
                    "source_profile_id": pid,
                    "source_field_note": "Cash Flow Beneficial owner",
                    "full_name": p.get("bene_name") or "",
                    "relationship": "beneficial_owner",
                    "tax_id": p.get("bene_tax_id") or "",
                    "phone": "",
                    "email": "",
                    "address_query": "",
                    "archived": "no",
                    "link_to_profile": "yes",
                    "beneficiary_key": bene_key,
                },
                b_headers,
            )
            bene_row += 1
            bene_count += 1

    wb.save(out)
    wb.close()
    return {
        "profiles": len(profiles),
        "addresses": addr_count,
        "beneficiaries": bene_count,
        "out": str(out),
    }


def ensure_column(ws: Worksheet, header: str, after_header_prefix: str | None = None) -> None:
    headers = [cell(c.value) for c in ws[1]]
    if any(h.startswith(header.split(" [")[0]) for h in headers if h):
        return
    insert_at = len(headers) + 1
    if after_header_prefix:
        for i, h in enumerate(headers, start=1):
            if h.startswith(after_header_prefix):
                insert_at = i + 1
                break
    ws.insert_cols(insert_at)
    ws.cell(1, insert_at, value=header)


def fill_add_investor_workbook(
    template: Path,
    profiles: list[dict],
    investments: list[dict],
    out: Path,
    sponsor_lookup: dict[str, str] | None = None,
) -> dict:
    wb = openpyxl.load_workbook(template)
    ws_ai = wb["Add Investors"]
    ws_inv = wb["Investments"]
    ensure_column(
        ws_ai,
        "contact_display_name [Profile name]",
        after_header_prefix="contact_id",
    )
    ensure_column(
        ws_ai,
        "first_name [First name]",
        after_header_prefix="contact_display_name",
    )
    ensure_column(
        ws_ai,
        "last_name [Last name]",
        after_header_prefix="first_name",
    )
    ensure_column(
        ws_ai,
        "contact_phone [Phone number]",
        after_header_prefix="last_name",
    )
    ensure_column(
        ws_ai,
        "investor_name [First + Last name]",
        after_header_prefix="contact_phone",
    )
    ensure_column(
        ws_ai,
        "source_profile_id [Unique profile id]",
        after_header_prefix="investor_name",
    )
    ensure_column(
        ws_ai,
        "selected_sponsors [Selected sponsors]",
        after_header_prefix="send_invitation_mail",
    )
    ensure_column(
        ws_ai,
        "percent_of_class_ownership [Percent of class (by total raised)]",
        after_header_prefix="committed_amount_hint",
    )
    ensure_column(
        ws_ai,
        "percent_of_class_distributions [Percent of class or bucket (by target raise)]",
        after_header_prefix="percent_of_class_ownership",
    )
    ensure_column(
        ws_ai,
        "entity_ownership_percent [Ownership percentage]",
        after_header_prefix="percent_of_class_distributions",
    )
    ensure_column(
        ws_ai,
        "distribution_allocation_percent [Ownership percentage]",
        after_header_prefix="entity_ownership_percent",
    )
    ensure_column(
        ws_inv,
        "first_name [First name]",
        after_header_prefix="contact_display_name",
    )
    ensure_column(
        ws_inv,
        "last_name [Last name]",
        after_header_prefix="first_name",
    )
    ensure_column(
        ws_inv,
        "contact_phone [Phone number]",
        after_header_prefix="last_name",
    )
    ensure_column(
        ws_inv,
        "investor_name [First + Last name]",
        after_header_prefix="contact_phone",
    )
    ensure_column(
        ws_inv,
        "accreditation_status [Accreditation status]",
        after_header_prefix="source_profile_id",
    )
    ensure_column(
        ws_inv,
        "source_profile_id [Unique profile id]",
        after_header_prefix="investor_name",
    )
    ensure_column(
        ws_inv,
        "selected_sponsors [Selected sponsors]",
        after_header_prefix="date_placed",
    )
    ensure_column(
        ws_inv,
        "percent_of_class_ownership [Percent of class (by total raised)]",
        after_header_prefix="selected_sponsors",
    )
    ensure_column(
        ws_inv,
        "percent_of_class_distributions [Percent of class or bucket (by target raise)]",
        after_header_prefix="percent_of_class_ownership",
    )
    ensure_column(
        ws_inv,
        "entity_ownership_percent [Ownership percentage]",
        after_header_prefix="percent_of_class_distributions",
    )
    ensure_column(
        ws_inv,
        "distribution_allocation_percent [Ownership percentage]",
        after_header_prefix="entity_ownership_percent",
    )
    clear_data_rows(ws_ai)
    clear_data_rows(ws_inv)

    ai_headers = [cell(c.value) for c in ws_ai[1]]
    inv_headers = [cell(c.value) for c in ws_inv[1]]

    roster_keys: set[tuple[str, str]] = set()
    skipped_duplicates = 0
    ai_row = 2
    for inv in investments:
        email = to_contact_email(inv.get("contact_email") or "")
        deal = inv.get("deal_name") or ""
        first_name, last_name = resolve_person_names(inv)
        investor_name = build_investor_name(
            first_name,
            last_name,
            inv.get("contact_display_name") or "",
        )
        inv_with_names = {
            **inv,
            "contact_email": email,
            "first_name": first_name,
            "last_name": last_name,
            "investor_name": investor_name,
        }
        seat_key = roster_seat_key(inv_with_names)
        if not seat_key:
            skipped_duplicates += 1
            continue
        key = (deal.lower(), seat_key)
        if key in roster_keys:
            skipped_duplicates += 1
            continue
        roster_keys.add(key)
        write_row(
            ws_ai,
            ai_row,
            {
                "deal_name": deal,
                "deal_id": "",
                "contact_email": email,
                "contact_id": "",
                "contact_display_name": inv.get("contact_display_name") or "",
                "first_name": first_name,
                "last_name": last_name,
                "contact_phone": inv.get("contact_phone") or "",
                "investor_name": investor_name,
                "investor_class_name": inv.get("investor_class_name") or "",
                "profile_id": inv.get("profile_id") or "",
                "user_investor_profile_id": "",
                "role": "LP Investor",
                "send_invitation_mail": "no",
                "selected_sponsors": inv.get("selected_sponsors") or "",
                "committed_amount_hint": inv.get("commitment_amount") or "",
                "percent_of_class_ownership": inv.get("percent_of_class_ownership") or "",
                "percent_of_class_distributions": inv.get("percent_of_class_distributions") or "",
                "entity_ownership_percent": inv.get("entity_ownership_percent") or "",
                "distribution_allocation_percent": inv.get("distribution_allocation_percent") or "",
                "source_profile_id": inv.get("source_profile_id") or "",
            },
            ai_headers,
        )
        ai_row += 1

    for i, inv in enumerate(investments, start=2):
        first_name, last_name = resolve_person_names(inv)
        investor_name = build_investor_name(
            first_name,
            last_name,
            inv.get("contact_display_name") or "",
        )
        write_row(
            ws_inv,
            i,
            {
                **inv,
                "contact_email": to_contact_email(inv.get("contact_email") or ""),
                "first_name": first_name,
                "last_name": last_name,
                "contact_phone": inv.get("contact_phone") or "",
                "investor_name": investor_name,
                "deal_id": "",
                "contact_id": "",
                "user_investor_profile_id": "",
                "investor_role": "lp_investors",
                "load_notes": "",
            },
            inv_headers,
        )

    sponsor_warnings: list[str] = []
    lookup = sponsor_lookup or {}

    wb.save(out)
    wb.close()

    # Re-open to apply sponsor email resolution on selected_sponsors columns
    if lookup:
        wb2 = openpyxl.load_workbook(out)
        ws_ai2 = wb2["Add Investors"]
        ws_inv2 = wb2["Investments"]
        ai_headers2 = [cell(c.value) for c in ws_ai2[1]]
        inv_headers2 = [cell(c.value) for c in ws_inv2[1]]

        def col_idx(headers: list[str], prefix: str) -> int | None:
            for i, h in enumerate(headers):
                if h.lower().startswith(prefix.lower()):
                    return i
            return None

        ai_sponsor_col = col_idx(ai_headers2, "selected_sponsors")
        inv_sponsor_col = col_idx(inv_headers2, "selected_sponsors")

        if ai_sponsor_col is not None:
            for r in range(2, ws_ai2.max_row + 1):
                raw = cell(ws_ai2.cell(r, ai_sponsor_col + 1).value)
                resolved, warns = resolve_selected_sponsors(raw, lookup)
                if resolved:
                    ws_ai2.cell(r, ai_sponsor_col + 1).value = resolved
                sponsor_warnings.extend(warns)

        if inv_sponsor_col is not None:
            for r in range(2, ws_inv2.max_row + 1):
                raw = cell(ws_inv2.cell(r, inv_sponsor_col + 1).value)
                resolved, warns = resolve_selected_sponsors(raw, lookup)
                if resolved:
                    ws_inv2.cell(r, inv_sponsor_col + 1).value = resolved
                sponsor_warnings.extend(warns)

        wb2.save(out)
        wb2.close()

    return {
        "add_investors": ai_row - 2,
        "investments": len(investments),
        "skipped_duplicates": skipped_duplicates,
        "sponsor_warnings": sponsor_warnings,
        "out": str(out),
    }


def safe_folder_name(name: str) -> str:
    raw = cell(name) or "Unknown_Deal"
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1f]+', "_", raw)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" .")
    cleaned = cleaned[:120] if cleaned else "Unknown_Deal"
    return cleaned or "Unknown_Deal"


def deal_file_name(deal_name: str, suffix: str) -> str:
    return f"{safe_folder_name(deal_name)}_{suffix}"


def process_workbook(
    input_path: Path,
    out_dir: Path,
    profile_template: Path | None = None,
    investor_template: Path | None = None,
    members_path: Path | None = None,
) -> dict:
    """
    Write mapped files under out_dir/<deal_name>/ for each deal found in the workbook.
    out_dir is expected to be python/mapFolder.
    """
    profile_tpl = profile_template or (TEMPLATES / "Add_Profile.xlsx")
    investor_tpl = investor_template or (TEMPLATES / "Add_Investor_Mapping.xlsx")

    if not input_path.exists():
        raise FileNotFoundError(input_path)
    if not profile_tpl.exists():
        raise FileNotFoundError(profile_tpl)
    if not investor_tpl.exists():
        raise FileNotFoundError(investor_tpl)

    out_dir.mkdir(parents=True, exist_ok=True)

    profiles, investments, warnings = load_cashflow(input_path)
    sponsor_lookup = load_sponsor_email_lookup(members_path) if members_path else {}
    if members_path and members_path.exists() and not sponsor_lookup:
        warnings.append(
            "Deal Members Excel provided but no sponsor name/email rows could be read."
        )

    deal_names = sorted(
        {
            cell(inv.get("deal_name")) or "Unknown_Deal"
            for inv in investments
        }
    )
    if not deal_names:
        deal_names = ["Unknown_Deal"]

    deal_outputs: list[dict] = []
    total_profiles = 0
    total_investments = 0
    total_beneficiaries = 0
    total_addresses = 0
    total_add_investors = 0
    all_warnings = list(warnings)

    for deal_name in deal_names:
        deal_investments = [
            inv
            for inv in investments
            if (cell(inv.get("deal_name")) or "Unknown_Deal") == deal_name
        ]
        profile_ids = {
            cell(inv.get("source_profile_id"))
            for inv in deal_investments
            if cell(inv.get("source_profile_id"))
        }

        # People on this deal (email / name+phone) so we can pull ALL of their
        # book profiles — not only the profile id used on an investment row.
        family_keys: set[str] = set()
        for inv in deal_investments:
            fk = roster_person_family_key(inv)
            if fk:
                family_keys.add(fk)

        deal_profiles_by_id: dict[str, dict] = {}
        for p in profiles:
            pid = cell(p.get("source_profile_id"))
            if not pid:
                continue
            on_deal_investment = pid in profile_ids
            on_deal_name = (cell(p.get("deal_name")) or "Unknown_Deal") == deal_name
            same_person = profile_family_key(p) in family_keys if family_keys else False
            if on_deal_investment or on_deal_name or same_person:
                deal_profiles_by_id[pid] = p

        deal_profiles = list(deal_profiles_by_id.values())

        # If investment rows lack profile ids, keep profiles that mention this deal
        if not deal_profiles and deal_name != "Unknown_Deal":
            deal_profiles = [
                p
                for p in profiles
                if (cell(p.get("deal_name")) or "Unknown_Deal") == deal_name
            ]
        if not deal_profiles and len(deal_names) == 1:
            deal_profiles = profiles

        extra_profiles = max(0, len(deal_profiles) - len(profile_ids))

        folder_name = safe_folder_name(deal_name)
        deal_dir = out_dir / folder_name
        deal_dir.mkdir(parents=True, exist_ok=True)

        profile_file_name = deal_file_name(deal_name, "Add_Profile_FILLED.xlsx")
        investor_file_name = deal_file_name(deal_name, "Add_Investor_Mapping_FILLED.xlsx")
        profile_out = deal_dir / profile_file_name
        investor_out = deal_dir / investor_file_name
        warnings_out = deal_dir / "warnings.txt"

        r1 = fill_profile_workbook(profile_tpl, deal_profiles, profile_out)
        r2 = fill_add_investor_workbook(
            investor_tpl,
            deal_profiles,
            deal_investments,
            investor_out,
            sponsor_lookup=sponsor_lookup,
        )

        deal_warnings: list[str] = []
        if extra_profiles:
            deal_warnings.append(
                f"Included {extra_profiles} extra profile(s) for multi-profile investors"
            )
        if r2.get("skipped_duplicates"):
            deal_warnings.append(
                f"Duplicate investor skipped ({r2['skipped_duplicates']} roster row(s))"
            )
        sponsor_warns = r2.get("sponsor_warnings") or []
        if sponsor_warns:
            unique_sponsor = sorted(set(sponsor_warns))
            deal_warnings.extend(unique_sponsor[:50])
            if len(unique_sponsor) > 50:
                deal_warnings.append(
                    f"... and {len(unique_sponsor) - 50} more sponsor lookup warning(s)"
                )

        if deal_warnings:
            warnings_out.write_text("\n".join(deal_warnings) + "\n", encoding="utf-8")
            all_warnings.extend(deal_warnings)
        elif warnings_out.exists():
            warnings_out.unlink()

        # Also write workbook-level warnings into the first deal folder only once at end
        total_profiles += r1["profiles"]
        total_investments += r2["investments"]
        total_beneficiaries += r1["beneficiaries"]
        total_addresses += r1["addresses"]
        total_add_investors += r2["add_investors"]

        deal_outputs.append(
            {
                "dealName": deal_name,
                "folderName": folder_name,
                "profiles": r1["profiles"],
                "investments": r2["investments"],
                "beneficiaries": r1["beneficiaries"],
                "profileFileName": profile_file_name,
                "mappingFileName": investor_file_name,
                "files": {
                    "profile": str(profile_out),
                    "mapping": str(investor_out),
                    "warnings": str(warnings_out) if deal_warnings else None,
                },
            }
        )

    # Deduplicate warnings
    seen: set[str] = set()
    unique_warnings: list[str] = []
    for w in all_warnings:
        if w in seen:
            continue
        seen.add(w)
        unique_warnings.append(w)

    # Persist combined warnings into each deal folder for visibility
    if unique_warnings:
        for deal in deal_outputs:
            deal_dir = out_dir / deal["folderName"]
            warnings_path = deal_dir / "warnings.txt"
            existing = (
                warnings_path.read_text(encoding="utf-8").splitlines()
                if warnings_path.exists()
                else []
            )
            merged = list(dict.fromkeys([*existing, *unique_warnings]))
            warnings_path.write_text("\n".join(merged) + "\n", encoding="utf-8")
            deal["files"]["warnings"] = str(warnings_path)

    primary = deal_outputs[0] if deal_outputs else None

    return {
        "success": True,
        "sourceFile": input_path.name,
        "summary": {
            "profiles": total_profiles,
            "investments": total_investments,
            "deals": len(deal_outputs),
            "beneficiaries": total_beneficiaries,
            "addresses": total_addresses,
            "addInvestors": total_add_investors,
            "warnings": len(unique_warnings),
        },
        "warnings": unique_warnings,
        "dealFolders": deal_outputs,
        "files": primary["files"] if primary else {},
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Map Cash Flow investments Excel to Profile + Add Investor filled ETL workbooks"
    )
    parser.add_argument("excel", help="Cash Flow Portal investments export (.xlsx)")
    parser.add_argument("--out-dir", required=True, help="Output folder for generated files")
    parser.add_argument("--profile-template", default=str(TEMPLATES / "Add_Profile.xlsx"))
    parser.add_argument("--investor-template", default=str(TEMPLATES / "Add_Investor_Mapping.xlsx"))
    parser.add_argument(
        "--members-file",
        default="",
        help="Deal Members Excel (sponsor name + email) to resolve Selected sponsors → emails",
    )
    parser.add_argument("--json", action="store_true", help="Print JSON result to stdout")
    args = parser.parse_args(argv)

    members_path = Path(args.members_file).expanduser().resolve() if args.members_file else None

    try:
        result = process_workbook(
            Path(args.excel).expanduser().resolve(),
            Path(args.out_dir).expanduser().resolve(),
            Path(args.profile_template),
            Path(args.investor_template),
            members_path=members_path,
        )
    except Exception as e:
        message = str(e)
        if "Investors (profile)" in message and "not found" in message.lower():
            message = "Investors (profile) sheet not found."
        elif isinstance(e, KeyError) and "Investors (profile)" in str(e):
            message = "Investors (profile) sheet not found."
        print(json.dumps({"success": False, "error": message}), file=sys.stderr)
        print("ERROR:", message, file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps(result))
    else:
        print("cashflow", result["sourceFile"])
        print("profiles", result["summary"]["profiles"])
        print("investments", result["summary"]["investments"])
        print("warnings", result["summary"]["warnings"])
        print("wrote", result["files"]["profile"])
        print("wrote", result["files"]["mapping"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
