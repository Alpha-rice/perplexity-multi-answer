chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[BG] onMessage received:', message);

  if (
    message.type === 'START_PERPLEXITY_QUERIES' &&
    Array.isArray(message.queries) &&
    typeof message.prompt === 'string'
  ) {
    console.log('[BG] START_PERPLEXITY_QUERIES accepted. Looking for Perplexity tab...');
    chrome.tabs.query({ url: '*://www.perplexity.ai/*' }, (tabs) => {
      if (chrome.runtime.lastError) {
        console.error('[BG] tabs.query error:', chrome.runtime.lastError);
        sendResponse({ status: 'error', message: chrome.runtime.lastError.message });
        return;
      }
      console.log('[BG] tabs.query result:', tabs);

      const tab = tabs[0];
      if (!tab || !tab.id) {
        console.error('[BG] No Perplexity tab found.');
        sendResponse({ status: 'error', message: 'Perplexityタブが見つかりません' });
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
            sendResponse({ status: 'error', message: chrome.runtime.lastError.message });
          } else if (typeof response === 'undefined') {
            // This can happen if the content script didn't respond
            console.error('[BG] Content script did not respond (response is undefined).');
            sendResponse({ status: 'error', message: 'content scriptから応答がありません' });
          } else {
            console.log('[BG] Received response from content script:', response);
            sendResponse(response);
          }
        }
      );
    });
    return true; // 非同期応答
  } else {
    console.warn('[BG] Message type not handled:', message.type);
  }
});