---
id: T-AREA-NN
wave: W0
status: pending # pending | in_progress | done | blocked | skipped
optional: false
size: L # S | M | L | XL
children: [] # required leaf ids
optional_children: [] # Should leaves — not required to close the parent
fs: []
---

# Parent Task: T-AREA-NN — Title

Parent epic grouping multi-leaf subtasks.

- **Status Rollup**: Automatically calculated via `python3 backlog/_build.py --refresh`.
- **Completion**: Closes automatically when all required leaves in `children` reach `status: done`.
- **Optional Leaves**: Leaves in `optional_children` may remain `pending` or `skipped` without blocking the launch gate.
