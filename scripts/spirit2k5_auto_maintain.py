#!/usr/bin/env python3
"""
Spirit2k5 autonomous website maintainer.

Runs safely on a schedule. It only applies deterministic, low-risk repairs:
- keeps the custom domain consistent
- removes old GitHub Pages site URLs
- restores required SEO/head basics when missing
- hardens target=_blank links
- repairs CNAME / robots.txt / sitemap domain references
- reports missing local files referenced by HTML

It deliberately does NOT rewrite page copy, prices, contact details, portfolio
claims, or delete pages automatically.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
SITE = "https://spirit2k5.co.za"
DOMAIN = "spirit2k5.co.za"

OLD_SITE_URLS = (
    "https://spirit2k5.github.io/spirit2k5/",
    "https://spirit2k5.github.io/spirit2k5",
    "http://spirit2k5.github.io/spirit2k5/",
    "http://spirit2k5.github.io/spirit2k5",
)

TEXT_EXTENSIONS = {".html", ".css", ".js", ".xml", ".txt", ".json", ".webmanifest"}
SKIP_DIRS = {".git", "node_modules", ".github"}
NOINDEX_PAGES = {"assistant-admin.html"}

HEAD_INSERT_RE = re.compile(r"<head(?P<attrs>[^>]*)>", re.I)
TITLE_RE = re.compile(r"<title\b[^>]*>.*?</title>", re.I | re.S)
CANONICAL_RE = re.compile(r"<link\b[^>]*rel=[\"']canonical[\"'][^>]*>", re.I)
VIEWPORT_RE = re.compile(r"<meta\b[^>]*name=[\"']viewport[\"'][^>]*>", re.I)
OG_URL_RE = re.compile(r"<meta\b[^>]*property=[\"']og:url[\"'][^>]*>", re.I)
ROBOTS_RE = re.compile(r"<meta\b[^>]*name=[\"']robots[\"'][^>]*>", re.I)

TAG_REF_RE = re.compile(
    r"<(?:a|img|script|link)\b[^>]*(?:href|src)=[\"']([^\"']+)[\"'][^>]*>",
    re.I,
)
TARGET_BLANK_TAG_RE = re.compile(r"<a\b[^>]*target=[\"']_blank[\"'][^>]*>", re.I)
REL_RE = re.compile(r"\srel=[\"']([^\"']*)[\"']", re.I)


def page_url(path: Path) -> str:
    rel = path.relative_to(ROOT).as_posix()
    if rel == "index.html":
        return SITE + "/"
    return SITE + "/" + rel


def replace_old_site_urls(text: str) -> tuple[str, int]:
    changed = 0
    for old in OLD_SITE_URLS:
        count = text.count(old)
        if count:
            text = text.replace(old, SITE + ("/" if old.endswith("/") else ""))
            changed += count
    return text, changed


def insert_after_head(text: str, fragment: str) -> str:
    match = HEAD_INSERT_RE.search(text)
    if not match:
        return text
    return text[: match.end()] + "\n  " + fragment + text[match.end() :]


def ensure_head_basics(path: Path, text: str) -> tuple[str, list[str]]:
    fixes: list[str] = []
    if not HEAD_INSERT_RE.search(text):
        return text, fixes

    if not VIEWPORT_RE.search(text):
        text = insert_after_head(
            text,
            '<meta name="viewport" content="width=device-width, initial-scale=1">',
        )
        fixes.append("added viewport meta")

    if path.name not in NOINDEX_PAGES:
        canonical = page_url(path)
        if not CANONICAL_RE.search(text):
            text = insert_after_head(text, f'<link rel="canonical" href="{canonical}">')
            fixes.append("added canonical")

        if not OG_URL_RE.search(text):
            text = insert_after_head(text, f'<meta property="og:url" content="{canonical}">')
            fixes.append("added og:url")
    else:
        if not ROBOTS_RE.search(text):
            text = insert_after_head(text, '<meta name="robots" content="noindex,nofollow">')
            fixes.append("added noindex to admin page")

    return text, fixes


def harden_blank_links(text: str) -> tuple[str, int]:
    count = 0

    def repl(match: re.Match[str]) -> str:
        nonlocal count
        tag = match.group(0)
        rel_match = REL_RE.search(tag)
        required = {"noopener", "noreferrer"}
        if rel_match:
            values = {v for v in rel_match.group(1).split() if v}
            merged = " ".join(sorted(values | required))
            new_tag = REL_RE.sub(f' rel="{merged}"', tag, count=1)
        else:
            new_tag = tag[:-1] + ' rel="noopener noreferrer">'
        if new_tag != tag:
            count += 1
        return new_tag

    return TARGET_BLANK_TAG_RE.sub(repl, text), count


def normalize_text_file(path: Path) -> list[str]:
    try:
        original = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return []

    text, old_url_count = replace_old_site_urls(original)
    fixes: list[str] = []
    if old_url_count:
        fixes.append(f"replaced {old_url_count} old GitHub Pages URL(s)")

    if path.suffix.lower() == ".html":
        text, head_fixes = ensure_head_basics(path, text)
        fixes.extend(head_fixes)
        text, blank_count = harden_blank_links(text)
        if blank_count:
            fixes.append(f"hardened {blank_count} target=_blank link(s)")

    if text != original:
        path.write_text(text, encoding="utf-8")
    return fixes


def ensure_core_files() -> list[str]:
    fixes: list[str] = []

    cname = ROOT / "CNAME"
    expected_cname = DOMAIN + "\n"
    current_cname = cname.read_text(encoding="utf-8") if cname.exists() else ""
    if current_cname != expected_cname:
        cname.write_text(expected_cname, encoding="utf-8")
        fixes.append("repaired CNAME")

    robots = ROOT / "robots.txt"
    expected_robots = (
        "User-agent: *\n"
        "Allow: /\n"
        f"Sitemap: {SITE}/sitemap.xml\n"
    )
    current_robots = robots.read_text(encoding="utf-8") if robots.exists() else ""
    if current_robots != expected_robots:
        robots.write_text(expected_robots, encoding="utf-8")
        fixes.append("repaired robots.txt")

    return fixes


def iter_text_files():
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        rel_parts = set(path.relative_to(ROOT).parts)
        if rel_parts & SKIP_DIRS:
            continue
        suffix = path.suffix.lower()
        if suffix in TEXT_EXTENSIONS or path.name == "site.webmanifest":
            yield path


def local_reference_problems() -> list[dict[str, str]]:
    problems: list[dict[str, str]] = []
    for html in ROOT.glob("*.html"):
        try:
            text = html.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for raw in TAG_REF_RE.findall(text):
            ref = raw.strip()
            if (
                not ref
                or ref.startswith(("#", "mailto:", "tel:", "javascript:", "data:"))
                or ref.startswith("//")
            ):
                continue
            parsed = urlparse(ref)
            if parsed.scheme in ("http", "https"):
                continue
            local_path = parsed.path.lstrip("/")
            if not local_path:
                continue
            target = ROOT / local_path
            if local_path.endswith("/"):
                target = ROOT / local_path / "index.html"
            if not target.exists():
                problems.append({"page": html.name, "reference": ref})
    return problems


def main() -> int:
    changes: dict[str, list[str]] = {}

    core = ensure_core_files()
    if core:
        changes["<core>"] = core

    for path in iter_text_files():
        fixes = normalize_text_file(path)
        if fixes:
            changes[path.relative_to(ROOT).as_posix()] = fixes

    problems = local_reference_problems()

    print("# Spirit2k5 autonomous maintenance")
    if changes:
        print(f"Applied safe repairs to {len(changes)} file group(s):")
        for file_name, fixes in sorted(changes.items()):
            print(f"- {file_name}: " + "; ".join(fixes))
    else:
        print("No safe automatic repairs were needed.")

    if problems:
        print(f"Found {len(problems)} unresolved local reference(s):")
        for item in problems[:50]:
            print(f"- {item['page']}: {item['reference']}")
    else:
        print("No missing local file references found.")

    summary = {
        "changed_file_groups": len(changes),
        "unresolved_local_references": len(problems),
    }
    print(json.dumps(summary))

    # Broken local references need attention, but safe repairs may still have been applied.
    return 2 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
