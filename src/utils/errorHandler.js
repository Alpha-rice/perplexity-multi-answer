/**
 * エラーハンドリング用ユーティリティ
 */

// エラーログの保存
export function saveErrorLog(error, context = '') {
  const errorLog = {
    timestamp: new Date().toISOString(),
    message: error.message || String(error),
    stack: error.stack,
    context: context,
    url: window.location?.href || 'unknown'
  };

  chrome.storage.local.get({ errorLogs: [] }, (data) => {
    const logs = data.errorLogs;
    logs.push(errorLog);
    
    // 最新100件のみ保持
    if (logs.length > 100) {
      logs.splice(0, logs.length - 100);
    }
    
    chrome.storage.local.set({ errorLogs: logs });
  });
}

// エラーログの取得
export function getErrorLogs(callback) {
  chrome.storage.local.get({ errorLogs: [] }, (data) => {
    callback(data.errorLogs);
  });
}

// エラーログのクリア
export function clearErrorLogs() {
  chrome.storage.local.set({ errorLogs: [] });
}

// 通知付きエラー処理
export function handleErrorWithNotification(error, title = 'エラーが発生しました') {
  console.error(error);
  saveErrorLog(error);
  
  if (chrome.notifications) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: title,
      message: error.message || String(error)
    });
  }
}