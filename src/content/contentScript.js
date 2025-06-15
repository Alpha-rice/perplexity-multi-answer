/**
 * Perplexity 自動クエリ送信・複数回対応 Content Script（デバッグ用ログ追加）
 */
console.log('[CS] content script loaded:', window.location.href);

// Ensure we're on a Perplexity page
if (!window.location.href.includes('perplexity.ai')) {
  console.warn('[CS] Not on Perplexity.ai, content script may not work properly');
}
const INPUT_SELECTORS = [
  'textarea[placeholder*="Ask anything"]',
  'textarea[placeholder*="質問"]',
  'textarea[placeholder*="Ask follow-up"]',
  'textarea[data-testid="search-input"]',
  'textarea[name="q"]',
  'input[type="text"][placeholder*="Ask"]',
  'div[contenteditable="true"]',
  'textarea',
  'input[type="text"]',
];

const SEND_BUTTON_SELECTORS = [
  'button[aria-label="Send"]',
  'button[aria-label="送信"]',
  'button[type="submit"]',
  'button:has(svg)',
  '[data-testid="send-button"]',
  'button[data-testid="submit-button"]',
  'button svg[data-icon="arrow-right"]',
  'button[class*="send"]',
  'button[class*="submit"]',
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

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function findElement(selectors) {
  for (const s of selectors) {
    const el = document.querySelector(s);
    if (el) return el;
  }
  return null;
}

// More robust input method using keyboard simulation
async function typeTextRobustly(element, text) {
  console.log('[CS] Typing text robustly:', text.substring(0, 50) + '...');
  
  // Clear existing content
  element.focus();
  await delay(100);
  
  // Select all and delete
  element.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }));
  await delay(50);
  element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
  await delay(100);

  // Method 1: Try clipboard approach
  try {
    await navigator.clipboard.writeText(text);
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true }));
    await delay(200);
    
    // Check if text was inserted
    const currentText = element.contentEditable === 'true' ? element.textContent : element.value;
    if (currentText.includes(text.substring(0, 20))) {
      console.log('[CS] Clipboard method successful');
      return true;
    }
  } catch (e) {
    console.log('[CS] Clipboard method failed:', e.message);
  }

  // Method 2: Character by character typing
  console.log('[CS] Trying character-by-character typing');
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    // Simulate keydown, keypress, input events
    element.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
    element.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));
    
    if (element.contentEditable === 'true') {
      element.textContent += char;
    } else {
      element.value += char;
    }
    
    element.dispatchEvent(new Event('input', { bubbles: true, inputType: 'insertText', data: char }));
    element.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
    
    // Small delay between characters
    if (i % 10 === 0) await delay(10);
  }

  // Trigger change event
  element.dispatchEvent(new Event('change', { bubbles: true }));
  await delay(200);

  return true;
}

async function sendQueryAndGetAnswer(query, tabIndex = 1) {
  console.log(`[CS] Tab ${tabIndex}: Starting query:`, query);
  
  // 監視をリセット
  if (currentObserver) currentObserver.disconnect();
  if (currentStableTimeout) clearTimeout(currentStableTimeout);
  if (currentTimeoutTimer) clearTimeout(currentTimeoutTimer);
  currentObserver = currentStableTimeout = currentTimeoutTimer = null;

  // Wait for page to be fully loaded
  await delay(1000);

  const input = findElement(INPUT_SELECTORS);
  if (!input) {
    console.warn(`[CS] Tab ${tabIndex}: Perplexity の入力欄が見つかりません`);
    throw new Error('Perplexity の入力欄が見つかりません（未ログイン？）');
  }

  console.log(`[CS] Tab ${tabIndex}: Found input element:`, input.tagName, input.placeholder);

  // Use robust typing method
  await typeTextRobustly(input, query);

  // Wait for UI to update
  await delay(500);

  // 送信ボタンが活性化されるまでリトライ
  let sendBtn = null;
  for (let i = 0; i < 15; i++) {
    sendBtn = findElement(SEND_BUTTON_SELECTORS);
    if (sendBtn && !sendBtn.disabled) {
      console.log(`[CS] Tab ${tabIndex}: Send button found and enabled`);
      break;
    }
    console.log(`[CS] Tab ${tabIndex}: Waiting for send button... attempt ${i + 1}`);
    await delay(200);
  }
  
  if (!sendBtn || sendBtn.disabled) {
    console.warn(`[CS] Tab ${tabIndex}: 送信ボタンが有効になりません`);
    throw new Error('送信ボタンが有効になりません');
  }

  console.log(`[CS] Tab ${tabIndex}: Clicking send button`);
  sendBtn.click();
  lastSentQuery = query;

  // Additional click attempts if needed
  await delay(100);
  if (sendBtn && !sendBtn.disabled) {
    sendBtn.click();
  }

  return await waitForAnswer(60000, tabIndex);
}

function waitForAnswer(timeoutMs = 60000, tabIndex = 1) {
  return new Promise((resolve, reject) => {
    let finished = false;
    let lastAnswer = '';

    function cleanup() {
      finished = true;
      if (currentObserver) currentObserver.disconnect();
      if (currentStableTimeout) clearTimeout(currentStableTimeout);
      if (currentTimeoutTimer) clearTimeout(currentTimeoutTimer);
    }

    console.log(`[CS] Tab ${tabIndex}: Waiting for answer...`);

    currentTimeoutTimer = setTimeout(() => {
      if (!finished) {
        cleanup();
        console.error(`[CS] Tab ${tabIndex}: 回答取得がタイムアウト`);
        reject(new Error('回答取得がタイムアウト'));
      }
    }, timeoutMs);

    try {
      currentObserver = new MutationObserver(() => {
        if (finished) return;

        for (const sel of ANSWER_CONTAINER_SELECTORS) {
          const nodes = document.querySelectorAll(sel);
          if (!nodes?.length) continue;

          const text = nodes[nodes.length - 1].innerText.trim();
          if (text && text !== lastAnswer && text.length > 20) {
            lastAnswer = text;
            console.log(`[CS] Tab ${tabIndex}: Answer updated, length: ${text.length}`);
            
            if (currentStableTimeout) clearTimeout(currentStableTimeout);
            currentStableTimeout = setTimeout(() => {
              if (!finished) {
                cleanup();
                console.log(`[CS] Tab ${tabIndex}: 回答取得完了:`, text.substring(0, 100) + '...');
                resolve(text);
              }
            }, 3000); // Increased stability timeout
          }
          break;
        }
      });

      currentObserver.observe(document.body, { childList: true, subtree: true });
    } catch (e) {
      console.error(`[CS] Tab ${tabIndex}: MutationObserver error:`, e);
      cleanup();
      reject(e);
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[CS] onMessage received:', message);

  // Handle PING message for health check
  if (message?.type === 'PING') {
    console.log('[CS] PING received, responding with PONG');
    sendResponse({ status: 'PONG' });
    return;
  }

  // Handle single query for new tab approach
  if (message?.type === 'PERPLEXITY_SEND_SINGLE_QUERY' && typeof message.query === 'string') {
    console.log(`[CS] Single query received for tab ${message.tabIndex}:`, message.query);
    
    let responded = false;
    const timeoutMs = 90000; // 90 seconds for single query
    const failSafe = setTimeout(() => {
      if (!responded) {
        responded = true;
        console.error(`[CS] Tab ${message.tabIndex}: 応答タイムアウト`);
        sendResponse({ status: 'error', message: 'contentScript: 応答タイムアウト' });
      }
    }, timeoutMs);

    (async () => {
      try {
        const answer = await sendQueryAndGetAnswer(message.query, message.tabIndex);
        
        if (!responded) {
          responded = true;
          clearTimeout(failSafe);
          console.log(`[CS] Tab ${message.tabIndex}: sendResponse (ok)`);
          sendResponse({ status: 'ok', answer: answer });
        }
      } catch (e) {
        console.error(`[CS] Tab ${message.tabIndex}: Exception in single query handler:`, e);
        if (!responded) {
          responded = true;
          clearTimeout(failSafe);
          console.log(`[CS] Tab ${message.tabIndex}: sendResponse (error):`, e?.message || String(e));
          sendResponse({ status: 'error', message: e?.message || String(e) });
        }
      }
    })();

    return true; // 非同期応答
  }

  // Handle legacy multiple queries (for backward compatibility)
  const isLegacyHandled =
    message?.type === 'PERPLEXITY_SEND_QUERY' &&
    (Array.isArray(message.queries) || typeof message.query === 'string');

  if (isLegacyHandled) {
    console.log('[CS] Legacy multiple query received');
    
    let responded = false;
    const timeoutMs = Math.max(70000, 70000 * (message.queries?.length || 1));
    const failSafe = setTimeout(() => {
      if (!responded) {
        responded = true;
        console.error('[CS] 応答タイムアウト');
        sendResponse({ status: 'error', message: 'contentScript: 応答タイムアウト' });
      }
    }, timeoutMs);

    (async () => {
      try {
        const queries = Array.isArray(message.queries)
          ? message.queries
          : [message.query];

        const answers = [];
        for (let i = 0; i < queries.length; i++) {
          const q = queries[i];
          try {
            answers.push(await sendQueryAndGetAnswer(q, i + 1));
          } catch (e) {
            console.error('[CS] sendQueryAndGetAnswer failed:', e);
            answers.push({ error: e?.message || String(e) });
          }
          await delay(900); // UI 安定待ち
        }

        if (!responded) {
          responded = true;
          clearTimeout(failSafe);
          console.log('[CS] sendResponse (ok):', { status: 'ok', answers });
          sendResponse({ status: 'ok', answers });
        }
      } catch (e) {
        console.error('[CS] Exception in onMessage handler:', e);
        if (!responded) {
          responded = true;
          clearTimeout(failSafe);
          console.log('[CS] sendResponse (error):', e?.message || String(e));
          sendResponse({ status: 'error', message: e?.message || String(e) });
        }
      }
    })();

    return true; // 非同期応答
  }

  console.warn('[CS] onMessage: type not handled:', message?.type);
});

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
        console.log('[CS] AutoSearch: Enterで送信:', query);
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
        console.log('[CS] AutoSearch: ボタンで送信:', query);
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
try {
  observeDomForInputs();
  console.log('[CS] Content script initialization completed successfully');
} catch (error) {
  console.error('[CS] Content script initialization failed:', error);
}