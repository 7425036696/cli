const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🧪 Running tests for scraped site...');

// Test 1: Check if files exist
console.log('\n📂 Test 1: File existence');
const files = ['index.html', 'about_index.html', 'guest-book_index.html', 'cohort_index.html'];
files.forEach(file => {
    const exists = fs.existsSync(path.join('scraped_site', file));
    console.log(`${exists ? '✅' : '❌'} ${file}`);
});

// Test 2: Check if server starts
console.log('\n🚀 Test 2: Server startup (will exit after 3 seconds)');
const server = exec('node serve_fixed.js');

server.stdout.on('data', (data) => {
    console.log(data);
});

server.stderr.on('data', (data) => {
    console.error(`stderr: ${data}`);
});

// Kill server after 3 seconds
setTimeout(() => {
    server.kill();
    console.log('\n✅ Server test completed');
    
    console.log('\n📋 Manual tests to perform:');
    console.log('1. Run: node serve_fixed.js');
    console.log('2. Open: http://localhost:3000');
    console.log('3. Click navigation links');
    console.log('4. Check browser console for errors');
    
}, 3000);