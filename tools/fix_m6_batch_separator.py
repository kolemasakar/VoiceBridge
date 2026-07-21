from __future__ import annotations

import re
from pathlib import Path

path = Path("src/cloud/src/stream_transport.ts")
text = path.read_text(encoding="utf-8")
pattern = re.compile(
    r'const combinedText = items\.map\(\(item\) => item\.text\)\.join\("\s*"\);'
)
replacement = (
    'const combinedText = items.map((item) => item.text).join("\\n\\n");'
)
text, count = pattern.subn(lambda _match: replacement, text, count=1)
if count != 1:
    raise SystemExit(f"Expected one broken TTS batch separator, found {count}")
path.write_text(text, encoding="utf-8", newline="\n")
Path(__file__).unlink()
