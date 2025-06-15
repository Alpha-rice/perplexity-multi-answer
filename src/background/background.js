// Helper function to inject content script if needed
async function ensureContentScriptInjected(tabId) {
  try {
    // Try to ping the content script first
    const response = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    if (response && response.status === 'PONG') {
      console.log('[BG] Content script already active in tab:', tabId);
      return true;
    }
  } catch (error) {
    console.log('[BG] Content script not responding, will inject:', error.message);
  }

  try {
    // Inject the content script
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['src/content/contentScript.js']
    });
    console.log('[BG] Content script injected successfully into tab:', tabId);
    
    // Wait a bit for the script to initialize
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Verify injection worked
    const response = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    if (response && response.status === 'PONG') {
      console.log('[BG] Content script injection verified');
      return true;
    } else {
      throw new Error('Content script injection verification failed');
    }
  } catch (error) {
    console.error('[BG] Failed to inject content script:', error);
    return false;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[BG] onMessage received:', message);

  if (
    message.type === 'START_PERPLEXITY_QUERIES' &&
    Array.isArray(message.queries) &&
    typeof message.prompt === 'string'
  ) {
    console.log('[BG] START_PERPLEXITY_QUERIES accepted. Looking for Perplexity tab...');
    
    // Query for both www.perplexity.ai and perplexity.ai
    chrome.tabs.query({ 
      url: ['*://www.perplexity.ai/*', '*://perplexity.ai/*'] 
    }, async (tabs) => {
      if (chrome.runtime.lastError) {
        console.error('[BG] tabs.query error:', chrome.runtime.lastError);
        sendResponse({ status: 'error', message: chrome.runtime.lastError.message });
        return;
      }
      console.log('[BG] tabs.query result:', tabs);

      // Filter for active/loaded tabs
      const activeTabs = tabs.filter(tab => 
        tab.status === 'complete' && 
        tab.url && 
        (tab.url.includes('perplexity.ai'))
      );

      if (activeTabs.length === 0) {
        console.error('[BG] No active Perplexity tab found.');
        sendResponse({ status: 'error', message: 'アクティブなPerplexityタブが見つかりません。Perplexity.aiを開いてから再試行してください。' });
        return;
      }

      const tab = activeTabs[0];
      console.log('[BG] Using tab:', tab.id, tab.url);

      try {
        // Ensure content script is injected and ready
        const injectionSuccess = await ensureContentScriptInjected(tab.id);
        if (!injectionSuccess) {
          sendResponse({ 
            status: 'error', 
            message: 'Content scriptの注入に失敗しました。タブを更新してから再試行してください。' 
          });
          return;
        }

        console.log('[BG] Sending message to content script in tab:', tab.id);
        chrome.tabs.sendMessage(
          tab.id,
          {
            type: 'PERPLEXITY_SEND_QUERY',
            queries: message.queries,
            prompt: message.prompt
          },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error('[BG] tabs.sendMessage error:', chrome.runtime.lastError);
              sendResponse({ 
                status: 'error', 
                message: `通信エラー: ${chrome.runtime.lastError.message}. タブを更新してから再試行してください。` 
              });
            } else if (typeof response === 'undefined') {
              console.error('[BG] Content script did not respond (response is undefined).');
              sendResponse({ 
                status: 'error', 
                message: 'Content scriptから応答がありません。タブを更新してから再試行してください。' 
              });
            } else {
              console.log('[BG] Received response from content script:', response);
              sendResponse(response);
            }
          }
        );
      } catch (error) {
        console.error('[BG] Error in message handling:', error);
        sendResponse({ 
          status: 'error', 
          message: `処理エラー: ${error.message}` 
        });
      }
    });
    return true; // 非同期応答
  } else {
    console.warn('[BG] Message type not handled:', message.type);
  }
});