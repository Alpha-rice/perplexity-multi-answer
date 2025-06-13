/**
 * Perplexity自動クエリ送信・回答取得用Content Script（堅牢性強化＋自動検索対応版）
 */

const INPUT_SELECTORS = [
  'textarea[placeholder*="Ask anything"]',
  'textarea[placeholder*="質問"]',
  'textarea[data-testid="search-input"]',
  'textarea[name="q"]',
  'input[type="text"][placeholder*="Ask"]',
  'div[contenteditable="true"]'
];

const SEND_BUTTON_SELECTORS = [
  'button[aria-label="Send"]',
  'button[aria-label="送信"]',
  'button[type="submit"]',
  'button:has(svg)',
  '[data-testid="send-button"]'
];

const ANSWER_CONTAINER_SELECTORS = [
  'main [data-testid="conversation-turn"]',
  '[data-testid="answer"]',
  '.answer-container',
  '[role="main"] > div',
  'main > div > div'
];

// 進行中の監視を管理
let currentObserver = null;
let currentStableTimeout = null;
let currentTimeoutTimer = null;

// 直近のクエリを記録し、重複送信を防ぐ
let lastSentQuery = '';

function findElement(selectors) {
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) return element;
  }
  return null;
}

async function sendQueryAndGetAnswer(query) {
  try {
    // 進行中の監視をキャンセル
    if (currentObserver) {
      currentObserver.disconnect();
      currentObserver = null;
    }
    if (currentStableTimeout) {
      clearTimeout(currentStableTimeout);
      currentStableTimeout = null;
    }
    if (currentTimeoutTimer) {
      clearTimeout(currentTimeoutTimer);
      currentTimeoutTimer = null;
    }

    const input = findElement(INPUT_SELECTORS);
    if (!input) throw new Error('Perplexityの入力欄が見つかりません（未ログインの可能性あり）');

    input.focus();

    // contenteditableの場合
    if (input.contentEditable === 'true') {
      input.textContent = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.textContent = query;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.value = query;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    await new Promise(resolve => setTimeout(resolve, 500));

    // 送信ボタンが有効になるまで最大10回再取得
    let sendBtn = null;
    let attempts = 0;
    while (attempts < 10) {
      sendBtn = findElement(SEND_BUTTON_SELECTORS);
      if (sendBtn && !sendBtn.disabled) break;
      await new Promise(resolve => setTimeout(resolve, 200));
      attempts++;
    }
    if (!sendBtn || sendBtn.disabled) throw new Error('送信ボタンが有効になりません');

    sendBtn.click();

    lastSentQuery = query; // 直近のクエリを記録

    const answer = await waitForAnswer();
    chrome.runtime.sendMessage({ type: 'PERPLEXITY_ANSWER', answer });
  } catch (err) {
    chrome.runtime.sendMessage({ type: 'PERPLEXITY_ERROR', message: err && err.message ? err.message : String(err) });
  }
}

// 回答監視（タイムアウトはsetTimeoutで確実に発火）
function waitForAnswer(timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    let lastAnswer = '';
    let finished = false;

    // タイムアウト監視
    currentTimeoutTimer = setTimeout(() => {
      if (finished) return;
      finished = true;
      if (currentObserver) currentObserver.disconnect();
      if (currentStableTimeout) clearTimeout(currentStableTimeout);
      reject(new Error('回答の取得にタイムアウトしました'));
    }, timeoutMs);

    currentObserver = new MutationObserver(() => {
      if (finished) return;

      let answerNodes = [];
      for (const selector of ANSWER_CONTAINER_SELECTORS) {
        const nodes = document.querySelectorAll(selector);
        if (nodes.length > 0) {
          answerNodes = Array.from(nodes);
          break;
        }
      }

      if (answerNodes.length > 0) {
        const lastNode = answerNodes[answerNodes.length - 1];
        const text = lastNode.innerText.trim();
        if (text && text !== lastAnswer && text.length > 10) {
          lastAnswer = text;
          if (currentStableTimeout) clearTimeout(currentStableTimeout);
          currentStableTimeout = setTimeout(() => {
            if (finished) return;
            finished = true;
            if (currentObserver) currentObserver.disconnect();
            if (currentTimeoutTimer) clearTimeout(currentTimeoutTimer);
            resolve(lastAnswer);
          }, 3000);
        }
      }
    });

    currentObserver.observe(document.body, { childList: true, subtree: true });
  });
}

// メッセージ経由でのクエリ送信
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PERPLEXITY_SEND_QUERY' && message.query) {
    let responded = false;
    // タイムアウト保険（例: 70秒後に強制応答）
    const failSafeTimer = setTimeout(() => {
      if (!responded) {
        responded = true;
        sendResponse({ status: 'error', message: 'contentScript: 応答タイムアウト' });
      }
    }, 70000);

    sendQueryAndGetAnswer(message.query)
      .then(() => {
        if (!responded) {
          responded = true;
          clearTimeout(failSafeTimer);
          sendResponse({ status: 'ok' });
        }
      })
      .catch(err => {
        if (!responded) {
          responded = true;
          clearTimeout(failSafeTimer);
          sendResponse({ status: 'error', message: err && err.message ? err.message : String(err) });
        }
      });
    return true; // 非同期応答のため必須
  }
});

// --- ここから自動検索イベントリスナー追加 ---

function setupAutoSearchOnUserInput() {
  const input = findElement(INPUT_SELECTORS);
  if (!input) return;

  // すでにイベントが設定されていれば重複しないように
  if (input._perplexityAutoSearchSetup) return;
  input._perplexityAutoSearchSetup = true;

  // Enterキーで送信（Shift+Enterは改行）
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      const query = input.contentEditable === 'true' ? input.textContent.trim() : input.value.trim();
      if (query && query !== lastSentQuery) {
        // 送信ボタンを押す前に自動送信
        sendQueryAndGetAnswer(query);
        e.preventDefault();
      }
    }
  });

  // 送信ボタン押下時にも自動送信（ユーザーが直接ボタンを押した場合）
  const sendBtn = findElement(SEND_BUTTON_SELECTORS);
  if (sendBtn && !sendBtn._perplexityAutoSearchSetup) {
    sendBtn._perplexityAutoSearchSetup = true;
    sendBtn.addEventListener('click', function() {
      const query = input.contentEditable === 'true' ? input.textContent.trim() : input.value.trim();
      if (query && query !== lastSentQuery) {
        sendQueryAndGetAnswer(query);
      }
    });
  }
}

// ページロード時と動的DOM変化時に監視して自動セットアップ
function observeInputAndButton() {
  setupAutoSearchOnUserInput();
  // 入力欄やボタンが動的に変わる場合にも対応
  const observer = new MutationObserver(() => {
    setupAutoSearchOnUserInput();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// 初期化
observeInputAndButton();