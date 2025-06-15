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
              // Handle new multiple tabs response format
              if (response.results) {
                console.log('[popup] Multiple tabs results:', response.results.length);
                if (response.errors && response.errors.length > 0) {
                  console.warn('[popup] Some queries failed:', response.errors);
                }
                // Create results display
                displayResults(response.results, response.errors, response.prompt);
              }
              resolve(response);
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
      .then((response) => {
        unlockUI();
        if (response && response.results) {
          showStatus(`クエリ完了！成功: ${response.results.length}件, エラー: ${response.errors.length}件。結果ウィンドウが開きます。`);
        } else {
          showStatus('クエリ送信を開始しました。結果は新しいタブで表示されます。');
        }
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

  // 結果表示機能
  function displayResults(results, errors, prompt) {
    console.log('[popup] Displaying results:', results.length);
    
    // Create results window
    const resultsWindow = window.open('', '_blank', 'width=800,height=600,scrollbars=yes');
    if (!resultsWindow) {
      showError('結果表示ウィンドウを開けませんでした。ポップアップブロッカーを確認してください。');
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html lang="ja">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Perplexity クエリ結果</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 1000px;
            margin: 0 auto;
            padding: 20px;
            line-height: 1.6;
          }
          .header {
            background: #f5f5f5;
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 20px;
          }
          .result {
            border: 1px solid #ddd;
            border-radius: 5px;
            margin: 15px 0;
            padding: 15px;
          }
          .result-header {
            background: #e8f4f8;
            padding: 10px;
            margin: -15px -15px 15px -15px;
            border-radius: 5px 5px 0 0;
            font-weight: bold;
          }
          .query {
            background: #f9f9f9;
            padding: 10px;
            border-radius: 3px;
            margin: 10px 0;
            font-style: italic;
          }
          .answer {
            white-space: pre-wrap;
            background: white;
            padding: 15px;
            border-left: 4px solid #007cba;
            margin: 10px 0;
          }
          .error {
            background: #ffe6e6;
            border-left: 4px solid #ff4444;
            padding: 10px;
            margin: 10px 0;
            color: #cc0000;
          }
          .summary {
            background: #e8f5e8;
            border: 2px solid #4caf50;
            border-radius: 5px;
            padding: 15px;
            margin: 20px 0;
          }
          .copy-btn {
            background: #007cba;
            color: white;
            border: none;
            padding: 5px 10px;
            border-radius: 3px;
            cursor: pointer;
            margin: 5px;
          }
          .copy-btn:hover {
            background: #005a8b;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Perplexity 複数クエリ結果</h1>
          <p>実行時刻: ${new Date().toLocaleString('ja-JP')}</p>
          <p>成功: ${results.length}件, エラー: ${errors.length}件</p>
        </div>

        ${results.map(result => `
          <div class="result">
            <div class="result-header">
              タブ ${result.tabIndex} の結果
              <button class="copy-btn" onclick="copyToClipboard('result-${result.tabIndex}')">コピー</button>
            </div>
            <div class="query">
              <strong>クエリ:</strong> ${escapeHtml(result.query)}
            </div>
            <div class="answer" id="result-${result.tabIndex}">
              ${escapeHtml(result.response.answer || result.response)}
            </div>
          </div>
        `).join('')}

        ${errors.length > 0 ? `
          <div class="error">
            <h3>エラー:</h3>
            ${errors.map(error => `<p>• ${escapeHtml(error)}</p>`).join('')}
          </div>
        ` : ''}

        <div class="summary">
          <h3>統合プロンプト:</h3>
          <p>${escapeHtml(prompt)}</p>
          <button class="copy-btn" onclick="copyAllResults()">全結果をコピー</button>
          <button class="copy-btn" onclick="copyForIntegration()">統合用テキストをコピー</button>
        </div>

        <script>
          function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
          }

          function copyToClipboard(elementId) {
            const element = document.getElementById(elementId);
            const text = element.textContent;
            navigator.clipboard.writeText(text).then(() => {
              alert('コピーしました！');
            }).catch(err => {
              console.error('コピーに失敗:', err);
            });
          }

          function copyAllResults() {
            const results = ${JSON.stringify(results.map(r => ({
              tabIndex: r.tabIndex,
              query: r.query,
              answer: r.response.answer || r.response
            })))};
            
            let text = 'Perplexity 複数クエリ結果\\n';
            text += '実行時刻: ${new Date().toLocaleString('ja-JP')}\\n\\n';
            
            results.forEach(result => {
              text += \`タブ \${result.tabIndex}:\\n\`;
              text += \`クエリ: \${result.query}\\n\`;
              text += \`回答:\\n\${result.answer}\\n\\n---\\n\\n\`;
            });

            navigator.clipboard.writeText(text).then(() => {
              alert('全結果をコピーしました！');
            }).catch(err => {
              console.error('コピーに失敗:', err);
            });
          }

          function copyForIntegration() {
            const results = ${JSON.stringify(results.map(r => ({
              tabIndex: r.tabIndex,
              query: r.query,
              answer: r.response.answer || r.response
            })))};
            
            let text = '${escapeHtml(prompt)}\\n\\n';
            text += '以下は同じクエリに対する複数の回答です:\\n\\n';
            
            results.forEach(result => {
              text += \`【回答\${result.tabIndex}】\\n\${result.answer}\\n\\n\`;
            });

            navigator.clipboard.writeText(text).then(() => {
              alert('統合用テキストをコピーしました！');
            }).catch(err => {
              console.error('コピーに失敗:', err);
            });
          }
        </script>
      </body>
      </html>
    `;

    resultsWindow.document.write(html);
    resultsWindow.document.close();
  }

  // HTML エスケープ関数
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

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