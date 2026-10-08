"""Extract the owner's Google Site pages into ordered, word-for-word blocks.

Usage (in the dev-env container):
    python3 scripts/seed/extract_gsite.py <html-dir> <out-dir>

Each page becomes <out-dir>/<page>.json: a list of blocks in page order.
Text is copied exactly as the page has it. Nothing is rewritten here; fixes
allowed by requirement 1.2.2 happen later and are listed in docs/text-fixes.md.
"""

import html
import json
import os
import sys
from html.parser import HTMLParser
from urllib.parse import parse_qs, urlparse

TEXT_TAGS = {"h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "small"}
SKIP_TAGS = {"script", "style", "noscript", "nav"}
VOID_TAGS = {"img", "br", "hr", "meta", "link", "input", "source", "wbr"}


def unwrap_google_redirect(href):
    """Google Sites wraps outside links as google.com/url?q=<target>."""
    parsed = urlparse(href)
    if parsed.hostname == "www.google.com" and parsed.path == "/url":
        target = parse_qs(parsed.query).get("q")
        if target:
            return target[0]
    return href


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks = []
        self.stack = []
        self.skip_depth = 0
        self.current = None  # the open text block
        self.link = None  # the open link inside a text block

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in SKIP_TAGS or attrs.get("role") == "navigation":
            if tag not in VOID_TAGS:
                self.skip_depth += 1
                self.stack.append(("skip", tag))
            return
        if tag not in VOID_TAGS:
            self.stack.append(("tag", tag))
        if self.skip_depth:
            return
        if tag == "img":
            src = attrs.get("src") or attrs.get("data-src") or ""
            if "sitesv-images" in src or "googleusercontent" in src:
                self.blocks.append({"type": "img", "src": src})
            return
        if tag == "iframe":
            self.blocks.append(
                {"type": "embed", "src": attrs.get("src") or attrs.get("data-src") or "", "title": attrs.get("title") or ""}
            )
            return
        if tag == "br" and self.current is not None:
            self.current["text"] += "\n"
            return
        if tag in TEXT_TAGS and self.current is None:
            self.current = {"type": tag, "text": "", "depth": len(self.stack)}
            return
        if tag == "a":
            href = unwrap_google_redirect(html.unescape(attrs.get("href", "")))
            if self.current is not None:
                self.link = {"href": href, "start": len(self.current["text"])}
            else:
                self.link = {"href": href, "start": None, "text": "", "label": attrs.get("aria-label") or ""}

    def handle_endtag(self, tag):
        # Pop to the matching open tag; Google Sites markup is well formed.
        while self.stack:
            kind, name = self.stack.pop()
            if kind == "skip":
                self.skip_depth -= 1
            if name == tag:
                break
        if self.skip_depth:
            return
        if tag == "a" and self.link is not None:
            if self.link["start"] is not None and self.current is not None:
                text = self.current["text"][self.link["start"]:]
                self.current.setdefault("links", []).append({"text": text, "href": self.link["href"]})
            elif self.link["start"] is None:
                self.blocks.append(
                    {"type": "link", "text": self.link["text"].strip(), "label": self.link["label"], "href": self.link["href"]}
                )
            self.link = None
            return
        if self.current is not None and tag == self.current["type"] and len(self.stack) < self.current["depth"]:
            block = self.current
            self.current = None
            del block["depth"]
            if block["text"].strip():
                self.blocks.append(block)

    def handle_data(self, data):
        if self.skip_depth:
            return
        if self.current is not None:
            self.current["text"] += data
        elif self.link is not None and self.link["start"] is None:
            self.link["text"] += data


def main():
    html_dir, out_dir = sys.argv[1], sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    for name in sorted(os.listdir(html_dir)):
        if not name.endswith(".html"):
            continue
        parser = PageParser()
        with open(os.path.join(html_dir, name), encoding="utf-8") as f:
            parser.feed(f.read())
        out = os.path.join(out_dir, name[:-5] + ".json")
        with open(out, "w", encoding="utf-8") as f:
            json.dump(parser.blocks, f, ensure_ascii=False, indent=2)
        print(name, len(parser.blocks), "blocks")


if __name__ == "__main__":
    main()
