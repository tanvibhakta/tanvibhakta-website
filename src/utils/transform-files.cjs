#!/usr/bin/env node

/*
 This script takes a directory and transforms the metadata of the files in that
 directory from the markdown format that mataroa exports to the frontmatter format
 in yaml that astro expects.

 You can run it repeatedly on files - it handles both initial transformation
 and updating existing frontmatter fields.
 */

const fs = require('fs');
const path = require('path');

// Get the directory from command line arguments
const directory = process.argv[2];

if (!directory) {
    console.error('Usage: node transform-files.cjs <directory>');
    process.exit(1);
}

// Check if directory exists
if (!fs.existsSync(directory)) {
    console.error(`Directory ${directory} does not exist`);
    process.exit(1);
}

/**
 * Parse frontmatter from markdown content
 * @param {string} content - The markdown content
 * @returns {Object} - { frontmatter: Object, bodyStartIndex: number, hasFrontmatter: boolean }
 */
function parseFrontmatter(content) {
    const lines = content.split('\n');
    
    if (lines[0] !== '---') {
        return { frontmatter: {}, bodyStartIndex: 0, hasFrontmatter: false };
    }
    
    const frontmatter = {};
    let i = 1;
    
    while (i < lines.length && lines[i] !== '---') {
        const line = lines[i].trim();
        if (line && line.includes(':')) {
            const colonIndex = line.indexOf(':');
            const key = line.substring(0, colonIndex).trim();
            let value = line.substring(colonIndex + 1).trim();
            
            // Remove quotes if present
            if ((value.startsWith('"') && value.endsWith('"')) || 
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            
            frontmatter[key] = value;
        }
        i++;
    }
    
    return { 
        frontmatter, 
        bodyStartIndex: i + 1, 
        hasFrontmatter: true 
    };
}

/**
 * Serialize frontmatter object to YAML string
 * @param {Object} frontmatter - The frontmatter object
 * @returns {string} - YAML frontmatter string
 */
function serializeFrontmatter(frontmatter) {
    const lines = ['---'];
    
    for (const [key, value] of Object.entries(frontmatter)) {
        // Quote string values that aren't dates
        const shouldQuote = typeof value === 'string' && !value.match(/^\d{4}-\d{2}-\d{2}$/);
        const formattedValue = shouldQuote ? `"${value}"` : value;
        lines.push(`${key}: ${formattedValue}`);
    }
    
    lines.push('---');
    return lines.join('\n');
}

/**
 * Apply transformations to frontmatter
 * @param {Object} frontmatter - Current frontmatter
 * @param {Object} updates - Updates to apply
 * @returns {Object} - Updated frontmatter
 */
function applyFrontmatterUpdates(frontmatter, updates) {
    const updated = { ...frontmatter };
    
    for (const [key, value] of Object.entries(updates)) {
        if (typeof value === 'function') {
            updated[key] = value(updated[key]);
        } else {
            updated[key] = value;
        }
    }
    
    return updated;
}

/**
 * Transform a single file
 * @param {string} filePath - Path to the file to transform
 */
function transformFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        
        // Parse existing frontmatter or check for Mataroa format
        const { frontmatter, bodyStartIndex, hasFrontmatter } = parseFrontmatter(content);
        
        let updates = {};
        let bodyContent = '';
        let wasTransformed = false;
        
        if (!hasFrontmatter && isMataraoFormat(lines)) {
            // Handle initial transformation from Mataroa format
            const title = lines[0].substring(2); // Remove '# '
            const publishedLine = lines[2].substring(15); // Remove '> Published on '
            
            updates = {
                title,
                publishedOn: convertDateFormat(publishedLine)
            };
            
            bodyContent = lines.slice(4).join('\n');
            wasTransformed = true;
            console.log(`Initial transformation: ${filePath}`);
            
        } else if (hasFrontmatter) {
            // Handle updates to existing frontmatter
            updates = {
                // Convert publishedOn date format if needed
                publishedOn: (currentDate) => currentDate ? convertDateFormat(currentDate) : currentDate
            };
            
            bodyContent = lines.slice(bodyStartIndex).join('\n');
            
            // Check if any updates were actually applied
            const originalDate = frontmatter.publishedOn;
            const newDate = convertDateFormat(originalDate);
            if (originalDate !== newDate) {
                wasTransformed = true;
                console.log(`Updated date format: ${filePath} (${originalDate} → ${newDate})`);
            }
        }
        
        if (wasTransformed) {
            const updatedFrontmatter = applyFrontmatterUpdates(frontmatter, updates);
            const newContent = `${serializeFrontmatter(updatedFrontmatter)}\n${bodyContent}`;
            
            fs.writeFileSync(filePath, newContent);
        } else {
            console.log(`No changes needed: ${filePath}`);
        }
        
    } catch (error) {
        console.error(`Error processing ${filePath}:`, error.message);
    }
}

/**
 * Check if content matches Mataroa export format
 * @param {string[]} lines - Content lines
 * @returns {boolean} - True if matches Mataroa format
 */
function isMataraoFormat(lines) {
    return lines.length >= 4 &&
           lines[0].startsWith('# ') &&
           lines[1] === '' &&
           lines[2].startsWith('> Published on ');
}

// Function to convert date format from "Apr 18, 2025" to "2025-04-18" (ISO format)
function convertDateFormat(dateString) {
    const monthMap = {
        'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
        'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
        'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
    };

    // Parse "Apr 18, 2025" format
    const parts = dateString.split(' ');
    if (parts.length === 3) {
        const month = monthMap[parts[0]];
        const day = parts[1].replace(',', '').padStart(2, '0');
        const year = parts[2];

        return `${year}-${month}-${day}`;
    }

    // Handle existing DD-MM-YYYY format (convert to ISO)
    const dashParts = dateString.split('-');
    if (dashParts.length === 3 && dashParts[0].length <= 2) {
        const day = dashParts[0].padStart(2, '0');
        const month = dashParts[1].padStart(2, '0');
        const year = dashParts[2];
        
        return `${year}-${month}-${day}`;
    }

    // If format doesn't match, return as is
    return dateString;
}

// Process all files in the directory
try {
    const files = fs.readdirSync(directory);

    files.forEach(file => {
        const filePath = path.join(directory, file);

        // Only process .md files
        if (path.extname(file) === '.md' && fs.statSync(filePath).isFile()) {
            transformFile(filePath);
        }
    });

    console.log('Transformation complete!');
} catch (error) {
    console.error('Error reading directory:', error.message);
    process.exit(1);
} 