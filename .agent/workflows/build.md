---
description: Build the Docker runner image for sandbox execution
---

# /build Workflow

Build the `bridge-runner:dev` Docker image used for sandboxed code execution.

## Command

```bash
docker build -t bridge-runner:dev .
```

## Prerequisites

- Docker Desktop must be running
- Working directory must be project root

## Verify Build

After building, verify the image exists:

```bash
docker images bridge-runner:dev
```

## When to Rebuild

- After changes to `Dockerfile`
- After updating base image (`oven/bun:1.1-alpine`)
- When setting up a fresh development environment
