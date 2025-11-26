#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const VALID_TYPES = ['patch', 'minor', 'major'];

function showUsage() {
    console.log(`
Usage: npm run version [patch|minor|major]

Examples:
  npm run version patch    # 1.0.0 → 1.0.1
  npm run version minor    # 1.0.0 → 1.1.0
  npm run version major    # 1.0.0 → 2.0.0

This script will:
  1. Update manifest.json version
  2. Update versions.json with new entry (plugin version → min Obsidian version)
  3. Stage the changes for git
  4. Create git commit with version message
  5. Create git tag (without 'v' prefix for Obsidian)
  6. Push tag and commit

NOTE: This project uses release-please for automatic releases.
For normal releases, just use conventional commits (feat:, fix:, etc.)
and let release-please handle versioning automatically.

Use this script only for manual releases that bypass release-please.
`);
}

function getCurrentVersion() {
    try {
        const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
        return manifest.version;
    } catch (error) {
        console.error('❌ Could not read current version from manifest.json');
        process.exit(1);
    }
}

function incrementVersion(version, type) {
    const [major, minor, patch] = version.split('.').map(Number);
    
    switch (type) {
        case 'patch':
            return `${major}.${minor}.${patch + 1}`;
        case 'minor':
            return `${major}.${minor + 1}.0`;
        case 'major':
            return `${major + 1}.0.0`;
        default:
            throw new Error(`Invalid version type: ${type}`);
    }
}

function updateManifest(newVersion) {
    try {
        const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
        manifest.version = newVersion;
        writeFileSync('manifest.json', JSON.stringify(manifest, null, '\t') + '\n');
        console.log(`✅ Updated manifest.json to version ${newVersion}`);
    } catch (error) {
        console.error('❌ Failed to update manifest.json:', error.message);
        process.exit(1);
    }
}

function updateVersionsFile(newVersion) {
    try {
        let versions = {};
        try {
            versions = JSON.parse(readFileSync('versions.json', 'utf8'));
        } catch {
            // File doesn't exist, create new
            console.log('📝 Creating new versions.json file');
        }

        // Get minAppVersion from manifest.json
        const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
        const minAppVersion = manifest.minAppVersion;

        // Add new version mapping: plugin version → minimum Obsidian version
        versions[newVersion] = minAppVersion;

        writeFileSync('versions.json', JSON.stringify(versions, null, '\t') + '\n');
        console.log(`✅ Updated versions.json: ${newVersion} → ${minAppVersion}`);
    } catch (error) {
        console.error('❌ Failed to update versions.json:', error.message);
        process.exit(1);
    }
}

function runGitCommands(newVersion, versionType) {
    try {
        // Stage changes
        execSync('git add manifest.json versions.json', { stdio: 'inherit' });
        console.log('✅ Staged manifest.json and versions.json');

        // Create commit
        const commitMessage = `chore: bump version to ${newVersion} (${versionType})`;
        execSync(`git commit -m "${commitMessage}"`, { stdio: 'inherit' });
        console.log(`✅ Created commit: ${commitMessage}`);

        // Create tag (without 'v' prefix for Obsidian compatibility)
        const tagMessage = `Release ${newVersion}`;
        execSync(`git tag -a ${newVersion} -m "${tagMessage}"`, { stdio: 'inherit' });
        console.log(`✅ Created tag: ${newVersion}`);

        // Push commit and tag
        execSync('git push origin main', { stdio: 'inherit' });
        execSync(`git push origin ${newVersion}`, { stdio: 'inherit' });
        console.log('✅ Pushed commit and tag to origin');

        console.log(`
🎉 Version bump complete!

Release ${newVersion} has been created and pushed.
GitHub Actions will now build and create the release automatically.

Check the release at:
https://github.com/cameronsjo/saved-reddit-exporter/releases/tag/${newVersion}
        `);

    } catch (error) {
        console.error('❌ Git operations failed:', error.message);
        console.error('\n💡 You may need to manually complete the git operations:');
        console.error('   git add manifest.json versions.json');
        console.error(`   git commit -m "chore: bump version to ${newVersion}"`);
        console.error(`   git tag -a ${newVersion} -m "Release ${newVersion}"`);
        console.error('   git push origin main');
        console.error(`   git push origin ${newVersion}`);
        process.exit(1);
    }
}

function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        showUsage();
        return;
    }

    const versionType = args[0];
    
    if (!VALID_TYPES.includes(versionType)) {
        console.error(`❌ Invalid version type: ${versionType}`);
        console.error(`   Valid types: ${VALID_TYPES.join(', ')}`);
        showUsage();
        process.exit(1);
    }

    console.log(`🚀 Starting ${versionType} version bump...\n`);

    // Get current version and calculate new version
    const currentVersion = getCurrentVersion();
    const newVersion = incrementVersion(currentVersion, versionType);
    
    console.log(`📋 Version bump: ${currentVersion} → ${newVersion}`);

    // Confirm with user
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.question(`\nContinue with version bump to ${newVersion}? (y/N): `, (answer) => {
        rl.close();
        
        if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
            console.log('❌ Version bump cancelled');
            return;
        }

        // Perform the version bump
        updateManifest(newVersion);
        updateVersionsFile(newVersion);
        runGitCommands(newVersion, versionType);
    });
}

main();