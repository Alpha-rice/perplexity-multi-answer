/**
 * エラーハンドリング用ユーティリティ（堅牢化＋Promise対応版）
 */

// エラーログの保存（Promise対応）
export function saveErrorLog(error, context = '', urlOverride) {
  return new Promise((resolve, reject) => {
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

    try {
      chrome.storage.local.get({ errorLogs: [] }, (data) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          console.error('エラーログ取得失敗:', chrome.runtime.lastError.message);
          reject(chrome.runtime.lastError);
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
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });
    } catch (e) {
      console.error('エラーログ保存例外:', e);
      reject(e);
    }
  });
}

// エラーログの取得（Promise対応）
export function getErrorLogs() {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.get({ errorLogs: [] }, (data) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          console.error('エラーログ取得失敗:', chrome.runtime.lastError.message);
          resolve([]); // 失敗時は空配列
          return;
        }
        resolve(Array.isArray(data.errorLogs) ? data.errorLogs : []);
      });
    } catch (e) {
      console.error('エラーログ取得例外:', e);
      resolve([]);
    }
  });
}

// エラーログのクリア（Promise対応）
export function clearErrorLogs() {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.set({ errorLogs: [] }, () => {
        if (chrome.runtime && chrome.runtime.lastError) {
          console.error('エラーログクリア失敗:', chrome.runtime.lastError.message);
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    } catch (e) {
      console.error('エラーログクリア例外:', e);
      reject(e);
    }
  });
}

// 通知付きエラー処理（Promise対応・通知パス柔軟化）
export async function handleErrorWithNotification(
  error,
  title = 'エラーが発生しました',
  context = '',
  urlOverride = undefined,
  iconPath = 'icons/icon128.png' // manifest.jsonのパスに合わせて
) {
  console.error(error);
  try {
    await saveErrorLog(error, context, urlOverride);
  } catch (e) {
    // ログ保存失敗は握りつぶす
  }

  // 通知APIが使える場合のみ通知
  if (chrome.notifications && chrome.notifications.create) {
    try {
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
    } catch (e) {
      console.error('通知作成例外:', e);
    }
  }
}