const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();

// Add CORS headers for development
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Serve static assets with proper MIME types
app.use('/_next/static', express.static(path.join(__dirname, 'scraped_site', '_next', 'static'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        } else if (filePath.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        }
    }
}));

app.use('/images', express.static(path.join(__dirname, 'scraped_site', 'images')));

// Route handlers for each page
const routes = {
    '/': 'index.html',
    '/about': 'about_index.html', 
    '/guest-book': 'guest-book_index.html',
    '/cohort': 'cohort_index.html'
};

// Setup routes with error handling
Object.entries(routes).forEach(([route, file]) => {
    app.get(route, (req, res) => {
        const filePath = path.join(__dirname, 'scraped_site', file);
        console.log(`📄 Serving ${route} -> ${file}`);
        
        if (fs.existsSync(filePath)) {
            res.sendFile(path.resolve(filePath));
        } else {
            console.error(`❌ File not found: ${file}`);
            res.status(404).send(`
                <h1>404 - Page Not Found</h1>
                <p>File not found: ${file}</p>
                <p><a href="/">Go to Home</a></p>
            `);
        }
    });
});

// Handle _next routes that might be requested
app.get('/_next/*', (req, res, next) => {
    const filePath = path.join(__dirname, 'scraped_site', req.path);
    if (fs.existsSync(filePath)) {
        res.sendFile(path.resolve(filePath));
    } else {
        console.log(`⚠️  _next resource not found: ${req.path}`);
        res.status(404).end();
    }
});

// Serve other static files
app.use(express.static('scraped_site', {
    extensions: ['html'],
    index: false // Don't auto-serve index.html for directories
}));

// Catch-all route for any remaining requests
app.get('*', (req, res) => {
    console.log(`🔍 Catch-all route for: ${req.path}`);
    
    // Try to find a matching HTML file
    const requestPath = req.path.slice(1); // Remove leading slash
    let fileName = 'index.html';
    
    if (requestPath && requestPath !== '') {
        fileName = `${requestPath.replace(/\//g, '_')}_index.html`;
    }
    
    const filePath = path.join(__dirname, 'scraped_site', fileName);
    
    if (fs.existsSync(filePath)) {
        console.log(`📄 Serving catch-all: ${req.path} -> ${fileName}`);
        res.sendFile(path.resolve(filePath));
    } else {
        // Fallback to index.html
        const indexPath = path.join(__dirname, 'scraped_site', 'index.html');
        if (fs.existsSync(indexPath)) {
            console.log(`📄 Fallback to index.html for: ${req.path}`);
            res.sendFile(path.resolve(indexPath));
        } else {
            res.status(404).send(`
                <h1>404 - Page Not Found</h1>
                <p>Requested path: ${req.path}</p>
                <p>Tried file: ${fileName}</p>
                <p><a href="/">Go to Home</a></p>
            `);
        }
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).send('Internal Server Error');
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`\n🚀 Server running at http://localhost:${PORT}`);
    console.log('📱 Try navigating between pages - routing should work now!');
    console.log('\n🔗 Available routes:`);
    Object.keys(routes).forEach(route => {
        console.log(`   http://localhost:${PORT}${route}`);
    });
    console.log('\n💡 Check browser console for routing debug info');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('\n🛑 Server shutting down gracefully...');
    process.exit(0);
});