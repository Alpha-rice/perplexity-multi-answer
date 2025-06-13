/**
 * エラーハンドリング用ユーティリティ（堅牢化版）
 */

// エラーログの保存
export function saveErrorLog(error, context = '', urlOverride = undefined) {
  // window.locationが使えない環境（background等）対策
  let url = 'unknown';
  if (typeof urlOverride === 'string') {
    url = urlOverride;
  } else if (typeof window !== 'undefined' && window.location && window.location.href) {
    url = window.location.href;
  } else if (typeof location !== 'undefined' && location.href) {
    url = location.href;
  }

  const errorLog = {
    timestamp: new Date().toISOString(),
    message: (error && error.message) ? error.message : String(error),
    stack: (error && error.stack) ? error.stack : '',
    context: context,
    url: url
  };

  chrome.storage.local.get({ errorLogs: [] }, (data) => {
    if (chrome.runtime && chrome.runtime.lastError) {
      console.error('エラーログ取得失敗:', chrome.runtime.lastError.message);
      return;
    }
    const logs = Array.isArray(data.errorLogs) ? data.errorLogs : [];
    logs.push(errorLog);

    // 最新100件のみ保持
    if (logs.length > 100) {
      logs.splice(0, logs.length - 100);
    }

    chrome.storage.local.set({ errorLogs: logs }, () => {
      if (chrome.runtime && chrome.runtime.lastError) {
        console.error('エラーログ保存失敗:', chrome.runtime.lastError.message);
      }
    });
  });
}

// エラーログの取得
export function getErrorLogs(callback) {
  chrome.storage.local.get({ errorLogs: [] }, (data) => {
    if (chrome.runtime && chrome.runtime.lastError) {
      console.error('エラーログ取得失敗:', chrome.runtime.lastError.message);
      callback([]);
      return;
    }
    callback(Array.isArray(data.errorLogs) ? data.errorLogs : []);
  });
}

// エラーログのクリア
export function clearErrorLogs(callback) {
  chrome.storage.local.set({ errorLogs: [] }, () => {
    if (chrome.runtime && chrome.runtime.lastError) {
      console.error('エラーログクリア失敗:', chrome.runtime.lastError.message);
    }
    if (typeof callback === 'function') callback();
  });
}

// 通知付きエラー処理
export function handleErrorWithNotification(error, title = 'エラーが発生しました', context = '', urlOverride = undefined) {
  console.error(error);
  saveErrorLog(error, context, urlOverride);

  // manifest.jsonのアイコンパスに合わせて修正
  const iconPath = 'public/icon128.png';

  if (chrome.notifications && chrome.notifications.create) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: iconPath,
      title: title,
      message: (error && error.message) ? error.message : String(error)
    }, () => {
      if (chrome.runtime && chrome.runtime.lastError) {
        console.error('通知作成失敗:', chrome.runtime.lastError.message);
      }
    });
  }
}