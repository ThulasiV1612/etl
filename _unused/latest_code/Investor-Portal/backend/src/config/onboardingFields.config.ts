/**
 * Python onboarding fields microservice (FastAPI + Flask).
 * Auto-places eSign fields for sponsors and auto-populates investor data.
 */

export function getOnboardingFieldsServiceUrl(): string | null {
  const raw =
    process.env.ONBOARDING_FIELDS_SERVICE_URL?.trim() ||
    process.env.PYTHON_ONBOARDING_SERVICE_URL?.trim() ||
    "";
  return raw || null;
}

export function isOnboardingFieldsServiceConfigured(): boolean {
  return Boolean(getOnboardingFieldsServiceUrl());
}
