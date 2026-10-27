"""Validate public-page search metadata without making network requests."""
import json
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = "https://spirit2k5.co.za"
SITE_TIMEZONE = timezone(timedelta(hours=2), "Africa/Johannesburg")


def site_today(now=None):
    """Compare publication dates in the business timezone, including on UTC CI."""
    return (now or datetime.now(timezone.utc)).astimezone(SITE_TIMEZONE).date()


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.titles, self.descriptions, self.canonicals, self.robots = [], [], [], []
        self.h1, self.ids, self.structured = [], [], []
        self.active = None
        self.parts = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get("id"):
            self.ids.append(attrs["id"])
        if tag == "meta":
            name = attrs.get("name", "").lower()
            if name == "description":
                self.descriptions.append(attrs.get("content", ""))
            if name == "robots":
                self.robots.append(attrs.get("content", ""))
        if tag == "link" and "canonical" in attrs.get("rel", "").lower().split():
            self.canonicals.append(attrs.get("href", ""))
        if tag in ("title", "h1") or (tag == "script" and attrs.get("type") == "application/ld+json"):
            self.active = tag
            self.parts = []

    def handle_data(self, data):
        if self.active:
            self.parts.append(data)

    def handle_endtag(self, tag):
        if tag == self.active:
            value = " ".join("".join(self.parts).split())
            if tag == "title":
                self.titles.append(value)
            elif tag == "h1":
                self.h1.append(value)
            else:
                self.structured.append(json.loads("".join(self.parts)))
            self.active = None
            self.parts = []


def main():
    ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    sitemap = ET.parse(ROOT / "sitemap.xml")
    seen, titles, descriptions = set(), [], []
    count = 0
    for entry in sitemap.findall("s:url", ns):
        url = entry.findtext("s:loc", namespaces=ns)
        assert url and url.startswith(ORIGIN + "/"), f"Unexpected sitemap origin: {url}"
        assert url not in seen, f"Duplicate sitemap URL: {url}"
        seen.add(url)
        parsed = urlsplit(url)
        assert not parsed.query and not parsed.fragment, f"Noncanonical sitemap URL: {url}"
        path = parsed.path.lstrip("/")
        path = path + "index.html" if not path or path.endswith("/") else path
        source = ROOT / path
        assert source.is_file(), f"Missing sitemap page: {path}"
        page = Page()
        page.feed(source.read_text(encoding="utf-8"))
        for label, values in (("title", page.titles), ("description", page.descriptions), ("H1", page.h1)):
            assert len(values) == 1 and values[0].strip(), f"{path}: missing/duplicate {label}"
        assert page.canonicals == [url], f"{path}: canonical mismatch {page.canonicals}"
        assert len(page.robots) == 1 and "noindex" not in page.robots[0].lower(), f"{path}: indexing blocked"
        duplicates = [key for key, total in Counter(page.ids).items() if total > 1]
        assert not duplicates, f"{path}: duplicate IDs {duplicates}"
        stamp = entry.findtext("s:lastmod", namespaces=ns)
        if stamp:
            assert date.fromisoformat(stamp) <= site_today(), f"{path}: invalid/future lastmod {stamp}"
        titles.append(page.titles[0])
        descriptions.append(page.descriptions[0])
        count += 1
    assert len(set(titles)) == count, "Duplicate public-page titles"
    assert len(set(descriptions)) == count, "Duplicate public-page descriptions"
    robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
    assert "Sitemap: " + ORIGIN + "/sitemap.xml" in robots, "Sitemap not advertised"
    for private in ("assistant-admin.html", "previews/vlandf-home/index.html", "previews/vlandf-home/index.production.html"):
        source = ROOT / private
        if source.is_file():
            page = Page()
            page.feed(source.read_text(encoding="utf-8"))
            assert any("noindex" in value.lower() for value in page.robots), f"Private page indexable: {private}"
            assert ORIGIN + "/" + private not in seen, f"Private page in sitemap: {private}"
    print(f"Search metadata, canonical, H1, JSON-LD, sitemap and private-page checks passed for {count} public URLs.")


if __name__ == "__main__":
    main()
