#!/usr/bin/env node

/**
 * CSS Debugger for Web Scraper
 * Helps diagnose and fix CSS loading issues
 */

const fs = require('fs').promises;
const path = require('path');
const colors = require('colors');

class CSSDebugger {
    constructor(outputDir = 'scraped_site') {
        this.outputDir = outputDir;
    }

    async analyzeCSS() {
        console.log('🔍 Analyzing CSS files and links...'.cyan.bold);
        
        try {
            const htmlFiles = await this.findHTMLFiles();
            const cssFiles = await this.findCSSFiles();
            
            console.log(`\n📄 Found ${htmlFiles.length} HTML files`.green);
            console.log(`🎨 Found ${cssFiles.length} CSS files`.green);
            
            for (const htmlFile of htmlFiles.slice(0, 3)) { // Check first 3 files
                await this.analyzeHTMLFile(htmlFile);
            }
            
            await this.suggestFixes();
            
        } catch (error) {
            console.error('❌ Error analyzing CSS:', error.message.red);
        }
    }

    async findHTMLFiles() {
        const files = [];
        
        const scanDirectory = async (dir) => {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                
                if (entry.isDirectory() && entry.name !== 'assets') {
                    await scanDirectory(fullPath);
                } else if (entry.isFile() && entry.name.endsWith('.html')) {
                    files.push(fullPath);
                }
            }
        };
        
        await scanDirectory(this.outputDir);
        return files;
    }

    async findCSSFiles() {
        const cssDir = path.join(this.outputDir, 'assets', 'css');
        try {
            const files = await fs.readdir(cssDir);
            return files.filter(f => f.endsWith('.css')).map(f => path.join(cssDir, f));
        } catch (error) {
            return [];
        }
    }

    async analyzeHTMLFile(htmlFile) {
        try {
            const content = await fs.readFile(htmlFile, 'utf-8');
            const relativePath = path.relative(this.outputDir, htmlFile);
            
            console.log(`\n🔍 Analyzing: ${relativePath}`.yellow);
            
            // Find CSS links
            const cssLinks = content.match(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi) || [];
            const inlineStyles = content.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || [];
            const baseTag = content.match(/<base[^>]*href=["']([^"']*)["'][^>]*>/i);
            
            console.log(`  • CSS links found: ${cssLinks.length}`);
            console.log(`  • Inline styles: ${inlineStyles.length}`);
            console.log(`  • Base tag: ${baseTag ? baseTag[1] : 'None'}`);
            
            // Check each CSS link
            for (let i = 0; i < cssLinks.length; i++) {
                const link = cssLinks[i];
                const hrefMatch = link.match(/href=["']([^"']*)["']/);
                
                if (hrefMatch) {
                    const href = hrefMatch[1];
                    console.log(`  • CSS ${i + 1}: ${href}`);
                    
                    // Check if file exists
                    const cssPath = path.resolve(path.dirname(htmlFile), href);
                    try {
                        await fs.access(cssPath);
                        const stats = await fs.stat(cssPath);
                        console.log(`    ✅ File exists (${stats.size} bytes)`.green);
                    } catch (error) {
                        console.log(`    ❌ File missing: ${cssPath}`.red);
                    }
                }
            }
            
        } catch (error) {
            console.error(`❌ Error analyzing ${htmlFile}:`, error.message.red);
        }
    }

    async suggestFixes() {
        console.log('\n💡 Suggestions to fix CSS loading issues:'.cyan.bold);
        
        console.log(`
1. Check file paths:
   • Ensure CSS files are in the correct location
   • Verify relative paths are correct for each HTML file depth

2. Add this debug HTML to test CSS loading:
   `.green);

        const debugHTML = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>CSS Debug Test</title>
    <link rel="stylesheet" href="assets/css/style.css">
    <style>
        .debug-test { 
            background: red; 
            color: white; 
            padding: 20px; 
            font-size: 24px; 
        }
    </style>
</head>
<body>
    <div class="debug-test">
        If you see RED background, inline CSS works!
        <br>
        If external CSS works, this should be styled differently.
    </div>
</body>
</html>`;

        await fs.writeFile(path.join(this.outputDir, 'css-debug.html'), debugHTML);
        console.log('   📄 Created css-debug.html for testing'.green);

        console.log(`
3. Common fixes:
   • Use absolute paths: href="/assets/css/style.css"
   • Check browser developer tools for 404 errors
   • Ensure CSS files have correct MIME type
   • Add <base> tag for complex directory structures
   
4. Manual fix for existing files:
   • Run: node css-debugger.js fix
        `.yellow);
    }

    async fixCSSPaths() {
        console.log('🔧 Attempting to fix CSS paths...'.cyan.bold);
        
        try {
            const htmlFiles = await this.findHTMLFiles();
            
            for (const htmlFile of htmlFiles) {
                await this.fixHTMLFile(htmlFile);
            }
            
            console.log(`✅ Fixed CSS paths in ${htmlFiles.length} files`.green);
            
        } catch (error) {
            console.error('❌ Error fixing CSS paths:', error.message.red);
        }
    }

    async fixHTMLFile(htmlFile) {
        try {
            let content = await fs.readFile(htmlFile, 'utf-8');
            const relativePath = path.relative(this.outputDir, htmlFile);
            
            // Calculate depth from output root
            const depth = (relativePath.match(/\//g) || []).length;
            const prefix = '../'.repeat(depth);
            
            // Fix CSS links
            content = content.replace(
                /<link([^>]*rel=["']stylesheet["'][^>]*href=["'])([^"']*)(["'][^>]*>)/gi,
                (match, before, href, after) => {
                    if (!href.startsWith('http') && !href.startsWith('/') && !href.startsWith('assets/')) {
                        const newHref = prefix + href.replace(/^\.\.\//, '');
                        console.log(`  • Fixed: ${href} -> ${newHref}`.yellow);
                        return before + newHref + after;
                    }
                    return match;
                }
            );
            
            // Fix JS links
            content = content.replace(
                /<script([^>]*src=["'])([^"']*)(["'][^>]*>)/gi,
                (match, before, src, after) => {
                    if (!src.startsWith('http') && !src.startsWith('/') && !src.startsWith('assets/')) {
                        const newSrc = prefix + src.replace(/^\.\.\//, '');
                        return before + newSrc + after;
                    }
                    return match;
                }
            );
            
            // Fix image sources
            content = content.replace(
                /<img([^>]*src=["'])([^"']*)(["'][^>]*>)/gi,
                (match, before, src, after) => {
                    if (!src.startsWith('http') && !src.startsWith('/') && !src.startsWith('data:') && !src.startsWith('assets/')) {
                        const newSrc = prefix + src.replace(/^\.\.\//, '');
                        return before + newSrc + after;
                    }
                    return match;
                }
            );
            
            await fs.writeFile(htmlFile, content);
            
        } catch (error) {
            console.error(`❌ Error fixing ${htmlFile}:`, error.message.red);
        }
    }
}

async function main() {
    const command = process.argv[2];
    const outputDir = process.argv[3] || 'scraped_site';
    
    const cssDebugger = new CSSDebugger(outputDir);
    
    if (command === 'fix') {
        await cssDebugger.fixCSSPaths();
    } else {
        await cssDebugger.analyzeCSS();
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error('❌ Unexpected error:', error.message.red);
        process.exit(1);
    });
}

module.exports = CSSDebugger;