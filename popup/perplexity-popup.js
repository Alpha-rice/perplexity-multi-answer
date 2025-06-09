// Perplexityクエリ統合レポート拡張 ポップアップUI用JS

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('query-form');
  const queriesTextarea = document.getElementById('queries');
  const promptTextarea = document.getElementById('integrate-prompt');
  const errorMessage = document.getElementById('error-message');
  const statusMessage = document.getElementById('status-message');
  const executeBtn = document.getElementById('execute-btn');

  // エラーメッセージ表示
  function showError(msg) {
    errorMessage.textContent = msg;
    errorMessage.style.display = 'block';
    statusMessage.style.display = 'none';
  }

  // ステータスメッセージ表示
  function showStatus(msg) {
    statusMessage.textContent = msg;
    statusMessage.style.display = 'block';
    errorMessage.style.display = 'none';
  }

  // メッセージ非表示
  function clearMessages() {
    errorMessage.style.display = 'none';
    statusMessage.style.display = 'none';
  }

  // フォーム送信イベント
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearMessages();

    const queries = queriesTextarea.value
      .split('\n')
      .map(q => q.trim())
      .filter(q => q.length > 0);

    const prompt = promptTextarea.value.trim();

    // バリデーション
    if (queries.length < 2 || queries.length > 5) {
      showError('クエリは2～5件入力してください（改行区切り）');
      return;
    }
    if (!prompt) {
      showError('統合プロンプトを入力してください');
      return;
    }

    // 送信処理（ここでbackgroundやcontent scriptへメッセージ送信する想定）
    showStatus('クエリを送信中...');

    chrome.runtime.sendMessage(
      {
        type: 'START_PERPLEXITY_QUERIES',
        queries,
        prompt
      },
      (response) => {
        if (chrome.runtime.lastError) {
          showError('拡張機能との通信エラー: ' + chrome.runtime.lastError.message);
          return;
        }
        if (response && response.status === 'ok') {
          showStatus('クエリ送信を開始しました。結果は新しいタブで表示されます。');
        } else if (response && response.error) {
          showError('エラー: ' + response.error);
        } else {
          showError('不明なエラーが発生しました');
        }
      }
    );
  });
});