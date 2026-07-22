from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="ascii")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="ascii", newline="\n")


def replace_once(content: str, old: str, new: str, label: str) -> str:
    if old not in content:
        if new in content:
            return content
        raise RuntimeError(f"Missing marker for {label}")
    return content.replace(old, new, 1)


def patch_phase_plan() -> None:
    path = "docs/phases/PHASE_1_CLOUD_YOUTUBE_MVP.md"
    content = read(path)
    content = replace_once(
        content,
        "Status:\nDraft",
        "Status:\nApproved - Phase 1 MVP Validated",
        "Phase 1 status",
    )
    content = replace_once(
        content,
        "Version:\n1.4.0",
        "Version:\n2.0.0",
        "Phase 1 version",
    )
    content = replace_once(
        content,
        "Last Updated:\n2026-07-18",
        "Last Updated:\n2026-07-22",
        "Phase 1 date",
    )

    section = """## 20A. Final Phase 1 MVP Result

Status:

`VOICEBRIDGE_PHASE_1_MVP_VALIDATED`

Validated baseline:

- cloud service `0.6.0`;
- browser extension `0.6.2`;
- AssemblyAI English streaming STT;
- Azure Translator primary English-to-Ukrainian translation;
- Gemini translation fallback;
- Azure Speech Ukrainian TTS with `uk-UA-OstapNeural`;
- ordered browser PCM playback;
- automatic original-audio ducking and restoration;
- one-press idempotent Stop with visible `STOPPING` state.

Final controlled acceptance evidence:

- English final segments: 28;
- Ukrainian final segments: 28;
- voiced segments: 28;
- played segments: 28;
- translation retries: 0;
- TTS retries: 0;
- pending operations after completion: 0;
- dropped audio frames: 0;
- final playback state: `COMPLETED`;
- final capture state: `IDLE`.

The project owner confirmed understandable Ukrainian speech, functional automatic ducking, original-audio restoration, normal Azure pipeline operation, and correct one-press Stop behavior.

Canonical evidence:

- `PHASE_1_MVP_VALIDATION.md`;
- `../history/2026-07-22_PHASE_1_MVP_VALIDATED.md`;
- `../bootstrap/PHASE_1_MVP_VALIDATED_BOOTSTRAP.md`.

Earlier milestone implementation and pending-validation sections in this plan are retained as historical execution snapshots. This final section is authoritative for Phase 1 completion state.

"""
    marker = "## 21. References"
    if "## 20A. Final Phase 1 MVP Result" not in content:
        if marker not in content:
            raise RuntimeError("Missing Phase 1 references marker")
        content = content.replace(marker, section + marker, 1)

    row = "| 2.0.0 | 2026-07-22 | Validated and closed the minimum Phase 1 YouTube MVP |\n"
    table = "| Version | Date | Description |\n|---------|------|-------------|\n"
    if row not in content:
        if table not in content:
            raise RuntimeError("Missing Phase 1 version table")
        content = content.replace(table, table + row, 1)
    write(path, content)


def patch_project_history() -> None:
    path = "docs/history/08_PROJECT_HISTORY.md"
    content = read(path)
    content = replace_once(
        content,
        "Version:\n1.7.0",
        "Version:\n1.13.0",
        "project history version",
    )
    content = replace_once(
        content,
        "Last Updated:\n2026-07-18",
        "Last Updated:\n2026-07-22",
        "project history date",
    )

    next_action = """## 13. Next Engineering Action

Phase 1 MVP work is complete.

Do not reopen completed Phase 1 scope without a documented defect or approved change.

The next project scope must be explicitly approved by the project owner. Candidate work belongs to Phase 2 Universal Cloud Audio or Phase 3 Cloud Service Hardening.
"""
    pattern = re.compile(
        r"## 13\. Next Engineering Action\n.*?(?=\n## 14\. Milestone 3 Streaming Transport)",
        re.DOTALL,
    )
    if not pattern.search(content):
        if next_action.strip() not in content:
            raise RuntimeError("Missing project history next-action section")
    else:
        content = pattern.sub(next_action.rstrip(), content, count=1)

    section = """## 15A. Phase 1 MVP Final Validation

Date:

2026-07-22.

Final result:

`VOICEBRIDGE_PHASE_1_MVP_VALIDATED`

Accepted versions:

- cloud service `0.6.0`;
- browser extension `0.6.2`;
- implementation baseline commit `1d7e82ecb122ab953190f9b2fdc8e7fbea86840c`.

Accepted pipeline:

```text
AssemblyAI English STT
    -> Azure Translator primary
    -> Gemini translation fallback
    -> Azure Speech Ukrainian TTS
```

Final controlled test completed 28 English, Ukrainian, voiced, and played segments with zero translation retries, zero TTS retries, zero pending operations after completion, zero dropped audio frames, and one-press Stop returning the extension to `IDLE`.

Observed final stage latency was 712 ms for STT, 81 ms for translation, and 190 ms for TTS.

A prior Azure Speech endurance session exceeded 12 minutes and completed 108 English, translated, voiced, and played segments with zero TTS retries.

The project owner confirmed understandable Ukrainian speech, automatic ducking, original-audio restoration, normal Azure pipeline operation, and correct one-press Stop behavior.

Records:

- `../phases/PHASE_1_MVP_VALIDATION.md`;
- `2026-07-22_PHASE_1_MVP_VALIDATED.md`;
- `../bootstrap/PHASE_1_MVP_VALIDATED_BOOTSTRAP.md`.

"""
    marker = "## 16. References"
    if "## 15A. Phase 1 MVP Final Validation" not in content:
        if marker not in content:
            raise RuntimeError("Missing project history references marker")
        content = content.replace(marker, section + marker, 1)

    row = "| 1.13.0 | 2026-07-22 | Validated the minimum Phase 1 MVP and recorded the Azure pipeline and one-press Stop acceptance |\n"
    table = "| Version | Date | Description |\n|---------|------|-------------|\n"
    if row not in content:
        if table not in content:
            raise RuntimeError("Missing project history version table")
        content = content.replace(table, table + row, 1)
    write(path, content)


def patch_overview() -> None:
    path = "docs/overview/01_PROJECT_OVERVIEW.md"
    content = read(path)
    content = replace_once(
        content,
        "Version:\n1.1.0",
        "Version:\n1.2.0",
        "overview version",
    )
    content = replace_once(
        content,
        "Last Updated:\n2026-07-18",
        "Last Updated:\n2026-07-22",
        "overview date",
    )
    statement = "\nThe minimum Phase 1 YouTube MVP was validated on 2026-07-22 with AssemblyAI STT, Azure Translator, Azure Speech TTS, browser playback, automatic ducking, and one-press Stop.\n"
    anchor = "The long-term direction is a universal multilingual communication bridge for videos, live conversations, meetings, calls, and other audio sources.\n"
    if statement.strip() not in content:
        if anchor not in content:
            raise RuntimeError("Missing overview product anchor")
        content = content.replace(anchor, anchor + statement, 1)
    row = "| 1.2.0 | 2026-07-22 | Recorded the validated minimum Phase 1 YouTube MVP |\n"
    table = "| Version | Date | Description |\n|---------|------|-------------|\n"
    if row not in content:
        content = content.replace(table, table + row, 1)
    write(path, content)


def patch_links() -> None:
    path = "docs/bootstrap/PHASE_1_MVP_VALIDATED_BOOTSTRAP.md"
    content = read(path)
    content = content.replace(
        "`docs/adr/ADR-009_AZURE_TRANSLATOR_PRIMARY.md` if present under the current ADR naming convention",
        "`docs/adr/ADR-008_PHASE_1_AZURE_TRANSLATION_PROVIDER.md`",
    )
    write(path, content)

    path = "README.md"
    content = read(path)
    link = "- [Phase 1 MVP History Entry](docs/history/2026-07-22_PHASE_1_MVP_VALIDATED.md)\n"
    anchor = "- [Phase 1 MVP Recovery Bootstrap](docs/bootstrap/PHASE_1_MVP_VALIDATED_BOOTSTRAP.md)\n"
    if link not in content:
        if anchor not in content:
            raise RuntimeError("Missing README bootstrap link")
        content = content.replace(anchor, anchor + link, 1)
    write(path, content)


if __name__ == "__main__":
    patch_phase_plan()
    patch_project_history()
    patch_overview()
    patch_links()
