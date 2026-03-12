#!/usr/bin/env node

/**
 * Script to replace API URL in environment.prod.ts during build
 * Usage: node scripts/replace-api-url.js <api-url>
 */

const fs = require('fs');
const path = require('path');

// Use environment variable, then command line argument, then fallback default
let apiUrl = process.env.API_BASE_URL;
if (apiUrl === undefined) {
  apiUrl = process.argv[2] || 'https://api.yourdomain.com';
}
const envFile = path.join(__dirname, '../src/environments/environment.prod.ts');

// Validate API URL (allow empty string for Nginx proxy)
if (apiUrl === undefined) {
  console.error('❌ Error: API URL is undefined');
  process.exit(1);
}

// Escape single quotes in URL for JavaScript string
const escapedApiUrl = apiUrl.replace(/'/g, "\\'");

console.log(`🔧 Replacing API URL with: ${apiUrl || '(empty string for same-origin proxy)'}`);
console.log(`📁 Environment file: ${envFile}`);

try {
  // Check if file exists
  if (!fs.existsSync(envFile)) {
    console.error(`❌ Error: Environment file not found at ${envFile}`);
    process.exit(1);
  }

  let content = fs.readFileSync(envFile, 'utf8');
  console.log(`📄 Original content preview: ${content.substring(0, 100)}...`);
  
  // Replace the apiBaseUrl value (handles both single and double quotes)
  const originalContent = content;
  content = content.replace(
    /apiBaseUrl:\s*['"](.*?)['"]/,
    `apiBaseUrl: '${escapedApiUrl}'`
  );
  
  // Check if replacement actually happened
  if (content === originalContent) {
    console.warn('⚠️  Warning: No replacement made. Pattern might not match.');
    console.log('Current apiBaseUrl pattern:', content.match(/apiBaseUrl:\s*['"](.*?)['"]/));
  } else {
    console.log(`✅ Successfully replaced API URL`);
  }
  
  fs.writeFileSync(envFile, content, 'utf8');
  console.log(`✅ Successfully updated ${envFile}`);
  console.log(`📄 Updated content preview: ${content.substring(0, 150)}...`);
} catch (error) {
  console.error(`❌ Error updating environment file:`, error.message);
  console.error(error.stack);
  process.exit(1);
}
