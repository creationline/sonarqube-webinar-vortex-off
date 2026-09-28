'use strict';

const express = require('express');

const PORT = Number(process.env.PORT) || 3000;
const TITLE_MAX_LENGTH = 100;
const BODY_MAX_LENGTH = 2000;
const QUERY_MAX_LENGTH = 100;

// メモはメモリ上に保持する（サーバーを再起動すると消える）
const memos = [];
let nextId = 1;

const app = express();

app.disable('x-powered-by');
app.use(express.urlencoded({ extended: false, limit: '10kb' }));

app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy':
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  next();
});

// 他サイトから送られてきたフォーム送信（CSRF）を拒否する
app.use((req, res, next) => {
  const site = req.get('Sec-Fetch-Site');
  if (req.method === 'POST' && site && site !== 'same-origin' && site !== 'none') {
    res.status(403).type('text/plain').send('Forbidden');
    return;
  }
  next();
});

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// クエリやフォームの値は配列などで届くこともあるので、文字列だけを受け付ける
function toText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function formatDate(date) {
  return date.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
}

function searchMemos(query) {
  if (!query) {
    return memos;
  }
  const needle = query.toLowerCase();
  return memos.filter(
    (memo) =>
      memo.title.toLowerCase().includes(needle) || memo.body.toLowerCase().includes(needle),
  );
}

function renderMemo(memo) {
  return `
    <li class="memo">
      <h3>${escapeHtml(memo.title)}</h3>
      ${memo.body ? `<p>${escapeHtml(memo.body)}</p>` : ''}
      <time>${escapeHtml(formatDate(memo.createdAt))}</time>
    </li>`;
}

function renderPage({ query = '', form = { title: '', body: '' }, errors = [] } = {}) {
  const results = searchMemos(query);
  const heading = query
    ? `「${escapeHtml(query)}」の検索結果（${results.length} 件）`
    : `メモ一覧（${results.length} 件）`;
  const list = results.length
    ? `<ul class="memos">${results.map(renderMemo).join('')}</ul>`
    : '<p class="empty">メモがありません。</p>';
  const errorList = errors.length
    ? `<ul class="errors">${errors.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul>`
    : '';

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>メモアプリ</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 0 auto; padding: 16px; color: #222; }
    h1 { font-size: 1.5rem; }
    section { margin-bottom: 32px; }
    form { display: grid; gap: 8px; }
    input, textarea, button { font: inherit; padding: 8px; }
    textarea { min-height: 6em; }
    button { width: fit-content; cursor: pointer; }
    .search { grid-template-columns: 1fr auto auto; align-items: center; }
    .errors { color: #b00020; }
    .memos { list-style: none; padding: 0; }
    .memo { border: 1px solid #ddd; border-radius: 6px; padding: 12px; margin-bottom: 12px; }
    .memo h3 { margin: 0 0 8px; font-size: 1.1rem; }
    .memo p { margin: 0 0 8px; white-space: pre-wrap; overflow-wrap: anywhere; }
    .memo time { color: #666; font-size: 0.85rem; }
    .empty { color: #666; }
  </style>
</head>
<body>
  <h1>メモアプリ</h1>

  <section>
    <h2>メモを追加</h2>
    ${errorList}
    <form method="post" action="/memos">
      <label>タイトル（必須・${TITLE_MAX_LENGTH} 文字まで）
        <input type="text" name="title" required maxlength="${TITLE_MAX_LENGTH}" value="${escapeHtml(form.title)}">
      </label>
      <label>本文（${BODY_MAX_LENGTH} 文字まで）
        <textarea name="body" maxlength="${BODY_MAX_LENGTH}">${escapeHtml(form.body)}</textarea>
      </label>
      <button type="submit">追加</button>
    </form>
  </section>

  <section>
    <h2>検索</h2>
    <form class="search" method="get" action="/">
      <input type="search" name="q" maxlength="${QUERY_MAX_LENGTH}" value="${escapeHtml(query)}" placeholder="タイトル・本文から検索">
      <button type="submit">検索</button>
      ${query ? '<a href="/">クリア</a>' : ''}
    </form>
  </section>

  <section>
    <h2>${heading}</h2>
    ${list}
  </section>
</body>
</html>`;
}

function validateMemo({ title, body }) {
  const errors = [];
  if (!title) {
    errors.push('タイトルを入力してください。');
  } else if (title.length > TITLE_MAX_LENGTH) {
    errors.push(`タイトルは ${TITLE_MAX_LENGTH} 文字以内で入力してください。`);
  }
  if (body.length > BODY_MAX_LENGTH) {
    errors.push(`本文は ${BODY_MAX_LENGTH} 文字以内で入力してください。`);
  }
  return errors;
}

app.get('/', (req, res) => {
  const query = toText(req.query.q).slice(0, QUERY_MAX_LENGTH);
  res.type('html').send(renderPage({ query }));
});

app.post('/memos', (req, res) => {
  const form = { title: toText(req.body?.title), body: toText(req.body?.body) };
  const errors = validateMemo(form);
  if (errors.length) {
    res.status(400).type('html').send(renderPage({ form, errors }));
    return;
  }

  memos.unshift({ id: nextId++, title: form.title, body: form.body, createdAt: new Date() });
  // 再読み込みで二重登録されないよう、一覧へリダイレクトする
  res.redirect(303, '/');
});

app.use((req, res) => {
  res.status(404).type('text/plain').send('Not Found');
});

// 内部エラーの詳細（スタックトレースなど）は画面に出さない
app.use((err, req, res, _next) => {
  const status = err.status >= 400 && err.status < 500 ? err.status : 500;
  if (status === 500) {
    console.error(err);
  }
  res.status(status).type('text/plain').send(status === 500 ? 'Internal Server Error' : 'Bad Request');
});

app.listen(PORT, () => {
  console.log(`Memo app listening on http://localhost:${PORT}`);
});
