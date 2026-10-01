#!/usr/bin/env python3
import json, subprocess, sys, urllib.request, urllib.parse, urllib.error, xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "ai" / "knowledge-sources.json"
SITE = "https://spirit2k5.co.za"
TIMEOUT = 15

class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = set()
    def handle_starttag(self, tag, attrs):
        if tag != "a":
            return
        href = dict(attrs).get("href")
        if href:
            self.links.add(href.strip())

def request(url):
    req = urllib.request.Request(url, headers={"User-Agent":"Spirit2k5-AI-Maintenance/1.0"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
        return res.status, res.read()

def git_blob_sha(path):
    p = subprocess.run(["git","hash-object",str(path)], cwd=ROOT, text=True, capture_output=True)
    if p.returncode != 0:
        return None
    return p.stdout.strip()

def main():
    report = {"knowledge_changed":[], "broken_pages":[], "broken_links":[], "checked_pages":0}
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    for rel, expected in data.get("sources",{}).items():
        path = ROOT / rel
        current = git_blob_sha(path) if path.exists() else None
        if current != expected:
            report["knowledge_changed"].append({"path":rel,"expected":expected,"current":current})

    try:
        status, body = request(SITE + "/sitemap.xml")
        if status != 200:
            report["broken_pages"].append({"url":SITE+"/sitemap.xml","status":status})
            urls = [SITE + "/"]
        else:
            root = ET.fromstring(body)
            ns = {"s":"http://www.sitemaps.org/schemas/sitemap/0.9"}
            urls = [n.text.strip() for n in root.findall(".//s:loc", ns) if n.text]
    except Exception as e:
        report["broken_pages"].append({"url":SITE+"/sitemap.xml","error":str(e)})
        urls = [SITE + "/"]

    found_links = set()
    for url in urls:
        try:
            status, body = request(url)
            report["checked_pages"] += 1
            if status >= 400:
                report["broken_pages"].append({"url":url,"status":status})
                continue
            ctype = ""
            try:
                parser = LinkParser()
                parser.feed(body.decode("utf-8","ignore"))
                for href in parser.links:
                    if not href or href.startswith(("#","mailto:","tel:","javascript:")):
                        continue
                    full = urllib.parse.urljoin(url, href)
                    parts = urllib.parse.urlparse(full)
                    if parts.netloc not in ("spirit2k5.co.za","www.spirit2k5.co.za"):
                        continue
                    clean = urllib.parse.urlunparse((parts.scheme or "https","spirit2k5.co.za",parts.path,parts.params,parts.query,""))
                    found_links.add(clean)
            except Exception:
                pass
        except urllib.error.HTTPError as e:
            report["broken_pages"].append({"url":url,"status":e.code})
        except Exception as e:
            report["broken_pages"].append({"url":url,"error":str(e)})

    for url in sorted(found_links):
        try:
            status, _ = request(url)
            if status >= 400:
                report["broken_links"].append({"url":url,"status":status})
        except urllib.error.HTTPError as e:
            report["broken_links"].append({"url":url,"status":e.code})
        except Exception as e:
            report["broken_links"].append({"url":url,"error":str(e)})

    md = [
        "# Spirit2k5 AI maintenance report",
        "",
        f"- Pages checked: {report['checked_pages']}",
        f"- Knowledge sources changed: {len(report['knowledge_changed'])}",
        f"- Broken sitemap pages: {len(report['broken_pages'])}",
        f"- Broken internal links: {len(report['broken_links'])}",
        ""
    ]
    if report["knowledge_changed"]:
        md += ["## Knowledge sources changed",""] + [f"- `{x['path']}`" for x in report["knowledge_changed"]] + [""]
    if report["broken_pages"]:
        md += ["## Broken pages",""] + [f"- {x}" for x in report["broken_pages"]] + [""]
    if report["broken_links"]:
        md += ["## Broken internal links",""] + [f"- {x}" for x in report["broken_links"]] + [""]

    (ROOT / "ai-health-report.json").write_text(json.dumps(report,indent=2),encoding="utf-8")
    (ROOT / "ai-health-report.md").write_text("\n".join(md),encoding="utf-8")
    print("\n".join(md))

    if report["knowledge_changed"] or report["broken_pages"] or report["broken_links"]:
        return 1
    return 0

if __name__ == "__main__":
    sys.exit(main())
