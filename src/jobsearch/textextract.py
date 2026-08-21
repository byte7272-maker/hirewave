"""Best-effort text extraction from uploaded résumé files.

Text formats are decoded directly; PDF/DOCX use pypdf / python-docx (the
``documents`` extra) and degrade gracefully to ``""`` if the libraries are
absent or the file can't be parsed — callers fall back to the structured
profile. The extracted text feeds the ATS preview and interview prep.
"""

from __future__ import annotations

import io

_TEXT_EXTS = {"txt", "md", "markdown"}


def _ext(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def extract_text(data: bytes, *, filename: str = "", content_type: str = "") -> str:
    ext = _ext(filename)
    if ext in _TEXT_EXTS or content_type.startswith("text/"):
        return data.decode("utf-8", errors="replace")

    if ext == "pdf" or content_type == "application/pdf":
        try:
            import pypdf

            reader = pypdf.PdfReader(io.BytesIO(data))
            return "\n".join((page.extract_text() or "") for page in reader.pages).strip()
        except Exception:  # noqa: BLE001 - missing lib or unparseable file
            return ""

    if ext in {"docx"} or content_type.endswith("wordprocessingml.document"):
        try:
            import docx

            document = docx.Document(io.BytesIO(data))
            return "\n".join(p.text for p in document.paragraphs).strip()
        except Exception:  # noqa: BLE001
            return ""

    # Unknown binary format — try a lenient decode, else give up.
    try:
        text = data.decode("utf-8")
        return text if text.isprintable() or "\n" in text else ""
    except UnicodeDecodeError:
        return ""
