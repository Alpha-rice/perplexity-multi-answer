// src/background/background.js

/**
 * Perplexity自動クエリ送信・複数回対応 Background Script
 * ※ DOM操作(document, MutationObserver等)は一切行わない
 * ※ クエリ送信・回答取得などのDOM操作は content script 側で実装すること
 */

// 例: content script へのメッセージ転送
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 例: ポップアップやoptionsからのリクエストを受けて、content scriptに転送
  if (
    message.type === 'PERPLEXITY_SEND_QUERY' &&
    (Array.isArray(message.queries) || typeof message.query === 'string')
  ) {
    // アクティブタブを取得
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab || !tab.id) {
        sendResponse({ status: 'error', message: 'アクティブなタブが見つかりません' });
        return;
      }
      // content scriptにメッセージ転送
      chrome.tabs.sendMessage(
        tab.id,
        message,
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

  // 必要に応じて他のメッセージタイプもここで処理
  // 例: タブ生成、ストレージ操作など
});