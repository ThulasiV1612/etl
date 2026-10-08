"""Auto-place eSign fields adjacent to detected PDF labels only."""

from app.models import PlaceFieldsRequest, PlacedField
from app.services.pdf_page_analyzer import analyze_pdf_base64


def _pct(value: float, total: float) -> float:
    if total <= 0:
        return 0.0
    return round((value / total) * 100, 4)


def _recipient_for_role(
    role: str,
    request: PlaceFieldsRequest,
) -> tuple[str, str]:
    if role == "sponsor":
        return request.sponsor_recipient_id, "sponsor"
    return request.investor_recipient_id, "investor"


def _anchor_to_field(
    anchor,
    request: PlaceFieldsRequest,
) -> PlacedField:
    role = anchor.role
    if role == "neutral":
        role = "investor"
    recipient_id, recipient_role = _recipient_for_role(role, request)

    return PlacedField(
        type=anchor.kind,  # type: ignore[arg-type]
        label=anchor.label,
        x=_pct(anchor.x, anchor.page_width),
        y=_pct(anchor.y, anchor.page_height),
        width=_pct(anchor.width, anchor.page_width),
        height=_pct(anchor.height, anchor.page_height),
        page=anchor.page,
        recipient_id=recipient_id,
        recipient_role=recipient_role,  # type: ignore[arg-type]
        required=anchor.kind in ("signature", "date", "initials")
        or anchor.label
        in ("First Name", "Last Name", "Email", "Phone", "Address", "Investment Amount"),
    )


def _dedupe_fields(fields: list[PlacedField]) -> list[PlacedField]:
    seen: set[str] = set()
    out: list[PlacedField] = []
    for field in fields:
        key = (
            f"{field.page}|{field.label.lower()}|{field.recipient_id}|"
            f"{round(field.x)}|{round(field.y)}"
        )
        if key in seen:
            continue
        seen.add(key)
        out.append(field)
    return out


def place_onboarding_fields(request: PlaceFieldsRequest) -> list[PlacedField]:
    """
    Read each page of the document and place fields only on detected blanks/rules.
    Skips questionnaire page (Node-managed) and W-9 appendix (pre-filled, no fields).
    """
    if request.template_type == "questionnaire_only":
        return []

    page_analyses = analyze_pdf_base64(
        request.pdf_base64,
        page_count=request.page_count,
        include_questionnaire=request.include_questionnaire,
        includes_w9_appendix=request.includes_w9_appendix,
        w9_page_count=request.w9_page_count,
    )

    fields: list[PlacedField] = []
    for analysis in page_analyses:
        if analysis.is_w9_page or analysis.is_questionnaire_page:
            continue
        for anchor in analysis.anchors:
            fields.append(_anchor_to_field(anchor, request))

    return _dedupe_fields(fields)
