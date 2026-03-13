#!/usr/bin/env node

/**
 * Script to replace API URL and PostHog keys in environment.prod.ts during build
 * Usage: node scripts/replace-api-url.js
 */

const fs = require('fs');
const path = require('path');

// Load environment variables if .env exists
try {
  const envPath = path.join(__dirname, '../../.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        // Remove quotes if present
        if (value.length > 0 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
          value = value.substring(1, value.length - 1);
        } else if (value.length > 0 && value.charAt(0) === "'" && value.charAt(value.length - 1) === "'") {
          value = value.substring(1, value.length - 1);
        }
        process.env[key] = value;
      }
    });
  }
} catch (e) {
  console.log('ℹ️ No root .env file found or could not be read. Using process.env only.');
}

// 1. API URL
let apiUrl = process.env.API_BASE_URL;
if (apiUrl === undefined) {
  apiUrl = process.argv[2] || ''; // Default to empty for proxy
}

// 2. PostHog Key
const posthogKey = process.env.POSTHOG_KEY || '';

// 3. PostHog Host
const posthogHost = process.env.POSTHOG_HOST || 'https://us.i.posthog.com';

const envFile = path.join(__dirname, '../src/environments/environment.prod.ts');
const devEnvFile = path.join(__dirname, '../src/environments/environment.ts');

const updateFile = (filePath, isProd) => {
  console.log(`🔧 Updating environment file: ${filePath}`);

  try {
    if (!fs.existsSync(filePath)) {
      console.error(`❌ Error: Environment file not found at ${filePath}`);
      return;
    }

    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace API URL
    content = content.replace(
      /apiBaseUrl:\s*['"](.*?)['"]/,
      `apiBaseUrl: '${apiUrl.replace(/'/g, "\\'")}'`
    );

    // Replace PostHog Key
    if (posthogKey) {
        content = content.replace(
            /posthogKey:\s*['"](.*?)['"]/,
            `posthogKey: '${posthogKey.replace(/'/g, "\\'")}'`
        );
    }

    // Replace PostHog Host
    if (posthogHost) {
        content = content.replace(
            /posthogHost:\s*['"](.*?)['"]/,
            `posthogHost: '${posthogHost.replace(/'/g, "\\'")}'`
        );
    }
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Successfully updated ${path.basename(filePath)}`);
  } catch (error) {
    console.error(`❌ Error updating ${path.basename(filePath)}:`, error.message);
  }
};

updateFile(envFile, true);
// Optionally update dev env if you want to use .env values there too
// updateFile(devEnvFile, false);
