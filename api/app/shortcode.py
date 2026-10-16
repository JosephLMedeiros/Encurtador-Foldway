"""Geração e validação de códigos curtos e URLs."""

import re
import secrets
from urllib.parse import urlsplit

CODE_PATTERN = re.compile(r"^[A-Za-z0-9_-]{3,50}$")

# Caminhos da própria API que um custom_code não pode ocupar (a rota /{code} é catch-all).
RESERVED_CODES = frozenset({"api", "r", "healthz", "readyz", "metrics", "docs", "redoc", "openapi.json"})

MAX_URL_LENGTH = 2048


def generate_code(length: int, alphabet: str) -> str:
    return "".join(secrets.choice(alphabet) for _ in range(length))


def is_valid_code(code: str) -> bool:
    return bool(CODE_PATTERN.fullmatch(code))


def is_reserved(code: str) -> bool:
    return code.lower() in RESERVED_CODES


def is_valid_url(url: str) -> bool:
    if not url or len(url) > MAX_URL_LENGTH:
        return False
    try:
        parts = urlsplit(url)
    except ValueError:
        return False
    return parts.scheme in ("http", "https") and bool(parts.netloc)
