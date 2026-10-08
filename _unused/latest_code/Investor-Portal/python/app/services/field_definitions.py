"""Standard field definitions for investor and sponsor onboarding documents."""

from dataclasses import dataclass
from typing import Literal

FieldKind = Literal["signature", "date", "text", "initials"]


@dataclass(frozen=True)
class FieldSpec:
    label: str
    field_type: FieldKind
    width_px: float
    height_px: float
    required: bool = True
    profile_types: tuple[str, ...] | None = None


LETTER_WIDTH = 612.0
LETTER_HEIGHT = 792.0

# Subscription document — sponsor signing block (last page, bottom area)
SPONSOR_SIGNATURE_FIELDS: tuple[FieldSpec, ...] = (
    FieldSpec("Sponsor Signature", "signature", 220, 44, True),
    FieldSpec("Sponsor Date", "date", 140, 22, True),
    FieldSpec("Sponsor Print Name", "text", 280, 22, True),
)

# Subscription document — investor signing block (last page, below sponsor)
INVESTOR_SIGNATURE_FIELDS: tuple[FieldSpec, ...] = (
    FieldSpec("Investor Signature", "signature", 220, 44, True),
    FieldSpec("Date Signed", "date", 140, 22, True),
    FieldSpec("Print Name", "text", 280, 22, True),
)

# Labels placed by this service on subscription pages (used when replacing stale fields)
AUTO_PLACED_SUBSCRIPTION_LABELS: frozenset[str] = frozenset(
    f.label.lower() for f in (*SPONSOR_SIGNATURE_FIELDS, *INVESTOR_SIGNATURE_FIELDS)
) | frozenset(
    {
        "sponsor title",
        "print title (if applicable)",
        "first name",
        "last name",
        "email",
        "phone",
        "address",
        "ssn",
        "investment amount",
        "entity legal name",
        "entity name",
        "authorized signature",
        "date",
    }
)

# Maps normalized field label → questionnaire question id (prefill at send time)
FIELD_KEY_TO_QUESTION_ID: dict[str, str] = {
    "first name": "first_name",
    "last name": "last_name",
    "telephone": "telephone",
    "phone": "telephone",
    "phone number": "telephone",
    "address": "address",
    "mailing address": "address",
    "ssn": "social_security_number",
    "tin": "social_security_number",
    "social security number": "social_security_number",
    "birth date": "birth_date",
    "date of birth": "birth_date",
    "entity legal name": "entity_full_legal_name",
    "entity name": "entity_full_legal_name",
    "email": "email",
    "email address": "email",
    "investment amount": "investment_amount",
    "commitment amount": "investment_amount",
    "amount": "investment_amount",
}

COMPUTED_FULL_NAME_KEYS = frozenset(
    {
        "print name",
        "fullname1",
        "full name",
        "investor name",
        "name",
        "subscriber name",
        "signer name",
        "sponsor print name",
    }
)

COMPUTED_DATE_KEYS = frozenset(
    {"date", "datesigned1", "date signed", "signed date", "sponsor date"}
)

COMPUTED_TITLE_KEYS = frozenset(
    {
        "print title (if applicable)",
        "print title",
        "title1",
        "title",
        "authorized title",
        "sponsor title",
    }
)
