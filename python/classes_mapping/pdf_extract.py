"""Extract text from Cash Flow classes PDF (text layer or OCR)."""

from __future__ import annotations

import re
import shutil
from pathlib import Path

import fitz

OCR_MIN_CHARS = 80


def render_pdf_pages(pdf: Path, pages_dir: Path, *, scale: float = 2.5) -> list[Path]:
    pages_dir.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(pdf)
    images: list[Path] = []
    matrix = fitz.Matrix(scale, scale)
    for i, page in enumerate(doc):
        out = pages_dir / f"page_{i + 1}.png"
        page.get_pixmap(matrix=matrix).save(str(out))
        images.append(out)
    doc.close()
    return images


def extract_text_layer(pdf: Path) -> str:
    doc = fitz.open(pdf)
    chunks: list[str] = []
    for page in doc:
        chunks.append(page.get_text("text") or "")
    doc.close()
    return "\n".join(chunks).strip()


def ocr_tesseract(image: Path) -> str:
    import pytesseract
    from PIL import Image

    tess = shutil.which("tesseract")
    if not tess:
        for candidate in (
            r"C:\Program Files\Tesseract-OCR\tesseract.exe",
            r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        ):
            if Path(candidate).exists():
                tess = candidate
                break
    if not tess:
        raise RuntimeError(
            "tesseract binary not found on PATH. "
            "Install Tesseract OCR (UB-Mannheim) or upload a PDF with a text layer "
            "(not a screenshot)."
        )
    pytesseract.pytesseract.tesseract_cmd = tess
    return pytesseract.image_to_string(Image.open(image))


def ocr_rapid(image: Path) -> str:
    """Pip-only OCR fallback when system Tesseract is unavailable."""
    from rapidocr_onnxruntime import RapidOCR

    engine = RapidOCR()
    result, _ = engine(str(image))
    if not result:
        return ""
    # Each row: [box, text, score]
    lines = [str(row[1]).strip() for row in result if row and len(row) > 1 and row[1]]
    return "\n".join(lines).strip()


def ocr_images(images: list[Path]) -> str:
    chunks: list[str] = []
    last_error: Exception | None = None
    use_rapid = not (
        shutil.which("tesseract")
        or Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe").exists()
        or Path(r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe").exists()
    )

    for image in images:
        try:
            if use_rapid:
                chunks.append(ocr_rapid(image))
            else:
                chunks.append(ocr_tesseract(image))
        except Exception as e:
            last_error = e
            # If tesseract path fails mid-run, try RapidOCR once
            try:
                chunks.append(ocr_rapid(image))
            except Exception as e2:
                last_error = e2
    text = "\n".join(chunks).strip()
    if not text and last_error:
        raise last_error
    return text


def extract_pdf_text(pdf: Path, work_dir: Path) -> tuple[str, list[Path], str]:
    """
    Returns (text, page_images, method).
    method: text_layer | ocr | none
    """
    text = extract_text_layer(pdf)
    if len(text) >= OCR_MIN_CHARS:
        return text, [], "text_layer"

    pages_dir = work_dir / "_pages"
    images = render_pdf_pages(pdf, pages_dir)
    try:
        ocr_text = ocr_images(images)
    except Exception:
        return "", images, "none"

    if len(ocr_text) >= OCR_MIN_CHARS:
        return ocr_text, images, "ocr"
    return ocr_text, images, "none"


def normalize_text(text: str) -> str:
    text = text.replace("\r", "\n")
    text = text.replace("—", "-").replace("–", "-").replace("−", "-")
    # Common OCR typos for Cash Flow class screenshots
    text = re.sub(r"\bApartnents\b", "Apartments", text, flags=re.IGNORECASE)
    text = re.sub(r"\bLmlted\b", "Limited", text, flags=re.IGNORECASE)
    text = re.sub(r"\bLimsited\b", "Limited", text, flags=re.IGNORECASE)
    text = re.sub(r"Class\s+([A-Z]\d?\+?)\s*-\s*(?=Limited|LP|General)", r"Class \1 - ", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()
