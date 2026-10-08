"""
Cash Flow classes PDF → Class_Mapping_FILLED.xlsx

Writes output under mapFolder/<deal_name>/.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from class_workbook import DealClasses, write_blank_template, write_workbook
from parse_cashflow_classes import parse_cashflow_classes_text, find_expected_class_count
from pdf_extract import extract_pdf_text, normalize_text

HERE = Path(__file__).resolve().parent
TEMPLATES = HERE / "templates"
TEMPLATE_BLANK = TEMPLATES / "Class_Mapping.xlsx"
OUT_FILLED = "Class_Mapping_FILLED.xlsx"
OUT_JSON = "parsed_classes.json"
OUT_TEXT = "extracted_text.txt"
OUT_WARNINGS = "warnings.txt"


def safe_folder_name(name: str) -> str:
    raw = str(name or "").strip() or "Unknown_Deal"
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1f]+', "_", raw)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" .")
    cleaned = cleaned[:120] if cleaned else "Unknown_Deal"
    return cleaned or "Unknown_Deal"


def ensure_templates() -> None:
    TEMPLATES.mkdir(parents=True, exist_ok=True)
    if not TEMPLATE_BLANK.exists():
        write_blank_template(TEMPLATE_BLANK)


def write_json(data: DealClasses, path: Path) -> None:
    path.write_text(json.dumps(data.to_dict(), indent=2), encoding="utf-8")


def load_json(path: Path) -> DealClasses:
    return DealClasses.from_dict(json.loads(path.read_text(encoding="utf-8")))


def process_pdf(pdf: Path, work_dir: Path, *, deal_name: str = "") -> tuple[DealClasses, list[str]]:
    warnings: list[str] = []
    text, images, method = extract_pdf_text(pdf, work_dir)
    text = normalize_text(text)
    text_path = work_dir / OUT_TEXT
    text_path.write_text(text, encoding="utf-8")

    if method == "none" or len(text) < 40:
        skeleton = DealClasses(deal_name=deal_name or pdf.stem.replace("_", " "))
        write_json(skeleton, work_dir / OUT_JSON)
        raise RuntimeError(
            "Could not extract enough text from the PDF. "
            "Install Tesseract OCR or provide a PDF with a text layer."
        )

    if method == "ocr":
        warnings.append("PDF text was extracted via OCR.")
    if images:
        warnings.append(f"Rendered {len(images)} page image(s) for extraction.")

    data = parse_cashflow_classes_text(text, deal_name=deal_name)
    if not data.deal_name:
        data.deal_name = deal_name or pdf.stem.replace("_", " ")

    expected_classes = find_expected_class_count(text.splitlines())
    if expected_classes is not None and len(data.classes) < expected_classes:
        warnings.append(
            f"PDF header shows {expected_classes} classes but only "
            f"{len(data.classes)} were parsed — review Class_Mapping_FILLED.xlsx."
        )
    elif len(data.classes) == 0:
        warnings.append(
            "No class card headers were detected in the PDF text. "
            "Try a clearer screenshot or export a text PDF from Cash Flow."
        )

    write_json(data, work_dir / OUT_JSON)
    return data, warnings


def process_workbook(
    input_path: Path | None = None,
    out_dir: Path | None = None,
    *,
    from_json: Path | None = None,
    deal_name: str = "",
) -> dict:
    """Write Class_Mapping_FILLED.xlsx under out_dir/<deal_name>/."""
    ensure_templates()
    if out_dir is None:
        raise ValueError("--out-dir is required")
    map_root = Path(out_dir).expanduser().resolve()
    map_root.mkdir(parents=True, exist_ok=True)

    warnings: list[str] = []
    source_name = ""
    work_dir = map_root / "_work"
    work_dir.mkdir(parents=True, exist_ok=True)

    if from_json:
        json_path = Path(from_json).expanduser().resolve()
        if not json_path.exists():
            raise FileNotFoundError(json_path)
        data = load_json(json_path)
        source_name = json_path.name
    else:
        if input_path is None:
            raise ValueError("Please upload a PDF (.pdf) file.")
        pdf = Path(input_path).expanduser().resolve()
        if not pdf.exists():
            raise FileNotFoundError(pdf)
        if pdf.suffix.lower() != ".pdf":
            raise ValueError("Please upload a PDF (.pdf) file.")
        source_name = pdf.name
        data, warnings = process_pdf(pdf, work_dir, deal_name=deal_name)

    if not data.classes:
        raise RuntimeError(
            "No classes parsed from the PDF. Please review the uploaded file."
        )

    folder_name = safe_folder_name(data.deal_name or deal_name or Path(source_name).stem)
    deal_dir = map_root / folder_name
    deal_dir.mkdir(parents=True, exist_ok=True)

    out_xlsx = deal_dir / OUT_FILLED
    write_workbook(data, out_xlsx, with_data=True)

    parsed_json = deal_dir / OUT_JSON
    write_json(data, parsed_json)

    seen: set[str] = set()
    unique_warnings: list[str] = []
    for w in warnings:
        if w in seen:
            continue
        seen.add(w)
        unique_warnings.append(w)

    warnings_path = deal_dir / OUT_WARNINGS
    if unique_warnings:
        warnings_path.write_text("\n".join(unique_warnings) + "\n", encoding="utf-8")
    elif warnings_path.exists():
        warnings_path.unlink()

    return {
        "success": True,
        "sourceFile": source_name,
        "summary": {
            "dealName": data.deal_name or folder_name,
            "classes": len(data.classes),
            "hurdles": len(data.hurdles),
            "finalTiers": len(data.final_tiers),
            "targetRaise": data.deal_target_raise or "",
            "warnings": len(unique_warnings),
        },
        "warnings": unique_warnings,
        "dealFolders": [
            {
                "dealName": data.deal_name or folder_name,
                "folderName": folder_name,
                "files": {
                    "mapping": str(out_xlsx),
                    "parsedJson": str(parsed_json),
                    "warnings": str(warnings_path) if unique_warnings else None,
                },
            }
        ],
        "files": {
            "mapping": str(out_xlsx),
            "parsedJson": str(parsed_json),
            "warnings": str(warnings_path) if unique_warnings else None,
        },
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Map Cash Flow classes PDF to Class_Mapping_FILLED.xlsx"
    )
    parser.add_argument("pdf", nargs="?", help="Classes PDF from Cash Flow")
    parser.add_argument("--from-json", help="Skip PDF parsing; build Excel from JSON")
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--deal-name", default="")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)

    try:
        result = process_workbook(
            Path(args.pdf) if args.pdf else None,
            Path(args.out_dir),
            from_json=Path(args.from_json) if args.from_json else None,
            deal_name=args.deal_name,
        )
    except Exception as e:
        message = str(e)
        if "Please upload a PDF" in message:
            pass
        elif "No classes parsed" in message:
            message = "No classes parsed from the PDF. Please review the uploaded file."
        elif "Could not extract" in message:
            message = "Could not extract text from the PDF. Please review the uploaded file."
        print(json.dumps({"success": False, "error": message}), file=sys.stderr)
        print("ERROR:", message, file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps(result))
    else:
        summary = result["summary"]
        print("deal", summary["dealName"])
        print("classes", summary["classes"], "hurdles", summary["hurdles"])
        print("wrote", result["files"]["mapping"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
