"""Parse uploaded documents into plain text."""

from __future__ import annotations

import io
from typing import Tuple


def parse_bytes(content: bytes, ext: str, filename: str = "") -> str:
    ext = (ext or "").upper().lstrip(".")
    if not ext and filename:
        ext = filename.rsplit(".", 1)[-1].upper()

    if ext == "PDF":
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(content))
        pages = [p.extract_text() or "" for p in reader.pages]
        return "\n\n".join(pages).strip()

    if ext == "DOCX":
        from docx import Document

        doc = Document(io.BytesIO(content))
        return "\n\n".join(p.text for p in doc.paragraphs if p.text).strip()

    # TXT / MD / fallback
    for encoding in ("utf-8", "gbk", "latin-1"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    return content.decode("utf-8", errors="ignore")


def detect_type(filename: str, declared: str = "") -> Tuple[str, str]:
    ext = (declared or "").upper().lstrip(".")
    if not ext and filename and "." in filename:
        ext = filename.rsplit(".", 1)[-1].upper()
    if not ext:
        ext = "TXT"
    return ext, ext
