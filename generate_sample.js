// Generate a sample question bank xlsx that can be imported as-is.
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

const rows = [
  // Day 1 — Set: ASEAN 市場
  { day: 'Day 1', question_set: 'ASEAN 市場', question_no: 1, question_type: 'single',
    question_text: '下列哪一個國家不是 ASEAN 成員國？',
    option_a: '越南', option_b: '泰國', option_c: '日本', option_d: '印尼',
    correct_answer: 'C', explanation: '日本不屬於 ASEAN，ASEAN 由東南亞 10 國組成。',
    base_score: 1000, time_limit_sec: 20 },
  { day: 'Day 1', question_set: 'ASEAN 市場', question_no: 2, question_type: 'single',
    question_text: '東協加三 (ASEAN+3) 中的「三」指的是？',
    option_a: '中國、日本、韓國', option_b: '美國、加拿大、墨西哥', option_c: '台灣、香港、新加坡', option_d: '印度、澳洲、紐西蘭',
    correct_answer: 'A', explanation: 'ASEAN+3 包含中國、日本、韓國，與東協合作緊密。',
    base_score: 1000, time_limit_sec: 20 },
  { day: 'Day 1', question_set: 'ASEAN 市場', question_no: 3, question_type: 'single',
    question_text: 'RCEP 區域全面經濟夥伴關係協定於哪一年正式生效？',
    option_a: '2018', option_b: '2020', option_c: '2022', option_d: '2024',
    correct_answer: 'C', explanation: 'RCEP 於 2022 年 1 月 1 日正式生效。',
    base_score: 1000, time_limit_sec: 20 },

  // Day 1 — Set: 跨境金融
  { day: 'Day 1', question_set: '跨境金融', question_no: 1, question_type: 'single',
    question_text: '下列哪一個不是常見的跨境支付網路？',
    option_a: 'SWIFT', option_b: 'CHIPS', option_c: 'FedNow', option_d: 'TCP/IP',
    correct_answer: 'D', explanation: 'TCP/IP 是網路通訊協定，與支付網路無關。',
    base_score: 1000, time_limit_sec: 20 },
  { day: 'Day 1', question_set: '跨境金融', question_no: 2, question_type: 'single',
    question_text: '信用狀 (Letter of Credit, L/C) 主要功能是？',
    option_a: '降低買賣雙方的信任風險', option_b: '提高商品的售價', option_c: '取代發票', option_d: '減少匯率波動',
    correct_answer: 'A', explanation: 'L/C 由銀行擔保付款，降低國際貿易中的信任風險。',
    base_score: 1000, time_limit_sec: 20 },

  // Day 2 — Set: 科技與創新
  { day: 'Day 2', question_set: '科技與創新', question_no: 1, question_type: 'single',
    question_text: '下列哪一項不屬於 Generative AI 應用？',
    option_a: '文字摘要', option_b: '影像生成', option_c: '密碼雜湊', option_d: '程式碼補全',
    correct_answer: 'C', explanation: '密碼雜湊屬於密碼學基本演算法，不是 Generative AI。',
    base_score: 1000, time_limit_sec: 18 },
  { day: 'Day 2', question_set: '科技與創新', question_no: 2, question_type: 'single',
    question_text: 'Zero Trust 安全模型的核心原則是？',
    option_a: '所有內網裝置都信任', option_b: '永不信任、永遠驗證', option_c: '只信任 VPN', option_d: '只用密碼即可',
    correct_answer: 'B', explanation: 'Zero Trust 強調 Never trust, always verify。',
    base_score: 1000, time_limit_sec: 18 },
  { day: 'Day 2', question_set: '科技與創新', question_no: 3, question_type: 'true_false',
    question_text: '是非題：HTTPS 與 HTTP 相比，主要差異是加上 TLS 加密。',
    option_a: '是', option_b: '否', option_c: '', option_d: '',
    correct_answer: 'A', explanation: 'HTTPS = HTTP over TLS，主要差別是加密與身分驗證。',
    base_score: 800, time_limit_sec: 12 },

  // Day 3 — Set: 團隊文化
  { day: 'Day 3', question_set: '團隊文化', question_no: 1, question_type: 'single',
    question_text: '高效團隊最重要的關鍵是？（Google Aristotle 研究結論）',
    option_a: '工時最長', option_b: '心理安全感', option_c: '薪資最高', option_d: '工具最新',
    correct_answer: 'B', explanation: 'Google Aristotle 研究指出心理安全感是高績效團隊的核心。',
    base_score: 1000, time_limit_sec: 18 },
  { day: 'Day 3', question_set: '團隊文化', question_no: 2, question_type: 'single',
    question_text: '下列哪一項最不像「成長型思維 (Growth Mindset)」？',
    option_a: '相信能力可以透過練習提升', option_b: '從失敗中學習', option_c: '只接受讚美、避開批評', option_d: '挑戰自己舒適圈',
    correct_answer: 'C', explanation: '成長型思維歡迎建設性批評；只接受讚美屬於固定型思維。',
    base_score: 1000, time_limit_sec: 18 },
];

const ws = XLSX.utils.json_to_sheet(rows);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Questions');
const out = path.join(__dirname, '..', 'sample_questions.xlsx');
XLSX.writeFile(wb, out);
console.log('Sample question bank written to', out, `(${rows.length} questions)`);
