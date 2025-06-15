// Perplexity拡張機能 設定ページ用JavaScript（堅牢性・バリデーション強化版）

document.addEventListener('DOMContentLoaded', () => {
  const defaultPromptTextarea = document.getElementById('default-prompt');
  const retryCountSelect = document.getElementById('retry-count');
  const timeoutInput = document.getElementById('timeout');
  const saveButton = document.getElementById('save-settings');
  const viewLogsButton = document.getElementById('view-logs');
  const clearLogsButton = document.getElementById('clear-logs');
  const errorLogsDiv = document.getElementById('error-logs');
  const statusDiv = document.getElementById('status');

  // DOM要素存在チェック
  if (
    !defaultPromptTextarea ||
    !retryCountSelect ||
    !timeoutInput ||
    !saveButton ||
    !viewLogsButton ||
    !clearLogsButton ||
    !errorLogsDiv ||
    !statusDiv
  ) {
    alert('設定ページの要素が正しく読み込めませんでした。HTML構造を確認してください。');
    return;
  }

  // 設定の読み込み
  loadSettings();

  // 設定保存
  saveButton.addEventListener('click', saveSettings);

  // ログ表示
  viewLogsButton.addEventListener('click', viewErrorLogs);

  // ログクリア
  clearLogsButton.addEventListener('click', clearErrorLogs);

  function loadSettings() {
    chrome.storage.sync.get(
      {
        defaultPrompt: '上記の回答をまとめて、わかりやすいレポートを作成してください。',
        retryCount: 3,
        timeout: 60,
      },
      (settings) => {
        if (chrome.runtime.lastError) {
          showStatus('設定の読み込みに失敗しました: ' + chrome.runtime.lastError.message, 'error');
          return;
        }
        defaultPromptTextarea.value = settings.defaultPrompt || '';
        retryCountSelect.value = String(settings.retryCount);
        timeoutInput.value = String(settings.timeout);
      }
    );
  }

  function saveSettings() {
    const defaultPrompt = defaultPromptTextarea.value.trim();
    const retryCount = parseInt(retryCountSelect.value, 10);
    const timeout = parseInt(timeoutInput.value, 10);

    // バリデーション
    if (!defaultPrompt) {
      showStatus('デフォルトプロンプトを入力してください', 'error');
      return;
    }
    if (isNaN(retryCount) || retryCount < 1 || retryCount > 10) {
      showStatus('リトライ回数は1〜10の範囲で設定してください', 'error');
      return;
    }
    if (isNaN(timeout) || timeout < 30 || timeout > 300) {
      showStatus('タイムアウト時間は30〜300秒の範囲で設定してください', 'error');
      return;
    }

    const settings = {
      defaultPrompt,
      retryCount,
      timeout,
    };

    chrome.storage.sync.set(settings, () => {
      if (chrome.runtime.lastError) {
        showStatus('設定の保存に失敗しました: ' + chrome.runtime.lastError.message, 'error');
      } else {
        showStatus('設定を保存しました', 'success');
      }
    });
  }

  function viewErrorLogs() {
    chrome.storage.local.get({ errorLogs: [] }, (data) => {
      if (chrome.runtime.lastError) {
        showStatus('エラーログの取得に失敗しました: ' + chrome.runtime.lastError.message, 'error');
        return;
      }
      const logs = Array.isArray(data.errorLogs) ? data.errorLogs : [];
      if (logs.length === 0) {
        errorLogsDiv.innerHTML = '<p>エラーログはありません</p>';
      } else {
        const logsHtml = logs
          .slice(-20) // 最新20件のみ表示
          .reverse()
          .map((log) => `
            <div class="log-entry">
              <strong>${log.timestamp ? new Date(log.timestamp).toLocaleString() : ''}</strong><br>
              <strong>エラー:</strong> ${escapeHtml(log.message || '')}<br>
              ${log.context ? `<strong>コンテキスト:</strong> ${escapeHtml(log.context)}<br>` : ''}
              ${log.url ? `<strong>URL:</strong> ${escapeHtml(log.url)}` : ''}
            </div>
          `)
          .join('');
        errorLogsDiv.innerHTML = logsHtml;
      }
      errorLogsDiv.style.display = 'block';
    });
  }

  function clearErrorLogs() {
    if (confirm('すべてのエラーログを削除しますか？')) {
      chrome.storage.local.set({ errorLogs: [] }, () => {
        if (chrome.runtime.lastError) {
          showStatus('ログの削除に失敗しました: ' + chrome.runtime.lastError.message, 'error');
        } else {
          showStatus('エラーログを削除しました', 'success');
          errorLogsDiv.style.display = 'none';
        }
      });
    }
  }

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';

    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 3000);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : text;
    return div.innerHTML;
  }
});