// Interactive Quiz Competition Platform — server entry point
// Express + Socket.IO + SQLite. Three roles: admin, host, player.

const express = require('express');
const http    = require('http');
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const XLSX    = require('xlsx');
const QRCode  = require('qrcode');
const { Server } = require('socket.io');
const db = require('./db');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const upload = multer({ storage: multer.memoryStorage() });

app.set('trust proxy', true); // honor x-forwarded-* on Render / Cloudflare / etc.
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ------------- Utility -------------
function shortCode(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing chars
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function getBaseUrl(req) {
  // 1. PUBLIC_URL env wins (set in cloud deploys, e.g. https://quizly.onrender.com)
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  // 2. Respect proxy headers (Cloudflare, Render, etc.)
  const xfHost  = req.get('x-forwarded-host');
  const xfProto = req.get('x-forwarded-proto');
  if (xfHost) return `${xfProto || 'https'}://${xfHost}`;
  // 3. Fall back to request host — BUT refuse "localhost"/"127.0.0.1" because
  //    the QR code goes to phones and they can't reach the host's loopback.
  const host = req.get('host') || '';
  if (/^(localhost|127\.0\.0\.1)/i.test(host)) {
    // Try to auto-detect the first LAN IP so QR codes still work on same-Wi-Fi
    const os = require('os');
    const ifaces = os.networkInterfaces();
    for (const list of Object.values(ifaces)) {
      for (const it of list || []) {
        if (it.family === 'IPv4' && !it.internal) return `http://${it.address}:${host.split(':')[1] || PORT}`;
      }
    }
  }
  return `${req.protocol}://${host}`;
}

// ------------- Admin APIs -------------

// List activities
app.get('/api/activities', (req, res) => {
  const rows = db.prepare(`
    SELECT a.*,
      (SELECT COUNT(*) FROM question_sets qs WHERE qs.activity_id = a.activity_id) AS set_count,
      (SELECT COUNT(*) FROM questions q JOIN question_sets qs ON q.set_id = qs.set_id WHERE qs.activity_id = a.activity_id) AS question_count
    FROM activities a ORDER BY created_at DESC
  `).all();
  res.json(rows);
});

// Create activity
app.post('/api/activities', (req, res) => {
  const { activity_name, start_date, end_date } = req.body;
  if (!activity_name) return res.status(400).json({ error: 'activity_name required' });
  const info = db.prepare('INSERT INTO activities (activity_name, start_date, end_date) VALUES (?,?,?)')
    .run(activity_name, start_date || null, end_date || null);
  res.json({ activity_id: info.lastInsertRowid });
});

// Delete activity
app.delete('/api/activities/:id', (req, res) => {
  db.prepare('DELETE FROM activities WHERE activity_id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Get activity detail with sets & questions
app.get('/api/activities/:id', (req, res) => {
  const activity = db.prepare('SELECT * FROM activities WHERE activity_id = ?').get(req.params.id);
  if (!activity) return res.status(404).json({ error: 'not found' });
  const sets = db.prepare('SELECT * FROM question_sets WHERE activity_id = ? ORDER BY day_label, sort_order, set_id').all(req.params.id);
  for (const s of sets) {
    s.questions = db.prepare('SELECT * FROM questions WHERE set_id = ? ORDER BY question_no, question_id').all(s.set_id);
  }
  res.json({ ...activity, sets });
});

// Import Excel question bank
app.post('/api/activities/:id/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  const activityId = parseInt(req.params.id, 10);
  let wb;
  try { wb = XLSX.read(req.file.buffer, { type: 'buffer' }); }
  catch (e) { return res.status(400).json({ error: 'cannot parse excel' }); }
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const insertSet = db.prepare('INSERT INTO question_sets (activity_id, day_label, set_name, sort_order) VALUES (?,?,?,?)');
  const findSet   = db.prepare('SELECT set_id FROM question_sets WHERE activity_id=? AND day_label=? AND set_name=?');
  const insertQ   = db.prepare(`INSERT INTO questions
    (set_id, question_no, question_type, question_text, option_a, option_b, option_c, option_d, correct_answer, explanation, base_score, time_limit_sec)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);

  let setsCreated = 0, qCreated = 0;
  const txn = db.transaction(() => {
    let order = 0;
    for (const r of rows) {
      const day = String(r.day || 'Day 1').trim();
      const setName = String(r.question_set || r.set_name || 'Set 1').trim();
      let setRow = findSet.get(activityId, day, setName);
      if (!setRow) {
        const info = insertSet.run(activityId, day, setName, order++);
        setRow = { set_id: info.lastInsertRowid };
        setsCreated++;
      }
      insertQ.run(
        setRow.set_id,
        Number(r.question_no) || null,
        String(r.question_type || 'single').toLowerCase().trim(),
        String(r.question_text || '').trim(),
        String(r.option_a || ''),
        String(r.option_b || ''),
        String(r.option_c || ''),
        String(r.option_d || ''),
        String(r.correct_answer || '').toUpperCase().trim(),
        String(r.explanation || ''),
        Number(r.base_score) || 1000,
        Number(r.time_limit_sec) || 20
      );
      qCreated++;
    }
  });
  try { txn(); } catch (e) { return res.status(500).json({ error: e.message }); }
  res.json({ ok: true, sets_created: setsCreated, questions_created: qCreated, total_rows: rows.length });
});

// Download an Excel template
app.get('/api/template.xlsx', (req, res) => {
  const sample = [{
    activity_name: '2026 海外交流互動競賽',
    day: 'Day 1',
    question_set: 'ASEAN 市場',
    question_no: 1,
    question_type: 'single',
    question_text: '示範題：哪一個是程式語言？',
    option_a: 'Python',
    option_b: '蘋果',
    option_c: '太陽',
    option_d: '汽車',
    correct_answer: 'A',
    explanation: 'Python 是常見的程式語言。',
    base_score: 1000,
    time_limit_sec: 20
  }];
  const ws = XLSX.utils.json_to_sheet(sample);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Questions');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="quiz_template.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// ------------- Session APIs -------------

app.post('/api/sessions', (req, res) => {
  const { activity_id } = req.body;
  const activity = db.prepare('SELECT * FROM activities WHERE activity_id=?').get(activity_id);
  if (!activity) return res.status(400).json({ error: 'invalid activity' });

  let code;
  for (let i = 0; i < 10; i++) {
    code = shortCode();
    if (!db.prepare('SELECT 1 FROM sessions WHERE session_id=?').get(code)) break;
  }
  db.prepare('INSERT INTO sessions (session_id, activity_id) VALUES (?,?)').run(code, activity_id);
  res.json({ session_id: code, activity_id });
});

app.get('/api/sessions/:id', (req, res) => {
  const s = db.prepare('SELECT * FROM sessions WHERE session_id=?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'not found' });
  const a = db.prepare('SELECT * FROM activities WHERE activity_id=?').get(s.activity_id);
  res.json({ ...s, activity_name: a?.activity_name });
});

// QR code PNG (for the join URL)
app.get('/api/sessions/:id/qrcode', async (req, res) => {
  const base = getBaseUrl(req);
  const url = `${base}/join.html?s=${req.params.id}`;
  const png = await QRCode.toBuffer(url, { width: 480, margin: 1, color: { dark: '#0F172A', light: '#FFFFFFFF' } });
  res.setHeader('Content-Type', 'image/png');
  res.send(png);
});

// Tell the host what URL the players should use
app.get('/api/sessions/:id/join-url', (req, res) => {
  const base = getBaseUrl(req);
  res.json({ join_url: `${base}/join.html?s=${req.params.id}`, base_url: base });
});

// ------------- Player join -------------

app.post('/api/sessions/:id/join', (req, res) => {
  const { employee_id, nickname, department } = req.body;
  if (!employee_id || !nickname) return res.status(400).json({ error: 'employee_id and nickname required' });
  const sess = db.prepare('SELECT * FROM sessions WHERE session_id=?').get(req.params.id);
  if (!sess) return res.status(404).json({ error: 'session not found' });

  let p = db.prepare('SELECT * FROM players WHERE session_id=? AND employee_id=?').get(req.params.id, employee_id);
  if (p) {
    db.prepare('UPDATE players SET nickname=?, department=?, last_seen_at=datetime(\'now\') WHERE player_id=?')
      .run(nickname, department || '', p.player_id);
    p.nickname = nickname; p.department = department || '';
  } else {
    const info = db.prepare('INSERT INTO players (session_id, employee_id, nickname, department) VALUES (?,?,?,?)')
      .run(req.params.id, employee_id, nickname, department || '');
    p = { player_id: info.lastInsertRowid, employee_id, nickname, department: department || '' };
  }
  // broadcast new player to host
  io.to(roomFor(req.params.id, 'host')).emit('player_joined', publicPlayer(p));
  res.json({ player_id: p.player_id, employee_id: p.employee_id, nickname: p.nickname });
});

// Players list (host uses this when rejoining)
app.get('/api/sessions/:id/players', (req, res) => {
  const rows = db.prepare('SELECT player_id, employee_id, nickname, department FROM players WHERE session_id=? ORDER BY joined_at').all(req.params.id);
  res.json(rows);
});

// ------------- Export -------------

app.get('/api/sessions/:id/export.xlsx', (req, res) => {
  const sessionId = req.params.id;
  const sess = db.prepare('SELECT * FROM sessions WHERE session_id=?').get(sessionId);
  if (!sess) return res.status(404).json({ error: 'not found' });
  const players = db.prepare('SELECT * FROM players WHERE session_id=?').all(sessionId);
  const answers = db.prepare(`
    SELECT a.*, p.employee_id, p.nickname, p.department,
           q.question_no, q.question_text, q.correct_answer, qs.set_name
    FROM answers a
    JOIN players p   ON a.player_id = p.player_id
    JOIN questions q ON a.question_id = q.question_id
    JOIN question_sets qs ON a.set_id = qs.set_id
    WHERE a.session_id = ?
  `).all(sessionId);

  // Aggregate
  const byPlayer = new Map();
  for (const p of players) byPlayer.set(p.player_id, {
    player_id: p.player_id, employee_id: p.employee_id, nickname: p.nickname, department: p.department,
    days: {}, sets: {}, total: 0, correct: 0, total_ms: 0, answered: 0
  });
  for (const a of answers) {
    const r = byPlayer.get(a.player_id); if (!r) continue;
    r.total += a.score;
    r.correct += a.is_correct;
    r.total_ms += a.response_ms || 0;
    r.answered += 1;
    r.days[a.day_label] = (r.days[a.day_label] || 0) + a.score;
    const k = `${a.day_label} / ${a.set_name}`;
    if (!r.sets[k]) r.sets[k] = { score: 0, correct: 0, total_ms: 0, count: 0 };
    r.sets[k].score += a.score;
    r.sets[k].correct += a.is_correct;
    r.sets[k].total_ms += a.response_ms || 0;
    r.sets[k].count += 1;
  }
  const totals = [...byPlayer.values()].sort((a,b) => b.total - a.total);
  totals.forEach((r,i) => r.rank = i+1);

  const dayLabels = [...new Set(answers.map(a => a.day_label))].sort();

  const wb = XLSX.utils.book_new();

  // Sheet 1 Total
  const totalRows = totals.map(r => {
    const row = { Rank: r.rank, EmployeeID: r.employee_id, Nickname: r.nickname, Department: r.department };
    for (const d of dayLabels) row[d] = r.days[d] || 0;
    row.Total = r.total;
    row.CorrectCount = r.correct;
    row.AvgResponseSec = r.answered ? +(r.total_ms / r.answered / 1000).toFixed(2) : 0;
    return row;
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(totalRows), 'TotalRanking');

  // Day sheets
  for (const d of dayLabels) {
    const sorted = [...totals].sort((a,b) => (b.days[d]||0) - (a.days[d]||0));
    const rows = sorted.map((r,i) => ({
      Rank: i+1, EmployeeID: r.employee_id, Nickname: r.nickname, Department: r.department,
      Score: r.days[d] || 0
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), d.replace(/[^A-Za-z0-9 ]/g, '').slice(0, 25) || 'Day');
  }

  // Set scores
  const setRows = [];
  for (const r of totals) {
    for (const k of Object.keys(r.sets)) {
      const s = r.sets[k];
      setRows.push({ EmployeeID: r.employee_id, Nickname: r.nickname, Set: k,
        Score: s.score, Correct: s.correct, AvgResponseSec: s.count ? +(s.total_ms/s.count/1000).toFixed(2) : 0 });
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(setRows), 'SetScores');

  // Per-answer
  const ansRows = answers.map(a => ({
    EmployeeID: a.employee_id, Nickname: a.nickname, Day: a.day_label, Set: a.set_name,
    QuestionNo: a.question_no, Question: a.question_text,
    Selected: a.selected_answer, Correct: a.correct_answer,
    IsCorrect: a.is_correct ? 'Y' : 'N',
    ResponseSec: a.response_ms ? +(a.response_ms/1000).toFixed(2) : 0,
    Score: a.score
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ansRows), 'PerAnswer');

  // Players
  const pRows = players.map(p => ({ EmployeeID: p.employee_id, Nickname: p.nickname, Department: p.department, JoinedAt: p.joined_at, LastSeen: p.last_seen_at }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pRows), 'Players');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', `attachment; filename="results_${sessionId}.xlsx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// ------------- Socket.IO game flow -------------

function roomFor(sessionId, role) { return `${sessionId}:${role}`; }
function publicPlayer(p) { return { player_id: p.player_id, nickname: p.nickname, department: p.department }; }

function computeLeaderboard(sessionId, scope = 'total', dayLabel = null) {
  let sql = `
    SELECT p.player_id, p.nickname, p.department,
           IFNULL(SUM(a.score),0) AS score,
           IFNULL(SUM(a.is_correct),0) AS correct,
           COUNT(a.answer_id) AS answered
    FROM players p
    LEFT JOIN answers a ON a.player_id = p.player_id
    WHERE p.session_id = ?
  `;
  const params = [sessionId];
  if (scope === 'day' && dayLabel) { sql += ' AND (a.day_label IS NULL OR a.day_label = ?) '; params.push(dayLabel); }
  sql += ' GROUP BY p.player_id ORDER BY score DESC, correct DESC LIMIT 50';
  return db.prepare(sql).all(...params);
}

function nextQuestionPointer(sessionId) {
  const sess = db.prepare('SELECT * FROM sessions WHERE session_id=?').get(sessionId);
  if (!sess) return null;
  const sets = db.prepare(`
    SELECT qs.set_id FROM question_sets qs WHERE qs.activity_id=? ORDER BY qs.day_label, qs.sort_order, qs.set_id
  `).all(sess.activity_id);
  const all = [];
  for (const s of sets) {
    const qs = db.prepare('SELECT question_id, set_id FROM questions WHERE set_id=? ORDER BY question_no, question_id').all(s.set_id);
    for (const q of qs) all.push(q);
  }
  if (!all.length) return null;
  if (!sess.current_question_id) return all[0];
  const idx = all.findIndex(x => x.question_id === sess.current_question_id);
  if (idx === -1 || idx === all.length - 1) return null;
  return all[idx + 1];
}

function getQuestion(id) {
  if (!id) return null;
  const q = db.prepare(`
    SELECT q.*, qs.set_id, qs.set_name, qs.day_label
    FROM questions q JOIN question_sets qs ON q.set_id = qs.set_id
    WHERE q.question_id = ?`).get(id);
  return q;
}

function questionForPlayer(q) {
  return {
    question_id: q.question_id, set_name: q.set_name, day_label: q.day_label,
    question_no: q.question_no, question_type: q.question_type, question_text: q.question_text,
    options: { A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d },
    time_limit_sec: q.time_limit_sec, base_score: q.base_score
  };
}

function answerDistribution(sessionId, questionId) {
  const rows = db.prepare(`SELECT selected_answer, COUNT(*) AS c FROM answers WHERE session_id=? AND question_id=? GROUP BY selected_answer`).all(sessionId, questionId);
  const dist = { A: 0, B: 0, C: 0, D: 0 };
  for (const r of rows) {
    if (r.selected_answer && dist[r.selected_answer] !== undefined) dist[r.selected_answer] = r.c;
  }
  return dist;
}

io.on('connection', socket => {
  let role = null;
  let sessionId = null;
  let playerId = null;

  socket.on('host_join', ({ session_id }) => {
    role = 'host'; sessionId = session_id;
    socket.join(roomFor(session_id, 'host'));
    const players = db.prepare('SELECT player_id, nickname, department FROM players WHERE session_id=? ORDER BY joined_at').all(session_id);
    socket.emit('host_state', {
      session: db.prepare('SELECT * FROM sessions WHERE session_id=?').get(session_id),
      players
    });
  });

  socket.on('player_join', ({ session_id, player_id }) => {
    role = 'player'; sessionId = session_id; playerId = player_id;
    socket.join(roomFor(session_id, 'player'));
    // sync current state
    const sess = db.prepare('SELECT * FROM sessions WHERE session_id=?').get(session_id);
    if (sess && sess.current_question_id && sess.question_phase === 'question') {
      const q = getQuestion(sess.current_question_id);
      socket.emit('question_started', { question: questionForPlayer(q), started_at: sess.question_started_at });
    }
  });

  // Host advances to next question (or first)
  socket.on('host_next_question', () => {
    if (role !== 'host') return;
    const ptr = nextQuestionPointer(sessionId);
    if (!ptr) {
      io.to(roomFor(sessionId, 'host')).emit('game_ended');
      io.to(roomFor(sessionId, 'player')).emit('game_ended');
      db.prepare('UPDATE sessions SET status=\'ended\', question_phase=\'idle\' WHERE session_id=?').run(sessionId);
      return;
    }
    const startedAt = Date.now();
    db.prepare(`UPDATE sessions SET current_set_id=?, current_question_id=?, question_phase='question', question_started_at=?, status='running' WHERE session_id=?`)
      .run(ptr.set_id, ptr.question_id, startedAt, sessionId);
    const q = getQuestion(ptr.question_id);
    io.to(roomFor(sessionId, 'host')).emit('question_started', { question: q, started_at: startedAt });
    io.to(roomFor(sessionId, 'player')).emit('question_started', { question: questionForPlayer(q), started_at: startedAt });
  });

  // Reveal the answer
  socket.on('host_reveal', () => {
    if (role !== 'host') return;
    const sess = db.prepare('SELECT * FROM sessions WHERE session_id=?').get(sessionId);
    if (!sess?.current_question_id) return;
    db.prepare('UPDATE sessions SET question_phase=\'reveal\' WHERE session_id=?').run(sessionId);
    const q = getQuestion(sess.current_question_id);
    const dist = answerDistribution(sessionId, sess.current_question_id);
    const totalAns = Object.values(dist).reduce((s,v) => s+v, 0);
    io.to(roomFor(sessionId, 'host')).emit('answer_revealed', { question_id: q.question_id, correct: q.correct_answer, distribution: dist, total: totalAns });
    io.to(roomFor(sessionId, 'player')).emit('answer_revealed', { question_id: q.question_id, correct: q.correct_answer });
  });

  socket.on('host_explain', () => {
    if (role !== 'host') return;
    const sess = db.prepare('SELECT * FROM sessions WHERE session_id=?').get(sessionId);
    if (!sess?.current_question_id) return;
    db.prepare('UPDATE sessions SET question_phase=\'explain\' WHERE session_id=?').run(sessionId);
    const q = getQuestion(sess.current_question_id);
    io.to(roomFor(sessionId, 'host')).emit('explanation_shown', { question_id: q.question_id, explanation: q.explanation });
    io.to(roomFor(sessionId, 'player')).emit('explanation_shown', { question_id: q.question_id, explanation: q.explanation });
  });

  socket.on('host_leaderboard', ({ scope, day_label } = {}) => {
    if (role !== 'host') return;
    db.prepare('UPDATE sessions SET question_phase=\'leaderboard\' WHERE session_id=?').run(sessionId);
    const rows = computeLeaderboard(sessionId, scope || 'total', day_label || null);
    io.to(roomFor(sessionId, 'host')).emit('leaderboard', { scope: scope || 'total', day_label: day_label || null, rows });
    io.to(roomFor(sessionId, 'player')).emit('leaderboard', { scope: scope || 'total', day_label: day_label || null, rows });
  });

  // Player submits answer
  socket.on('player_answer', ({ question_id, selected }) => {
    if (role !== 'player') return;
    const sess = db.prepare('SELECT * FROM sessions WHERE session_id=?').get(sessionId);
    if (!sess || sess.current_question_id !== question_id || sess.question_phase !== 'question') {
      socket.emit('answer_rejected', { reason: 'not_open' });
      return;
    }
    const q = getQuestion(question_id);
    const now = Date.now();
    const elapsedMs = now - (sess.question_started_at || now);
    if (elapsedMs > q.time_limit_sec * 1000) {
      socket.emit('answer_rejected', { reason: 'too_late' });
      return;
    }
    const isCorrect = (selected || '').toUpperCase() === (q.correct_answer || '').toUpperCase() ? 1 : 0;
    const remainingRatio = Math.max(0, 1 - elapsedMs / (q.time_limit_sec * 1000));
    // Speed-weighted score: 50% guaranteed if correct, 50% speed bonus
    const score = isCorrect ? Math.round(q.base_score * (0.5 + 0.5 * remainingRatio)) : 0;
    try {
      db.prepare(`INSERT INTO answers (session_id, player_id, question_id, set_id, day_label, selected_answer, is_correct, response_ms, score)
                  VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(sessionId, playerId, question_id, q.set_id, q.day_label, (selected||'').toUpperCase(), isCorrect, elapsedMs, score);
    } catch (e) {
      // duplicate (already answered) — ignore
      socket.emit('answer_rejected', { reason: 'already_answered' });
      return;
    }
    socket.emit('answer_accepted', { question_id, is_correct: !!isCorrect, score, elapsed_ms: elapsedMs });
    // Update host of progress
    const answered = db.prepare('SELECT COUNT(*) AS c FROM answers WHERE session_id=? AND question_id=?').get(sessionId, question_id).c;
    const totalPlayers = db.prepare('SELECT COUNT(*) AS c FROM players WHERE session_id=?').get(sessionId).c;
    io.to(roomFor(sessionId, 'host')).emit('answer_progress', { question_id, answered, total: totalPlayers });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Quiz platform listening on 0.0.0.0:${PORT}`);
  console.log(`PUBLIC_URL = ${process.env.PUBLIC_URL || '(not set)'}`);
});

process.on('uncaughtException',  (err) => console.error('UNCAUGHT EXCEPTION:', err));
process.on('unhandledRejection', (err) => console.error('UNHANDLED REJECTION:', err));
