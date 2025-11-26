#!/usr/bin/env node
/**
 * Simple script to trigger a beta release via GitHub Actions
 * Usage: npm run release:beta
 */
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

function getCurrentVersion() {
  const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
  return manifest.version;
}

function validateBetaVersion(version) {
  const pattern = /^\d+\.\d+\.\d+-(alpha|beta|rc)\.\d+$/;
  return pattern.test(version);
}

function suggestBetaVersion(currentVersion) {
  const [major, minor, patch] = currentVersion.split('.').map(Number);
  return `${major}.${minor}.${patch + 1}-beta.1`;
}

async function main() {
  console.log('\n🚀 Beta Release Helper\n');

  const currentVersion = getCurrentVersion();
  console.log(`Current version: ${currentVersion}`);

  const suggested = suggestBetaVersion(currentVersion);
  const version = await question(`Beta version [${suggested}]: `);
  const betaVersion = version.trim() || suggested;

  if (!validateBetaVersion(betaVersion)) {
    console.error('\n❌ Invalid beta version format!');
    console.error('   Expected: X.Y.Z-beta.N (e.g., 1.2.0-beta.1)');
    console.error('   Valid prefixes: alpha, beta, rc');
    rl.close();
    process.exit(1);
  }

  console.log(`\nThis will create a beta release: ${betaVersion}`);
  console.log('The release will be marked as a pre-release on GitHub.');
  console.log('BRAT users will be able to install it.\n');

  const confirm = await question('Continue? (y/N): ');
  if (confirm.toLowerCase() !== 'y') {
    console.log('Cancelled.');
    rl.close();
    return;
  }

  console.log('\n📦 Triggering beta release via GitHub Actions...\n');

  try {
    execSync(
      `gh workflow run beta-release.yml -f version=${betaVersion} -f prerelease=true`,
      { stdio: 'inherit' }
    );

    console.log('\n✅ Beta release triggered!');
    console.log('\nNext steps:');
    console.log('1. Check GitHub Actions for build progress');
    console.log(`2. Once complete, BRAT users can install: cameronsjo/saved-reddit-exporter`);
    console.log(`3. Release will be at: https://github.com/cameronsjo/saved-reddit-exporter/releases/tag/${betaVersion}`);
  } catch (error) {
    console.error('\n❌ Failed to trigger release. Make sure:');
    console.error('   - You have the GitHub CLI (gh) installed');
    console.error('   - You are authenticated: gh auth login');
    console.error('   - You have push access to the repository');
  }

  rl.close();
}

main();
