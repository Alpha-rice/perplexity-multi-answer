chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (
    message.type === 'START_PERPLEXITY_QUERIES' &&
    Array.isArray(message.queries) &&
    typeof message.prompt === 'string'
  ) {
    // アクティブなPerplexityタブを探す
    chrome.tabs.query({ url: '*://www.perplexity.ai/*' }, (tabs) => {
      const tab = tabs[0];
      if (!tab || !tab.id) {
        sendResponse({ status: 'error', message: 'Perplexityタブが見つかりません' });
        return;
      }
      // content scriptに転送
      chrome.tabs.sendMessage(
        tab.id,
        {
          type: 'PERPLEXITY_SEND_QUERY',
          queries: message.queries,
          prompt: message.prompt
        },
        (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({ status: 'error', message: chrome.runtime.lastError.message });
          } else {
            sendResponse(response);
          }
        }
      );
    });
    return true; // 非同期応答
  }
});