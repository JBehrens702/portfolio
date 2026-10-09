"""Download every content image of the Google Site into content/seed/media/.

Usage (in the dev-env container, from the repo root):
    python3 scripts/seed/download_media.py

The image URLs of a Google Site are signed and expire, so the URLs in
content/seed/raw/*.json stop working after some hours. This script therefore
fetches each live page again, extracts its blocks with extract_gsite.py, and
checks that the live text still equals the raw text. Only then does it
download each image, at the size the Google Site serves it (=w1280). The
header logo is not downloaded: the site has its own logo files (U3).

File names:
    home-hero.<ext>               the photo beside the home intro
    home-card-<slug>.<ext>        the "Selected Work" card image of a page
    <slug>-<nn>.<ext>             the images of a subpage, in page order

It writes content/seed/media/manifest.json: one entry per file with the page,
the image position on the page, the content type, and the pixel size.
scripts/seed.ts reads the manifest to fill in the Media fields when it uploads
the files.
"""

import json
import os
import subprocess
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract_gsite import PageParser  # noqa: E402

SITE = "https://sites.google.com/view/jonathan-behrens-portfolio/"
RAW_DIR = "content/seed/raw"
MEDIA_DIR = "content/seed/media"
PAGES = [
    "thermocouple-reader-system",
    "turbine-testing-stand",
    "victaulic-internship",
    "solidworks-experience",
    "volunteer-experience",
]
EXTENSIONS = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}


def is_logo(src):
    # The header logo is the only image served at w16383 on every page.
    return src.endswith("=w16383")


def curl(url, out):
    result = subprocess.run(
        ["curl", "-sSfL", "-A", "Mozilla/5.0", "-o", out, "-w", "%{content_type}", url],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.split(";")[0].strip().lower()


def live_blocks(page):
    """The blocks of the live page. Exits when its text differs from the raw copy."""
    tmp = os.path.join(MEDIA_DIR, page + ".html.download")
    curl(SITE + page, tmp)
    parser = PageParser()
    with open(tmp, encoding="utf-8") as f:
        parser.feed(f.read())
    os.remove(tmp)
    with open(os.path.join(RAW_DIR, page + ".json"), encoding="utf-8") as f:
        raw = json.load(f)
    strip = lambda blocks: [{k: v for k, v in b.items() if k != "src"} for b in blocks]  # noqa: E731
    if strip(parser.blocks) != strip(raw):
        sys.exit(f"{page}: the live page differs from {RAW_DIR}/{page}.json; extract the pages again first")
    return parser.blocks


def images(blocks):
    return [b["src"] for b in blocks if b["type"] == "img" and not is_logo(b["src"])]


def home_jobs():
    blocks = live_blocks("home")
    srcs = images(blocks)
    # The hero photo comes first. Each card image is followed by a link to its page.
    jobs = [("home", "home-hero", 1, srcs[0])]
    position = 1
    for index, block in enumerate(blocks):
        if block["type"] != "img" or is_logo(block["src"]) or block["src"] == srcs[0]:
            continue
        position += 1
        slug = blocks[index + 1].get("href", "").rsplit("/", 1)[-1]
        if slug not in PAGES:
            sys.exit(f"home card image {position} is not followed by a page link")
        jobs.append(("home", f"home-card-{slug}", position, block["src"]))
    return jobs


def download(base, src):
    tmp = os.path.join(MEDIA_DIR, base + ".download")
    content_type = curl(src, tmp)
    if content_type not in EXTENSIONS:
        os.remove(tmp)
        sys.exit(f"unexpected content type {content_type!r} for {base}")
    name = f"{base}.{EXTENSIONS[content_type]}"
    path = os.path.join(MEDIA_DIR, name)
    os.replace(tmp, path)
    with Image.open(path) as image:
        width, height = image.size
    return {"file": name, "contentType": content_type, "width": width, "height": height, "bytes": os.path.getsize(path)}


def main():
    os.makedirs(MEDIA_DIR, exist_ok=True)
    jobs = home_jobs()
    for page in PAGES:
        srcs = images(live_blocks(page))
        jobs += [(page, f"{page}-{n:02d}", n, src) for n, src in enumerate(srcs, start=1)]
    manifest = []
    for page, base, position, src in jobs:
        entry = download(base, src)
        manifest.append({"page": page, "position": position, **entry})
        print(entry["file"], entry["contentType"], f'{entry["width"]}x{entry["height"]}', entry["bytes"])
    with open(os.path.join(MEDIA_DIR, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(len(manifest), "files")


if __name__ == "__main__":
    main()
