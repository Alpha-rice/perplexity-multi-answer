/**
 * Perplexity自動クエリ統合レポート用バックグラウンドスクリプト（バグ修正版）
 */

const PERPLEXITY_URL = "https://www.perplexity.ai/";
const MAX_RETRY = 3;

// グローバル状態をバッチ単位で管理
let currentBatch = null;

// タブクローズ時のリスナー/状態クリーンアップ
chrome.tabs.onRemoved.addListener((tabId) => {
  if (currentBatch) {
    // クエリタブ
    if (currentBatch.tabListeners.has(tabId)) {
      chrome.tabs.onUpdated.removeListener(currentBatch.tabListeners.get(tabId));
      currentBatch.tabListeners.delete(tabId);
    }
    // 統合レポートタブ
    if (currentBatch.reportTabId === tabId) {
      currentBatch.reportTabId = null;
    }
  }
});

// 拡張機能インストール時の初期化
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'perplexity-multi-query',
    title: 'Perplexity複数クエリ実行',
    contexts: ['page', 'selection']
  });
});

// コンテキストメニューのクリック処理
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'perplexity-multi-query') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'public/icon128.png',
      title: 'Perplexity拡張機能',
      message: '拡張機能のアイコンをクリックしてポップアップを開いてください'
    }, () => {
      if (chrome.runtime.lastError) {
        console.warn('通知エラー:', chrome.runtime.lastError.message);
      }
    });
  }
});

// ポップアップからのメッセージ受信
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "START_PERPLEXITY_QUERIES") {
    // 既存バッチが進行中なら拒否
    if (currentBatch && !currentBatch.finished) {
      sendResponse({ status: "error", error: "前回のバッチがまだ処理中です" });
      return true;
    }
    // バッチ状態初期化
    currentBatch = {
      queries: [...message.queries],
      answers: new Array(message.queries.length).fill(null),
      retryCounts: new Map(),
      tabIdToIdx: new Map(),
      tabListeners: new Map(),
      integratePrompt: message.prompt,
      reportTabId: null,
      finished: false,
      batchStart: Date.now()
    };

    // クエリごとにタブを開く
    currentBatch.queries.forEach((query, idx) => {
      openPerplexityTab(query, idx, 0);
    });

    sendResponse({ status: "ok" });
    return true;
  }
});

// Perplexityタブを開き、content scriptにクエリ送信
function openPerplexityTab(query, idx, retry) {
  chrome.tabs.create({ url: PERPLEXITY_URL, active: false }, (tab) => {
    if (!currentBatch) return;
    currentBatch.tabIdToIdx.set(tab.id, idx);
    currentBatch.retryCounts.set(tab.id, retry);

    let sent = false;
    const listener = function (tabId, info) {
      if (sent) return;
      if (tabId === tab.id && info.status === "complete") {
        sent = true;
        chrome.tabs.onUpdated.removeListener(listener);
        currentBatch.tabListeners.delete(tab.id);

        chrome.tabs.sendMessage(
          tab.id,
          { type: "PERPLEXITY_SEND_QUERY", query },
          () => { /* 応答不要 */ }
        );
      }
    };
    currentBatch.tabListeners.set(tab.id, listener);
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// content scriptからの回答・エラー受信
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!currentBatch || !sender.tab) return;
  const tabId = sender.tab.id;
  if (message.type === "PERPLEXITY_ANSWER") {
    handleAnswer(tabId, message.answer);
  } else if (message.type === "PERPLEXITY_ERROR") {
    handleError(tabId, message.message);
  }
});

// 回答受信処理
function handleAnswer(tabId, answer) {
  if (!currentBatch || !currentBatch.tabIdToIdx.has(tabId)) return;
  const idx = currentBatch.tabIdToIdx.get(tabId);
  currentBatch.answers[idx] = answer;

  // タブを閉じる＆リスナー解除
  chrome.tabs.remove(tabId, () => {
    if (currentBatch.tabListeners.has(tabId)) {
      chrome.tabs.onUpdated.removeListener(currentBatch.tabListeners.get(tabId));
      currentBatch.tabListeners.delete(tabId);
    }
    currentBatch.tabIdToIdx.delete(tabId);
    currentBatch.retryCounts.delete(tabId);
  });

  // すべての回答が揃ったら統合プロンプト送信
  if (currentBatch.answers.every(ans => ans !== null) && !currentBatch.finished) {
    currentBatch.finished = true;
    sendIntegratePrompt();
  }
}

// エラー受信・リトライ処理
function handleError(tabId, errorMsg) {
  if (!currentBatch || !currentBatch.tabIdToIdx.has(tabId)) return;
  const idx = currentBatch.tabIdToIdx.get(tabId);
  const retry = currentBatch.retryCounts.get(tabId) || 0;
  if (retry < MAX_RETRY) {
    // タブを閉じてリトライ
    chrome.tabs.remove(tabId, () => {
      if (currentBatch.tabListeners.has(tabId)) {
        chrome.tabs.onUpdated.removeListener(currentBatch.tabListeners.get(tabId));
        currentBatch.tabListeners.delete(tabId);
      }
      currentBatch.tabIdToIdx.delete(tabId);
      currentBatch.retryCounts.delete(tabId);
      openPerplexityTab(currentBatch.queries[idx], idx, retry + 1);
    });
  } else {
    // リトライ上限→エラーログ保存
    saveErrorLog({ tabId, errorMsg, time: new Date().toISOString() });
    chrome.tabs.remove(tabId, () => {
      if (currentBatch.tabListeners.has(tabId)) {
        chrome.tabs.onUpdated.removeListener(currentBatch.tabListeners.get(tabId));
        currentBatch.tabListeners.delete(tabId);
      }
      currentBatch.tabIdToIdx.delete(tabId);
      currentBatch.retryCounts.delete(tabId);
    });
    chrome.notifications.create({
      type: "basic",
      iconUrl: "public/icon128.png",
      title: "Perplexity拡張エラー",
      message: `クエリ${idx + 1}でエラー: ${errorMsg}`,
    }, () => {
      if (chrome.runtime.lastError) {
        console.warn('通知エラー:', chrome.runtime.lastError.message);
      }
    });
    // 回答欄はnullのまま→バッチ完了判定
    if (currentBatch.answers.every(ans => ans !== null) && !currentBatch.finished) {
      currentBatch.finished = true;
      sendIntegratePrompt();
    }
  }
}

// 統合プロンプト送信
function sendIntegratePrompt() {
  if (!currentBatch) return;
  const combined = currentBatch.answers
    .map((ans, i) => `【クエリ${i + 1}の回答】\n${ans}`)
    .join("\n\n");
  const finalPrompt = `${combined}\n\n${currentBatch.integratePrompt}`;

  chrome.tabs.create({ url: PERPLEXITY_URL, active: true }, (tab) => {
    currentBatch.reportTabId = tab.id;
    let sent = false;
    const listener = function (tabId, info) {
      if (sent) return;
      if (tabId === tab.id && info.status === "complete") {
        sent = true;
        chrome.tabs.onUpdated.removeListener(listener);
        currentBatch.tabListeners.delete(tab.id);

        chrome.tabs.sendMessage(
          tab.id,
          { type: "PERPLEXITY_SEND_QUERY", query: finalPrompt },
          () => { /* 応答不要 */ }
        );
      }
    };
    currentBatch.tabListeners.set(tab.id, listener);
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// エラーログ保存（chrome.storage.local）
function saveErrorLog(log) {
  chrome.storage.local.get({ errorLogs: [] }, (data) => {
    const logs = Array.isArray(data.errorLogs) ? data.errorLogs : [];
    logs.push(log);
    chrome.storage.local.set({ errorLogs: logs }, () => {
      if (chrome.runtime.lastError) {
        console.warn('エラーログ保存失敗:', chrome.runtime.lastError.message);
      }
    });
  });
}