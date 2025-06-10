// Perplexity自動クエリ統合レポート用バックグラウンドスクリプト（改善版）

const PERPLEXITY_URL = "https://www.perplexity.ai/";
const MAX_RETRY = 3;

// クエリごとのタブ・状態管理
let queryTabs = [];
let answers = [];
let retryCounts = {};
let integratePrompt = "";
let reportTabId = null;
let queries = []; // クエリ内容を保持
let tabListeners = {}; // タブごとのリスナー参照を保持

// ポップアップからのメッセージ受信
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "START_PERPLEXITY_QUERIES") {
    // 初期化
    queryTabs = [];
    answers = new Array(message.queries.length).fill(null);
    retryCounts = {};
    integratePrompt = message.prompt;
    reportTabId = null;
    queries = [...message.queries];
    tabListeners = {};

    // クエリごとにタブを開く
    queries.forEach((query, idx) => {
      openPerplexityTab(query, idx, 0);
    });

    sendResponse({ status: "ok" });
    return true; // 非同期応答
  }
});

// Perplexityタブを開き、content scriptにクエリ送信
function openPerplexityTab(query, idx, retry) {
  chrome.tabs.create({ url: PERPLEXITY_URL, active: false }, (tab) => {
    queryTabs[idx] = tab.id;
    retryCounts[tab.id] = retry;

    // リスナーを外部関数化し、参照を保存
    const listener = function (tabId, info) {
      if (tabId === tab.id && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        delete tabListeners[tab.id];

        // content scriptにクエリ送信
        chrome.tabs.sendMessage(
          tab.id,
          { type: "PERPLEXITY_SEND_QUERY", query },
          (response) => {
            // content scriptからの直接応答は使わない
          }
        );
      }
    };
    tabListeners[tab.id] = listener;
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// content scriptからのwindow.postMessageを受けるための仕組み（未使用だが残す）
chrome.runtime.onMessageExternal?.addListener((msg, sender, sendResponse) => {
  // ここは通常使わないが、外部拡張連携時用
});

// content scriptからの回答・エラー受信
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "PERPLEXITY_ANSWER" && sender.tab) {
    handleAnswer(sender.tab.id, message.answer);
  } else if (message.type === "PERPLEXITY_ERROR" && sender.tab) {
    handleError(sender.tab.id, message.message);
  }
});

// 回答受信処理
function handleAnswer(tabId, answer) {
  const idx = queryTabs.indexOf(tabId);
  if (idx === -1) return;

  answers[idx] = answer;

  // タブを閉じる
  chrome.tabs.remove(tabId, () => {
    // 念のためリスナーも解除
    if (tabListeners[tabId]) {
      chrome.tabs.onUpdated.removeListener(tabListeners[tabId]);
      delete tabListeners[tabId];
    }
  });

  // すべての回答が揃ったら統合プロンプト送信
  if (answers.filter(ans => ans !== null).length === queryTabs.length) {
    sendIntegratePrompt();
  }
}

// エラー受信・リトライ処理
function handleError(tabId, errorMsg) {
  const idx = queryTabs.indexOf(tabId);
  if (idx === -1) return;

  const retry = retryCounts[tabId] || 0;
  if (retry < MAX_RETRY) {
    // タブを閉じてリトライ
    chrome.tabs.remove(tabId, () => {
      // 念のためリスナーも解除
      if (tabListeners[tabId]) {
        chrome.tabs.onUpdated.removeListener(tabListeners[tabId]);
        delete tabListeners[tabId];
      }
      // 正しいクエリ内容で再送
      openPerplexityTab(queries[idx], idx, retry + 1);
    });
  } else {
    // リトライ上限→エラーログ保存
    saveErrorLog({ tabId, errorMsg, time: new Date().toISOString() });
    // タブを閉じる
    chrome.tabs.remove(tabId, () => {
      if (tabListeners[tabId]) {
        chrome.tabs.onUpdated.removeListener(tabListeners[tabId]);
        delete tabListeners[tabId];
      }
    });
    // ポップアップ通知（manifestのパスに合わせて修正）
    chrome.notifications.create({
      type: "basic",
      iconUrl: "public/icon128.png",
      title: "Perplexity拡張エラー",
      message: `クエリ${idx + 1}でエラー: ${errorMsg}`,
    });
  }
}

// 統合プロンプト送信
function sendIntegratePrompt() {
  // 回答をまとめて統合プロンプトを作成
  const combined = answers
    .map((ans, i) => `【クエリ${i + 1}の回答】\n${ans}`)
    .join("\n\n");

  const finalPrompt = `${combined}\n\n${integratePrompt}`;

  // 新しいタブでPerplexityを開き、統合プロンプト送信
  chrome.tabs.create({ url: PERPLEXITY_URL, active: true }, (tab) => {
    reportTabId = tab.id;

    // リスナーを外部関数化し、参照を保存
    const listener = function (tabId, info) {
      if (tabId === tab.id && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        delete tabListeners[tab.id];

        // content scriptに統合プロンプト送信
        chrome.tabs.sendMessage(
          tab.id,
          { type: "PERPLEXITY_SEND_QUERY", query: finalPrompt },
          (response) => {
            // 統合レポートのタブは開いたまま
          }
        );
      }
    };
    tabListeners[tab.id] = listener;
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// エラーログ保存（chrome.storage.local）
function saveErrorLog(log) {
  chrome.storage.local.get({ errorLogs: [] }, (data) => {
    const logs = data.errorLogs;
    logs.push(log);
    chrome.storage.local.set({ errorLogs: logs });
  });
}