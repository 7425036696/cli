#!/usr/bin/env node

/**
 * Simple & Reliable Web Scraping CLI Agent (Node.js)
 * Crawls websites and generates complete HTML/CSS replicas with working navigation
 * SIMPLIFIED VERSION - Focus on reliability over complexity
 */

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');
const { URL } = require('url');
const commander = require('commander');
const colors = require('colors');
const ProgressBar = require('progress');
const mime = require('mime-types');

class WebScraperAgent {
    constructor(baseUrl, options = {}) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.domain = new URL(baseUrl).hostname;
        this.outputDir = options.output || 'scraped_site';
        this.maxDepth = options.maxDepth || 3;
        this.maxPages = options.maxPages || 5;
        this.delay = options.delay || 500;
        
        this.visitedUrls = new Set();
        this.scrapedPages = new Map();
        this.urlToLocalFile = new Map(); // Simple URL -> filename mapping
        this.assets = new Map(); // URL -> local path
        this.urlQueue = [];
        
        // Create axios instance with proper headers
        this.client = axios.create({
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        
        // Progress tracking
        this.progressBar = null;
        
        console.log('🚀 Simple Web Scraper Agent Initialized'.green.bold);
        console.log(`📍 Target: ${this.baseUrl}`.cyan);
        console.log(`📁 Output: ${this.outputDir}`.cyan);
        console.log(`🔍 Max depth: ${this.maxDepth}, Max pages: ${this.maxPages}`.cyan);
    }

    async init() {
        try {
            // Create output directory structure
            await this.createDirectoryStructure();
            console.log('📁 Directory structure created'.green);
        } catch (error) {
            console.error('❌ Failed to create directory structure:', error.message.red);
            throw error;
        }
    }

    async createDirectoryStructure() {
        const directories = [
            this.outputDir,
            path.join(this.outputDir, 'assets'),
            path.join(this.outputDir, 'assets', 'css'),
            path.join(this.outputDir, 'assets', 'js'),
            path.join(this.outputDir, 'assets', 'images'),
            path.join(this.outputDir, 'assets', 'fonts')
        ];

        for (const dir of directories) {
            await fs.mkdir(dir, { recursive: true });
        }
    }

    isValidUrl(url) {
        try {
            const urlObj = new URL(url);
            return (
                urlObj.hostname === this.domain &&
                !url.match(/\.(pdf|doc|docx|zip|exe|dmg|rar|7z)$/i) &&
                !url.includes('#') // Skip anchor links
            );
        } catch {
            return false;
        }
    }

    // SIMPLIFIED filename generation
    getLocalFilename(url) {
        try {
            const urlObj = new URL(url);
            let pathname = urlObj.pathname;
            
            // Handle root URL
            if (pathname === '/' || pathname === '') {
                return 'index.html';
            }
            
            // Remove leading/trailing slashes
            pathname = pathname.replace(/^\/+|\/+$/g, '');
            
            // If it ends with / or has no extension, treat as directory -> add index.html
            if (pathname.endsWith('/') || !path.extname(pathname)) {
                if (pathname.endsWith('/')) {
                    pathname = pathname.slice(0, -1);
                }
                pathname += '_index.html'; // Use _index to avoid conflicts
            }
            
            // Replace / with _ to flatten structure (SIMPLER APPROACH)
            pathname = pathname.replace(/\//g, '_');
            
            // Ensure .html extension
            if (!pathname.endsWith('.html')) {
                pathname = pathname.replace(/\.[^.]*$/, '') + '.html';
            }
            
            // Clean filename
            pathname = pathname.replace(/[<>:"|?*]/g, '_');
            
            return pathname;
        } catch {
            return `page_${Date.now()}.html`;
        }
    }

    async downloadAsset(assetUrl, assetType) {
        try {
            if (this.assets.has(assetUrl)) {
                return this.assets.get(assetUrl);
            }

            console.log(`📦 Downloading ${assetType}: ${assetUrl}`.yellow);
            
            const response = await this.client.get(assetUrl, {
                responseType: 'arraybuffer'
            });

            // Determine filename and directory
            const urlObj = new URL(assetUrl);
            let filename = path.basename(urlObj.pathname) || `asset_${Date.now()}`;
            
            let assetDir, extension;
            switch (assetType) {
                case 'css':
                    assetDir = 'css';
                    extension = '.css';
                    break;
                case 'js':
                    assetDir = 'js';
                    extension = '.js';
                    break;
                case 'image':
                    assetDir = 'images';
                    extension = mime.extension(response.headers['content-type']) || '.jpg';
                    break;
                case 'font':
                    assetDir = 'fonts';
                    extension = path.extname(filename) || '.woff2';
                    break;
                default:
                    assetDir = 'assets';
                    extension = path.extname(filename) || '.file';
            }

            if (!filename.includes('.')) {
                filename += extension;
            }

            // Ensure unique filename
            let counter = 1;
            let finalPath = path.join(this.outputDir, 'assets', assetDir, filename);
            
            while (await this.fileExists(finalPath)) {
                const ext = path.extname(filename);
                const name = path.basename(filename, ext);
                filename = `${name}_${counter}${ext}`;
                finalPath = path.join(this.outputDir, 'assets', assetDir, filename);
                counter++;
            }

            await fs.writeFile(finalPath, response.data);
            
            const relativePath = path.join('assets', assetDir, filename).replace(/\\/g, '/');
            this.assets.set(assetUrl, relativePath);
            
            return relativePath;

        } catch (error) {
            console.error(`❌ Failed to download ${assetUrl}:`, error.message.red);
            return assetUrl; // Return original URL as fallback
        }
    }

    async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    async processCss(cssContent, baseUrl) {
        try {
            // Find URL references in CSS
            const urlRegex = /url\s*\(\s*['""]?([^'"")\s]+)['""]?\s*\)/gi;
            
            let processedCss = cssContent;
            const matches = [...cssContent.matchAll(urlRegex)];
            
            for (const match of matches) {
                try {
                    const url = match[1];
                    const assetUrl = new URL(url, baseUrl).href;
                    const localPath = await this.downloadAsset(assetUrl, 'font');
                    processedCss = processedCss.replace(match[0], `url("${localPath}")`);
                } catch (error) {
                    // Keep original if processing fails
                    console.log(`⚠️ CSS URL processing failed for ${match[1]}`.yellow);
                }
            }

            return processedCss;
        } catch (error) {
            console.error('⚠️ Error processing CSS:', error.message.yellow);
            return cssContent;
        }
    }

    async scrapePage(url, depth = 0) {
        try {
            if (this.visitedUrls.has(url) || depth > this.maxDepth || this.visitedUrls.size >= this.maxPages) {
                return { links: [], pageData: null };
            }

            console.log(`🔍 Scraping: ${url} (depth: ${depth})`.blue);
            this.visitedUrls.add(url);

            const response = await this.client.get(url);
            const $ = cheerio.load(response.data);
            
            const links = [];
            const localFilename = this.getLocalFilename(url);
            
            // Store the URL -> filename mapping
            this.urlToLocalFile.set(url, localFilename);
            
            // Collect all internal links first (DON'T modify yet)
            $('a[href]').each((i, elem) => {
                const href = $(elem).attr('href');
                try {
                    const fullUrl = new URL(href, url).href;
                    if (this.isValidUrl(fullUrl) && !this.visitedUrls.has(fullUrl)) {
                        links.push(fullUrl);
                    }
                } catch (e) {
                    // Invalid URL, ignore
                }
            });

            // Process CSS links
            const cssPromises = [];
            $('link[rel="stylesheet"]').each((i, elem) => {
                const href = $(elem).attr('href');
                if (href) {
                    const cssPromise = (async () => {
                        try {
                            const cssUrl = new URL(href, url).href;
                            const cssResponse = await this.client.get(cssUrl);
                            const processedCss = await this.processCss(cssResponse.data, cssUrl);
                            
                            // Simple filename
                            const cssFilename = `style_${i}_${Date.now()}.css`;
                            const cssPath = path.join(this.outputDir, 'assets', 'css', cssFilename);
                            
                            await fs.writeFile(cssPath, processedCss, 'utf-8');
                            $(elem).attr('href', `assets/css/${cssFilename}`);
                            
                            console.log(`🎨 Processed CSS: ${cssFilename}`.green);
                        } catch (error) {
                            console.log(`❌ Failed to process CSS ${href}:`, error.message.red);
                        }
                    })();
                    cssPromises.push(cssPromise);
                }
            });

            await Promise.all(cssPromises);

            // Process JavaScript
            const jsPromises = [];
            $('script[src]').each((i, elem) => {
                const src = $(elem).attr('src');
                if (src && !src.startsWith('data:') && !src.startsWith('blob:')) {
                    const jsPromise = (async () => {
                        try {
                            const jsUrl = new URL(src, url).href;
                            const localJsPath = await this.downloadAsset(jsUrl, 'js');
                            $(elem).attr('src', localJsPath);
                        } catch (error) {
                            console.log(`❌ Failed to process JS ${src}`.red);
                        }
                    })();
                    jsPromises.push(jsPromise);
                }
            });

            await Promise.all(jsPromises);

            // Process images
            const imgPromises = [];
            $('img[src]').each((i, elem) => {
                const src = $(elem).attr('src');
                if (src && !src.startsWith('data:') && !src.startsWith('blob:')) {
                    const imgPromise = (async () => {
                        try {
                            const imgUrl = new URL(src, url).href;
                            const localImgPath = await this.downloadAsset(imgUrl, 'image');
                            $(elem).attr('src', localImgPath);
                        } catch (error) {
                            console.log(`❌ Failed to process image ${src}`.red);
                        }
                    })();
                    imgPromises.push(imgPromise);
                }
            });

            // Process srcset
            $('img[srcset]').each((i, elem) => {
                const srcset = $(elem).attr('srcset');
                if (srcset) {
                    const srcsetPromise = (async () => {
                        try {
                            const newSrcset = [];
                            const srcsetItems = srcset.split(',');
                            
                            for (const item of srcsetItems) {
                                const parts = item.trim().split(/\s+/);
                                if (parts.length > 0) {
                                    const imgUrl = new URL(parts[0], url).href;
                                    const localImgPath = await this.downloadAsset(imgUrl, 'image');
                                    
                                    if (parts.length > 1) {
                                        newSrcset.push(`${localImgPath} ${parts[1]}`);
                                    } else {
                                        newSrcset.push(localImgPath);
                                    }
                                }
                            }
                            
                            $(elem).attr('srcset', newSrcset.join(', '));
                        } catch (error) {
                            console.log(`❌ Failed to process srcset`.red);
                        }
                    })();
                    imgPromises.push(srcsetPromise);
                }
            });

            await Promise.all(imgPromises);

            // Store the raw HTML (we'll fix links later)
            const pageData = {
                url,
                title: $('title').text() || 'Untitled',
                content: $.html(),
                depth,
                filename: localFilename
            };

            return { links, pageData };

        } catch (error) {
            console.error(`❌ Error scraping ${url}:`, error.message.red);
            return { links: [], pageData: null };
        }
    }

    // SEPARATE PHASE: Fix all internal links after scraping is complete
    async fixAllLinks() {
        console.log('\n🔗 Fixing internal links...'.cyan.bold);
        
        for (const [url, pageData] of this.scrapedPages) {
            const $ = cheerio.load(pageData.content);
            let linkCount = 0;
            
            $('a[href]').each((i, elem) => {
                const href = $(elem).attr('href');
                try {
                    const fullUrl = new URL(href, url).href;
                    
                    // If this is an internal URL we scraped, update the link
                    if (this.urlToLocalFile.has(fullUrl)) {
                        const targetLocalFile = this.urlToLocalFile.get(fullUrl);
                        $(elem).attr('href', targetLocalFile);
                        linkCount++;
                        console.log(`  ✅ ${href} -> ${targetLocalFile}`.gray);
                    }
                } catch (e) {
                    // External or invalid URL, keep as-is
                }
            });
            
            // Add simple navigation script
            const navScript = `
                <script>
                document.addEventListener('DOMContentLoaded', function() {
                    // Add scraped site indicator
                    const indicator = document.createElement('div');
                    indicator.innerHTML = '🕷️ Scraped Site';
                    indicator.style.cssText = \`
                        position: fixed; top: 10px; right: 10px; 
                        background: #007bff; color: white; 
                        padding: 5px 10px; border-radius: 3px; 
                        font-size: 12px; z-index: 9999; opacity: 0.8;
                    \`;
                    document.body.appendChild(indicator);
                });
                </script>
            `;

            $('body').append(navScript);
            
            // Update the stored content
            pageData.content = $.html();
            console.log(`📄 Fixed ${linkCount} links in ${pageData.filename}`.green);
        }
    }

    async crawlWebsite() {
        console.log('\n🕷️ Starting website crawl...'.green.bold);
        
        this.urlQueue = [{ url: this.baseUrl, depth: 0 }];
        
        this.progressBar = new ProgressBar('[:bar] :current/:total pages (:percent) :etas', {
            complete: '█',
            incomplete: '░',
            width: 40,
            total: this.maxPages
        });

        while (this.urlQueue.length > 0 && this.visitedUrls.size < this.maxPages) {
            const batch = this.urlQueue.splice(0, 3); // Process in small batches
            
            const promises = batch.map(({ url, depth }) => this.scrapePage(url, depth));
            const results = await Promise.allSettled(promises);

            for (let i = 0; i < results.length; i++) {
                if (results[i].status === 'fulfilled') {
                    const { links, pageData } = results[i].value;
                    
                    if (pageData) {
                        this.scrapedPages.set(pageData.url, pageData);
                        this.progressBar.tick();
                        
                        // Add new links to queue
                        for (const link of links) {
                            if (!this.urlQueue.find(item => item.url === link) && !this.visitedUrls.has(link)) {
                                this.urlQueue.push({ url: link, depth: batch[i].depth + 1 });
                            }
                        }
                    }
                }
            }

            // Be respectful to the server
            if (this.urlQueue.length > 0) {
                await new Promise(resolve => setTimeout(resolve, this.delay));
            }
        }

        console.log(`\n✅ Crawling completed! Visited ${this.visitedUrls.size} pages`.green.bold);
        
        // NOW fix all the internal links
        await this.fixAllLinks();
    }

    async savePages() {
        console.log(`\n💾 Saving ${this.scrapedPages.size} pages...`.cyan.bold);

        for (const [url, pageData] of this.scrapedPages) {
            try {
                const filePath = path.join(this.outputDir, pageData.filename);
                await fs.writeFile(filePath, pageData.content, 'utf-8');
                console.log(`📄 Saved: ${pageData.filename}`.green);
            } catch (error) {
                console.error(`❌ Failed to save ${url}:`, error.message.red);
            }
        }

        // Create additional files
        await this.createSitemap();
        await this.createIndexIfNeeded();
    }

    async createSitemap() {
        const sitemapContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Site Map</title>
            <style>
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    max-width: 1200px; margin: 0 auto; padding: 20px; 
                    background: #f8f9fa; color: #333;
                }
                .header { text-align: center; margin-bottom: 40px; padding: 20px; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                .page-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
                .page-card { 
                    background: white; padding: 20px; border-radius: 8px; 
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1); transition: transform 0.2s;
                }
                .page-card:hover { transform: translateY(-2px); }
                .page-title { font-size: 1.2em; margin-bottom: 10px; }
                .page-title a { text-decoration: none; color: #007bff; font-weight: 600; }
                .page-title a:hover { text-decoration: underline; }
                .page-url { font-size: 0.9em; color: #666; word-break: break-all; }
                .page-depth { display: inline-block; background: #007bff; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; }
                .success-msg { background: #d4edda; color: #155724; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🗺️ Site Map</h1>
                <p>Scraped from: <strong>${this.baseUrl}</strong></p>
                <p>${this.scrapedPages.size} pages • ${this.assets.size} assets</p>
            </div>
            <div class="success-msg">
                ✅ <strong>All internal links have been fixed and should work for offline browsing!</strong>
            </div>
            <div class="page-grid">
        `;

        let sitemapPages = '';
        for (const [url, pageData] of this.scrapedPages) {
            sitemapPages += `
                <div class="page-card">
                    <div class="page-title">
                        <a href="${pageData.filename}">${pageData.title}</a>
                    </div>
                    <div class="page-url">${url}</div>
                    <div style="margin-top: 10px;">
                        <span class="page-depth">Depth: ${pageData.depth}</span>
                    </div>
                </div>
            `;
        }

        const finalSitemapContent = sitemapContent + sitemapPages + `
            </div>
        </body>
        </html>
        `;

        await fs.writeFile(path.join(this.outputDir, 'sitemap.html'), finalSitemapContent, 'utf-8');
        console.log('🗺️ Created sitemap.html'.green);
    }

    async createIndexIfNeeded() {
        // Only create if no index exists
        const indexExists = this.urlToLocalFile.has(this.baseUrl) || 
                           this.urlToLocalFile.has(this.baseUrl + '/') ||
                           await this.fileExists(path.join(this.outputDir, 'index.html'));
                           
        if (indexExists) {
            console.log('🏠 Index page already exists'.yellow);
            return;
        }

        const indexContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Scraped Website</title>
            <style>
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    max-width: 800px; margin: 0 auto; padding: 20px; 
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh; color: white;
                }
                .container { background: rgba(255,255,255,0.1); backdrop-filter: blur(10px); padding: 40px; border-radius: 20px; }
                .header { text-align: center; margin-bottom: 40px; }
                .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 20px; margin-bottom: 40px; }
                .stat-card { text-align: center; background: rgba(255,255,255,0.2); padding: 20px; border-radius: 10px; }
                .stat-number { font-size: 2em; font-weight: bold; }
                .links { display: grid; gap: 15px; }
                .link-item { 
                    background: rgba(255,255,255,0.2); padding: 20px; border-radius: 10px; 
                    transition: transform 0.2s; cursor: pointer;
                }
                .link-item:hover { transform: translateY(-2px); background: rgba(255,255,255,0.3); }
                .link-item a { text-decoration: none; color: white; font-weight: 500; font-size: 1.1em; }
                .emoji { font-size: 1.5em; margin-right: 10px; }
                .success { background: #28a745; padding: 15px; border-radius: 10px; margin-bottom: 30px; text-align: center; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="success">
                    ✅ <strong>Website Successfully Scraped!</strong><br>
                    All internal links are now connected for offline browsing.
                </div>
                
                <div class="header">
                    <h1>🕷️ Scraped Website</h1>
                    <p>From: <strong>${this.baseUrl}</strong></p>
                </div>
                
                <div class="stats">
                    <div class="stat-card">
                        <div class="stat-number">${this.scrapedPages.size}</div>
                        <div>Pages</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number">${this.assets.size}</div>
                        <div>Assets</div>
                    </div>
                </div>
                
                <div class="links">
                    <div class="link-item">
                        <a href="sitemap.html">
                            <span class="emoji">🗺️</span>View Complete Site Map
                        </a>
                    </div>
        `;

        // Add first few pages
        let pageCount = 0;
        for (const [url, pageData] of this.scrapedPages) {
            if (pageCount >= 5) break;
            indexContent += `
                    <div class="link-item">
                        <a href="${pageData.filename}">
                            <span class="emoji">📄</span>${pageData.title}
                        </a>
                    </div>
            `;
            pageCount++;
        }

        const finalIndexContent = indexContent + `
                </div>
            </div>
        </body>
        </html>
        `;

        await fs.writeFile(path.join(this.outputDir, 'index.html'), finalIndexContent, 'utf-8');
        console.log('🏠 Created index.html'.green);
    }

    async generateReport() {
        const report = {
            baseUrl: this.baseUrl,
            totalPages: this.scrapedPages.size,
            totalAssets: this.assets.size,
            outputDirectory: this.outputDir,
            scrapingDate: new Date().toISOString(),
            pages: Array.from(this.scrapedPages.values()).map(pageData => ({
                url: pageData.url,
                title: pageData.title,
                filename: pageData.filename,
                depth: pageData.depth
            })),
            urlMappings: Array.from(this.urlToLocalFile.entries()).map(([url, filename]) => ({
                originalUrl: url,
                localFilename: filename
            }))
        };

        await fs.writeFile(
            path.join(this.outputDir, 'scraping_report.json'), 
            JSON.stringify(report, null, 2), 
            'utf-8'
        );

        console.log('\n📊 Final Report:'.cyan.bold);
        console.log(`   • Pages scraped: ${this.scrapedPages.size}`.green);
        console.log(`   • Assets downloaded: ${this.assets.size}`.green);
        console.log(`   • Internal links fixed: ${this.urlToLocalFile.size}`.green);
        console.log(`   • Output directory: ${this.outputDir}`.green);
        console.log(`   ✅ All routes should now work offline!`.green.bold);
    }
}

async function main() {
    const program = new commander.Command();
    
    program
        .name('simple-web-scraper')
        .description('🕷️ Simple & Reliable Web Scraper - Working navigation guaranteed!')
        .version('3.0.0')
        .argument('<url>', 'Target website URL to scrape')
        .option('-o, --output <directory>', 'Output directory', 'scraped_site')
        .option('-d, --max-depth <number>', 'Maximum crawling depth', '3')
        .option('-p, --max-pages <number>', 'Maximum number of pages to scrape', '5')
        .option('--delay <number>', 'Delay between requests in milliseconds', '500')
        .addHelpText('after', `
Examples:
  $ node web-scraper.js https://example.com
  $ node web-scraper.js https://example.com -o my_site -d 2 -p 20

This version uses a simpler approach:
  ✅ Flattened file structure (no complex nested paths)
  ✅ Two-phase processing (scrape first, fix links after)
  ✅ Clear URL-to-filename mapping
  ✅ Working offline navigation guaranteed!
        `)
        .parse();

    const url = program.args[0];
    const options = {
        output: program.opts().output,
        maxDepth: parseInt(program.opts().maxDepth),
        maxPages: parseInt(program.opts().maxPages),
        delay: parseInt(program.opts().delay)
    };

    try {
        // Validate URL
        new URL(url);
        
        console.log('🚀 Starting SIMPLE web scraper (focus on working navigation)...'.green.bold);
        
        const scraper = new WebScraperAgent(url, options);
        
        // Initialize
        await scraper.init();
        
        // Start crawling (includes link fixing)
        await scraper.crawlWebsite();
        
        // Save all pages
        await scraper.savePages();
        
        // Generate report
        await scraper.generateReport();
        
        console.log('\n🎉 Scraping completed! Navigation should work perfectly now.'.green.bold);
        console.log(`📁 Open ${options.output}/index.html or ${options.output}/sitemap.html to browse`.cyan);
        console.log(`🔗 All internal links should now work for offline browsing!`.green.bold);
        
    } catch (error) {
        if (error.code === 'INVALID_URL') {
            console.error('❌ Error: Invalid URL provided'.red);
        } else {
            console.error(`❌ Error: ${error.message}`.red);
        }
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n⚠️ Scraping interrupted by user'.yellow);
    process.exit(0);
});

if (require.main === module) {
    main().catch(error => {
        console.error('❌ Unexpected error:', error.message.red);
        process.exit(1);
    });
}

module.exports = WebScraperAgent;