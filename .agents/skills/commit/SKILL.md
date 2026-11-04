---

name: commit
description: Create atomic, well-formatted Conventional Commits with appropriate gitmoji
argument-hint: Optional flags like -m or --no-verify
model: haiku
allowed-tools: Bash(git status:*), Bash(git add:*), Bash(git diff:*), Bash(git diff --cached:*), Bash(git commit:*), Bash(git config:*)

---

# Commit

Create clean, atomic Git commits using Conventional Commits and appropriate gitmoji.

## Core Rules

1. Never commit blindly.
2. Inspect the repository state before making changes.
3. Review the actual staged diff before writing the commit message.
4. Never modify files merely to make the commit cleaner.
5. Never include unrelated changes in a commit.
6. Never add AI tools, agents, or yourself as a Git co-author.
7. Do not create a commit if there are no changes to commit.
8. Git hooks handle automated verification. Do not bypass them unless the user explicitly requests `--no-verify`.

## Workflow

### 1. Inspect repository state

Run:

```bash
git status
```

Determine:

* Which files are staged
* Which files are unstaged
* Which files are untracked

### 2. Determine the commit scope

If files are already staged:

* Commit ONLY the staged files/hunks.
* Do not automatically stage unrelated files.

If nothing is staged:

```bash
git add -A
```

Then continue.

### 3. Review the staged diff

Run:

```bash
git diff --cached
```

The staged diff is the authoritative source for the commit message.

### 4. Check for atomicity

Determine whether the staged changes represent one coherent logical change.

A commit should have:

* One clear purpose
* Related changes
* A single coherent reason to exist
* A commit message that accurately describes the entire diff

Consider splitting when there are:

* Different concerns
* Different features
* Different bug fixes
* Feature + unrelated refactor
* Feature + unrelated documentation
* Functional changes + unrelated formatting
* Unrelated dependency changes

### 5. Split commits when appropriate

If changes contain multiple independent logical changes, split them when it can be done safely.

For separate files:

```bash
git reset
git add <specific-files>
git diff --cached
git commit
```

For partial changes:

```bash
git add -p
```

After each commit, inspect the remaining changes before creating another commit.

Never use destructive commands such as:

```bash
git reset --hard
git checkout .
git restore .
```

unless explicitly requested by the user.

If changes cannot be safely separated, keep them together and write the most accurate commit message possible.

## Commit Message Format

Use:

```text
<gitmoji> <type>(<scope>): <imperative description>

<optional body>

<optional footer>
```

### Subject

* Use imperative mood.
* Keep it concise, preferably under 72 characters.
* Start the description with lowercase.
* Do not end with a period.
* Describe the actual change.
* Avoid vague messages such as `update stuff`, `fix things`, or `changes`.

### Body & Detail Level

* **Default (Balanced Detail)**: By default, provide a balanced level of detail with a clear subject and structured body. Explain the context, key implementation changes, and behavioral impact.
* **Simple (Extra Small Changes Only)**: Keep the message simple (subject-only without a body) only for extra small changes, such as single-line fixes, minor typos, or trivial version/config bumps.
* **Prioritize Bullet Points**: In the commit body, prioritize concise bullet points (`- `) to highlight key changes and decisions rather than dense paragraphs.
* **Backtick Formatting**: Use backticks (`` ` ``) for important words, classes, methods, variables, flags, or file names (e.g., `MeteringService`, `status`, `auth.guard.ts`).

Good (Default — Balanced Detail):

```text
✨ feat(auth): add JWT authentication and route guard

- Protect API endpoints with stateless access token validation in `AuthGuard`
- Centralize authentication strategy in `jwt.strategy.ts` using `PassportModule`
- Issue signed tokens on login in `AuthService` with configurable `expiresIn`
- Return `401 Unauthorized` for expired or malformed bearer tokens
```

Good (Extra Small Change — Simple):

```text
🐛 fix(metering): correct `cronExpression` syntax in `MeteringProcessor`
```

Bad (Raw file list without explanation):

```text
✨ feat(auth): add JWT authentication

- Added auth.service.ts
- Added auth.controller.ts
- Added jwt.strategy.ts
- Added auth.guard.ts
```

The diff already communicates file creation; focus bullet points on what was implemented and why, referencing important components with backticks.

## Conventional Commit Types

| Type       | Use                                        |
| ---------- | ------------------------------------------ |
| `feat`     | New functionality                          |
| `fix`      | Bug fix                                    |
| `docs`     | Documentation                              |
| `style`    | Formatting only; no behavior change        |
| `refactor` | Code restructuring without behavior change |
| `perf`     | Performance improvement                    |
| `test`     | Tests                                      |
| `build`    | Build system or dependency changes         |
| `ci`       | CI/CD changes                              |
| `chore`    | Maintenance/tooling                        |
| `revert`   | Revert a previous commit                   |

## Gitmoji

Use the most specific appropriate gitmoji.

### Primary

* ✨ `feat`
* 🐛 `fix`
* 📝 `docs`
* 💄 `style`
* ♻️ `refactor`
* ⚡ `perf`
* 🧪 `test`
* 🔧 `chore`
* 🚀 `ci`
* 🗑️ `revert`

### Specialized

* 🦺 Validation
* 👔 Business logic
* 🔒 Security
* 🚑 Hotfix
* 🚨 Linter
* 🔥 Remove code
* ⚰️ Remove dead code
* 👽 External API
* 🗃️ Database
* ➕ Add dependency
* ➖ Remove dependency
* 📌 Pin dependency/version
* 📦 Package changes
* 🙈 Gitignore
* 🧑‍💻 Developer experience
* 🏗️ Architecture
* 🚚 Move/rename
* 📈 Analytics
* 🔊 Logging
* 🔇 Remove logging
* 🧵 Concurrency
* 📱 Responsive
* 🔍 SEO
* 💥 Breaking change
* 🧪 Failing test
* 🤡 Mocks
* 📸 Snapshots
* 🍱 Assets
* 💬 Text/literals

Do not force a specialized gitmoji when the standard one is clearer.

## Scope

Use a scope when it improves clarity.

Examples:

```text
✨ feat(auth): add JWT authentication
🐛 fix(users): prevent duplicate email registration
🗃️ feat(database): add conversation indexes
🧑‍💻 chore(dev): improve local development setup
```

Omit the scope when it provides no useful information:

```text
📝 docs: update installation instructions
🔧 chore: update project configuration
```

## Verification

Before committing:

1. Review the staged diff:

```bash
git diff --cached
```

2. Ensure the commit message accurately represents the staged changes.
3. Do not manually run expensive verification commands unless necessary.
4. Repository Git hooks handle automated verification.
5. Never use `--no-verify` unless explicitly requested by the user.

## Commit

For standard commits (default — balanced detail with bullet points):

```bash
git commit -m "<subject>" -m "- Bullet point 1 referencing \`importantEntity\`
- Bullet point 2 explaining \`anotherChange\`"
```

For extra small changes (simple commit):

```bash
git commit -m "<subject>"
```

Preserve additional Git flags supplied by the user when appropriate.

Never add AI attribution or co-author trailers such as:

```text
Co-authored-by:
Co-Authored-By:
AI-generated:
Generated-by:
```

## Final Response

After committing, report:

* Commit hash
* Commit message
* Brief summary of what was committed
* Whether changes were split into multiple commits

Keep the response concise.

Example:

```text
Committed.

✨ feat(auth): add JWT authentication

Commit: a1b2c3d

Added JWT authentication and route protection.
```
