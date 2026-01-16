# Getting Started with Bridge Watcher

> **One-time setup guide. Follow this once, then use `01_DAILY_WORKFLOW.md` daily.**

---

## Prerequisites

You need the following installed on your machine:

### 1. Bun (JavaScript Runtime)

```bash
# macOS / Linux
curl -fsSL https://bun.sh/install | bash

# Verify
bun --version
```

### 2. Docker (Container Runtime)

**macOS:**
1. Download [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop/)
2. Install and open it
3. Wait for Docker to start (whale icon in menu bar)

**Verify:**
```bash
docker --version
docker run hello-world
```

### 3. Git

```bash
# macOS (usually pre-installed)
git --version

# If not installed
xcode-select --install
```

### 4. OpenCode (AI Executor)

```bash
# Install OpenCode
npm install -g opencode

# Verify
opencode --version
```

---

## Step 1: Clone the Bridge Repo

```bash
cd ~/dev
git clone <bridge-watcher-repo-url> bridge-watcher
cd bridge-watcher
bun install
```

---

## Step 2: Build the Docker Runner Image

```bash
cd ~/dev/bridge-watcher
docker build -t bridge-runner:dev .
```

This creates the secure container image that will execute all tasks.

**Verify:**
```bash
docker images | grep bridge-runner
```

---

## Step 3: Link Bridge CLI (Optional)

To use `bridge` command from anywhere:

```bash
cd ~/dev/bridge-watcher
bun link
```

Now you can run `bridge` from any directory.

---

## Step 4: Initialize Your App Repo

Go to your application repo and initialize Bridge:

```bash
cd ~/dev/my-app
bridge init
```

This creates:
- `.ai-handoff/` directory structure
- Updates `.gitignore` to exclude `.ai-handoff/`

---

## Step 5: Verify Setup

Run the harness to ensure everything is working:

```bash
cd ~/dev/my-app
bridge harness
```

All tests should pass. If any fail, see `03_TROUBLESHOOTING.md`.

---

## Step 6: Configure OpenCode Authentication

```bash
# Login to OpenCode (Google OAuth)
opencode auth login
```

Follow the browser prompts to authenticate.

---

## You're Ready!

See `01_DAILY_WORKFLOW.md` for how to use Bridge day-to-day.

---

## Quick Reference

| What | Command |
|------|---------|
| Start OpenCode server | `opencode serve` |
| Run Bridge | `bridge run` |
| Run harness | `bridge harness` |
| Initialize new repo | `bridge init` |
| Rebuild runner image | `docker build -t bridge-runner:dev .` |

---

## Directory Structure After Setup

```
~/dev/
├── bridge-watcher/          # The Bridge tool (never deployed)
│   ├── src/
│   ├── Dockerfile
│   └── ...
└── my-app/                  # Your application (deploys to Cloudflare)
    ├── src/
    ├── .ai-handoff/         # Bridge state (gitignored)
    └── ...
```
