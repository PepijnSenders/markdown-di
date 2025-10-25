# Automated Release Process

This repository uses a fully automated CI/CD workflow. Simply create PRs and the CI handles everything else.

## How It Works

### 1. Branch Naming Convention

The version bump type is determined by your branch name prefix:

- `patch/feature-name` → Patch version bump (0.8.0 → 0.8.1)
- `minor/feature-name` → Minor version bump (0.8.0 → 0.9.0)
- `major/breaking-change` → Major version bump (0.8.0 → 1.0.0)
- Any other name defaults to patch

### 2. Workflow Steps

When you merge a PR to `main`:

1. ✅ **Tests run** - Ensures everything passes
2. 📦 **Version bumps** - Based on branch prefix
3. 📝 **CHANGELOG updates** - Automatically adds entry with PR details
4. 🏷️ **Git tag created** - Creates version tag (e.g., `v0.9.0`)
5. 📤 **Publishes to npm** - With provenance
6. 🎉 **GitHub Release created** - With PR details

### 3. Example Workflow

```bash
# Create a feature branch with version prefix
git checkout -b patch/fix-bug
# or
git checkout -b minor/new-feature
# or
git checkout -b major/breaking-change

# Make your changes and commit
git add .
git commit -m "fix: resolve issue"
git push origin patch/fix-bug

# Create PR on GitHub
# When merged, CI automatically:
# - Bumps version
# - Updates CHANGELOG
# - Creates tag
# - Publishes to npm
# - Creates GitHub release
```

### 4. What You Need

- **NPM_TOKEN**: Set as repository secret for npm publishing
- **Permissions**: Write access for GitHub Actions (automatically configured)

### 5. CHANGELOG Format

The CHANGELOG is automatically maintained with this format:

```markdown
## [0.9.0] - 2025-10-25

### Changed
- Add new feature ([#123](PR_URL)) by @username
```

## Manual Override

If you need to skip the automated release, you can:
1. Use a branch name without a version prefix
2. Add `[skip ci]` to the PR title

## Troubleshooting

- **Tests fail**: PR won't merge until tests pass
- **Publish fails**: Check NPM_TOKEN secret is set correctly
- **Version conflict**: Ensure main is up to date before merging
