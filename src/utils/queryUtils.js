/**
 * クエリ処理用ユーティリティ
 */

// クエリの検証
export function validateQueries(queries) {
  if (!Array.isArray(queries)) {
    return { valid: false, error: 'クエリは配列である必要があります' };
  }
  
  if (queries.length < 2) {
    return { valid: false, error: 'クエリは最低2件必要です' };
  }
  
  if (queries.length > 5) {
    return { valid: false, error: 'クエリは最大5件までです' };
  }
  
  const emptyQueries = queries.filter(q => !q || q.trim().length === 0);
  if (emptyQueries.length > 0) {
    return { valid: false, error: '空のクエリが含まれています' };
  }
  
  return { valid: true };
}

// クエリの正規化
export function normalizeQueries(queriesText) {
  if (typeof queriesText !== 'string') {
    return [];
  }
  
  return queriesText
    .split('\n')
    .map(q => q.trim())
    .filter(q => q.length > 0)
    .slice(0, 5); // 最大5件まで
}

// 統合プロンプトの検証
export function validateIntegratePrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    return { valid: false, error: '統合プロンプトが必要です' };
  }
  
  if (prompt.trim().length === 0) {
    return { valid: false, error: '統合プロンプトを入力してください' };
  }
  
  if (prompt.length > 1000) {
    return { valid: false, error: '統合プロンプトは1000文字以内で入力してください' };
  }
  
  return { valid: true };
}

// クエリと回答の統合
export function combineQueriesAndAnswers(queries, answers, integratePrompt) {
  if (!queries || !answers || queries.length !== answers.length) {
    throw new Error('クエリと回答の数が一致しません');
  }
  
  const combined = answers
    .map((answer, index) => {
      if (!answer) {
        return `【クエリ${index + 1}】${queries[index]}\n【回答】回答を取得できませんでした`;
      }
      return `【クエリ${index + 1}】${queries[index]}\n【回答】${answer}`;
    })
    .join('\n\n');
  
  return `${combined}\n\n${integratePrompt}`;
}

// クエリの重複チェック
export function checkDuplicateQueries(queries) {
  const seen = new Set();
  const duplicates = [];
  
  queries.forEach((query, index) => {
    const normalized = query.toLowerCase().trim();
    if (seen.has(normalized)) {
      duplicates.push({ index, query });
    } else {
      seen.add(normalized);
    }
  });
  
  return duplicates;
}