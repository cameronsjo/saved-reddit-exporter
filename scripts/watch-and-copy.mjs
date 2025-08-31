import { spawn } from 'child_process';
import { watch } from 'fs';
import { execSync } from 'child_process';

console.log('🔥 Starting development server with auto-copy...');

// Start the esbuild watch process
const buildProcess = spawn('node', ['esbuild.config.mjs'], {
    stdio: 'inherit',
    shell: true
});

// Watch for changes to the main.js file and copy when it changes
let copyTimeout;

function copyWithDebounce() {
    if (copyTimeout) {
        clearTimeout(copyTimeout);
    }
    
    copyTimeout = setTimeout(() => {
        try {
            console.log('🔄 Files changed, copying to vault...');
            execSync('node scripts/copy-to-vault.mjs', { stdio: 'inherit' });
        } catch (error) {
            console.error('❌ Copy failed:', error.message);
        }
    }, 500); // Wait 500ms after last change
}

// Watch for changes to built files
watch('main.js', (eventType) => {
    if (eventType === 'change') {
        copyWithDebounce();
    }
});

watch('manifest.json', (eventType) => {
    if (eventType === 'change') {
        copyWithDebounce();
    }
});

watch('styles.css', (eventType) => {
    if (eventType === 'change') {
        copyWithDebounce();
    }
});

// Handle process termination
process.on('SIGINT', () => {
    console.log('\n🛑 Stopping development server...');
    buildProcess.kill('SIGINT');
    process.exit(0);
});

process.on('SIGTERM', () => {
    buildProcess.kill('SIGTERM');
    process.exit(0);
});

console.log('👀 Watching for changes... Press Ctrl+C to stop');
console.log('💡 Files will be automatically copied to .vault when they change');