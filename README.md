# Quizly · 互動答題競賽平台

A real-time quiz competition platform inspired by Kahoot, designed for cross-border training events and team-building activities. Excel import for question banks, QR-code join from any phone, host-controlled flow with projection display, real-time / daily / total rankings, and full Excel result export.

支援全球連線、100 人同時在線、主持人控場、即時排名、Excel 匯入/匯出。

---

## Quick Start 快速開始

```bash
# 1) Install dependencies
npm install

# 2) (optional) Generate a sample question bank xlsx
npm run seed
# → sample_questions.xlsx

# 3) Start the server
npm start
# → http://localhost:3000
```

Then in a browser:

1. Open `http://localhost:3000/admin.html`
2. Create an activity (建立活動)
3. Open the activity, upload `sample_questions.xlsx`
4. Click **建立現場代碼** → a 6-character code appears (e.g. `A3K9PX`)
5. Click **開啟主持人畫面** — this is the screen you project on the big display
6. Players scan the QR code with their phone → opens `/join.html?s=<code>` → enter employee ID + nickname
7. On the host screen, click **下一題 / 開始** to push the first question; then **公布答案** / **顯示詳解** / **即時排名** / **下一題** to drive the flow
8. When done, **下載 Excel 完整成績** on the host screen or admin panel

---

## Routes 路由

| URL | Role | What it is |
|-----|------|------------|
| `/`                  | All     | Landing page |
| `/admin.html`        | Admin   | Create activities, import xlsx, start sessions, export results |
| `/host.html?s=CODE`  | Host    | Big-screen projection + control buttons |
| `/join.html?s=CODE`  | Player  | Mobile join form + game UI |
| `/api/template.xlsx` | Admin   | Download Excel template |
| `/api/sessions/:id/qrcode`     | —       | PNG QR code for a session |
| `/api/sessions/:id/export.xlsx`| Admin   | Download all results as multi-sheet xlsx |

---

## Excel Format 題庫格式

Column headers (case-sensitive, English):

```
day | question_set | question_no | question_type | question_text
option_a | option_b | option_c | option_d
correct_answer | explanation | base_score | time_limit_sec
```

* `question_type` — `single` / `multiple` / `true_false`
* `correct_answer` — `A` / `B` / `C` / `D`
* `base_score` defaults to 1000 if blank
* `time_limit_sec` defaults to 20 if blank
* Rows are automatically grouped into `(day, question_set)` — i.e. you do not need to pre-create question sets

Use `/api/template.xlsx` to download a working template, or `npm run seed` to generate `sample_questions.xlsx` with 10 sample questions across 3 days.

---

## Scoring 計分

```
score = is_correct ? base_score × (0.5 + 0.5 × remaining_time_ratio) : 0
```

A correct answer is guaranteed at least 50% of `base_score`; the remaining 50% scales with how fast you answered. Wrong / unanswered = 0.

---

## Architecture 架構

```
Browser (player phone)  ──┐
Browser (player phone)  ──┼─→  Socket.IO  ─→  Node.js (Express)  ─→  SQLite
Browser (host display)  ──┘                       │
Browser (admin laptop)  ───→  HTTP REST  ─────────┘
```

* **Backend** — Node.js + Express + Socket.IO
* **Database** — SQLite via `better-sqlite3` (file at `data/quiz.db`)
* **Realtime** — Socket.IO rooms, one per session code; host and player rooms separated
* **Excel** — `xlsx` (SheetJS) for import + multi-sheet export
* **QR** — `qrcode` package, served as PNG

### Files

```
quiz-platform/
├── server.js              Express + Socket.IO + REST + game logic
├── db.js                  Better-sqlite3 schema setup
├── package.json
├── scripts/
│   └── generate_sample.js Seeds sample_questions.xlsx
├── public/
│   ├── style.css          Light + tech color system (indigo + cyan on slate-50)
│   ├── index.html         Landing page
│   ├── admin.html         Admin console
│   ├── host.html          Projection / control
│   └── join.html          Mobile player UI
└── data/                  SQLite db lives here (auto-created)
```

---

## Deployment 部署

The MVP is single-process and works on any Node 18+ host. For real cross-border use:

* **Process** — `pm2 start server.js -i 1` (sticky sessions required if you scale `i > 1` — Socket.IO sticky cookie)
* **TLS** — front with Nginx or Caddy: `your.domain → http://localhost:3000`. WebSocket upgrade headers required.
* **Capacity** — One Node process easily handles 100–200 concurrent players. SQLite is fine at this scale; for >500 players or multi-region, swap `db.js` for PostgreSQL + Redis (table schema unchanged).
* **Cloud** — Any of GCP Cloud Run, AWS App Runner, Azure App Service, or a single VM. Pin a single instance so WebSocket affinity stays simple.

---

## Visual Identity 視覺風格

Per request, **not** Yushan green/gold. A modern, light, tech-forward palette:

| Token | Hex | Use |
|------|-----|-----|
| `--bg`         | `#F4F7FB` | Page background (slate) |
| `--surface`    | `#FFFFFF` | Cards |
| `--primary`    | `#4F46E5` | Indigo — buttons, accents |
| `--accent`     | `#06B6D4` | Cyan — secondary highlights |
| `--success`    | `#10B981` | Correct answers |
| `--danger`     | `#EF4444` | Wrong answers |
| `--warn`       | `#F59E0B` | Podium / 1st-3rd place |

Brand gradient `indigo → cyan` is used for the logo mark, primary buttons, and player avatars.

---

## What's Implemented vs Out of Scope

| Feature (per spec) | Status |
|--------------------|--------|
| Excel import 題庫匯入                              | ✅ |
| Employee ID + nickname login 員編登入             | ✅ |
| Host control 主持人控場                            | ✅ |
| Real-time ranking 即時排名                         | ✅ |
| Daily ranking 單日排名                             | ✅ |
| Total ranking 總排名                               | ✅ |
| Excel export (7 sheets) 完整 Excel 匯出            | ✅ |
| 100 concurrent players 100 人同時在線              | ✅ (single process; load-tested architecture) |
| QR-code join QR Code 入場                          | ✅ |
| Question / reveal / explain / leaderboard phases  | ✅ |
| Image questions 圖片題                             | ⏳ Phase 2 |
| Team mode 團隊賽                                   | ⏳ Phase 2 |
| Bilingual i18n 中英雙語                            | ⏳ Phase 2 |
| Random question order 題目隨機排序                 | ⏳ Phase 2 |
| AI-assisted question generation AI 出題           | ⏳ Phase 2 |

---

## License

Internal prototype — do whatever you need internally.
