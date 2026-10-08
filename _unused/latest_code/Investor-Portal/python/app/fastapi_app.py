"""FastAPI application — primary onboarding fields API."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.wsgi import WSGIMiddleware

from app.config import settings
from app.flask_app import create_flask_app
from app.models import (
    PlaceAndPrefillRequest,
    PlaceAndPrefillResponse,
    PlaceFieldsRequest,
    PlaceFieldsResponse,
    PrefillFieldsRequest,
    PrefillFieldsResponse,
)
from app.services.field_placement import place_onboarding_fields
from app.services.field_prefill import prefill_fields

fastapi_app = FastAPI(
    title="Investor Portal Onboarding Fields Service",
    description="Auto-place and auto-populate eSign fields for investor and sponsor onboarding",
    version="1.0.0",
)

fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Flask at /flask for secondary routes
fastapi_app.mount("/flask", WSGIMiddleware(create_flask_app()))


@fastapi_app.get("/api/v1/health")
def health() -> dict:
    return {"status": "ok", "service": "onboarding-fields", "frameworks": ["fastapi", "flask"]}


@fastapi_app.post("/api/v1/fields/place", response_model=PlaceFieldsResponse)
def place_fields(request: PlaceFieldsRequest) -> PlaceFieldsResponse:
    """Auto-place investor and sponsor fields — no manual editor placement needed."""
    fields = place_onboarding_fields(request)
    return PlaceFieldsResponse(fields=fields)


@fastapi_app.post("/api/v1/fields/prefill", response_model=PrefillFieldsResponse)
def prefill_field_values(request: PrefillFieldsRequest) -> PrefillFieldsResponse:
    """Auto-populate field values from investor questionnaire and profile data."""
    fields, count = prefill_fields(request.fields, request.answers, request.context)
    return PrefillFieldsResponse(fields=fields, prefilled_count=count)


@fastapi_app.post("/api/v1/fields/place-and-prefill", response_model=PlaceAndPrefillResponse)
def place_and_prefill(request: PlaceAndPrefillRequest) -> PlaceAndPrefillResponse:
    """Place fields and prefill data in one call for investor onboarding."""
    placed = place_onboarding_fields(request.placement)
    fields, count = prefill_fields(placed, request.answers, request.context)
    return PlaceAndPrefillResponse(fields=fields, prefilled_count=count)
