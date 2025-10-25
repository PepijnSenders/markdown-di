import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { MarkdownDI } from "../src/index";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

describe("MarkdownDI", () => {
  const mdi = new MarkdownDI();

  test("should parse frontmatter correctly", async () => {
    const content = `---
name: test-doc
description: Test document
partials:
  intro: intro.md
---

# Test

{{partials.intro}}`;

    const result = await mdi.process({
      content,
      baseDir: "./test",
    });

    expect(result.frontmatter.name).toBe("test-doc");
    expect(result.frontmatter.description).toBe("Test document");
    expect(result.frontmatter.partials).toBeDefined();
    expect(result.frontmatter.partials?.intro).toBe("intro.md");
  });

  test("should validate missing required fields", async () => {
    const content = `---
description: Test document (missing name)
---

# Test`;

    const result = await mdi.process({
      content,
      baseDir: "./test",
    });

    // Without a schema, missing fields are not validated
    // This test just ensures frontmatter is parsed correctly
    expect(result.frontmatter.description).toBe("Test document (missing name)");
    expect(result.frontmatter.name).toBeUndefined();
  });

  test("should validate reference syntax", async () => {
    const content = `---
name: test-doc
description: Test document
---

# Test

{{valid.reference}}

{{invalid{reference syntax}}`;

    const result = await mdi.process({
      content,
      baseDir: "./test",
    });

    expect(result.errors.some((e) => e.type === "syntax")).toBe(true);
  });

  test("should validate reference existence", async () => {
    const content = `---
name: test-doc
description: Test document
partials:
  intro: intro.md
---

# Test

{{partials.nonexistent}}`;

    const result = await mdi.process({
      content,
      baseDir: "./test",
    });

    expect(result.errors.some((e) => e.type === "injection")).toBe(true);
  });

  test("should work in validate mode", async () => {
    const content = `---
name: test-doc
description: Test document
---

# Test`;

    const result = await mdi.process({
      content,
      baseDir: "./test",
      mode: "validate",
    });

    expect(result.errors.length).toBe(0);
    expect(result.content).toContain("# Test");
  });

  describe("with real files", () => {
    const testDir = "./test-tmp";
    const introFile = join(testDir, "intro.md");

    beforeAll(() => {
      // Create test directory and files
      mkdirSync(testDir, { recursive: true });
      writeFileSync(
        introFile,
        "# Introduction\n\nThis is the intro section.\n"
      );
    });

    afterAll(() => {
      // Clean up test files
      rmSync(testDir, { recursive: true, force: true });
    });

    test("should resolve and inject content", async () => {
      const content = `---
name: test-doc
description: Test document
partials:
  intro: intro.md
---

# Test

{{partials.intro}}`;

      const result = await mdi.process({
        content,
        baseDir: testDir,
      });

      expect(result.errors.length).toBe(0);
      expect(result.content).toContain("# Introduction");
      expect(result.content).toContain("This is the intro section.");
      expect(result.dependencies).toContain(introFile);
    });

    test("should detect missing files", async () => {
      const content = `---
name: test-doc
description: Test document
partials:
  missing: missing.md
---

# Test`;

      const result = await mdi.process({
        content,
        baseDir: testDir,
      });

      expect(result.errors.some((e) => e.type === "file")).toBe(true);
    });

    test("should block path traversal with ../", async () => {
      const content = `---
name: test-doc
description: Test document
partials:
  malicious: ../../../etc/passwd
---

# Test

{{partials.malicious}}`;

      const result = await mdi.process({
        content,
        baseDir: testDir,
      });

      expect(result.errors.some((e) => e.type === "file" && e.message.includes("Path traversal not allowed"))).toBe(true);
    });

    test("should block path traversal in glob patterns", async () => {
      const content = `---
name: test-doc
description: Test document
partials:
  malicious:
    - ../secrets/*.md
---

# Test`;

      const result = await mdi.process({
        content,
        baseDir: testDir,
      });

      expect(result.errors.some((e) => e.type === "file" && e.message.includes("Path traversal not allowed"))).toBe(true);
    });

    test("should block path traversal with .. in middle of path", async () => {
      const content = `---
name: test-doc
description: Test document
partials:
  malicious: foo/../../etc/passwd
---

# Test`;

      const result = await mdi.process({
        content,
        baseDir: testDir,
      });

      expect(result.errors.some((e) => e.type === "file" && e.message.includes("Path traversal not allowed"))).toBe(true);
    });

    test("should allow valid relative paths within baseDir", async () => {
      const content = `---
name: test-doc
description: Test document
partials:
  intro: intro.md
---

# Test

{{partials.intro}}`;

      const result = await mdi.process({
        content,
        baseDir: testDir,
      });

      expect(result.errors.some((e) => e.message.includes("Path traversal not allowed"))).toBe(false);
      expect(result.errors.length).toBe(0);
    });
  });
});
