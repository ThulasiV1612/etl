# Investor Portal — Onboarding Fields Service (Python)

Auto-places eSign fields for **sponsors** and auto-populates field data for **investors** during onboarding. Uses **FastAPI** (primary API) and **Flask** (mounted at `/flask`).

## Setup (venv)

```powershell
cd python
python -m venv venv
.\venv\Scripts\pip install -r requirements.txt
```

Or run `.\setup.ps1` on Windows.

## Run

**Windows (recommended — always uses the venv):**

```powershell
.\venv\Scripts\python run.py
```

Or double-click / run:

```cmd
run.bat
```

> Do **not** use plain `python run.py` after `activate` unless `where python` shows the venv path first. Otherwise Windows may use system Python (which does not have the installed packages).

Service listens on **http://localhost:5008** by default.

## Configure Node backend

Add to `backend/.env`:

```
ONBOARDING_FIELDS_SERVICE_URL=http://localhost:5008
```

When set, the Express API will:

1. **Auto-place** investor + sponsor fields when a SignFlow eSign template draft is created (no manual field placement in the editor).
2. **Auto-populate** investor questionnaire/profile data into fields at e-sign send time.

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/health` | Health check |
| POST | `/api/v1/fields/place` | Auto-place sponsor + investor fields |
| POST | `/api/v1/fields/prefill` | Auto-populate field values from questionnaire |
| POST | `/api/v1/fields/place-and-prefill` | Combined placement + prefill |
| GET | `/flask/status` | Flask status route |
| GET | `/flask/field-types` | Supported field types |

## Example: place fields

```json
POST /api/v1/fields/place
{
  "page_count": 12,
  "include_questionnaire": true,
  "template_type": "subscription"
}
```

## Example: prefill investor data

```json
POST /api/v1/fields/prefill
{
  "fields": [...],
  "answers": [
    { "question_id": "first_name", "value": "Jane" },
    { "question_id": "last_name", "value": "Doe" },
    { "question_id": "social_security_number", "value": "123456789" }
  ],
  "context": {
    "member_email": "jane@example.com",
    "investment_amount": "50000"
  }
}
```
