/**
 * Perplexity自動クエリ送信・回答取得用Content Script（拡張通信対応版）
 * - 指定クエリを自動入力・送信
 * - 回答を監視し、取得後はchrome.runtime.sendMessageで拡張に通知
 * - エラー時もchrome.runtime.sendMessageで通知
 * - backgroundからの指示もchrome.runtime.onMessageで受信
 * - 日本語コメント
 */

// より堅牢なセレクター（複数の候補を用意）
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

// 要素を見つけるヘルパー関数
function findElement(selectors) {
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) return element;
  }
  return null;
}

// クエリ送信＆回答取得メイン関数
async function sendQueryAndGetAnswer(query) {
  try {
    const input = findElement(INPUT_SELECTORS);
    if (!input) throw new Error('Perplexityの入力欄が見つかりません（未ログインの可能性あり）');

    // 入力欄の値をクリアしてからセット（SPA対策）
    input.focus();
    
    // contenteditable要素の場合
    if (input.contentEditable === 'true') {
      input.textContent = '';
      input.textContent = query;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      // textarea/input要素の場合
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.value = query;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // 少し待ってから送信ボタンを探す
    await new Promise(resolve => setTimeout(resolve, 500));

    const sendBtn = findElement(SEND_BUTTON_SELECTORS);
    if (!sendBtn) throw new Error('送信ボタンが見つかりません');
    
    // ボタンが有効になるまで待つ
    let attempts = 0;
    while (sendBtn.disabled && attempts < 10) {
      await new Promise(resolve => setTimeout(resolve, 200));
      attempts++;
    }
    
    sendBtn.click();

    const answer = await waitForAnswer();
    chrome.runtime.sendMessage({ type: 'PERPLEXITY_ANSWER', answer });
  } catch (err) {
    chrome.runtime.sendMessage({ type: 'PERPLEXITY_ERROR', message: err && err.message ? err.message : String(err) });
  }
}

// 回答が表示されるまで監視（最大60秒、安定性向上）
function waitForAnswer(timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    let lastAnswer = '';
    let stableTimeout = null;
    let finished = false;

    const observer = new MutationObserver(() => {
      if (finished) return;
      
      // 複数のセレクターで回答を探す
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
        if (text && text !== lastAnswer && text.length > 10) { // 最低10文字以上
          lastAnswer = text;
          clearTimeout(stableTimeout);
          stableTimeout = setTimeout(() => {
            if (finished) return;
            finished = true;
            observer.disconnect();
            resolve(lastAnswer);
          }, 3000); // 3秒間変化がなければ確定（安定性向上）
        }
      }
      
      if (Date.now() - start > timeoutMs) {
        if (finished) return;
        finished = true;
        observer.disconnect();
        reject(new Error('回答の取得にタイムアウトしました'));
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  });
}

// backgroundからのメッセージ受信
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PERPLEXITY_SEND_QUERY' && message.query) {
    sendQueryAndGetAnswer(message.query);
  }
});