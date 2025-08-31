import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';

const PLUGIN_FILES = ['main.js', 'manifest.json', 'styles.css', 'icon.svg'];
const VAULT_PLUGIN_DIR = '.vault/.obsidian/plugins/saved-reddit-exporter';

function ensureDirectoryExists(dirPath) {
    if (!existsSync(dirPath)) {
        mkdirSync(dirPath, { recursive: true });
        console.log(`Created directory: ${dirPath}`);
    }
}

function copyPluginFiles() {
    console.log('📦 Copying plugin files to vault...');
    
    // Ensure vault plugin directory exists
    ensureDirectoryExists(VAULT_PLUGIN_DIR);
    
    let copiedCount = 0;
    
    for (const file of PLUGIN_FILES) {
        if (existsSync(file)) {
            const targetPath = join(VAULT_PLUGIN_DIR, file);
            try {
                copyFileSync(file, targetPath);
                console.log(`✅ Copied ${file} -> ${targetPath}`);
                copiedCount++;
            } catch (error) {
                console.error(`❌ Failed to copy ${file}:`, error.message);
            }
        } else {
            console.warn(`⚠️  File not found: ${file}`);
        }
    }
    
    if (copiedCount === PLUGIN_FILES.length) {
        console.log(`🎉 Successfully copied all ${copiedCount} plugin files!`);
        console.log('💡 Now restart Obsidian or reload the plugin to see changes.');
    } else {
        console.log(`⚠️  Copied ${copiedCount}/${PLUGIN_FILES.length} files.`);
    }
}

// Check if vault directory exists
if (!existsSync('.vault')) {
    console.error('❌ No .vault directory found. Please create a vault for development first.');
    process.exit(1);
}

copyPluginFiles();