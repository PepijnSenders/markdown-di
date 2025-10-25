#!/usr/bin/env node

/**
 * Update version across all packages
 * Usage: bun run version <new-version>
 */

const fs = require('fs');
const path = require('path');

const newVersion = process.argv[2];

if (!newVersion) {
  console.error('Usage: bun run version <new-version>');
  console.error('Example: bun run version 0.2.0');
  process.exit(1);
}

// Validate semver format
if (!/^\d+\.\d+\.\d+(-[a-z0-9.-]+)?$/.test(newVersion)) {
  console.error('Invalid version format. Use semver: x.y.z or x.y.z-alpha.1');
  process.exit(1);
}

const packagesDir = path.join(__dirname, '../packages');
const packages = ['core', 'remark', 'cli'];

console.log(`\nUpdating all packages to version ${newVersion}...\n`);

// Update root package.json
const rootPkgPath = path.join(__dirname, '../package.json');
const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));
rootPkg.version = newVersion;
fs.writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + '\n');
console.log(`✓ Updated root package.json to ${newVersion}`);

// Update each package
packages.forEach(pkg => {
  const pkgPath = path.join(packagesDir, pkg, 'package.json');
  const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  pkgJson.version = newVersion;

  // Update workspace dependencies
  if (pkgJson.dependencies) {
    Object.keys(pkgJson.dependencies).forEach(dep => {
      if (dep.startsWith('@markdown-di/')) {
        pkgJson.dependencies[dep] = newVersion;
      }
    });
  }

  fs.writeFileSync(pkgPath, JSON.stringify(pkgJson, null, 2) + '\n');
  console.log(`✓ Updated @markdown-di/${pkg} to ${newVersion}`);
});

console.log(`\n✓ All packages updated to ${newVersion}`);
console.log('\nNext steps:');
console.log('1. Update CHANGELOG.md with changes');
console.log('2. Run: bun test');
console.log('3. Run: bun run build');
console.log('4. Commit changes: git add . && git commit -m "chore: release v' + newVersion + '"');
console.log('5. Create tag: git tag v' + newVersion);
console.log('6. Push: git push && git push --tags');
