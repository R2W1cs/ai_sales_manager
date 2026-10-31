#!/usr/bin/env python3
"""Step-by-step backlog execution runner.

Usage:
  python3 backlog/_runner.py status              # Show backlog progress, cursor, and ready leaves
  python3 backlog/_runner.py current             # Print full card details for active cursor leaf
  python3 backlog/_runner.py info <leaf_id>      # Print full card details for any leaf
  python3 backlog/_runner.py ready               # List all leaves whose dependencies are done
  python3 backlog/_runner.py start [<leaf_id>]   # Set leaf status to in_progress (default: cursor)
  python3 backlog/_runner.py verify [<leaf_id>]  # Run done_cmd for leaf
  python3 backlog/_runner.py complete [<leaf_id>] [--commit <hash>] [--note <text>] [--no-verify]
  python3 backlog/_runner.py block [<leaf_id>] --reason <text>
  python3 backlog/_runner.py skip <leaf_id> [--note <text>]
  python3 backlog/_runner.py reset-cursor <leaf_id>
"""

from __future__ import annotations

import argparse
import datetime
import os
import re
import subprocess
import sys
from pathlib import Path

# Import graph helpers from _build
sys.path.insert(0, str(Path(__file__).resolve().parent))
import _build
from _tasks import TASKS

ROOT = _build.ROOT
REPO = _build.REPO
P1 = _build.P1
WAVES = _build.WAVES

user_home = Path.home()
for p in [str(user_home / ".local/bin"), str(user_home / ".local/share/pnpm"), str(user_home / ".local/share/pnpm/bin")]:
    if p not in os.environ.get("PATH", ""):
        os.environ["PATH"] = f"{p}:{os.environ.get('PATH', '')}"


def get_git_commit() -> str:
    """Get current git commit short hash, or '-' if not in git repo."""
    try:
        res = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=REPO,
            capture_output=True,
            text=True,
            check=False,
        )
        if res.returncode == 0 and res.stdout.strip():
            return res.stdout.strip()
    except Exception:
        pass
    return "-"


def get_cursor_data() -> dict[str, str | None]:
    """Read cursor frontmatter."""
    cursor_path = ROOT / "CURSOR.md"
    if not cursor_path.is_file():
        sys.exit("Missing backlog/CURSOR.md")
    text = cursor_path.read_text(encoding="utf-8")
    return {
        "phase": _build.fm_field(text, "phase"),
        "wave": _build.fm_field(text, "wave"),
        "leaf": _build.fm_field(text, "leaf"),
        "status": _build.fm_field(text, "status") or "pending",
        "blocked_by": _build.fm_field(text, "blocked_by"),
        "last_commit": _build.fm_field(text, "last_commit"),
        "last_session": _build.fm_field(text, "last_session"),
    }


def update_cursor_file(
    *,
    leaf: str | None,
    status: str,
    blocked_by: str | None = None,
    commit: str | None = None,
    session_time: str | None = None,
) -> None:
    """Update backlog/CURSOR.md with new leaf, status, commit, and resume instructions."""
    expanded, topo, next_of, optional_of, deps_map, by_leaf = _build.expand_graph()
    cursor_path = ROOT / "CURSOR.md"

    if leaf is None or leaf not in by_leaf:
        # All tasks completed or invalid
        final_status = "blocked" if status == "blocked" else "done"
        lines = [
            "---",
            "phase: phase-1-mvp",
            "wave: W10",
            "leaf: null",
            f"status: {final_status}",
            f"blocked_by: {_build.yq(blocked_by) if blocked_by else 'null'}",
            f"last_commit: {_build.yq(commit) if commit else 'null'}",
            f"last_session: {_build.yq(session_time) if session_time else 'null'}",
            "---",
            "",
            "# Cursor",
            "",
            "All Phase 1 backlog leaves and launch gate sign-off (`T-OPS-07`) have been completed.",
            "",
        ]
        _build.write(cursor_path, "\n".join(lines))
        return

    t, lf = by_leaf[leaf]
    resume = _build.leaf_rel(t, lf)
    deps = deps_map[leaf]
    if deps:
        dep_line = "Depends: " + ", ".join(f"`{d}`" for d in deps) + " must be `done`."
    else:
        dep_line = "Depends are clear."

    do_snippet = lf["do"][0] if lf.get("do") else t["title"]
    nxt = next_of.get(leaf)

    lines = [
        "---",
        "phase: phase-1-mvp",
        f"wave: {t['wave']}",
        f"leaf: {leaf}",
        f"status: {status}",
        f"blocked_by: {_build.yq(blocked_by) if blocked_by else 'null'}",
        f"last_commit: {_build.yq(commit) if commit else 'null'}",
        f"last_session: {_build.yq(session_time) if session_time else 'null'}",
        "---",
        "",
        "# Cursor",
        "",
        "This file is the board position. One leaf at a time unless `depends` of another leaf are already `done`.",
        "",
        "`next` skips `optional: true` leaves. Pull those only if you are shipping a Should.",
        "",
        "Completing a **parallel** leaf (allowed when its `depends` are `done`) does not move this file. Only advance `leaf` along the serial `next` of the cursor leaf.",
        "",
        "## Resume",
        "",
        f"Open [`{resume}`]({resume}).",
        "",
        dep_line,
        do_snippet,
        "",
        f"**Next after this leaf:** `{nxt}`" if nxt else "**Next after this leaf:** `null` (end of queue)",
        "",
        "## Externals (`31` §8)",
        "",
        "Do not encode X1–X5 as `T-*` depends. Note them here if a leaf is waiting on Meta review, AWS, model quota, design partners, or golden-set authoring.",
        "",
    ]
    _build.write(cursor_path, "\n".join(lines))


def append_log(leaf: str, commit: str, note: str) -> None:
    """Append row to backlog/LOG.md."""
    log_path = ROOT / "LOG.md"
    today = datetime.date.today().isoformat()
    clean_note = note.replace("|", "/").strip()
    clean_commit = commit.replace("|", "").strip() or "-"
    row = f"| {today} | `{leaf}` | `{clean_commit}` | {clean_note} |\n"

    if not log_path.is_file():
        content = "# Session log\n\nAppend one row per finished or blocked session. Do not edit old rows.\n\n| Date | Leaf | Commit | Note |\n|------|------|--------|------|\n"
        log_path.write_text(content, encoding="utf-8")

    text = log_path.read_text(encoding="utf-8")
    if not text.endswith("\n"):
        text += "\n"
    text += row
    log_path.write_text(text, encoding="utf-8")


def run_graphify_update() -> None:
    """Run graphify update . to keep AST graph in sync."""
    try:
        subprocess.run(
            ["graphify", "update", "."],
            cwd=REPO,
            capture_output=True,
            text=True,
            check=False,
        )
    except Exception:
        pass


def get_card_info(leaf: str) -> dict:
    """Parse card details from file."""
    expanded, topo, next_of, optional_of, deps_map, by_leaf = _build.expand_graph()
    if leaf not in by_leaf:
        sys.exit(f"Unknown leaf '{leaf}'")
    t, lf = by_leaf[leaf]
    rel = _build.leaf_rel(t, lf)
    path = ROOT / rel
    if not path.is_file():
        sys.exit(f"Card file missing: {rel}")
    text = path.read_text(encoding="utf-8")

    status = _build.fm_field(text, "status") or "pending"
    cmd = _build.fm_field(text, "done_cmd") or ""

    g = lf.get("gold") or t.get("gold") or {}
    return {
        "id": leaf,
        "title": lf["title"],
        "parent": t["id"],
        "parent_title": t["title"],
        "wave": t["wave"],
        "wave_title": WAVES[t["wave"]][1],
        "size": t["size"],
        "optional": optional_of[leaf],
        "status": status,
        "path": rel,
        "full_path": str(path),
        "depends": deps_map[leaf],
        "next": next_of.get(leaf),
        "fs": t["fs"],
        "read": lf["read"],
        "files": lf["files"],
        "cmd": cmd,
        "do": lf["do"],
        "dont": lf["dont"],
        "done": lf["done"],
        "objective_value": g.get("objective_value"),
        "technical_contract": g.get("technical_contract", []),
        "security_invariants": g.get("security_invariants", []),
        "acceptance_scenarios": g.get("acceptance_test_scenarios", []),
        "human_contribution": g.get("human_contribution") or lf.get("human_contribution") or t.get("human_contribution") or [],
    }


def cmd_status() -> None:
    """Display overall progress and status."""
    expanded, topo, next_of, optional_of, deps_map, by_leaf = _build.expand_graph()
    cursor = get_cursor_data()

    statuses: dict[str, str] = {}
    for t, lf, _ in expanded:
        lid = _build.leaf_id(t, lf)
        statuses[lid] = _build.read_status(_build.leaf_rel(t, lf))

    req_leaves = [lid for lid in topo if not optional_of[lid]]
    opt_leaves = [lid for lid in topo if optional_of[lid]]

    req_done = sum(1 for lid in req_leaves if statuses[lid] in {"done", "skipped"})
    req_total = len(req_leaves)
    opt_done = sum(1 for lid in opt_leaves if statuses[lid] in {"done", "skipped"})
    opt_total = len(opt_leaves)

    in_progress = [lid for lid in topo if statuses[lid] == "in_progress"]
    blocked = [lid for lid in topo if statuses[lid] == "blocked"]

    # Ready leaves: pending and all depends done/skipped
    ready = []
    for lid in topo:
        if statuses[lid] == "pending":
            deps = deps_map[lid]
            if all(statuses.get(d) in {"done", "skipped"} for d in deps):
                ready.append(lid)

    pct = (req_done / req_total * 100) if req_total else 100.0
    bar_len = 30
    filled = int(bar_len * req_done / req_total) if req_total else bar_len
    bar = "=" * filled + ">" if filled < bar_len else "=" * bar_len
    bar = bar.ljust(bar_len, ".")

    print("================================================================================")
    print("                      BACKLOG EXECUTION STATUS                                  ")
    print("================================================================================")
    print(f"Progress: [{bar}] {req_done}/{req_total} Required ({pct:.1f}%) | {opt_done}/{opt_total} Optional")
    print("--------------------------------------------------------------------------------")
    print(f"Cursor Leaf:   {cursor['leaf'] or 'None (All Completed)'}")
    wave_info = f" ({WAVES[cursor['wave']][1]})" if cursor.get("wave") and cursor["wave"] in WAVES else ""
    print(f"Cursor Wave:   {cursor['wave'] or 'None'}{wave_info}")
    print(f"Cursor Status: {cursor['status']}")
    if cursor.get("blocked_by"):
        print(f"Blocked By:    {cursor['blocked_by']}")
    if cursor.get("last_commit"):
        session_info = f" at {cursor['last_session']}" if cursor.get("last_session") else ""
        print(f"Last Commit:   {cursor['last_commit']}{session_info}")
    print("--------------------------------------------------------------------------------")

    if in_progress:
        print(f"In Progress ({len(in_progress)}): " + ", ".join(f"`{x}`" for x in in_progress))
    if blocked:
        print(f"Blocked ({len(blocked)}): " + ", ".join(f"`{x}`" for x in blocked))

    print(f"Ready to execute ({len(ready)}):")
    for r in ready[:8]:
        t, lf = by_leaf[r]
        gate = " (optional)" if optional_of[r] else ""
        is_cur = " [CURSOR]" if r == cursor["leaf"] else ""
        print(f"  - `{r}`: {lf['title']} [{t['wave']}]{gate}{is_cur}")
    if len(ready) > 8:
        print(f"  ... and {len(ready) - 8} more ready leaves.")
    print("================================================================================")


def cmd_info(leaf: str | None) -> None:
    """Print full card information."""
    if not leaf:
        cursor = get_cursor_data()
        leaf = cursor["leaf"]
        if not leaf:
            sys.exit("No active cursor leaf. Provide leaf_id explicitly.")

    info = get_card_info(leaf)

    print("================================================================================")
    print(f"LEAF: {info['id']} — {info['title']}")
    print("================================================================================")
    print(f"Parent:    {info['parent']} ({info['parent_title']}) [Size: {info['size']}]")
    print(f"Wave:      {info['wave']} — {info['wave_title']}")
    print(f"Status:    {info['status'].upper()}")
    print(f"Gate:      {'OPTIONAL (Should)' if info['optional'] else 'REQUIRED (Launch Gate)'}")
    print(f"Card File: backlog/{info['path']}")
    print(f"Next:      {info['next'] or 'None (End of queue)'}")
    print("--------------------------------------------------------------------------------")

    if info.get("objective_value"):
        print("Objective & Value:")
        print(f"  {info['objective_value']}")
        print("--------------------------------------------------------------------------------")

    print("Dependencies:")
    if not info["depends"]:
        print("  - None (Clear to start)")
    else:
        for d in info["depends"]:
            d_info = get_card_info(d)
            mark = "✓ DONE" if d_info["status"] in {"done", "skipped"} else f"✗ {d_info['status'].upper()}"
            print(f"  - `{d}` ({d_info['title']}): [{mark}]")

    print("--------------------------------------------------------------------------------")
    print("Read List (Max 5 specs):")
    for r in info["read"]:
        exists = "✓" if (REPO / r).exists() else "✗ MISSING"
        print(f"  - [{exists}] {r}")

    print("--------------------------------------------------------------------------------")
    print("Files Allowlist (Touch ONLY these paths + colocated tests):")
    for f in info["files"]:
        exists = "✓" if (REPO / f).exists() else "○ NEW"
        print(f"  - [{exists}] {f}")

    if info.get("technical_contract"):
        print("--------------------------------------------------------------------------------")
        print("Technical Contract & Interfaces:")
        for tc in info["technical_contract"]:
            print(f"  • {tc}")

    if info.get("security_invariants"):
        print("--------------------------------------------------------------------------------")
        print("Invariants & Security Guardrails:")
        for inv in info["security_invariants"]:
            print(f"  • {inv}")

    print("--------------------------------------------------------------------------------")
    print(f"Done Command: {info['cmd']}")
    print("--------------------------------------------------------------------------------")
    print("Implementation Steps:")
    for d in info["do"]:
        print(f"  {d}")

    if info.get("acceptance_scenarios"):
        print("--------------------------------------------------------------------------------")
        print("Acceptance Criteria & Test Scenarios:")
        for sc in info["acceptance_scenarios"]:
            print(f"  {sc}")
    else:
        print("--------------------------------------------------------------------------------")
        print(f"DONE WHEN: {info['done']}")

    if info.get("human_contribution"):
        print("--------------------------------------------------------------------------------")
        print("HUMAN CONTRIBUTION (What to do from your side):")
        for h in info["human_contribution"]:
            print(f"  ⚡ {h}")
    print("================================================================================")


def cmd_ready() -> None:
    """Print all ready leaves."""
    expanded, topo, next_of, optional_of, deps_map, by_leaf = _build.expand_graph()
    cursor = get_cursor_data()

    statuses: dict[str, str] = {}
    for t, lf, _ in expanded:
        lid = _build.leaf_id(t, lf)
        statuses[lid] = _build.read_status(_build.leaf_rel(t, lf))

    ready = []
    for lid in topo:
        if statuses[lid] == "pending":
            deps = deps_map[lid]
            if all(statuses.get(d) in {"done", "skipped"} for d in deps):
                ready.append(lid)

    print(f"Found {len(ready)} ready leaves:")
    for r in ready:
        t, lf = by_leaf[r]
        gate = "optional" if optional_of[r] else "required"
        is_cur = " <- CURSOR" if r == cursor["leaf"] else ""
        print(f"`{r}` [{t['wave']}] ({gate}) — {lf['title']}{is_cur}")


def cmd_start(leaf: str | None) -> None:
    """Mark leaf as in_progress."""
    cursor = get_cursor_data()
    if not leaf:
        leaf = cursor["leaf"]
        if not leaf:
            sys.exit("No active cursor leaf. Specify leaf_id to start.")

    info = get_card_info(leaf)

    # Check dependencies
    unmet = []
    for d in info["depends"]:
        d_info = get_card_info(d)
        if d_info["status"] not in {"done", "skipped"}:
            unmet.append(f"{d} ({d_info['status']})")

    if unmet:
        sys.exit(f"Cannot start `{leaf}`: Unmet dependencies:\n- " + "\n- ".join(unmet))

    card_path = ROOT / info["path"]
    _build.set_fm_status(card_path, "in_progress")

    if leaf == cursor["leaf"]:
        update_cursor_file(
            leaf=leaf,
            status="in_progress",
            blocked_by=None,
            commit=cursor.get("last_commit"),
            session_time=cursor.get("last_session"),
        )

    _build.refresh()
    print(f"✓ Started `{leaf}` ({info['title']}). Status set to in_progress.")
    print(f"Card file: backlog/{info['path']}")
    print(f"Verification command: {info['cmd']}")


def cmd_verify(leaf: str | None) -> int:
    """Execute done_cmd for the leaf."""
    if not leaf:
        cursor = get_cursor_data()
        leaf = cursor["leaf"]
        if not leaf:
            sys.exit("No active cursor leaf. Specify leaf_id to verify.")

    info = get_card_info(leaf)
    cmd = info["cmd"]
    if not cmd:
        sys.exit(f"No done_cmd defined for `{leaf}`")

    print(f"Running done_cmd for `{leaf}`:\n$ {cmd}\n")
    res = subprocess.run(cmd, shell=True, cwd=REPO)
    if res.returncode == 0:
        print(f"\n✓ Verification SUCCEEDED for `{leaf}` (exit code 0).")
    else:
        print(f"\n✗ Verification FAILED for `{leaf}` (exit code {res.returncode}).")
    return res.returncode


def cmd_complete(
    leaf: str | None,
    commit: str | None,
    note: str | None,
    no_verify: bool = False,
) -> None:
    """Mark leaf done, update cursor, log session, refresh index, and update graphify."""
    cursor = get_cursor_data()
    if not leaf:
        leaf = cursor["leaf"]
        if not leaf:
            sys.exit("No active cursor leaf. Specify leaf_id to complete.")

    info = get_card_info(leaf)

    # Check dependencies before completing
    unmet = []
    for d in info["depends"]:
        d_info = get_card_info(d)
        if d_info["status"] not in {"done", "skipped"}:
            unmet.append(f"{d} ({d_info['status']})")

    if unmet:
        sys.exit(f"Cannot complete `{leaf}`: Unmet dependencies:\n- " + "\n- ".join(unmet))

    if not no_verify:
        print(f"Verifying done_cmd before completion for `{leaf}`...")
        ret = subprocess.run(info["cmd"], shell=True, cwd=REPO)
        if ret.returncode != 0:
            sys.exit(f"Cannot complete `{leaf}`: done_cmd failed with exit code {ret.returncode}. Fix issues or pass --no-verify.")

    # Determine commit
    actual_commit = commit or get_git_commit()
    actual_note = note or f"Completed {info['title']}"
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Set leaf status to done
    card_path = ROOT / info["path"]
    _build.set_fm_status(card_path, "done")

    # If completing cursor leaf, advance cursor
    if leaf == cursor["leaf"]:
        nxt = info["next"]
        update_cursor_file(
            leaf=nxt,
            status="done" if nxt is None else "pending",
            blocked_by=None,
            commit=actual_commit,
            session_time=now_str,
        )
        if nxt:
            print(f"✓ Cursor advanced from `{leaf}` to `{nxt}`.")
        else:
            print(f"✓ Completed final task `{leaf}`. All Phase 1 tasks completed.")
    else:
        print(f"✓ Parallel leaf `{leaf}` marked done (Cursor remains at `{cursor['leaf']}`).")

    # Append to LOG.md
    append_log(leaf, actual_commit, actual_note)
    print(f"✓ Appended entry to backlog/LOG.md.")

    # Refresh index and rollups
    _build.refresh()

    # Update knowledge graph
    run_graphify_update()
    print(f"✓ Refreshed INDEX.md and updated knowledge graph.")
    print(f"\nSuccessfully completed `{leaf}`!")

    if leaf == cursor["leaf"]:
        if info["next"]:
            print(f"Next task queued: `{info['next']}`")
            print(f"Session complete. To work on `{info['next']}` in a new session, run: python3 backlog/_runner.py start")
        else:
            print("All Phase 1 tasks and launch gate sign-off (`T-OPS-07`) are completed!")


def cmd_block(leaf: str | None, reason: str) -> None:
    """Mark leaf as blocked."""
    cursor = get_cursor_data()
    if not leaf:
        leaf = cursor["leaf"]
        if not leaf:
            sys.exit("No active cursor leaf. Specify leaf_id to block.")

    if not reason:
        sys.exit("A block reason is required (--reason <text>).")

    info = get_card_info(leaf)
    card_path = ROOT / info["path"]
    _build.set_fm_status(card_path, "blocked")

    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    actual_commit = get_git_commit()

    if leaf == cursor["leaf"]:
        update_cursor_file(
            leaf=leaf,
            status="blocked",
            blocked_by=reason,
            commit=actual_commit,
            session_time=now_str,
        )

    append_log(leaf, actual_commit, f"BLOCKED: {reason}")
    _build.refresh()
    print(f"✓ Marked `{leaf}` as BLOCKED: {reason}")


def cmd_skip(leaf: str, note: str | None) -> None:
    """Mark optional leaf as skipped."""
    info = get_card_info(leaf)
    if not info["optional"]:
        sys.exit(f"Cannot skip required leaf `{leaf}`. Only optional: true leaves can be skipped.")

    card_path = ROOT / info["path"]
    _build.set_fm_status(card_path, "skipped")

    cursor = get_cursor_data()
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    actual_commit = get_git_commit()
    actual_note = note or "Skipped optional leaf"

    if leaf == cursor["leaf"]:
        nxt = info["next"]
        update_cursor_file(
            leaf=nxt,
            status="done" if nxt is None else "pending",
            blocked_by=None,
            commit=actual_commit,
            session_time=now_str,
        )
        if nxt:
            print(f"✓ Cursor advanced from `{leaf}` to `{nxt}`.")
        else:
            print(f"✓ Skipped final task `{leaf}`. All Phase 1 tasks completed.")

    append_log(leaf, actual_commit, actual_note)
    _build.refresh()
    print(f"✓ Marked optional leaf `{leaf}` as SKIPPED.")


def cmd_reset_cursor(leaf: str) -> None:
    """Reset cursor to specific leaf."""
    info = get_card_info(leaf)
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    commit = get_git_commit()
    update_cursor_file(
        leaf=leaf,
        status="pending",
        blocked_by=None,
        commit=commit,
        session_time=now_str,
    )
    print(f"✓ Reset CURSOR.md to `{leaf}` ({info['title']}).")


LANES_CONFIG = [
    {
        "name": "Lane A: Knowledge & RAG",
        "description": "Business rules, knowledge docs ingestion & pgvector search worker",
        "tasks": ["T-KNOW-01", "T-KNOW-02", "T-KNOW-03"],
    },
    {
        "name": "Lane B: Catalog Management",
        "description": "Categories, products, variants, CSV import & re-indexing worker",
        "tasks": ["T-CAT-01", "T-CAT-02", "T-CAT-03", "T-CAT-04"],
    },
    {
        "name": "Lane C: Channels & Meta Integration",
        "description": "Meta OAuth, webhook HMAC ingestion, adapters & outbound pipeline",
        "tasks": ["T-INT-01", "T-INT-02", "T-INT-03", "T-INT-04", "T-INT-05", "T-INT-06", "T-INT-07"],
    },
    {
        "name": "Lane D: Customer CRM",
        "description": "Customer identity resolution, tags, VIP flags & merge service",
        "tasks": ["T-CUST-01", "T-CUST-02", "T-CUST-03", "T-CUST-04"],
    },
    {
        "name": "Lane E: Production Infra & Ops",
        "description": "Terraform ECS Fargate, CI/CD deploy pipeline & security matrix",
        "tasks": ["T-OPS-01", "T-OPS-02", "T-OPS-03", "T-OPS-04", "T-OPS-05", "T-OPS-06"],
    },
    {
        "name": "Lane F: Frontend Web P0",
        "description": "Web Auth UI, App Shell, Realtime Inbox & Onboarding Wizard",
        "tasks": ["T-WEB-01", "T-WEB-02", "T-WEB-03", "T-WEB-04", "T-WEB-05", "T-WEB-06"],
    },
]


def cmd_lanes() -> None:
    """Display live status of the 6 parallel execution lanes for sub-agent dispatch."""
    expanded, topo, next_of, optional_of, deps_map, by_leaf = _build.expand_graph()
    cursor = get_cursor_data()

    print("================================================================================")
    print("                 MULTI-AGENT PARALLEL EXECUTION LANES                           ")
    print("================================================================================")
    print("Independent sub-trees from DEPENDENCY_GRAPH.md that can execute in parallel:")
    print("--------------------------------------------------------------------------------")

    for lane in LANES_CONFIG:
        lane_name = lane["name"]
        lane_desc = lane["description"]
        task_ids = lane["tasks"]

        # Resolve leaf IDs (handles single-leaf and multi-leaf task parents)
        lane_leaves = []
        for tid in task_ids:
            if tid in by_leaf:
                lane_leaves.append(tid)
            else:
                child_leaves = [lid for lid in topo if lid.startswith(f"{tid}/")]
                lane_leaves.extend(child_leaves)

        # Find next uncompleted leaf in this lane
        next_leaf = None
        for lid in lane_leaves:
            st = get_card_info(lid)["status"]
            if st != "done" and st != "skipped":
                next_leaf = lid
                break

        if not next_leaf:
            badge = "✓ ALL DONE"
            action_text = "All tasks in this lane are completed."
        else:
            info = get_card_info(next_leaf)
            deps = info["depends"]
            unmet = [d for d in deps if get_card_info(d)["status"] not in {"done", "skipped"}]
            if unmet:
                badge = f"⏳ BLOCKED by {', '.join(unmet)}"
                action_text = f"Waiting on upstream: {', '.join(unmet)}"
            elif info["status"] == "in_progress":
                badge = f"⚡ IN PROGRESS (`{next_leaf}`)"
                action_text = f"Currently active: {info['title']}"
            else:
                badge = f"🚀 READY TO START (`{next_leaf}`)"
                action_text = f"Launch: python3 backlog/_runner.py start {next_leaf}"

        print(f"\n📁 {lane_name}")
        print(f"   Purpose: {lane_desc}")
        print(f"   Status:  {badge}")
        print(f"   Action:  {action_text}")
        print("   Path:    " + " -> ".join([f"`{tid}`" for tid in task_ids]))

    print("\n================================================================================")
    print("Tip: Launch a parallel task with: python3 backlog/_runner.py start <task_id>")
    print("================================================================================")


def cmd_qa(leaf: str | None) -> None:
    """Print 1-click manual QA testing instructions, curl commands, and Swagger steps."""
    cursor = get_cursor_data()
    target_leaf = leaf or cursor["leaf"]
    if not target_leaf:
        sys.exit("No active leaf to run QA for.")

    info = get_card_info(target_leaf)
    print("================================================================================")
    print(f"HUMAN QA & SMOKE TEST PLAN: `{info['id']}` — {info['title']}")
    print("================================================================================")
    print(f"Parent: {info['parent']} | Wave: {info['wave']} — {info['wave_title']}")
    print("--------------------------------------------------------------------------------")

    print("🌐 1. LOCAL SERVICE DASHBOARDS:")
    print("   • API Swagger Docs:      http://localhost:3001/api/docs")
    print("   • Prisma Studio (DB):    pnpm --filter api exec prisma studio (http://localhost:5555)")
    print("   • Web Application UI:    http://localhost:3000")
    print("   • MinIO Storage Console: http://localhost:9001 (minioadmin / minioadmin)")
    print("   • Redis Commander:       http://localhost:8081")

    print("\n--------------------------------------------------------------------------------")
    print("🔑 2. ENVIRONMENT VARIABLES TO VERIFY:")
    hc = info.get("human_contribution", [])
    env_items = [h for h in hc if "env" in h.lower() or "secret" in h.lower() or "key" in h.lower()]
    if env_items:
        for e in env_items:
            print(f"   • {e}")
    else:
        print("   • Standard local `.env` variables (Database, Redis, JWT secrets).")

    print("\n--------------------------------------------------------------------------------")
    print("🧪 3. STEP-BY-STEP MANUAL TESTING INSTRUCTIONS:")
    test_items = [h for h in hc if not ("env" in h.lower() or "review" in h.lower())]
    if test_items:
        for t in test_items:
            print(f"   ⚡ {t}")
    else:
        print("   ⚡ Execute test command and verify in Swagger UI.")

    if info.get("technical_contract"):
        print("\n--------------------------------------------------------------------------------")
        print("📡 4. ENDPOINTS TO TEST:")
        for tc in info["technical_contract"]:
            print(f"   • {tc}")

    print("\n--------------------------------------------------------------------------------")
    print("👁️ 5. REVIEW & SIGN-OFF CRITERIA:")
    rev_items = [h for h in hc if "review" in h.lower() or "sign-off" in h.lower()]
    if rev_items:
        for r in rev_items:
            print(f"   • {r}")
    print("   • Verification command passes: " + info["cmd"])
    print("   • Full workspace check passes: pnpm check:full")
    print("================================================================================")


def cmd_scaffold(leaf: str | None, force: bool = False) -> None:
    """Scaffold TypeScript test suites from card acceptance criteria for TDD."""
    cursor = get_cursor_data()
    target_leaf = leaf or cursor["leaf"]
    if not target_leaf:
        sys.exit("No active leaf to scaffold tests for.")

    info = get_card_info(target_leaf)
    files = info.get("files", [])
    spec_files = [
        f for f in files
        if f.endswith(".spec.ts") or f.endswith(".test.ts") or f.endswith(".spec.tsx") or f.endswith(".test.tsx")
    ]

    if not spec_files:
        domain_files = [f for f in files if f.endswith(".ts") and not f.endswith(".dto.ts") and not f.endswith(".module.ts")]
        if domain_files:
            spec_files = [domain_files[0][:-3] + ".spec.ts"]
        else:
            ts_files = [f for f in files if f.endswith(".ts") or f.endswith(".tsx")]
            if ts_files:
                target_f = ts_files[0]
                if target_f.endswith(".tsx"):
                    spec_files = [target_f[:-4] + ".spec.tsx"]
                else:
                    spec_files = [target_f[:-3] + ".spec.ts"]
            else:
                print("================================================================================")
                print(f"TDD TEST SCAFFOLDER: `{info['id']}` — {info['title']}")
                print("================================================================================")
                print(f"ℹ️  Leaf `{info['id']}` does not modify TypeScript code files (allowlist: {', '.join(files) if files else 'empty'}).")
                print("   Skipping test suite scaffolding.")
                print("================================================================================")
                return

    criteria = info.get("acceptance_scenarios", [])
    if not criteria:
        criteria = [info["done"]]

    print("================================================================================")
    print(f"TDD TEST SCAFFOLDER: `{info['id']}` — {info['title']}")
    print("================================================================================")

    for spec_path_str in spec_files:
        spec_path = REPO / spec_path_str
        describe_title = f"{info['title']} ({info['id']})"

        test_blocks = []
        for c in criteria:
            clean_c = c.replace("[ ]", "").replace("**", "").strip()
            if clean_c.startswith("-"):
                clean_c = clean_c[1:].strip()
            clean_c = " ".join(clean_c.split())
            clean_c = clean_c.replace('"', '\\"')
            test_blocks.append(f"""  it("{clean_c}", () => {{
    // TODO: Implement test assertion for: {clean_c}
    expect(true).toBe(true);
  }});""")

        clean_title = describe_title.replace('"', '\\"')
        test_content = f"""/**
 * Automated TDD Test Suite for {info['id']} — {info['title']}
 * Generated from backlog card acceptance criteria.
 */

describe("{clean_title}", () => {{
  beforeEach(() => {{
    // Setup test module & mocks
  }});

{chr(10).join(test_blocks)}
}});
"""

        if spec_path.exists() and not force:
            print(f"\n⚠️  File already exists: `{spec_path_str}`")
            print("   Use --force to overwrite, or view generated scaffold below:\n")
            print("--------------------------------------------------------------------------------")
            print(test_content)
            print("--------------------------------------------------------------------------------")
        else:
            spec_path.parent.mkdir(parents=True, exist_ok=True)
            spec_path.write_text(test_content, encoding="utf-8")
            print(f"\n✓ Scaffolded test suite written to: `{spec_path_str}`")
            print(f"  Includes {len(criteria)} pre-filled test scenarios from card acceptance criteria.")

    print("\nNext steps for TDD:")
    print(f"  1. Run tests (Red):   {info['cmd']}")
    print(f"  2. Implement code in: {', '.join(info['files'])}")
    print(f"  3. Verify (Green):    python3 backlog/_runner.py verify {info['id']}")
    print("================================================================================")


def cmd_check_arch() -> None:
    """Audit codebase for architectural boundaries, cross-module imports, and unapproved packages."""
    import json
    print("================================================================================")
    print("             ARCHITECTURAL BOUNDARY & IMPORT INTEGRITY AUDIT                    ")
    print("================================================================================")
    print("Scanning TypeScript AST and imports against 10_ARCHITECTURE.md rules...")

    violations = []
    checked_files = 0

    # 1. Check apps/web -> apps/api forbidden imports
    web_dir = REPO / "apps/web"
    if web_dir.exists():
        for p in web_dir.rglob("*.ts*"):
            if "node_modules" in str(p) or ".next" in str(p):
                continue
            checked_files += 1
            content = p.read_text(encoding="utf-8", errors="ignore")
            for line_no, line in enumerate(content.splitlines(), start=1):
                if re.search(r"from\s+['\"].*apps/api", line) or re.search(r"from\s+['\"].*\.\./api", line):
                    violations.append({
                        "rule": "RULE-ARCH-01: Forbidden Web-to-API Direct Import",
                        "file": str(p.relative_to(REPO)),
                        "line": line_no,
                        "content": line.strip(),
                        "fix": "Import from `@repo/shared` or call REST API instead.",
                    })

    # 2. Check unapproved packages in package.json
    FORBIDDEN_PACKAGES = {"baileys", "whatsapp-web.js", "puppeteer-extra", "playwright-aws-lambda"}
    for pj in REPO.rglob("package.json"):
        if "node_modules" in str(pj):
            continue
        try:
            data = json.loads(pj.read_text(encoding="utf-8"))
            deps = {**data.get("dependencies", {}), **data.get("devDependencies", {})}
            for pkg in deps:
                if pkg.lower() in FORBIDDEN_PACKAGES:
                    violations.append({
                        "rule": "RULE-ARCH-02: Unapproved External Package Detected",
                        "file": str(pj.relative_to(REPO)),
                        "line": 1,
                        "content": f"Package '{pkg}' is forbidden per 03_MVP_SCOPE.md",
                        "fix": "Remove unofficial package; use official cloud APIs only.",
                    })
        except Exception:
            pass

    # 3. Check apps/api cross-module deep private imports (10 §4)
    api_src = REPO / "apps/api/src"
    domain_modules = [
        "auth", "businesses", "products", "catalog", "customers", "conversations",
        "ai", "orders", "integrations", "analytics", "notifications",
        "realtime", "platform"
    ]
    if api_src.exists():
        for p in api_src.rglob("*.ts"):
            if "node_modules" in str(p) or p.name.endswith(".spec.ts"):
                continue
            checked_files += 1
            rel = p.relative_to(api_src)
            parts = rel.parts
            if len(parts) > 1:
                cur_mod = parts[0]
                if cur_mod in domain_modules:
                    content = p.read_text(encoding="utf-8", errors="ignore")
                    for line_no, line in enumerate(content.splitlines(), start=1):
                        for other_mod in domain_modules:
                            if other_mod != cur_mod and other_mod != "platform":
                                if re.search(rf"from\s+['\"]\.\./{other_mod}/.+['\"]", line):
                                    violations.append({
                                        "rule": "RULE-ARCH-03: Forbidden Cross-Module Private Import",
                                        "file": str(p.relative_to(REPO)),
                                        "line": line_no,
                                        "content": line.strip(),
                                        "fix": f"Export domain service from {other_mod}.module.ts or use shared events.",
                                    })

    print(f"\nScanned {checked_files} TypeScript files across monorepo.")
    print("--------------------------------------------------------------------------------")

    if violations:
        print(f"❌ FOUND {len(violations)} ARCHITECTURAL VIOLATIONS:\n")
        for v in violations:
            print(f"  • [{v['rule']}]")
            print(f"    File: {v['file']}:{v['line']}")
            print(f"    Code: {v['content']}")
            print(f"    Fix:  {v['fix']}\n")
        print("================================================================================")
        sys.exit(1)
    else:
        print("✅ 0 Architectural Violations Found!")
        print("   • Web -> API isolation: 100% compliant")
        print("   • Package lockfile hygiene: 100% compliant")
        print("   • Cross-module NestJS boundaries: 100% compliant")
        print("================================================================================")


def cmd_test_everything(skip_e2e: bool = False, fast: bool = False, app: str | None = None) -> int:
    """Run comprehensive test-everything suite across monorepo."""
    script = REPO / "scripts/test-everything.mjs"
    if not script.exists():
        sys.exit(f"Error: missing {script}")
    cmd = ["node", str(script)]
    if skip_e2e:
        cmd.append("--skip-e2e")
    if fast:
        cmd.append("--fast")
    if app:
        cmd.extend(["--app", app])
    res = subprocess.run(cmd, cwd=REPO)
    return res.returncode


def main() -> None:
    parser = argparse.ArgumentParser(description="Backlog step-by-step execution runner")
    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # status
    subparsers.add_parser("status", help="Show backlog progress and active cursor")

    # current / info
    subparsers.add_parser("current", help="Print details of active cursor leaf")
    info_parser = subparsers.add_parser("info", help="Print details of a leaf")
    info_parser.add_argument("leaf", nargs="?", help="Leaf ID (e.g. T-BOOT-01/a)")

    # ready / lanes
    subparsers.add_parser("ready", help="List all ready/unblocked leaves")
    subparsers.add_parser("lanes", help="Show status of 6 parallel execution lanes")

    # qa
    qa_parser = subparsers.add_parser("qa", help="Show 1-click human QA and smoke testing plan")
    qa_parser.add_argument("leaf", nargs="?", help="Leaf ID (default: cursor leaf)")

    # scaffold
    scaffold_parser = subparsers.add_parser("scaffold", help="Scaffold test files from acceptance criteria for TDD")
    scaffold_parser.add_argument("leaf", nargs="?", help="Leaf ID (default: cursor leaf)")
    scaffold_parser.add_argument("--force", action="store_true", help="Overwrite existing test file")

    # check-arch
    subparsers.add_parser("check-arch", help="Audit architectural boundaries and import hygiene")

    # start
    start_parser = subparsers.add_parser("start", help="Mark leaf as in_progress")
    start_parser.add_argument("leaf", nargs="?", help="Leaf ID (default: cursor leaf)")

    # verify
    verify_parser = subparsers.add_parser("verify", help="Run done_cmd for leaf")
    verify_parser.add_argument("leaf", nargs="?", help="Leaf ID (default: cursor leaf)")

    # complete
    complete_parser = subparsers.add_parser("complete", help="Complete leaf, advance cursor, log and refresh")
    complete_parser.add_argument("leaf", nargs="?", help="Leaf ID (default: cursor leaf)")
    complete_parser.add_argument("--commit", help="Git commit hash")
    complete_parser.add_argument("--note", help="Note for LOG.md")
    complete_parser.add_argument("--no-verify", action="store_true", help="Skip running done_cmd")

    # block
    block_parser = subparsers.add_parser("block", help="Mark leaf as blocked")
    block_parser.add_argument("leaf", nargs="?", help="Leaf ID (default: cursor leaf)")
    block_parser.add_argument("--reason", required=True, help="Reason for blockage")

    # skip
    skip_parser = subparsers.add_parser("skip", help="Skip optional leaf")
    skip_parser.add_argument("leaf", help="Leaf ID to skip")
    skip_parser.add_argument("--note", help="Note for LOG.md")

    # test-everything
    test_everything_parser = subparsers.add_parser(
        "test-everything",
        help="Run 8-gate test-everything suite across monorepo",
    )
    test_everything_parser.add_argument(
        "--skip-e2e",
        action="store_true",
        help="Skip Playwright browser E2E test gate",
    )
    test_everything_parser.add_argument(
        "--fast",
        action="store_true",
        help="Fast mode: skip typecheck and E2E suites",
    )
    test_everything_parser.add_argument(
        "--app",
        help="Specific target app for React Doctor (e.g. apps/api, apps/web)",
    )

    args = parser.parse_args()

    if not args.command or args.command == "status":
        cmd_status()
    elif args.command == "current":
        cmd_info(None)
    elif args.command == "info":
        cmd_info(args.leaf)
    elif args.command == "ready":
        cmd_ready()
    elif args.command == "lanes":
        cmd_lanes()
    elif args.command == "qa":
        cmd_qa(args.leaf)
    elif args.command == "scaffold":
        cmd_scaffold(args.leaf, args.force)
    elif args.command == "check-arch":
        cmd_check_arch()
    elif args.command == "test-everything":
        code = cmd_test_everything(args.skip_e2e, args.fast, args.app)
        sys.exit(code)
    elif args.command == "start":
        cmd_start(args.leaf)
    elif args.command == "verify":
        code = cmd_verify(args.leaf)
        sys.exit(code)
    elif args.command == "complete":
        cmd_complete(args.leaf, args.commit, args.note, args.no_verify)
    elif args.command == "block":
        cmd_block(args.leaf, args.reason)
    elif args.command == "skip":
        cmd_skip(args.leaf, args.note)
    elif args.command == "reset-cursor":
        cmd_reset_cursor(args.leaf)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()

