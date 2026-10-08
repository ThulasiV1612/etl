"""Pydantic models for onboarding field placement and prefill."""

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


SignFlowProfileType = Literal[
    "individual",
    "custodian_ira_401k",
    "joint_tenancy",
    "llc_corp_partnership_trust_solo_checkbook_ira",
]

RecipientRole = Literal["investor", "sponsor"]

FieldType = Literal["signature", "date", "text", "initials"]


class PlacedField(BaseModel):
    type: FieldType
    label: str
    x: float = Field(description="X position as percentage of page width (0-100)")
    y: float = Field(description="Y position as percentage of page height (0-100)")
    width: float
    height: float
    page: int = 1
    recipient_id: str
    recipient_role: RecipientRole = "investor"
    required: bool = True
    profile_type: SignFlowProfileType | None = None
    profile_types: list[SignFlowProfileType] | None = None
    value: str | None = None

    @field_validator("type", mode="before")
    @classmethod
    def normalize_field_type(cls, value: Any) -> str:
        raw = str(value or "text").strip().lower()
        if raw in ("date_signed", "datesigned"):
            return "date"
        if raw in ("initial", "initials"):
            return "initials"
        if raw not in ("signature", "date", "text", "initials"):
            return "text"
        return raw

    @field_validator("recipient_role", mode="before")
    @classmethod
    def normalize_recipient_role(cls, value: Any) -> str:
        raw = str(value or "investor").strip().lower()
        if "sponsor" in raw or "seller" in raw:
            return "sponsor"
        return "investor"

    @field_validator("profile_type", mode="before")
    @classmethod
    def normalize_profile_type(cls, value: Any) -> str | None:
        if value is None or value == "":
            return None
        raw = str(value).strip()
        if raw in (
            "individual",
            "custodian_ira_401k",
            "joint_tenancy",
            "llc_corp_partnership_trust_solo_checkbook_ira",
        ):
            return raw
        if raw in ("llc", "llc_corp_trust_etc", "entity"):
            return "llc_corp_partnership_trust_solo_checkbook_ira"
        return None

    @field_validator("profile_types", mode="before")
    @classmethod
    def normalize_profile_types(cls, value: Any) -> list[str] | None:
        if not value:
            return None
        if not isinstance(value, list):
            return None
        out: list[str] = []
        for item in value:
            mapped = PlacedField.normalize_profile_type(item)
            if mapped and mapped not in out:
                out.append(mapped)
        return out or None


class PlaceFieldsRequest(BaseModel):
    page_count: int = Field(ge=1, description="Total pages in the PDF template")
    pdf_base64: str | None = Field(
        default=None,
        description="Base64-encoded PDF — analyzed to place fields on each page",
    )
    include_questionnaire: bool = False
    includes_w9_appendix: bool = Field(
        default=False,
        description="When true, trailing W-9 pages are skipped (W-9 is pre-filled, no eSign fields)",
    )
    w9_page_count: int = Field(default=0, ge=0)
    template_type: Literal["subscription", "questionnaire_only"] = "subscription"
    investor_recipient_id: str = "rec_investor"
    sponsor_recipient_id: str = "rec_sponsor"
    target_page: int | None = Field(
        default=None,
        description="Deprecated — all pages are analyzed when pdf_base64 is provided",
    )


class PlaceFieldsResponse(BaseModel):
    fields: list[PlacedField]
    layout_version: int = 4


class PrefillContext(BaseModel):
    model_config = {"extra": "ignore"}

    member_display_name: str | None = None
    member_email: str | None = None
    investment_amount: str | None = None
    address_line: str | None = None
    mailing_address_line: str | None = None
    street_line: str | None = None
    street_line_2: str | None = None
    city: str | None = None
    state: str | None = None
    zip: str | None = None
    city_state_zip: str | None = None


class QuestionAnswer(BaseModel):
    question_id: str
    value: str = ""


class PrefillFieldsRequest(BaseModel):
    model_config = {"extra": "ignore"}

    fields: list[PlacedField]
    answers: list[QuestionAnswer] = Field(default_factory=list)
    context: PrefillContext = Field(default_factory=PrefillContext)


class PrefillFieldsResponse(BaseModel):
    fields: list[PlacedField]
    prefilled_count: int


class PlaceAndPrefillRequest(BaseModel):
    placement: PlaceFieldsRequest
    answers: list[QuestionAnswer] = Field(default_factory=list)
    context: PrefillContext = Field(default_factory=PrefillContext)


class PlaceAndPrefillResponse(BaseModel):
    fields: list[PlacedField]
    prefilled_count: int
    layout_version: int = 1
