# Bridge Watcher Security Rules

> Project-specific rules for secure development of the Bridge Watcher orchestration engine.

## Security-First Development

### Safe Wrappers Required
- **NEVER** use raw `fs` operations - use `fsSafe` wrapper
- **NEVER** use raw `git` commands - use `gitSafe` wrapper  
- **ALWAYS** scan for secrets before any output - use `StreamScanner`

### Docker Sandbox
All untrusted code execution MUST use:
- `--network=none` - No network access
- `--read-only` - Read-only container filesystem
- `--cap-drop=ALL` - Minimal capabilities
- `--security-opt=no-new-privileges` - No privilege escalation

### Path Confinement
- All file operations confined to approved root directories
- Symlink attacks blocked via O_NOFOLLOW
- Parent directory traversal (`..`) validation required

## Testing Requirements

### Before Any PR
1. Run harness: `bun run src/cli.ts harness`
2. All 6 adversarial tests must pass
3. TypeScript must compile: `bun run typecheck`

### The 6 Adversarial Tests
1. **Symlink Race** - O_NOFOLLOW blocks file swaps
2. **Untracked Secret** - New files scanned for secrets
3. **Overlap Leak** - 8KB buffer catches split secrets
4. **Delete Escape** - Path confinement on cleanup
5. **Hook Trap** - Git hooks disabled
6. **Exfil Attempt** - Network blocked in sandbox

## Commit Guidelines

- Prefix security-related commits with `sec:`
- Any change to safe wrappers requires harness re-run
- Document security implications in commit message
