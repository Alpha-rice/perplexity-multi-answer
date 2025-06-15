document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('query-form');
  const queryTextarea = document.getElementById('query');
  const promptTextarea = document.getElementById('integrate-prompt');
  const countInput = document.getElementById('query-count');
  const errorMessage = document.getElementById('error-message');
  const statusMessage = document.getElementById('status-message');
  const executeBtn = document.getElementById('execute-btn');

  let isSending = false;
  let errorLog = [];

  // エラーログ保存（localStorage利用）
  function saveErrorLog(entry) {
    errorLog.push(entry);
    try {
      localStorage.setItem('perplexity_error_log', JSON.stringify(errorLog));
      console.log('[popup] エラーログ保存:', entry);
    } catch (e) {
      console.error('[popup] エラーログ保存失敗:', e);
    }
  }

  // エラーメッセージ表示
  function showError(msg) {
    console.error('[popup] showError:', msg);
    errorMessage.textContent = msg;
    errorMessage.style.display = 'block';
    statusMessage.style.display = 'none';
  }

  // ステータスメッセージ表示
  function showStatus(msg) {
    console.log('[popup] showStatus:', msg);
    statusMessage.textContent = msg;
    statusMessage.style.display = 'block';
    errorMessage.style.display = 'none';
  }

  // メッセージ非表示
  function clearMessages() {
    errorMessage.style.display = 'none';
    statusMessage.style.display = 'none';
  }

  // UIロック
  function lockUI() {
    console.log('[popup] UIロック');
    executeBtn.disabled = true;
    queryTextarea.disabled = true;
    promptTextarea.disabled = true;
    countInput.disabled = true;
    isSending = true;
  }

  // UIアンロック
  function unlockUI() {
    console.log('[popup] UIアンロック');
    executeBtn.disabled = false;
    queryTextarea.disabled = false;
    promptTextarea.disabled = false;
    countInput.disabled = false;
    isSending = false;
  }

  // クエリ送信処理（リトライ付き）
  function sendQueriesWithRetry(queries, prompt, retryCount = 3) {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      let lastError = null;

      function trySend() {
        console.log(`[popup] クエリ送信試行: ${attempts + 1}/${retryCount}`, { queries, prompt });
        chrome.runtime.sendMessage(
          {
            type: 'START_PERPLEXITY_QUERIES',
            queries,
            prompt
          },
          (response) => {
            if (chrome.runtime.lastError) {
              lastError = chrome.runtime.lastError.message;
              console.error('[popup] chrome.runtime.lastError:', lastError);
              attempts++;
              if (attempts < retryCount) {
                showStatus(`通信エラー。リトライ中...（${attempts}/${retryCount}）`);
                setTimeout(trySend, 1000);
              } else {
                reject(lastError);
              }
              return;
            }
            console.log('[popup] 受信response:', response);
            if (response && response.status === 'ok') {
              resolve();
            } else if (response && response.status === 'error') {
              lastError = response.message || 'エラーが発生しました';
              console.error('[popup] response.error:', lastError);
              attempts++;
              if (attempts < retryCount) {
                showStatus(`エラー発生。リトライ中...（${attempts}/${retryCount}）`);
                setTimeout(trySend, 2000); // Increased retry delay
              } else {
                reject(lastError);
              }
            } else if (response && response.error) {
              lastError = response.error;
              console.error('[popup] response.error:', lastError);
              attempts++;
              if (attempts < retryCount) {
                showStatus(`エラー発生。リトライ中...（${attempts}/${retryCount}）`);
                setTimeout(trySend, 2000);
              } else {
                reject(lastError);
              }
            } else {
              lastError = response ? `予期しない応答: ${JSON.stringify(response)}` : '不明なエラーが発生しました';
              console.error('[popup] 不明なエラー:', response);
              attempts++;
              if (attempts < retryCount) {
                showStatus(`不明なエラー。リトライ中...（${attempts}/${retryCount}）`);
                setTimeout(trySend, 2000);
              } else {
                reject(lastError);
              }
            }
          }
        );
      }
      trySend();
    });
  }

  // フォーム送信イベント
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearMessages();

    if (isSending) {
      // 多重送信防止
      console.warn('[popup] 送信中のため無視');
      return;
    }

    const query = queryTextarea.value.trim();
    const prompt = promptTextarea.value.trim();
    const count = parseInt(countInput.value, 10);

    // バリデーション
    if (!query) {
      showError('クエリを入力してください');
      return;
    }
    if (!prompt) {
      showError('統合プロンプトを入力してください');
      return;
    }
    if (isNaN(count) || count < 2 || count > 5) {
      showError('送信回数は2～5回で指定してください');
      return;
    }

    // 同じクエリを指定回数分の配列に
    const queries = Array(count).fill(query);

    // 送信処理
    showStatus('クエリを送信中...');
    lockUI();

    sendQueriesWithRetry(queries, prompt, 3)
      .then(() => {
        unlockUI();
        showStatus('クエリ送信を開始しました。結果は新しいタブで表示されます。');
        // 統合プロンプトはリセットしない
        const promptValue = promptTextarea.value;
        form.reset();
        promptTextarea.value = promptValue;
      })
      .catch((errMsg) => {
        unlockUI();
        showError('エラー: ' + errMsg);
        saveErrorLog({
          time: new Date().toISOString(),
          queries,
          prompt,
          error: errMsg
        });
      });
  });

  // エラーログの初期化（localStorageから取得）
  try {
    const stored = localStorage.getItem('perplexity_error_log');
    if (stored) {
      errorLog = JSON.parse(stored);
      console.log('[popup] エラーログ初期化:', errorLog);
    }
  } catch (e) {
    errorLog = [];
    console.error('[popup] エラーログ初期化失敗:', e);
  }
});