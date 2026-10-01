# Losslessly remove provenance/text metadata from site images.
# JPEG: drop APP11 (JUMBF/C2PA) and APP1 XMP; keep EXIF (orientation) and ICC.
# PNG: drop caBX (C2PA) and tEXt/iTXt/zTXt chunks.
import os, re, struct, sys, zlib

ROOT = os.path.join(os.path.dirname(__file__), "..", "site")
PAT = re.compile(rb"(?i)claude|anthropic|lovable|openai|gemini|midjourney|dall-e")

def strip_jpeg(d):
    if d[:2] != b"\xff\xd8":
        return d
    out, i = [d[:2]], 2
    while i < len(d):
        if d[i] != 0xFF:
            return d  # unexpected; leave file alone
        m = d[i + 1]
        if m == 0xDA:  # start of scan: rest is image data
            out.append(d[i:])
            break
        ln = struct.unpack(">H", d[i + 2:i + 4])[0]
        seg = d[i:i + 2 + ln]
        drop = m == 0xEB or (m == 0xE1 and seg[4:33].startswith(b"http://ns.adobe.com/xap/1.0/"))
        if m == 0xE1 and PAT.search(seg) and not seg[4:10].startswith(b"Exif"):
            drop = True
        if not drop:
            out.append(seg)
        i += 2 + ln
    return b"".join(out)

def strip_png(d):
    if d[:8] != b"\x89PNG\r\n\x1a\n":
        return d
    out, i = [d[:8]], 8
    while i < len(d):
        ln = struct.unpack(">I", d[i:i + 4])[0]
        typ = d[i + 4:i + 8]
        chunk = d[i:i + 12 + ln]
        if typ not in (b"caBX", b"tEXt", b"iTXt", b"zTXt"):
            out.append(chunk)
        i += 12 + ln
    return b"".join(out)

changed = left = 0
for dp, _, fs in os.walk(ROOT):
    for f in fs:
        p = os.path.join(dp, f)
        ext = f.lower().rsplit(".", 1)[-1]
        if ext not in ("jpg", "jpeg", "png"):
            continue
        d = open(p, "rb").read()
        n = strip_jpeg(d) if ext in ("jpg", "jpeg") else strip_png(d)
        if n != d:
            open(p, "wb").write(n)
            changed += 1
        if PAT.search(n):
            left += 1
            print("still matches:", p)
print("stripped", changed, "files; remaining matches", left)
