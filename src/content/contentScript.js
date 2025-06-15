/**
 * Perplexity 自動クエリ送信・複数回対応 Content Script（デバッグ用ログ追加）
 */
console.log('[CS] content script loaded:', window.location.href);

// Ensure we're on a Perplexity page
if (!window.location.href.includes('perplexity.ai')) {
  console.warn('[CS] Not on Perplexity.ai, content script may not work properly');
}
const INPUT_SELECTORS = [
  // Primary selectors for Perplexity
  'textarea[placeholder*="Ask anything"]',
  'textarea[placeholder*="Ask follow-up"]',
  'textarea[placeholder*="質問"]',
  'textarea[data-testid="search-input"]',
  'textarea[data-testid="query-input"]',
  'textarea[name="q"]',
  'input[type="text"][placeholder*="Ask"]',
  
  // Generic selectors
  'div[contenteditable="true"]',
  'textarea',
  'input[type="text"]',
  
  // More specific patterns
  'form textarea',
  'div[role="textbox"]',
  '[contenteditable="true"]',
  'textarea[rows]',
  'input[placeholder]',
];

const SEND_BUTTON_SELECTORS = [
  // Primary send button selectors
  'button[aria-label="Send"]',
  'button[aria-label="送信"]',
  'button[data-testid="send-button"]',
  'button[data-testid="submit-button"]',
  'button[type="submit"]',
  
  // SVG-based buttons
  'button:has(svg)',
  'button svg[data-icon="arrow-right"]',
  'button:has(svg[viewBox*="24"])',
  
  // Class-based selectors
  'button[class*="send"]',
  'button[class*="submit"]',
  'button[class*="Search"]',
  
  // Generic button patterns
  'form button',
  'button:last-child',
  'button:not([disabled])',
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

// Enhanced input method with multiple fallback strategies
async function typeTextRobustly(element, text) {
  console.log('[CS] Typing text robustly:', text.substring(0, 50) + '...');
  console.log('[CS] Element type:', element.tagName, 'contentEditable:', element.contentEditable);
  
  // Focus the element
  element.focus();
  element.click();
  await delay(200);

  // Method 1: Direct value/textContent assignment with React events
  console.log('[CS] Method 1: Direct assignment with React events');
  try {
    // Clear existing content
    if (element.contentEditable === 'true') {
      element.textContent = '';
    } else {
      element.value = '';
    }
    
    // Trigger React events for clearing
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    await delay(100);
    
    // Set the text
    if (element.contentEditable === 'true') {
      element.textContent = text;
    } else {
      element.value = text;
    }
    
    // Trigger comprehensive React events
    element.dispatchEvent(new Event('input', { bubbles: true, inputType: 'insertText' }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('keyup', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
    element.dispatchEvent(new Event('focus', { bubbles: true }));
    
    await delay(300);
    
    // Check if text was set
    const currentText = element.contentEditable === 'true' ? element.textContent : element.value;
    if (currentText.trim() === text.trim()) {
      console.log('[CS] Method 1 successful');
      return true;
    }
  } catch (e) {
    console.log('[CS] Method 1 failed:', e.message);
  }

  // Method 2: Clipboard approach
  console.log('[CS] Method 2: Clipboard approach');
  try {
    await navigator.clipboard.writeText(text);
    
    // Clear first
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }));
    await delay(50);
    
    // Paste
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true }));
    await delay(300);
    
    // Check if text was inserted
    const currentText = element.contentEditable === 'true' ? element.textContent : element.value;
    if (currentText.includes(text.substring(0, 20))) {
      console.log('[CS] Method 2 successful');
      return true;
    }
  } catch (e) {
    console.log('[CS] Method 2 failed:', e.message);
  }

  // Method 3: Character by character with enhanced events
  console.log('[CS] Method 3: Character-by-character typing');
  try {
    // Clear first
    if (element.contentEditable === 'true') {
      element.textContent = '';
    } else {
      element.value = '';
    }
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      
      // Simulate comprehensive keyboard events
      const keydownEvent = new KeyboardEvent('keydown', { 
        key: char, 
        code: `Key${char.toUpperCase()}`,
        bubbles: true,
        cancelable: true
      });
      const keypressEvent = new KeyboardEvent('keypress', { 
        key: char, 
        code: `Key${char.toUpperCase()}`,
        bubbles: true,
        cancelable: true
      });
      const keyupEvent = new KeyboardEvent('keyup', { 
        key: char, 
        code: `Key${char.toUpperCase()}`,
        bubbles: true,
        cancelable: true
      });
      
      element.dispatchEvent(keydownEvent);
      element.dispatchEvent(keypressEvent);
      
      // Update the element content
      if (element.contentEditable === 'true') {
        element.textContent += char;
      } else {
        element.value += char;
      }
      
      // Trigger input event with detailed data
      const inputEvent = new Event('input', { 
        bubbles: true, 
        cancelable: true
      });
      inputEvent.inputType = 'insertText';
      inputEvent.data = char;
      element.dispatchEvent(inputEvent);
      
      element.dispatchEvent(keyupEvent);
      
      // Small delay every few characters
      if (i % 5 === 0) await delay(20);
    }
    
    // Final events
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
    element.dispatchEvent(new Event('focus', { bubbles: true }));
    
    await delay(300);
    console.log('[CS] Method 3 completed');
    return true;
  } catch (e) {
    console.log('[CS] Method 3 failed:', e.message);
  }

  // Method 4: execCommand (legacy but sometimes works)
  console.log('[CS] Method 4: execCommand approach');
  try {
    element.focus();
    document.execCommand('selectAll');
    document.execCommand('delete');
    document.execCommand('insertText', false, text);
    await delay(200);
    console.log('[CS] Method 4 completed');
    return true;
  } catch (e) {
    console.log('[CS] Method 4 failed:', e.message);
  }

  console.warn('[CS] All input methods failed');
  return false;
}

// Enhanced function to find and click send button
async function findAndClickSendButton(tabIndex) {
  console.log(`[CS] Tab ${tabIndex}: Looking for send button...`);
  
  // Try multiple approaches to find the send button
  for (let attempt = 0; attempt < 20; attempt++) {
    console.log(`[CS] Tab ${tabIndex}: Send button search attempt ${attempt + 1}`);
    
    // Method 1: Use predefined selectors
    let sendBtn = findElement(SEND_BUTTON_SELECTORS);
    
    // Method 2: Look for buttons near the input
    if (!sendBtn) {
      const input = findElement(INPUT_SELECTORS);
      if (input) {
        const form = input.closest('form');
        if (form) {
          sendBtn = form.querySelector('button[type="submit"]') || 
                   form.querySelector('button:last-child') ||
                   form.querySelector('button:not([disabled])');
        }
        
        // Look for buttons in the same container
        if (!sendBtn) {
          const container = input.closest('div');
          if (container) {
            sendBtn = container.querySelector('button:not([disabled])');
          }
        }
      }
    }
    
    // Method 3: Look for any enabled button that might be the send button
    if (!sendBtn) {
      const allButtons = document.querySelectorAll('button:not([disabled])');
      for (const btn of allButtons) {
        const text = btn.textContent.toLowerCase();
        const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
        if (text.includes('send') || text.includes('submit') || 
            ariaLabel.includes('send') || ariaLabel.includes('submit') ||
            btn.querySelector('svg')) {
          sendBtn = btn;
          break;
        }
      }
    }
    
    if (sendBtn && !sendBtn.disabled) {
      console.log(`[CS] Tab ${tabIndex}: Found send button:`, sendBtn.outerHTML.substring(0, 100));
      
      // Try multiple click methods
      try {
        // Method 1: Regular click
        sendBtn.click();
        await delay(100);
        
        // Method 2: Dispatch click event
        sendBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        await delay(100);
        
        // Method 3: Focus and Enter key
        sendBtn.focus();
        sendBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await delay(100);
        
        console.log(`[CS] Tab ${tabIndex}: Send button clicked successfully`);
        return true;
      } catch (e) {
        console.error(`[CS] Tab ${tabIndex}: Error clicking send button:`, e);
      }
    }
    
    await delay(300);
  }
  
  console.error(`[CS] Tab ${tabIndex}: Could not find or click send button`);
  return false;
}

async function sendQueryAndGetAnswer(query, tabIndex = 1) {
  console.log(`[CS] Tab ${tabIndex}: Starting query:`, query);
  
  // 監視をリセット
  if (currentObserver) currentObserver.disconnect();
  if (currentStableTimeout) clearTimeout(currentStableTimeout);
  if (currentTimeoutTimer) clearTimeout(currentTimeoutTimer);
  currentObserver = currentStableTimeout = currentTimeoutTimer = null;

  // Wait for page to be fully loaded
  await delay(2000);

  // Find input element with retries
  let input = null;
  for (let i = 0; i < 10; i++) {
    input = findElement(INPUT_SELECTORS);
    if (input) break;
    console.log(`[CS] Tab ${tabIndex}: Waiting for input element... attempt ${i + 1}`);
    await delay(500);
  }

  if (!input) {
    console.warn(`[CS] Tab ${tabIndex}: Perplexity の入力欄が見つかりません`);
    // Log all available elements for debugging
    console.log(`[CS] Tab ${tabIndex}: Available textareas:`, document.querySelectorAll('textarea').length);
    console.log(`[CS] Tab ${tabIndex}: Available inputs:`, document.querySelectorAll('input').length);
    throw new Error('Perplexity の入力欄が見つかりません（未ログイン？）');
  }

  console.log(`[CS] Tab ${tabIndex}: Found input element:`, input.tagName, input.placeholder || 'no placeholder');

  // Use robust typing method
  const typingSuccess = await typeTextRobustly(input, query);
  if (!typingSuccess) {
    throw new Error('テキスト入力に失敗しました');
  }

  // Wait for UI to update
  await delay(1000);

  // Verify text was entered
  const currentText = input.contentEditable === 'true' ? input.textContent : input.value;
  console.log(`[CS] Tab ${tabIndex}: Current input text:`, currentText.substring(0, 50));

  // Try Enter key first (often more reliable)
  console.log(`[CS] Tab ${tabIndex}: Trying Enter key to submit`);
  input.focus();
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await delay(500);
  
  // Also try send button as backup
  const sendSuccess = await findAndClickSendButton(tabIndex);
  if (!sendSuccess) {
    console.warn(`[CS] Tab ${tabIndex}: Send button click failed, but Enter key might have worked`);
    // Don't throw error immediately, let's see if the query was submitted
  }

  lastSentQuery = query;

  return await waitForAnswer(90000, tabIndex);
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

// Debug function to analyze page structure
function debugPageStructure() {
  console.log('[CS] === PAGE STRUCTURE DEBUG ===');
  console.log('[CS] URL:', window.location.href);
  console.log('[CS] Title:', document.title);
  
  // Check for input elements
  const textareas = document.querySelectorAll('textarea');
  console.log('[CS] Textareas found:', textareas.length);
  textareas.forEach((ta, i) => {
    console.log(`[CS] Textarea ${i}:`, {
      placeholder: ta.placeholder,
      name: ta.name,
      id: ta.id,
      className: ta.className,
      visible: ta.offsetParent !== null
    });
  });
  
  const inputs = document.querySelectorAll('input[type="text"]');
  console.log('[CS] Text inputs found:', inputs.length);
  inputs.forEach((inp, i) => {
    console.log(`[CS] Input ${i}:`, {
      placeholder: inp.placeholder,
      name: inp.name,
      id: inp.id,
      className: inp.className,
      visible: inp.offsetParent !== null
    });
  });
  
  // Check for buttons
  const buttons = document.querySelectorAll('button');
  console.log('[CS] Buttons found:', buttons.length);
  buttons.forEach((btn, i) => {
    if (i < 10) { // Limit to first 10 buttons
      console.log(`[CS] Button ${i}:`, {
        text: btn.textContent.trim().substring(0, 20),
        ariaLabel: btn.getAttribute('aria-label'),
        type: btn.type,
        disabled: btn.disabled,
        className: btn.className,
        visible: btn.offsetParent !== null
      });
    }
  });
  
  // Check for forms
  const forms = document.querySelectorAll('form');
  console.log('[CS] Forms found:', forms.length);
  
  console.log('[CS] === END DEBUG ===');
}

// Add debug command to window for manual testing
window.debugPerplexity = debugPageStructure;

// 初期化
try {
  observeDomForInputs();
  console.log('[CS] Content script initialization completed successfully');
  
  // Run debug after a delay to let the page load
  setTimeout(debugPageStructure, 3000);
} catch (error) {
  console.error('[CS] Content script initialization failed:', error);
}