// start-dev.js - Development starter script
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting Love Website Development Server...');
console.log('📁 Checking for required files...');

// Ensure required files exist
const requiredFiles = [
    'server.js',
    'index.html',
    'admin.html'
];

for (const file of requiredFiles) {
    if (!fs.existsSync(file)) {
        console.error(`❌ Missing required file: ${file}`);
        process.exit(1);
    }
}

console.log('✅ All required files found');
console.log('🔄 Starting server with nodemon...\n');

// Spawn nodemon with specific ignore patterns
const nodemon = spawn('npx', ['nodemon', '--config', 'nodemon.json', 'server.js'], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, NODE_ENV: 'development' }
});

// Handle process signals
process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, shutting down...');
    nodemon.kill('SIGINT');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down...');
    nodemon.kill('SIGTERM');
    process.exit(0);
});

// Handle nodemon exit
nodemon.on('exit', (code) => {
    console.log(`\n📴 Nodemon exited with code ${code}`);
    if (code !== 0) {
        console.log('⚠️  Server crashed. Check for errors above.');
    }
    process.exit(code);
});

// Handle nodemon error
nodemon.on('error', (err) => {
    console.error('❌ Failed to start nodemon:', err);
    process.exit(1);
});

console.log('✨ Development server is running...');
console.log('💡 Press Ctrl+C to stop');
console.log('🔄 Nodemon will auto-restart on file changes\n');