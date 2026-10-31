#!/usr/bin/env python3
"""Phase 1 backlog cards.

  python3 backlog/_build.py              emit cards (refuses if any status is live)
  python3 backlog/_build.py --force      emit even if cards are in_progress/done/…
  python3 backlog/_build.py --refresh    rewrite INDEX + parent/wave/phase status from files
  python3 backlog/_build.py --check      validate depends / optional / read paths
  python3 backlog/_build.py --check-launch
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _tasks import TASKS

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
P1 = ROOT / "phase-1-mvp"

WAVES = {
    "W0": ("W00-bootstrap", "Bootstrap"),
    "W1": ("W01-identity", "Identity and workspace"),
    "W2": ("W02-catalog-knowledge", "Catalog and knowledge"),
    "W3": ("W03-channels", "Channels"),
    "W4": ("W04-inbox-api", "Inbox API, scoring, realtime"),
    "W5": ("W05-ai-handoff", "AI, playground, handoff"),
    "W6": ("W06-orders-customers", "Orders and customers"),
    "W7": ("W07-notify-usage-analytics", "Notifications, usage, analytics"),
    "W8": ("W08-web-p0", "Web P0 (auth, shell, inbox, onboarding)"),
    "W9": ("W09-web-p1-p2", "Web P1 / P2"),
    "W10": ("W10-ops-launch", "Ops and launch gate"),
}


def yq(value: str) -> str:
    if value == "":
        return '""'
    special = set(":{}[]&*!|>'\"%@`")
    if any(c in value for c in special) or value.startswith(" ") or value.endswith(" ") or "#" in value:
        return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'
    return value


def yseq(items: list[str]) -> str:
    if not items:
        return "[]"
    return "\n".join(f"  - {yq(x)}" for x in items)


def fm_leaf(
    *,
    lid: str,
    parent: str,
    wave: str,
    optional: bool,
    depends: list[str],
    fs: list[str],
    read: list[str],
    files: list[str],
    cmd: str,
    nxt: str | None,
) -> str:
    lines = [
        "---",
        f"id: {lid}",
        f"parent: {parent}",
        f"wave: {wave}",
        "status: pending",
        f"optional: {'true' if optional else 'false'}",
        "depends:" if depends else "depends: []",
    ]
    if depends:
        lines.append(yseq(depends))
    lines.append("fs:" if fs else "fs: []")
    if fs:
        lines.append(yseq(fs))
    lines.append("read:" if read else "read: []")
    if read:
        lines.append(yseq(read))
    lines.append("files:" if files else "files: []")
    if files:
        lines.append(yseq(files))
    lines.append(f"done_cmd: {yq(cmd)}")
    lines.append(f"next: {yq(nxt) if nxt else 'null'}")
    lines.append("---")
    lines.append("")
    return "\n".join(lines)


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text.rstrip() + "\n", encoding="utf-8")


def last_leaf_id(t: dict) -> str:
    leaves = t["leaves"]
    if len(leaves) == 1:
        return t["id"]
    return f"{t['id']}/{leaves[-1]['letter']}"


def required_last_leaf_id(t: dict) -> str | None:
    if t.get("optional"):
        return None
    if len(t["leaves"]) == 1:
        return None if t["leaves"][0].get("optional") else t["id"]
    required = [lf for lf in t["leaves"] if not lf.get("optional")]
    if not required:
        return None
    return f"{t['id']}/{required[-1]['letter']}"


def dep_leaf_id(t: dict) -> str:
    rid = required_last_leaf_id(t)
    return rid if rid is not None else last_leaf_id(t)


def leaf_id(t: dict, lf: dict) -> str:
    if len(t["leaves"]) == 1:
        return t["id"]
    return f"{t['id']}/{lf['letter']}"


def leaf_rel(t: dict, lf: dict) -> str:
    folder = WAVES[t["wave"]][0]
    if len(t["leaves"]) == 1:
        return f"phase-1-mvp/{folder}/{t['id']}.md"
    return f"phase-1-mvp/{folder}/{t['id']}/{lf['letter']}.md"


def wave_rel(t: dict, lf: dict) -> str:
    if len(t["leaves"]) == 1:
        return f"{t['id']}.md"
    return f"{t['id']}/{lf['letter']}.md"


def child_rel(tid: str, child: str) -> str:
    letter = child.split("/")[-1]
    return f"{tid}/{letter}.md"


def fm_field(text: str, key: str) -> str | None:
    m = re.search(rf"^{re.escape(key)}:\s*(.+)\s*$", text, re.M)
    if not m:
        return None
    val = m.group(1).strip()
    if val in {"null", "~"}:
        return None
    if val == "[]":
        return val
    if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
        return val[1:-1]
    return val


def set_fm_status(path: Path, status: str) -> None:
    text = path.read_text(encoding="utf-8")
    new, n = re.subn(r"^status:\s*\S+", f"status: {status}", text, count=1, flags=re.M)
    if n != 1:
        sys.exit(f"Could not set status on {path.relative_to(ROOT)}")
    if new != text:
        path.write_text(new, encoding="utf-8")


def check_overwrite_safety() -> None:
    if "--force" in sys.argv:
        return
    if not P1.exists():
        return
    for path in P1.glob("**/*.md"):
        if path.name in ("PHASE.md", "WAVE.md"):
            continue
        content = path.read_text(encoding="utf-8")
        if re.search(r"^status:\s*(in_progress|done|blocked|skipped)", content, re.M):
            sys.exit(
                f"Refusing to overwrite active backlog board: '{path.relative_to(ROOT)}' "
                "has non-pending status. Use --force to override, or --refresh to update INDEX only."
            )


def expand_graph() -> tuple[
    list[tuple[dict, dict, list[str]]],
    list[str],
    dict[str, str | None],
    dict[str, bool],
    dict[str, list[str]],
    dict[str, tuple[dict, dict]],
]:
    by_id = {t["id"]: t for t in TASKS}
    assert len(by_id) == len(TASKS)

    expanded: list[tuple[dict, dict, list[str]]] = []
    for t in TASKS:
        prev_in_parent: str | None = None
        for i, lf in enumerate(t["leaves"]):
            deps: list[str] = []
            if i == 0:
                if t.get("depends_all_required"):
                    deps = [x for x in (required_last_leaf_id(u) for u in TASKS if u["id"] != t["id"]) if x]
                else:
                    for dep in t["depends"]:
                        if dep not in by_id:
                            raise SystemExit(f"{t['id']} depends on unknown {dep}")
                        deps.append(dep_leaf_id(by_id[dep]))
            else:
                assert prev_in_parent
                deps = [prev_in_parent]
            expanded.append((t, lf, deps))
            prev_in_parent = leaf_id(t, lf)

    deps_map = {leaf_id(t, lf): deps for t, lf, deps in expanded}
    optional_of = {leaf_id(t, lf): bool(t.get("optional") or lf.get("optional")) for t, lf, _ in expanded}
    ids_in_order = [leaf_id(t, lf) for t, lf, _ in expanded]
    remaining = set(ids_in_order)
    topo: list[str] = []
    while remaining:
        candidates = [n for n in ids_in_order if n in remaining and all(d not in remaining for d in deps_map[n])]
        if not candidates:
            raise SystemExit(f"cycle or missing dep among {sorted(remaining)[:12]}")
        n = candidates[0]
        topo.append(n)
        remaining.remove(n)
    next_of: dict[str, str | None] = {}
    for i, lid in enumerate(topo):
        nxt = None
        for m in topo[i + 1 :]:
            if not optional_of[m]:
                nxt = m
                break
        if optional_of[lid] and nxt is None:
            nxt = topo[i + 1] if i + 1 < len(topo) else None
        next_of[lid] = nxt
    by_leaf = {leaf_id(t, lf): (t, lf) for t, lf, _ in expanded}
    return expanded, topo, next_of, optional_of, deps_map, by_leaf


def read_status(rel: str) -> str:
    path = ROOT / rel
    if not path.is_file():
        sys.exit(f"Missing card {rel}")
    status = fm_field(path.read_text(encoding="utf-8"), "status")
    if not status:
        sys.exit(f"No status: in {rel}")
    return status


def rollup(statuses: list[str]) -> str:
    if any(s == "blocked" for s in statuses):
        return "blocked"
    if statuses and all(s in {"done", "skipped"} for s in statuses):
        return "done"
    if any(s in {"in_progress", "done", "skipped"} for s in statuses):
        return "in_progress"
    return "pending"


def phase_status(statuses: list[str]) -> str:
    if statuses and all(s in {"done", "skipped"} for s in statuses):
        return "done"
    if any(s == "blocked" for s in statuses) and not any(s in {"in_progress", "done"} for s in statuses):
        return "blocked"
    return "in_progress"


def write_index(
    topo: list[str],
    by_leaf: dict[str, tuple[dict, dict]],
    optional_of: dict[str, bool],
    status_of: dict[str, str],
) -> None:
    headers = ["ID", "Wave", "Size", "Status", "Gate"]
    rows = []
    for lid in topo:
        t, lf = by_leaf[lid]
        rel = leaf_rel(t, lf)
        gate = "optional" if optional_of[lid] else "required"
        id_cell = f"[`{lid}`]({rel})"
        rows.append([id_cell, t["wave"], t["size"], status_of[lid], gate])

    col_widths = [len(h) for h in headers]
    for r in rows:
        for i, cell in enumerate(r):
            col_widths[i] = max(col_widths[i], len(cell))

    header_line = "| " + " | ".join(headers[i].ljust(col_widths[i]) for i in range(len(headers))) + " |"
    sep_line = "| " + " | ".join("-" * col_widths[i] for i in range(len(headers))) + " |"

    idx = [
        "# Index",
        "",
        "Generated from the Phase 1 cards. **Status on this page is a snapshot** — "
        "the card file is canonical. Refresh with `python3 backlog/_build.py --refresh`. "
        "Rows are in depends-ready order. `next` skips `optional`.",
        "",
        header_line,
        sep_line,
    ]
    for r in rows:
        idx.append("| " + " | ".join(r[i].ljust(col_widths[i]) for i in range(len(headers))) + " |")

    idx += [
        "",
        f"**{len(topo)} leaves** across **{len(TASKS)}** `T-*` parents from `30`.",
        "",
    ]
    write(ROOT / "INDEX.md", "\n".join(idx))


def refresh() -> None:
    expanded, topo, _next_of, optional_of, _deps_map, by_leaf = expand_graph()
    status_of: dict[str, str] = {}
    for t, lf, _ in expanded:
        lid = leaf_id(t, lf)
        status_of[lid] = read_status(leaf_rel(t, lf))
    write_index(topo, by_leaf, optional_of, status_of)

    for t in TASKS:
        if len(t["leaves"]) == 1:
            continue
        folder = WAVES[t["wave"]][0]
        parent_path = P1 / folder / f"{t['id']}.md"
        required = [leaf_id(t, lf) for lf in t["leaves"] if not lf.get("optional")]
        set_fm_status(parent_path, rollup([status_of[c] for c in required]))

    for wave, (folder, _title) in WAVES.items():
        req = [leaf_id(t, lf) for t, lf, _ in expanded if t["wave"] == wave and not (t.get("optional") or lf.get("optional"))]
        set_fm_status(P1 / folder / "WAVE.md", rollup([status_of[c] for c in req]))

    req_all = [lid for lid in topo if not optional_of[lid]]
    set_fm_status(P1 / "PHASE.md", phase_status([status_of[c] for c in req_all]))
    print(f"refreshed index parents={len(TASKS)} leaves={len(topo)}")


def check(expanded: list[tuple[dict, dict, list[str]]], optional_of: dict[str, bool]) -> None:
    ids = {leaf_id(t, lf) for t, lf, _ in expanded}
    errors: list[str] = []
    for t, lf, deps in expanded:
        lid = leaf_id(t, lf)
        for d in deps:
            if d not in ids:
                errors.append(f"{lid} depends on unknown {d}")
            elif not optional_of[lid] and optional_of[d]:
                errors.append(f"{lid} is required but depends on optional {d}")
        if len(lf["read"]) > 5:
            errors.append(f"{lid} read: has {len(lf['read'])} (max 5)")
        if len(lf["files"]) > 8:
            errors.append(f"{lid} files: has {len(lf['files'])} (max 8)")
        for r in lf["read"]:
            if not (REPO / r).exists():
                errors.append(f"{lid} read path missing: {r}")
    if errors:
        sys.exit("backlog check failed:\n- " + "\n- ".join(errors))
    print(f"check ok leaves={len(ids)}")


def check_launch() -> None:
    expanded, _topo, _n, optional_of, _d, _b = expand_graph()
    pending: list[str] = []
    for t, lf, _ in expanded:
        lid = leaf_id(t, lf)
        if optional_of[lid] or lid == "T-OPS-07":
            continue
        status = read_status(leaf_rel(t, lf))
        if status != "done":
            pending.append(f"{lid}={status}")
    if pending:
        sys.exit("Launch gate blocked — required leaves not done:\n- " + "\n- ".join(pending))
    print("launch-gate: all required leaves done (T-OPS-07 sign-off remains)")


def main() -> None:
    args = [a for a in sys.argv[1:] if a != "--force"]
    if args == ["--refresh"]:
        refresh()
        return
    if args == ["--check"]:
        expanded, _topo, _n, optional_of, _d, _b = expand_graph()
        check(expanded, optional_of)
        return
    if args == ["--check-launch"]:
        check_launch()
        return
    if args:
        sys.exit("Usage: _build.py [--force] [--refresh | --check | --check-launch]")
    refresh()


if __name__ == "__main__":
    main()
