# Extension Communication Fixes Summary

## Problem Analysis

The original error showed that the background script could find Perplexity tabs but failed to communicate with content scripts:

```
[BG] tabs.query result: Array(2)
[BG] Sending message to content script in tab: 125453402
[BG] tabs.sendMessage error: Object
```

This typically indicates that the content script was not properly injected or not responding.

## Root Causes Identified

1. **Content Script Not Injected**: Tabs opened before extension was loaded/enabled
2. **Timing Issues**: Background script trying to communicate before content script was ready
3. **No Health Check**: No way to verify if content script was active
4. **Poor Error Handling**: Generic error messages made debugging difficult
5. **Tab Filtering**: Not filtering for fully loaded tabs

## Fixes Implemented

### 1. Automatic Content Script Injection

**File**: `src/background/background.js`

Added `ensureContentScriptInjected()` function that:
- Pings content script to check if it's active
- Automatically injects content script if not responding
- Verifies injection was successful
- Provides detailed error messages

```javascript
async function ensureContentScriptInjected(tabId) {
  try {
    // Try to ping the content script first
    const response = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    if (response && response.status === 'PONG') {
      return true;
    }
  } catch (error) {
    // Inject if not responding
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['src/content/contentScript.js']
    });
    // Verify injection worked
    // ...
  }
}
```

### 2. Health Check System

**Files**: `src/background/background.js`, `src/content/contentScript.js`

Implemented PING/PONG mechanism:
- Background script sends PING to verify content script is active
- Content script responds with PONG if healthy
- Used before attempting to send actual queries

```javascript
// Content script
if (message?.type === 'PING') {
  console.log('[CS] PING received, responding with PONG');
  sendResponse({ status: 'PONG' });
  return;
}
```

### 3. Improved Tab Detection

**File**: `src/background/background.js`

Enhanced tab filtering:
- Query for both `www.perplexity.ai` and `perplexity.ai`
- Filter for tabs with `status === 'complete'`
- Verify URL contains 'perplexity.ai'
- Use first active tab found

```javascript
chrome.tabs.query({ 
  url: ['*://www.perplexity.ai/*', '*://perplexity.ai/*'] 
}, async (tabs) => {
  const activeTabs = tabs.filter(tab => 
    tab.status === 'complete' && 
    tab.url && 
    (tab.url.includes('perplexity.ai'))
  );
  // ...
});
```

### 4. Better Error Messages

**Files**: `src/background/background.js`, `src/popup/popup.js`

Improved error handling:
- More descriptive error messages
- Specific guidance for common issues
- Better error propagation from background to popup

```javascript
sendResponse({ 
  status: 'error', 
  message: 'アクティブなPerplexityタブが見つかりません。Perplexity.aiを開いてから再試行してください。' 
});
```

### 5. Content Script Robustness

**File**: `src/content/contentScript.js`

Added safety checks:
- Verify we're on a Perplexity page
- Wrap initialization in try-catch
- Better error logging

```javascript
// Ensure we're on a Perplexity page
if (!window.location.href.includes('perplexity.ai')) {
  console.warn('[CS] Not on Perplexity.ai, content script may not work properly');
}

// Safe initialization
try {
  observeDomForInputs();
  console.log('[CS] Content script initialization completed successfully');
} catch (error) {
  console.error('[CS] Content script initialization failed:', error);
}
```

### 6. Debug Tools

**File**: `debug.html`

Created comprehensive debugging interface:
- Check extension availability
- Test tab detection
- Verify content script communication
- Send test queries
- Real-time logging

### 7. Manifest Improvements

**File**: `manifest.json`

- Added `all_frames: false` to content script registration
- Ensured proper permissions are declared

## Testing the Fixes

### Quick Test Steps

1. **Load the updated extension**:
   - Go to `chrome://extensions/`
   - Click reload on the extension
   - Refresh any open Perplexity tabs

2. **Test basic functionality**:
   - Open `debug.html` in Chrome
   - Click "Check Extension" - should show extension is available
   - Click "Check Perplexity Tabs" - should find tabs if any are open
   - Click "Test Content Script" - should show "Content script is responding correctly"

3. **Test full workflow**:
   - Open Perplexity.ai in a tab
   - Use the extension popup to send a test query
   - Check console logs for detailed debugging info

### Console Monitoring

**Background Script Logs**:
- Go to `chrome://extensions/`
- Find extension, click "service worker"
- Look for `[BG]` prefixed messages

**Content Script Logs**:
- Open Perplexity.ai tab
- Press F12, go to Console
- Look for `[CS]` prefixed messages

## Expected Behavior After Fixes

1. **First Use**: Extension automatically injects content script if needed
2. **Health Check**: Verifies content script is responding before sending queries
3. **Clear Errors**: Specific error messages guide users to solutions
4. **Robust Recovery**: Handles edge cases like tabs opened before extension load
5. **Debug Support**: Built-in tools help diagnose issues

## Common Solutions for Users

1. **"Content script communication error"** → Refresh Perplexity tab
2. **"No Perplexity tab found"** → Open Perplexity.ai and ensure it's fully loaded
3. **Extension not working** → Reload extension in chrome://extensions/

The fixes address the core communication issues while providing better debugging capabilities and user guidance.