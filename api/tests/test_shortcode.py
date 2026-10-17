import string

import pytest

from app import shortcode


def test_generated_code_respects_length_and_alphabet():
    alphabet = string.ascii_lowercase + string.digits
    for _ in range(200):
        code = shortcode.generate_code(7, alphabet)
        assert len(code) == 7
        assert set(code) <= set(alphabet)


@pytest.mark.parametrize("code", ["abc", "meu-link", "Link_2026", "a" * 50])
def test_valid_codes(code):
    assert shortcode.is_valid_code(code)


@pytest.mark.parametrize("code", ["ab", "a" * 51, "com espaço", "ação", "a/b", "a.b", ""])
def test_invalid_codes(code):
    assert not shortcode.is_valid_code(code)


@pytest.mark.parametrize("code", ["api", "healthz", "METRICS", "r"])
def test_reserved_codes(code):
    assert shortcode.is_reserved(code)


@pytest.mark.parametrize("url", ["https://example.com", "http://localhost:3000/a?b=c#d"])
def test_valid_urls(url):
    assert shortcode.is_valid_url(url)


@pytest.mark.parametrize(
    "url",
    ["", "example.com", "ftp://example.com", "javascript:alert(1)", "https://", "http://" + "a" * 2050],
)
def test_invalid_urls(url):
    assert not shortcode.is_valid_url(url)
