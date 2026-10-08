"""Flask application — status and legacy-compatible routes."""

from flask import Flask, jsonify


def create_flask_app() -> Flask:
    app = Flask(__name__)

    @app.get("/status")
    def status():
        return jsonify(
            {
                "status": "ok",
                "service": "onboarding-fields-flask",
                "message": "Fields are auto-placed for sponsors; data is auto-populated for investors",
            }
        )

    @app.get("/field-types")
    def field_types():
        return jsonify(
            {
                "investor": [
                    "signature",
                    "date",
                    "text",
                    "initials",
                ],
                "sponsor": [
                    "signature",
                    "date",
                    "text",
                ],
                "auto_populated_labels": [
                    "First Name",
                    "Last Name",
                    "Email",
                    "Phone",
                    "Address",
                    "SSN",
                    "Investment Amount",
                    "Print Name",
                    "Entity Legal Name",
                ],
            }
        )

    return app
