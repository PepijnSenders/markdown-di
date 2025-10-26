---
schema: command
name: review-pr
description: Comprehensive pull request review with code quality, security, and test coverage analysis
category: code-review
priority: high
version: 1.0.0
author: Development Team
created: 2025-01-26
updated: 2025-01-26
tags:
  - pr-review
  - code-quality
  - security
arguments: []
allowed-tools: Read, Grep, Glob, Bash
model: claude-sonnet-4-5-20250929
output-frontmatter:
  - allowed-tools
  - description
  - model
---

# Command: /{{name}}

## Metadata
- **Category**: {{category}}
- **Priority**: {{priority}}
- **Version**: {{version}}
- **Author**: {{author}}
- **Last Updated**: {{updated}}

## Description
{{description}}

## Tags
{{#tags}}
- {{.}}
{{/tags}}

## Usage
```bash
/review-pr
```

## What it does

1. Check out the PR branch
2. Read all changed files
3. Analyze code quality, security, and performance
4. Check for test coverage
5. Verify documentation is updated
6. Provide a summary with:
   - Strengths
   - Issues (categorized by severity)
   - Suggestions for improvement
7. Add review comments to the PR

## Output Format

```
PR Review Summary
=================

Strengths:
✓ Well-structured code
✓ Good test coverage (87%)
✓ Clear commit messages

Issues:
⚠️  High: Security vulnerability in auth.ts:45
⚠️  Medium: Missing error handling in api.ts:92
ℹ️  Low: Consider extracting helper function at utils.ts:123

Suggestions:
- Add input validation for user endpoints
- Update API documentation
- Consider adding integration tests
```

## Implementation

The command executes the following prompt:

Review the current pull request:

1. Check out the PR branch
2. Read all changed files
3. Analyze code quality, security, and performance
4. Check for test coverage
5. Verify documentation is updated
6. Provide a summary with strengths, issues (categorized by severity), and suggestions
7. Add review comments to the PR
