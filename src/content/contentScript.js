/**
 * Perplexity自動クエリ送信・回答取得用Content Script（堅牢性強化版）
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
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PERPLEXITY_SEND_QUERY' && message.query) {
    sendQueryAndGetAnswer(message.query)
      .then(() => sendResponse({ status: 'ok' }))
      .catch(err => sendResponse({ status: 'error', message: err && err.message ? err.message : String(err) }));
    return true; // 非同期応答のため必須
  }
});