---
name: code-review-nextjs
description: Ruthless Next.js/TS code review for uncommitted/staged changes. Finds bugs, enforces shadcn/Tailwind/Zustand/TRPC standards.
metadata:
  short-description: "Elite code review for solo/team Next.js projects"
  trigger-phrases: ["review code", "check changes", "audit nextjs"]
---

# EXECUTION PROTOCOL

1. Scan uncommitted/staged changes (git diff HEAD, unstaged files).
2. Check: ESLint/Vitest compliance, security (no secrets), perf (no N+1), accessibility.
3. Output: Markdown table of issues + fixes (code blocks).

EXAMPLES in /examples/. REFERENCES in /references/.

CRITICAL: Never approve without fixes. Prioritize user repo context.
