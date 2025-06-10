/**
 * Perplexity自動クエリ送信・回答取得用Content Script（拡張通信対応版）
 * - 指定クエリを自動入力・送信
 * - 回答を監視し、取得後はchrome.runtime.sendMessageで拡張に通知
 * - エラー時もchrome.runtime.sendMessageで通知
 * - backgroundからの指示もchrome.runtime.onMessageで受信
 * - 日本語コメント
 */

const INPUT_SELECTOR = 'textarea[placeholder*="Ask anything"]';
const SEND_BUTTON_SELECTOR = 'button[aria-label="Send"]';
const ANSWER_CONTAINER_SELECTOR = 'main [data-testid="conversation-turn"]';

// クエリ送信＆回答取得メイン関数
async function sendQueryAndGetAnswer(query) {
  try {
    const input = document.querySelector(INPUT_SELECTOR);
    if (!input) throw new Error('Perplexityの入力欄が見つかりません（未ログインの可能性あり）');

    // 入力欄の値をクリアしてからセット（SPA対策）
    input.focus();
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.value = query;
    input.dispatchEvent(new Event('input', { bubbles: true }));

    const sendBtn = document.querySelector(SEND_BUTTON_SELECTOR);
    if (!sendBtn) throw new Error('送信ボタンが見つかりません');
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
      const answerNodes = document.querySelectorAll(ANSWER_CONTAINER_SELECTOR);
      if (answerNodes.length > 0) {
        const lastNode = answerNodes[answerNodes.length - 1];
        const text = lastNode.innerText.trim();
        if (text && text !== lastAnswer) {
          lastAnswer = text;
          clearTimeout(stableTimeout);
          stableTimeout = setTimeout(() => {
            if (finished) return;
            finished = true;
            observer.disconnect();
            resolve(lastAnswer);
          }, 2000); // 2秒間変化がなければ確定
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