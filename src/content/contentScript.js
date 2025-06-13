/**
 * Perplexity 自動クエリ送信・複数回対応 Content-Script（async-response 修正版）
 */

const INPUT_SELECTORS = [
  'textarea[placeholder*="Ask anything"]',
  'textarea[placeholder*="質問"]',
  'textarea[data-testid="search-input"]',
  'textarea[name="q"]',
  'input[type="text"][placeholder*="Ask"]',
  'div[contenteditable="true"]',
];

const SEND_BUTTON_SELECTORS = [
  'button[aria-label="Send"]',
  'button[aria-label="送信"]',
  'button[type="submit"]',
  'button:has(svg)',
  '[data-testid="send-button"]',
];

const ANSWER_CONTAINER_SELECTORS = [
  'main [data-testid="conversation-turn"]',
  '[data-testid="answer"]',
  '.answer-container',
  '[role="main"] > div',
  'main > div > div',
];

// 進行中の監視を管理
let currentObserver = null;
let currentStableTimeout = null;
let currentTimeoutTimer = null;

// 直近のクエリ（重複送信防止）
let lastSentQuery = '';

/* ---------- 便利 util ---------- */
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function findElement(selectors) {
  for (const s of selectors) {
    const el = document.querySelector(s);
    if (el) return el;
  }
  return null;
}

/* ---------- メイン処理 ---------- */
async function sendQueryAndGetAnswer(query) {
  // 監視をリセット
  if (currentObserver) currentObserver.disconnect();
  if (currentStableTimeout) clearTimeout(currentStableTimeout);
  if (currentTimeoutTimer) clearTimeout(currentTimeoutTimer);
  currentObserver = currentStableTimeout = currentTimeoutTimer = null;

  const input = findElement(INPUT_SELECTORS);
  if (!input)
    throw new Error('Perplexity の入力欄が見つかりません（未ログイン？）');

  input.focus();

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

  await delay(400);

  // 送信ボタンが活性化されるまでリトライ
  let sendBtn = null;
  for (let i = 0; i < 10; i++) {
    sendBtn = findElement(SEND_BUTTON_SELECTORS);
    if (sendBtn && !sendBtn.disabled) break;
    await delay(150);
  }
  if (!sendBtn || sendBtn.disabled)
    throw new Error('送信ボタンが有効になりません');

  sendBtn.click();
  lastSentQuery = query;

  return await waitForAnswer();
}

/* 回答待ち */
function waitForAnswer(timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    let finished = false;
    let lastAnswer = '';

    currentTimeoutTimer = setTimeout(() => {
      if (!finished) {
        finished = true;
        currentObserver?.disconnect();
        reject(new Error('回答取得がタイムアウト'));
      }
    }, timeoutMs);

    currentObserver = new MutationObserver(() => {
      if (finished) return;

      for (const sel of ANSWER_CONTAINER_SELECTORS) {
        const nodes = document.querySelectorAll(sel);
        if (!nodes?.length) continue;

        const text = nodes[nodes.length - 1].innerText.trim();
        if (text && text !== lastAnswer && text.length > 10) {
          lastAnswer = text;
          clearTimeout(currentStableTimeout);
          currentStableTimeout = setTimeout(() => {
            if (finished) return;
            finished = true;
            currentObserver.disconnect();
            clearTimeout(currentTimeoutTimer);
            resolve(lastAnswer);
          }, 2500);
        }
        break;
      }
    });

    currentObserver.observe(document.body, { childList: true, subtree: true });
  });
}

/* ---------- onMessage ---------- */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 対象メッセージでなければ同期的に終了させる
  const isHandled =
    message?.type === 'PERPLEXITY_SEND_QUERY' &&
    (Array.isArray(message.queries) || typeof message.query === 'string');

  if (!isHandled) return; // ここで true を返さない -> ポートは閉じられる

  let responded = false;
  const timeoutMs =
    Math.max(70000, 70000 * (message.queries?.length || 1));
  const failSafe = setTimeout(() => {
    if (!responded) {
      responded = true;
      sendResponse({ status: 'error', message: 'contentScript: 応答タイムアウト' });
    }
  }, timeoutMs);

  (async () => {
    try {
      const queries = Array.isArray(message.queries)
        ? message.queries
        : [message.query];

      const answers = [];
      for (const q of queries) {
        try {
          answers.push(await sendQueryAndGetAnswer(q));
        } catch (e) {
          answers.push({ error: e?.message || String(e) });
        }
        await delay(900); // UI 安定待ち
      }

      if (!responded) {
        responded = true;
        clearTimeout(failSafe);
        sendResponse({ status: 'ok', answers });
      }
    } catch (e) {
      if (!responded) {
        responded = true;
        clearTimeout(failSafe);
        sendResponse({ status: 'error', message: e?.message || String(e) });
      }
    }
  })();

  return true; // 非同期応答
});

/* ---------- ユーザー手入力監視 ---------- */
function setupAutoSearch() {
  const input = findElement(INPUT_SELECTORS);
  if (!input || input._perplexityAutoSearchSetup) return;
  input._perplexityAutoSearchSetup = true;

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      const query =
        input.contentEditable === 'true'
          ? input.textContent.trim()
          : input.value.trim();
      if (query && query !== lastSentQuery) {
        sendQueryAndGetAnswer(query);
        e.preventDefault();
      }
    }
  });

  const sendBtn = findElement(SEND_BUTTON_SELECTORS);
  if (sendBtn && !sendBtn._perplexityAutoSearchSetup) {
    sendBtn._perplexityAutoSearchSetup = true;
    sendBtn.addEventListener('click', () => {
      const query =
        input.contentEditable === 'true'
          ? input.textContent.trim()
          : input.value.trim();
      if (query && query !== lastSentQuery) {
        sendQueryAndGetAnswer(query);
      }
    });
  }
}

function observeDomForInputs() {
  setupAutoSearch();
  const obs = new MutationObserver(setupAutoSearch);
  obs.observe(document.body, { childList: true, subtree: true });
}

// 初期化
observeDomForInputs();