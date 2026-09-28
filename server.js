const express = require('express');

const app = express();
app.use(express.urlencoded({ extended: false }));

const memos = [];

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderPage(list, q) {
  const items = list
    .map((m) => `<li>${escapeHtml(m.text)} <small>(${escapeHtml(m.createdAt)})</small></li>`)
    .join('');
  return `<!doctype html>
<html lang="ja">
<head><meta charset="utf-8"><title>メモアプリ</title></head>
<body>
  <h1>メモアプリ</h1>
  <form method="post" action="/memos">
    <input name="text" required maxlength="1000" placeholder="メモを入力">
    <button type="submit">追加</button>
  </form>
  <form method="get" action="/">
    <input name="q" value="${escapeHtml(q)}" placeholder="検索">
    <button type="submit">検索</button>
  </form>
  <ul>${items || '<li>メモはありません</li>'}</ul>
</body>
</html>`;
}

app.get('/', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  const list = q ? memos.filter((m) => m.text.includes(q)) : memos;
  res.send(renderPage(list, q));
});

app.post('/memos', (req, res) => {
  const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
  if (text) {
    memos.push({ text: text.slice(0, 1000), createdAt: new Date().toLocaleString('ja-JP') });
  }
  res.redirect('/');
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`http://localhost:${port}`));
