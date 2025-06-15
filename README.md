# Perplexity Multi-Answer Extension

A Chrome extension that automatically sends multiple queries to Perplexity.ai and collects the responses for analysis.

## Features

- **Multiple Tab Queries**: Automatically opens multiple new Perplexity.ai tabs and sends queries simultaneously
- **Robust Input Method**: Uses advanced keyboard simulation and clipboard methods for reliable text input
- **Real-time Results**: Collects responses from all tabs and displays them in a formatted results window
- **Error Handling**: Comprehensive error handling with detailed logging and retry mechanisms
- **Results Export**: Copy individual results or all results for integration with other tools
- **Debug Tools**: Built-in debugging interface for troubleshooting

## Installation

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension directory
5. The extension icon should appear in your toolbar

## Usage

1. Click the extension icon to open the popup
2. Enter your query and integration prompt
3. Select how many times to send the query (2-5)
4. Click "Execute" to start the process
5. The extension will automatically:
   - Open multiple new Perplexity.ai tabs
   - Send the same query to each tab simultaneously
   - Wait for responses from all tabs
   - Display results in a formatted window
6. Use the results window to copy individual responses or all results for further analysis

## Troubleshooting

### Common Issues

#### "Content script communication error"

This usually means the content script isn't properly injected. Try:

1. **Refresh the Perplexity tab** - The most common fix
2. **Check the tab URL** - Make sure you're on `https://www.perplexity.ai/` or `https://perplexity.ai/`
3. **Reload the extension** - Go to `chrome://extensions/`, find this extension, and click the reload button
4. **Check permissions** - Make sure the extension has permission to access Perplexity.ai

#### "No Perplexity tab found"

1. Open Perplexity.ai in a new tab
2. Make sure the page is fully loaded
3. Try refreshing the page
4. Check that you're logged into Perplexity (if required)

#### Extension not working after Chrome restart

1. Go to `chrome://extensions/`
2. Find the extension and click the reload button
3. Refresh any open Perplexity tabs

### Debug Tools

Open `debug.html` in Chrome to access debugging tools:

1. **Check Extension** - Verify the extension is loaded
2. **Check Perplexity Tabs** - See if Perplexity tabs are detected
3. **Test Content Script** - Verify communication with content scripts
4. **Send Test Query** - Test the full query process

### Advanced Troubleshooting

#### Check Console Logs

1. Open Perplexity.ai
2. Press F12 to open Developer Tools
3. Go to the Console tab
4. Look for messages starting with `[CS]` (Content Script)
5. Try using the extension and watch for errors

#### Check Background Script Logs

1. Go to `chrome://extensions/`
2. Find this extension and click "service worker"
3. Look for messages starting with `[BG]` (Background)
4. Try using the extension and watch for errors

#### Manual Content Script Injection

If automatic injection fails, you can manually inject:

1. Open Perplexity.ai
2. Open Developer Tools (F12)
3. Go to Console tab
4. Paste and run: `chrome.runtime.sendMessage({type: 'PING'})`
5. If you get an error, the content script isn't loaded

## Technical Details

### Architecture

- **Background Script** (`src/background/background.js`) - Handles communication between popup and content scripts
- **Content Script** (`src/content/contentScript.js`) - Interacts with Perplexity.ai page
- **Popup** (`src/popup/`) - User interface for configuring and starting queries

### Communication Flow

1. User clicks "Execute" in popup
2. Popup sends message to background script
3. Background script finds Perplexity tabs
4. Background script ensures content script is injected
5. Background script forwards request to content script
6. Content script automates Perplexity.ai interface
7. Results are collected and returned

### Error Handling

- Automatic content script injection if not present
- Health check (PING/PONG) before sending queries
- Retry mechanisms for failed communications
- Detailed error messages for troubleshooting

## Development

### File Structure

```
perplexity-multi-answer/
├── manifest.json           # Extension manifest
├── debug.html             # Debug tools
├── src/
│   ├── background/
│   │   └── background.js  # Background script
│   ├── content/
│   │   └── contentScript.js # Content script
│   ├── popup/
│   │   ├── popup.html     # Popup UI
│   │   ├── popup.js       # Popup logic
│   │   └── popup.css      # Popup styles
│   ├── options/           # Options page
│   └── utils/             # Utility functions
└── icons/                 # Extension icons
```

### Key Improvements Made

1. **Automatic Content Script Injection** - If the content script isn't responding, it's automatically injected
2. **Health Checks** - PING/PONG mechanism to verify content script status
3. **Better Error Messages** - More descriptive error messages for easier troubleshooting
4. **Robust Tab Detection** - Improved logic for finding and validating Perplexity tabs
5. **Debug Tools** - Built-in debugging interface for troubleshooting

## License

MIT License