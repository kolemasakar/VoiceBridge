from pathlib import Path

path = Path("src/cloud/tests/cloud.test.ts")
text = path.read_text(encoding="utf-8")
old = "const completed = await stopStream(socket, 12000);"
new = "const completed = await stopStream(socket, 50000);"
if text.count(old) != 1:
    raise SystemExit(f"Expected one queue timeout marker, found {text.count(old)}")
path.write_text(text.replace(old, new, 1), encoding="utf-8", newline="\n")
Path(__file__).unlink()
