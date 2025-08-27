const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

// Ensure recordings directory exists
const recordingsDir = path.join(__dirname, 'recordings');
if (!fs.existsSync(recordingsDir)) {
  fs.mkdirSync(recordingsDir, { recursive: true });
}

// Generate a UUID for the bot session
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Create a simple mock API server to handle requests
function startMockApiServer(port = 80) {
  try {
    const server = http.createServer((req, res) => {
      console.log(`Mock API received request: ${req.method} ${req.url}`);

      // Read the request body
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });

      req.on('end', () => {
        if (body) {
          console.log(`Request body: ${body}`);
        }

        // Always respond with success
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Mock API response' }));
      });
    });

    server.listen(port, 'localhost', () => {
      console.log(`Mock API server running at http://localhost:${port}`);
    });

    server.on('error', (err) => {
      console.warn(`Could not start mock API server: ${err.message}`);
      console.warn('Continuing without mock API server');
    });

    return server;
  } catch (error) {
    console.warn(`Failed to start mock API server: ${error.message}`);
    console.warn('Continuing without mock API server');
    return null;
  }
}

// Read the configuration file
const configFile = process.argv[2] || 'bot.config.json';
if (!fs.existsSync(configFile)) {
  console.error(`Configuration file '${configFile}' not found`);
  process.exit(1);
}

// Read and process the configuration
let config = JSON.parse(fs.readFileSync(configFile, 'utf8'));

// Add bot_uuid if not present
if (!config.bot_uuid) {
  config.bot_uuid = generateUUID();
  console.log(`Generated bot UUID: ${config.bot_uuid}`);
}

// Set environment variables
process.env.BOT_ID = config.bot_uuid;
process.env.MEETING_URL = config.meeting_url;
process.env.RECORDING = 'true';
process.env.SERVERLESS = 'true'; // Run in serverless mode to avoid API calls
process.env.DEBUG_LOGS = 'true'; // Enable debug logs
process.env.API_SERVER_BASEURL = 'http://localhost:80'; // Set API server URL to localhost

// Add additional environment variables to help with browser stability
process.env.BROWSER_ARGS = '--no-sandbox,--disable-setuid-sandbox,--disable-dev-shm-usage,--disable-web-security,--disable-features=IsolateOrigins,site-per-process';
process.env.PWDEBUG = '1'; // Enable Playwright debug mode
process.env.PLAYWRIGHT_BROWSERS_PATH = '0'; // Use browsers from system

// Add timeout settings
process.env.NAVIGATION_TIMEOUT = '120000'; // 2 minutes
process.env.WAIT_TIMEOUT = '60000'; // 1 minute

// Log the configuration
console.log('Running with configuration:');
console.log(JSON.stringify(config, null, 2));

// Start mock API server
const mockApiServer = startMockApiServer();

// Run the bot
const botProcess = spawn('node', ['build/src/main.js'], {
  stdio: ['pipe', 'inherit', 'inherit'],
  env: process.env
});

// Send the configuration to the bot's stdin
botProcess.stdin.write(JSON.stringify(config));
botProcess.stdin.end();

// Handle process exit
botProcess.on('exit', (code) => {
  console.log(`Bot process exited with code ${code}`);
  // Close the mock API server
  if (mockApiServer && mockApiServer.listening) {
    mockApiServer.close();
  }
});

// Handle CTRL+C to gracefully exit
process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down...');
  botProcess.kill('SIGINT');
  // Close the mock API server
  if (mockApiServer && mockApiServer.listening) {
    mockApiServer.close();
  }
});
