from pathlib import Path

source = Path("scripts/a9_7_c_runtime_http_patch.py").read_text(encoding="utf-8")
start_marker = "anchor = dedent('''\nfunction parseHttpsEndpoint("
end_marker = 'text = replace_once(text, anchor, replacement, "config endpoint helpers")\n'
start = source.find(start_marker)
end = source.find(end_marker)
if start < 0 or end < 0 or end <= start:
    raise SystemExit("A9.7-C v2 could not locate config helper patch block")
end += len(end_marker)
replacement = '''helper_insert = dedent(\'\'\'\nfunction parseOptionalHttpsEndpoint(\n  value: string | undefined,\n  name: string\n): string | null {\n  if (!value || !value.trim()) return null;\n  return parseHttpsEndpoint(value.trim(), value.trim(), name);\n}\n\nfunction parseCacheMaxAge(value: string | undefined): string {\n  const normalized = (value || "30d").trim().toLowerCase();\n  if (!/^\\\\d{1,4}[smhdw]$/.test(normalized)) {\n    throw new Error(\n      "SCRAPECREATORS_CACHE_MAX_AGE must be an integer followed by s, m, h, d, or w."\n    );\n  }\n  return normalized;\n}\n\n\'\'\')\ntext = replace_once(\n    text,\n    "export function loadConfig(\\n",\n    helper_insert + "export function loadConfig(\\n",\n    "config endpoint helpers",\n)\n'''
patched = source[:start] + replacement + source[end:]
exec(compile(patched, "a9_7_c_runtime_http_patch_v2_exec.py", "exec"), {"__name__": "__main__"})
