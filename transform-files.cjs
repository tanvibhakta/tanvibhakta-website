#!/usr/bin/env node

/*
 This script takes a directory and transforms the metadata of the files in that
 directory from the markdown format that mataroa exports to the frontmatter format
 in yaml that astro expects.

 You can run it repeatedly on files.
 */

const fs = require('fs');
const path = require('path');

// Get the directory from command line arguments
const directory = process.argv[2];

if (!directory) {
    console.error('Usage: node transform-files.js <directory>');
    process.exit(1);
}

// Check if directory exists
if (!fs.existsSync(directory)) {
    console.error(`Directory ${directory} does not exist`);
    process.exit(1);
}

// Function to transform a single file
function transformFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');

        // Check if file starts with the expected format
        const lines = content.split('\n');

        // Look for pattern: # Title followed by > Published on Date
        if (lines.length >= 4 &&
            lines[0].startsWith('# ') &&
            lines[1] === '' &&
            lines[2].startsWith('> Published on ')) {

            // Extract title and date
            const title = lines[0].substring(2); // Remove '# '
            const publishedLine = lines[2].substring(15); // Remove '> Published on '

            // Parse date (assuming format like "Apr 18, 2025")
            const publishedOn = convertDateFormat(publishedLine);

            // Create new frontmatter
            const newContent = `---
title: "${title}"
publishedOn: ${publishedOn}
---
${lines.slice(4).join('\n')}`;

            // Write the transformed content back
            fs.writeFileSync(filePath, newContent);
            console.log(`Transformed: ${filePath}`);
        } else {
            console.log(`Skipped (no matching pattern): ${filePath}`);
        }
    } catch (error) {
        console.error(`Error processing ${filePath}:`, error.message);
    }
}

// Function to convert date format from "Apr 18, 2025" to "18-04-2025"
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

        return `${day}-${month}-${year}`;
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