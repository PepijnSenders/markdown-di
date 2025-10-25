#!/usr/bin/env node

/**
 * Interactive release script
 * Usage: bun run release
 */

const { execSync } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

function exec(command) {
  console.log(`\n$ ${command}`);
  try {
    execSync(command, { stdio: 'inherit' });
    return true;
  } catch (error) {
    console.error(`Failed: ${command}`);
    return false;
  }
}

async function main() {
  console.log('\n📦 markdown-di Release Script\n');

  // Check git status
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8' });
    if (status.trim()) {
      console.log('⚠️  Working directory is not clean:');
      console.log(status);
      const answer = await ask('\nContinue anyway? (y/N): ');
      if (answer.toLowerCase() !== 'y') {
        console.log('Aborted.');
        rl.close();
        process.exit(0);
      }
    }
  } catch (error) {
    console.error('Failed to check git status');
    rl.close();
    process.exit(1);
  }

  // Get current version
  const pkg = require('../package.json');
  const currentVersion = pkg.version;
  console.log(`Current version: ${currentVersion}`);

  // Ask for new version
  const newVersion = await ask('\nNew version (e.g., 0.2.0): ');
  if (!newVersion || !/^\d+\.\d+\.\d+(-[a-z0-9.-]+)?$/.test(newVersion)) {
    console.error('Invalid version format');
    rl.close();
    process.exit(1);
  }

  console.log(`\nReleasing version ${newVersion}...\n`);

  // Confirm
  const confirm = await ask(`Proceed with release v${newVersion}? (y/N): `);
  if (confirm.toLowerCase() !== 'y') {
    console.log('Aborted.');
    rl.close();
    process.exit(0);
  }

  console.log('\n📝 Updating versions...');
  if (!exec(`node scripts/version.js ${newVersion}`)) {
    rl.close();
    process.exit(1);
  }

  console.log('\n🧪 Running tests...');
  if (!exec('bun test')) {
    rl.close();
    process.exit(1);
  }

  console.log('\n🔨 Building packages...');
  if (!exec('bun run build')) {
    rl.close();
    process.exit(1);
  }

  console.log('\n📝 Committing changes...');
  if (!exec('git add .')) {
    rl.close();
    process.exit(1);
  }
  if (!exec(`git commit -m "chore: release v${newVersion}"`)) {
    rl.close();
    process.exit(1);
  }

  console.log('\n🏷️  Creating tag...');
  if (!exec(`git tag v${newVersion}`)) {
    rl.close();
    process.exit(1);
  }

  console.log('\n✅ Release prepared successfully!');
  console.log('\nTo publish:');
  console.log('  git push && git push --tags');
  console.log('\nThe GitHub Action will automatically publish to npm when the tag is pushed.');

  rl.close();
}

main().catch(error => {
  console.error(error);
  rl.close();
  process.exit(1);
});
