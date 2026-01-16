# Daily Workflow

> **How to use Bridge Watcher day-to-day.**

---

## The Simple Version (3 Commands)

```bash
# Terminal 1: Start OpenCode server
opencode serve

# Terminal 2: Run Bridge
cd ~/dev/my-app
bridge run
```

That's it. Bridge processes tasks automatically.

When done: `Ctrl+C` both terminals.

---

## Detailed Workflow

### 1. Planning Phase (Antigravity)

Use Antigravity (this AI) to plan tasks:

1. Describe what you want to build
2. Antigravity creates task files in `.ai-handoff/tasks/`
3. Each task has a clear goal, scope, and verification commands

### 2. Execution Phase (Bridge + OpenCode)

**Terminal 1 - OpenCode Server:**
```bash
opencode serve
```
Leave this running.

**Terminal 2 - Bridge Watcher:**
```bash
cd ~/dev/my-app
bridge run
```

Bridge will:
1. Pick up tasks from `.ai-handoff/tasks/`
2. Create isolated worktree for each task
3. Send task to OpenCode (via Docker sandbox)
4. Run verification commands (via Docker sandbox)
5. Write results to `.ai-handoff/results/`
6. Clean up worktree

### 3. Review Phase (You)

After Bridge finishes:

```bash
# Check results
ls .ai-handoff/results/

# View a specific result
cat .ai-handoff/results/<task-id>.json

# View patches (what changed)
cat .ai-handoff/patches/<task-id>_post.patch
```

### 4. Commit Changes (Manual)

Bridge creates branches but does NOT merge. You decide:

```bash
# See branches created by Bridge
git branch | grep feat/ai

# Merge if happy
git checkout main
git merge feat/ai/<task-id>

# Or cherry-pick specific changes
```

---

## Workflow Diagram

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Antigravity │ ──▶ │   Bridge    │ ──▶ │   OpenCode  │
│  (Planner)   │     │  (Watcher)  │     │  (Executor) │
└─────────────┘     └─────────────┘     └─────────────┘
      │                    │                    │
      ▼                    ▼                    ▼
  Creates             Orchestrates          Edits files
  task.json           execution             in worktree
                           │
                           ▼
                    ┌─────────────┐
                    │   Docker    │
                    │  (Sandbox)  │
                    └─────────────┘
                           │
                           ▼
                    Runs verification
                    (bun test, etc.)
```

---

## Common Scenarios

### Pause and Resume

```bash
# Pause: Just Ctrl+C the bridge run terminal
# Resume: Run bridge run again (it's idempotent)
bridge run
```

### Approve a Pending Task

If a task requires confirmation:

```bash
# Move from pending back to tasks
mv .ai-handoff/pending/<task-id>.json .ai-handoff/tasks/
```

### Skip a Failed Task

```bash
# Check why it failed
cat .ai-handoff/results/<task-id>.json | jq '.reason'

# If you want to retry, delete the result and re-add task
rm .ai-handoff/results/<task-id>.json
mv .ai-handoff/failed/<task-id>.json .ai-handoff/tasks/
```

---

## Shutdown Checklist

1. `Ctrl+C` the Bridge terminal
2. `Ctrl+C` the OpenCode terminal
3. (Optional) Stop Docker Desktop if not needed

---

## Quick Commands

| Action | Command |
|--------|---------|
| Start OpenCode | `opencode serve` |
| Start Bridge | `bridge run` |
| Check queue | `ls .ai-handoff/tasks/` |
| Check results | `ls .ai-handoff/results/` |
| Check failures | `grep -l '"status": "failed"' .ai-handoff/results/*.json` |
| Clear worker lock | `rm .ai-handoff/locks/__worker__.lock` |
| Re-run harness | `bridge harness` |
