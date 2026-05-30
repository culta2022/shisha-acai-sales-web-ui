'use strict';

// ── New storage layer (used in upcoming UI steps) ─────────────────────────────
import {
  getShishaSales, saveShishaSale, updateShishaSale, deleteShishaSale,
  getAcaiSales,   saveAcaiSale,   updateAcaiSale,   deleteAcaiSale,
  getExpenses,    saveExpense,    updateExpense,     deleteExpense,
} from './src/services/storage.js';

// ── Legacy storage (current UI — will be replaced in step 2+) ─────────────────
const STORE_KEY = 'shisha_acai_sales';

function loadRecords() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; }
  catch { return []; }
}

function saveRecords(records) {
  localStorage.setItem(STORE_KEY, JSON.stringify(records));
}

let records = loadRecords();

// ── Utilities ─────────────────────────────────────────────────────────────────
const fmt = (n) => '¥' + Number(n).toLocaleString();
const today = () => new Date().toISOString().slice(0, 10);

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ── Navigation ────────────────────────────────────────────────────────────────
document.querySelectorAll('nav button[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('nav button[data-tab]').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'today')   showTodaySection('landing');
    if (btn.dataset.tab === 'summary') renderDashboard();
    if (btn.dataset.tab === 'history') renderHistoryView();
  });
});

// ── Today page ────────────────────────────────────────────────────────────────
function showTodaySection(name) {
  const ids = { landing: 'today-landing', shisha: 'today-shisha', acai: 'today-acai', expense: 'today-expense' };
  Object.entries(ids).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el) el.hidden = (key !== name);
  });
}

function formatDateJa(dateStr) {
  const d    = new Date(dateStr + 'T00:00:00');
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${days[d.getDay()]}）`;
}

function renderTodayStats() {
  const t            = today();
  const shishaTotal  = getShishaSales().filter(r => r.date === t).reduce((s, r) => s + (r.totalAmount || 0), 0);
  const acaiTotal    = getAcaiSales().filter(r => r.date === t).reduce((s, r) => s + (r.totalAmount || 0), 0);
  const expenseTotal = getExpenses().filter(r => r.date === t).reduce((s, r) => s + (r.amount || 0), 0);
  const salesTotal   = shishaTotal + acaiTotal;
  document.getElementById('tkpi-sales').textContent   = fmt(salesTotal);
  document.getElementById('tkpi-expense').textContent = fmt(expenseTotal);
  document.getElementById('tkpi-profit').textContent  = fmt(salesTotal - expenseTotal);
}

document.getElementById('today-date-display').textContent = formatDateJa(today());
document.getElementById('btn-go-shisha').addEventListener('click',      () => showTodaySection('shisha'));
document.getElementById('btn-go-acai').addEventListener('click',        () => showTodaySection('acai'));
document.getElementById('btn-go-expense').addEventListener('click',     () => showTodaySection('expense'));
document.getElementById('back-from-shisha').addEventListener('click',   () => showTodaySection('landing'));
document.getElementById('back-from-acai').addEventListener('click',     () => showTodaySection('landing'));
document.getElementById('back-from-expense').addEventListener('click',  () => showTodaySection('landing'));

// ── Acai Form ────────────────────────────────────────────────────────────────
const CH_CONFIG = {
  '店頭':       { emoji: '🏪', cls: 'ch-instore' },
  'Rocket Now': { emoji: '🚀', cls: 'ch-rocket'  },
  'Uber Eats':  { emoji: '🛵', cls: 'ch-uber'    },
  'その他':     { emoji: '📦', cls: 'ch-other'   },
};

function showAcaiStep(step) {
  document.getElementById('acai-ch-step').hidden     = (step !== 'channel');
  document.getElementById('acai-form-wrap').hidden   = (step !== 'form');
  document.getElementById('acai-saved-state').hidden = (step !== 'saved');
}

function selectAcaiChannel(ch) {
  const cfg = CH_CONFIG[ch] || { emoji: '📦', cls: 'ch-other' };
  const badge = document.getElementById('acai-ch-badge');
  badge.className = 'acai-ch-badge ' + cfg.cls;
  document.getElementById('acai-badge-icon').textContent  = cfg.emoji;
  document.getElementById('acai-badge-label').textContent = ch;
  document.getElementById('acai-channel-val').value       = ch;
  showAcaiStep('form');
  recalcAcai();
}

// チャネルボタン
document.querySelectorAll('.ch-btn[data-ch]').forEach(btn => {
  btn.addEventListener('click', () => selectAcaiChannel(btn.dataset.ch));
});

document.getElementById('btn-acai-ch-change').addEventListener('click', () => showAcaiStep('channel'));

// 今日の日付をセット
document.getElementById('acai-date').value = today();

// Toggle group（フォーム内の顧客区分・サイズ）
document.querySelectorAll('.toggle-group').forEach(group => {
  const form  = group.closest('form');
  const input = form
    ? form.querySelector(`[name="${group.dataset.target}"]`)
    : document.querySelector(`[name="${group.dataset.target}"]`);
  group.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      group.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (input) input.value = btn.dataset.val;
    });
  });
});

// 数量 +/− ボタン
document.querySelectorAll('.qty-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    if (!input) return;
    const v = Number(input.value) || 0;
    if (btn.dataset.action === 'inc') input.value = v + 1;
    if (btn.dataset.action === 'dec' && v > 1) input.value = v - 1;
    input.dispatchEvent(new Event('input'));
  });
});

// リアルタイム計算
function recalcAcai() {
  const nv = (id) => Number(document.getElementById(id)?.value) || 0;

  const qty          = nv('acai-qty');
  const unitPrice    = nv('acai-unit-price');
  const productSales = qty * unitPrice;
  const toppingSales = nv('acai-topping');
  const deliveryFee  = nv('acai-delivery');
  const discount     = nv('acai-discount');
  const platformFee  = nv('acai-platform');
  const materialCost = nv('acai-material');

  const totalAmount = productSales + toppingSales + deliveryFee - discount - platformFee;
  const grossProfit = totalAmount - materialCost;
  const grossProfitRate = totalAmount > 0
    ? Math.round((grossProfit / totalAmount) * 1000) / 10
    : null;

  const receivedAmount = nv('acai-cash') + nv('acai-card') + nv('acai-qr')
                       + nv('acai-rocket') + nv('acai-uber') + nv('acai-other-pay');
  const difference     = totalAmount - receivedAmount;

  document.getElementById('calc-product').textContent  = fmt(productSales);
  document.getElementById('calc-total').textContent    = fmt(totalAmount);
  document.getElementById('calc-profit').textContent   = fmt(grossProfit);
  document.getElementById('calc-rate').textContent     = grossProfitRate !== null ? grossProfitRate + '%' : '—';
  document.getElementById('calc-received').textContent = fmt(receivedAmount);
  document.getElementById('calc-diff').textContent     = fmt(difference);

  // 利益警告
  document.getElementById('profit-warn-low').hidden   = !(grossProfitRate !== null && grossProfitRate >= 0 && grossProfitRate < 20);
  document.getElementById('profit-warn-minus').hidden = !(grossProfitRate !== null && grossProfitRate < 0);

  // 利益率の色
  const rateEl = document.getElementById('calc-rate');
  if (grossProfitRate === null)       rateEl.style.color = '';
  else if (grossProfitRate < 0)       rateEl.style.color = '#c0392b';
  else if (grossProfitRate < 20)      rateEl.style.color = '#d35400';
  else                                rateEl.style.color = '#27ae60';

  // 差額ステータス
  const statusEl = document.getElementById('calc-diff-status');
  statusEl.textContent = difference === 0 ? 'OK' : '要確認';
  statusEl.className   = difference === 0 ? 'diff-ok' : 'diff-ng';
}

// 計算トリガーを全入力フィールドに設定
['acai-qty','acai-unit-price','acai-topping','acai-delivery','acai-discount',
 'acai-platform','acai-material',
 'acai-cash','acai-card','acai-qr','acai-rocket','acai-uber','acai-other-pay',
].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', recalcAcai);
});

// フォーム送信
document.getElementById('acai-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const f   = e.target;
  const qty = Number(f.quantity.value) || 0;
  const up  = Number(f.unitPrice.value) || 0;

  const saved = saveAcaiSale({
    date:            f.date.value,
    staffName:       f.staffName.value.trim(),
    channel:         f.channel.value,
    orderNumber:     f.orderNumber.value.trim(),
    customerType:    f.customerType.value,
    customerName:    f.customerName.value.trim(),
    productName:     f.productName.value.trim(),
    size:            f.size.value,
    quantity:        qty,
    unitPrice:       up,
    productSales:    qty * up,
    toppingSales:    Number(f.toppingSales.value)    || 0,
    deliveryFee:     Number(f.deliveryFee.value)     || 0,
    discount:        Number(f.discount.value)        || 0,
    platformFee:     Number(f.platformFee.value)     || 0,
    materialCost:    Number(f.materialCost.value)    || 0,
    cashAmount:      Number(f.cashAmount.value)      || 0,
    cardAmount:      Number(f.cardAmount.value)      || 0,
    qrAmount:        Number(f.qrAmount.value)        || 0,
    rocketNowAmount: Number(f.rocketNowAmount.value) || 0,
    uberEatsAmount:  Number(f.uberEatsAmount.value)  || 0,
    otherAmount:     Number(f.otherAmount.value)     || 0,
    memo:            f.memo.value.trim(),
  });

  const cfg = CH_CONFIG[saved.channel] || {};
  document.getElementById('acai-saved-detail').textContent =
    `${cfg.emoji} ${saved.channel}  ／  ${saved.productName}（${saved.size}）× ${saved.quantity}  ／  ${fmt(saved.totalAmount)}`;

  renderTodayStats();
  showAcaiStep('saved');
  showToast('アサイー売上を保存しました');
});

// 保存後ボタン群
function resetAcaiForm() {
  const form = document.getElementById('acai-form');
  form.reset();
  document.getElementById('acai-date').value = today();
  // toggle ボタンを初期状態（最初の選択肢）に戻す
  form.querySelectorAll('.toggle-group').forEach(group => {
    const input  = form.querySelector(`[name="${group.dataset.target}"]`);
    const first  = group.querySelector('.toggle-btn');
    group.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    if (first) { first.classList.add('active'); if (input) input.value = first.dataset.val; }
  });
  recalcAcai();
}

document.getElementById('acai-continue-btn').addEventListener('click', () => {
  resetAcaiForm();
  showAcaiStep('channel');
});

document.getElementById('acai-today-btn').addEventListener('click', () => {
  showTodaySection('landing');
  renderTodayStats();
});

document.getElementById('acai-dashboard-btn').addEventListener('click', () => {
  document.querySelector('nav button[data-tab="summary"]').click();
});

// ── Expense Form ──────────────────────────────────────────────────────────────
const DEPT_CONFIG = {
  'シーシャの経費': { emoji: '💨', cls: 'dept-shisha' },
  'アサイーの経費': { emoji: '🍇', cls: 'dept-acai'   },
  '共通の経費':     { emoji: '🏠', cls: 'dept-common'  },
};

function showExpStep(step) {
  document.getElementById('exp-dept-step').hidden   = (step !== 'dept');
  document.getElementById('exp-form-wrap').hidden   = (step !== 'form');
  document.getElementById('exp-saved-state').hidden = (step !== 'saved');
}

function selectExpDept(dept) {
  const cfg = DEPT_CONFIG[dept] || { emoji: '🏠', cls: 'dept-common' };
  const badge = document.getElementById('exp-dept-badge');
  badge.className = 'exp-dept-badge ' + cfg.cls;
  document.getElementById('exp-badge-icon').textContent  = cfg.emoji;
  document.getElementById('exp-badge-label').textContent = dept;
  document.getElementById('exp-department-val').value    = dept;
  showExpStep('form');
}

// 部門ボタン
document.querySelectorAll('.dept-btn[data-dept]').forEach(btn => {
  btn.addEventListener('click', () => selectExpDept(btn.dataset.dept));
});

document.getElementById('btn-exp-dept-change').addEventListener('click', () => showExpStep('dept'));

// 今日の日付をセット
document.getElementById('exp-date').value = today();

// 領収書「なし」警告
document.getElementById('exp-form').querySelectorAll(
  '.toggle-group[data-target="hasReceipt"] .toggle-btn'
).forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('receipt-warn').hidden = (btn.dataset.val !== 'なし');
  });
});

// フォーム送信
document.getElementById('exp-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;

  const saved = saveExpense({
    date:          f.date.value,
    payee:         f.payee.value.trim(),
    department:    f.department.value,
    category:      f.category.value,
    amount:        Number(f.amount.value) || 0,
    paymentMethod: f.paymentMethod.value,
    hasReceipt:    f.hasReceipt.value,
    memo:          f.memo.value.trim(),
  });

  const cfg = DEPT_CONFIG[saved.department] || {};
  document.getElementById('exp-saved-detail').textContent =
    `${cfg.emoji} ${saved.department}  ／  ${saved.category}  ／  ${fmt(saved.amount)}`;

  renderTodayStats();
  showExpStep('saved');
  showToast('経費を保存しました');
});

// 保存後ボタン群
function resetExpForm() {
  const form = document.getElementById('exp-form');
  form.reset();
  document.getElementById('exp-date').value        = today();
  document.getElementById('receipt-warn').hidden   = true;
  form.querySelectorAll('.toggle-group').forEach(group => {
    const input = form.querySelector(`[name="${group.dataset.target}"]`);
    const first = group.querySelector('.toggle-btn');
    group.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    if (first) { first.classList.add('active'); if (input) input.value = first.dataset.val; }
  });
}

document.getElementById('exp-continue-btn').addEventListener('click', () => {
  resetExpForm();
  showExpStep('dept');
});

document.getElementById('exp-today-btn').addEventListener('click', () => {
  showTodaySection('landing');
  renderTodayStats();
});

document.getElementById('exp-dashboard-btn').addEventListener('click', () => {
  document.querySelector('nav button[data-tab="summary"]').click();
});

// ── Entry Form ────────────────────────────────────────────────────────────────
document.getElementById('entry-date').value = today();

document.getElementById('entry-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const record = {
    id: Date.now(),
    date: f.date.value,
    category: f.category.value,
    item: f.item.value.trim(),
    qty: Number(f.qty.value),
    price: Number(f.price.value),
    note: f.note.value.trim(),
  };
  record.total = record.qty * record.price;
  records.push(record);
  saveRecords(records);
  showToast('売上を記録しました');
  f.reset();
  f.date.value = today();
});

// カテゴリ変更でアイテム候補を更新
const presets = {
  shisha: ['シーシャ（1時間）', 'シーシャ（2時間）', 'シーシャ（3時間）', 'フレーバー追加', 'ヘッド交換'],
  acai:   ['アサイーボウル（S）', 'アサイーボウル（M）', 'アサイーボウル（L）', 'スムージー'],
  drink:  ['ソフトドリンク', 'アルコール', 'コーヒー', 'ハーブティー'],
};

document.getElementById('cat').addEventListener('change', (e) => {
  const list = document.getElementById('item-list');
  list.innerHTML = '';
  (presets[e.target.value] || []).forEach(p => {
    const opt = document.createElement('option');
    opt.value = p;
    list.appendChild(opt);
  });
});

// ── Dashboard ─────────────────────────────────────────────────────────────────
const MONTHLY_TARGET = 500000;
const _charts = {};

function aggregateDashboard(monthStr) {
  const shishaAll  = getShishaSales();
  const acaiAll    = getAcaiSales();
  const expenseAll = getExpenses();

  const shisha  = shishaAll.filter(r => r.date.startsWith(monthStr));
  const acai    = acaiAll.filter(r => r.date.startsWith(monthStr));
  const expense = expenseAll.filter(r => r.date.startsWith(monthStr));

  const shishaTotal  = shisha.reduce((s, r) => s + (r.totalAmount || 0), 0);
  const acaiTotal    = acai.reduce((s, r) => s + (r.totalAmount || 0), 0);
  const expenseTotal = expense.reduce((s, r) => s + (r.amount || 0), 0);
  const salesTotal   = shishaTotal + acaiTotal;
  const profit       = salesTotal - expenseTotal;
  const profitRate   = salesTotal > 0 ? Math.round((profit / salesTotal) * 1000) / 10 : null;

  const acaiByChannel = { '店頭': 0, 'Rocket Now': 0, 'Uber Eats': 0, 'その他': 0 };
  acai.forEach(r => { acaiByChannel[r.channel] = (acaiByChannel[r.channel] || 0) + (r.totalAmount || 0); });

  const visitors = shisha.reduce((s, r) => s + (r.totalCount || 0), 0);
  const avgSpend = visitors > 0 ? Math.round(shishaTotal / visitors) : 0;
  const unpaid   = shisha.reduce((s, r) => s + (r.unpaidAmount || 0), 0);

  const expByCategory = {};
  expense.forEach(r => { expByCategory[r.category] = (expByCategory[r.category] || 0) + (r.amount || 0); });

  const payByMethod = { '現金': 0, 'カード': 0, 'QR': 0, 'Rocket Now': 0, 'Uber Eats': 0 };
  shisha.forEach(r => {
    payByMethod['現金']   += r.cashAmount || 0;
    payByMethod['カード'] += r.cardAmount || 0;
    payByMethod['QR']     += r.qrAmount   || 0;
  });
  acai.forEach(r => {
    payByMethod['現金']       += r.cashAmount      || 0;
    payByMethod['カード']     += r.cardAmount      || 0;
    payByMethod['QR']         += r.qrAmount        || 0;
    payByMethod['Rocket Now'] += r.rocketNowAmount || 0;
    payByMethod['Uber Eats']  += r.uberEatsAmount  || 0;
  });

  // 過去30日（日別）
  const dailyData = {};
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dailyData[d.toISOString().slice(0, 10)] = { shisha: 0, acai: 0 };
  }
  shishaAll.forEach(r => { if (dailyData[r.date]) dailyData[r.date].shisha += r.totalAmount || 0; });
  acaiAll.forEach(r => { if (dailyData[r.date]) dailyData[r.date].acai   += r.totalAmount || 0; });

  // 過去12ヶ月（月別）
  const monthlyData = {};
  for (let i = 11; i >= 0; i--) {
    const d  = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ms = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthlyData[ms] = { shisha: 0, acai: 0 };
  }
  shishaAll.forEach(r => { const m = r.date.slice(0, 7); if (monthlyData[m]) monthlyData[m].shisha += r.totalAmount || 0; });
  acaiAll.forEach(r => { const m = r.date.slice(0, 7); if (monthlyData[m]) monthlyData[m].acai   += r.totalAmount || 0; });

  return {
    shishaTotal, acaiTotal, expenseTotal, salesTotal,
    profit, profitRate,
    acaiByChannel, visitors, avgSpend, unpaid,
    expByCategory, payByMethod,
    dailyData, monthlyData,
    targetRate: salesTotal > 0 ? Math.round((salesTotal / MONTHLY_TARGET) * 100) : 0,
  };
}

function generateMgmtComments(d) {
  const items = [];

  if (d.salesTotal === 0) {
    items.push({ type: 'info', text: 'この月のデータはまだありません。' });
    return items;
  }

  if (d.targetRate >= 100) {
    items.push({ type: 'ok', text: `🎉 月間目標達成！ 目標の ${d.targetRate}% を達成しました。` });
  } else if (d.targetRate >= 80) {
    items.push({ type: 'info', text: `📌 月間目標の ${d.targetRate}% 達成。あと ¥${(MONTHLY_TARGET - d.salesTotal).toLocaleString()} で達成です。` });
  } else {
    items.push({ type: 'warn', text: `⚠️ 月間目標の ${d.targetRate}% 達成。目標まで ¥${(MONTHLY_TARGET - d.salesTotal).toLocaleString()} 残っています。` });
  }

  if (d.profitRate !== null) {
    if (d.profitRate < 0) {
      items.push({ type: 'bad', text: `🚨 営業利益がマイナスです（${d.profitRate}%）。経費を今すぐ見直してください。` });
    } else if (d.profitRate < 15) {
      items.push({ type: 'warn', text: `⚠️ 利益率が低めです（${d.profitRate}%）。仕入れコストや経費を確認しましょう。` });
    } else if (d.profitRate >= 30) {
      items.push({ type: 'ok', text: `✅ 利益率は良好です（${d.profitRate}%）。この調子で継続しましょう。` });
    }
  }

  if (d.unpaid > 0) {
    items.push({ type: 'warn', text: `💴 未収金 ¥${d.unpaid.toLocaleString()} があります。回収状況を確認してください。` });
  }

  if (d.acaiByChannel['Uber Eats'] > 0 && d.acaiByChannel['Uber Eats'] > d.acaiByChannel['店頭']) {
    items.push({ type: 'info', text: `🛵 Uber Eats の売上が店頭を上回っています。手数料負担を定期的に確認しましょう。` });
  }

  if (d.visitors > 0) {
    if (d.avgSpend < 3000) {
      items.push({ type: 'warn', text: `📉 シーシャの客単価が ¥${d.avgSpend.toLocaleString()} と低めです。ドリンクのアップセルを検討しましょう。` });
    } else if (d.avgSpend >= 5000) {
      items.push({ type: 'ok', text: `👍 シーシャの客単価が ¥${d.avgSpend.toLocaleString()} と高水準です。` });
    }
  }

  return items;
}

function renderMgmtComments(items) {
  const el = document.getElementById('mgmt-comments');
  el.innerHTML = `<div class="mgmt-comments-title">💡 経営コメント</div>` +
    items.map(c => `<div class="mgmt-comment ${c.type}">${c.text}</div>`).join('');
}

function destroyChart(id) {
  if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; }
}

function renderDashCharts(d) {
  const dailyKeys   = Object.keys(d.dailyData);
  const monthlyKeys = Object.keys(d.monthlyData);

  // 日別売上（過去30日）
  destroyChart('daily');
  _charts['daily'] = new Chart(document.getElementById('chart-daily'), {
    type: 'bar',
    data: {
      labels: dailyKeys.map(k => k.slice(5)),
      datasets: [
        { label: 'シーシャ', data: dailyKeys.map(k => d.dailyData[k].shisha),
          backgroundColor: '#1a527688', borderColor: '#1a5276', borderWidth: 1, borderRadius: 3, stack: 'sales' },
        { label: 'アサイー', data: dailyKeys.map(k => d.dailyData[k].acai),
          backgroundColor: '#7d3c9888', borderColor: '#7d3c98', borderWidth: 1, borderRadius: 3, stack: 'sales' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top', labels: { font: { size: 11 } } } },
      scales: {
        x: { stacked: true, ticks: { font: { size: 9 } } },
        y: { stacked: true, ticks: { callback: v => '¥' + v.toLocaleString(), font: { size: 9 } } },
      },
    },
  });

  // 月別売上（過去12ヶ月）
  destroyChart('monthly');
  _charts['monthly'] = new Chart(document.getElementById('chart-monthly'), {
    type: 'bar',
    data: {
      labels: monthlyKeys.map(k => k.slice(5) + '月'),
      datasets: [
        { label: 'シーシャ', data: monthlyKeys.map(k => d.monthlyData[k].shisha),
          backgroundColor: '#1a527688', borderColor: '#1a5276', borderWidth: 1, borderRadius: 3, stack: 'sales' },
        { label: 'アサイー', data: monthlyKeys.map(k => d.monthlyData[k].acai),
          backgroundColor: '#7d3c9888', borderColor: '#7d3c98', borderWidth: 1, borderRadius: 3, stack: 'sales' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top', labels: { font: { size: 11 } } } },
      scales: {
        x: { stacked: true, ticks: { font: { size: 9 } } },
        y: { stacked: true, ticks: { callback: v => '¥' + v.toLocaleString(), font: { size: 9 } } },
      },
    },
  });

  // シーシャ vs アサイー（ドーナツ）
  destroyChart('category');
  _charts['category'] = new Chart(document.getElementById('chart-category'), {
    type: 'doughnut',
    data: {
      labels: ['💨 シーシャ', '🍇 アサイー'],
      datasets: [{ data: [d.shishaTotal, d.acaiTotal],
        backgroundColor: ['#1a527688', '#7d3c9888'],
        borderColor: ['#1a5276', '#7d3c98'], borderWidth: 2 }],
    },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } } },
  });

  // アサイー チャネル別（ドーナツ）
  destroyChart('acaiChannel');
  _charts['acaiChannel'] = new Chart(document.getElementById('chart-acai-channel'), {
    type: 'doughnut',
    data: {
      labels: ['🏪 店頭', '🚀 Rocket Now', '🛵 Uber Eats', '📦 その他'],
      datasets: [{ data: [d.acaiByChannel['店頭'], d.acaiByChannel['Rocket Now'], d.acaiByChannel['Uber Eats'], d.acaiByChannel['その他']],
        backgroundColor: ['#27ae6088', '#2980b988', '#8e44ad88', '#95a5a688'],
        borderColor: ['#27ae60', '#2980b9', '#8e44ad', '#95a5a6'], borderWidth: 2 }],
    },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } } },
  });

  // 経費内訳（ドーナツ）
  destroyChart('expensePie');
  const expLabels = Object.keys(d.expByCategory);
  const expValues = Object.values(d.expByCategory);
  const expPalette = ['#e74c3c','#e67e22','#f1c40f','#2ecc71','#3498db','#9b59b6','#1abc9c','#34495e'];
  _charts['expensePie'] = new Chart(document.getElementById('chart-expense-pie'), {
    type: 'doughnut',
    data: {
      labels: expLabels.length ? expLabels : ['データなし'],
      datasets: [{ data: expValues.length ? expValues : [1],
        backgroundColor: expLabels.length ? expPalette.slice(0, expLabels.length).map(c => c + '88') : ['#ccc8'],
        borderColor: expLabels.length ? expPalette.slice(0, expLabels.length) : ['#999'], borderWidth: 2 }],
    },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 12 } } } },
  });

  // 支払い方法別（バー）
  destroyChart('payment');
  const payLabels = Object.keys(d.payByMethod).filter(k => d.payByMethod[k] > 0);
  const payValues = payLabels.map(k => d.payByMethod[k]);
  _charts['payment'] = new Chart(document.getElementById('chart-payment'), {
    type: 'bar',
    data: {
      labels: payLabels.length ? payLabels : ['データなし'],
      datasets: [{ label: '受取額', data: payValues.length ? payValues : [0],
        backgroundColor: '#6c348388', borderColor: '#6c3483', borderWidth: 1, borderRadius: 6 }],
    },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { ticks: { callback: v => '¥' + v.toLocaleString(), font: { size: 9 } } },
        x: { ticks: { font: { size: 10 } } },
      },
    },
  });
}

function renderDashboard() {
  const month = document.getElementById('sum-month').value;
  const d = aggregateDashboard(month);

  document.getElementById('dk-total').textContent       = fmt(d.salesTotal);
  document.getElementById('dk-shisha').textContent      = fmt(d.shishaTotal);
  document.getElementById('dk-acai').textContent        = fmt(d.acaiTotal);
  document.getElementById('dk-expense').textContent     = fmt(d.expenseTotal);
  document.getElementById('dk-profit').textContent      = fmt(d.profit);
  document.getElementById('dk-profit-rate').textContent = d.profitRate !== null ? d.profitRate + '%' : '—';

  const profitCard = document.getElementById('dk-profit-card');
  if (d.profit < 0) profitCard.classList.add('is-loss');
  else profitCard.classList.remove('is-loss');

  document.getElementById('dk-target-rate').textContent  = d.salesTotal > 0 ? d.targetRate + '%' : '—';
  document.getElementById('dk-visitors').textContent     = d.visitors + ' 人';
  document.getElementById('dk-avg-spend').textContent    = fmt(d.avgSpend);
  document.getElementById('dk-acai-instore').textContent = fmt(d.acaiByChannel['店頭']);
  document.getElementById('dk-acai-rocket').textContent  = fmt(d.acaiByChannel['Rocket Now']);
  document.getElementById('dk-acai-uber').textContent    = fmt(d.acaiByChannel['Uber Eats']);
  document.getElementById('dk-unpaid').textContent       = fmt(d.unpaid);

  renderMgmtComments(generateMgmtComments(d));
  renderDashCharts(d);
}

document.getElementById('sum-month').addEventListener('change', renderDashboard);
document.getElementById('sum-month').value = today().slice(0, 7);

// ── History（日計・月計） ──────────────────────────────────────────────────────

let _histMode = 'daily';
const _histCharts = {};

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function kpiHtml(items) {
  return `<div class="dash-kpi-grid">${items.map(it =>
    `<div class="dash-kpi ${it.cls || 'dk-neutral'}">
      <div class="dk-label">${it.label}</div>
      <div class="dk-value">${it.value}</div>
      ${it.sub ? `<div class="dk-sub">${it.sub}</div>` : ''}
    </div>`
  ).join('')}</div>`;
}

// ── 日計 ──────────────────────────────────────────────────────────────────────

function computeDaily(dateStr) {
  const shisha  = getShishaSales().filter(r => r.date === dateStr);
  const acai    = getAcaiSales().filter(r => r.date === dateStr);
  const expense = getExpenses().filter(r => r.date === dateStr);

  const shishaTotal  = shisha.reduce((s, r) => s + (r.totalAmount || 0), 0);
  const acaiTotal    = acai.reduce((s, r) => s + (r.totalAmount || 0), 0);
  const expenseTotal = expense.reduce((s, r) => s + (r.amount || 0), 0);
  const salesTotal   = shishaTotal + acaiTotal;
  const profit       = salesTotal - expenseTotal;
  const unpaid       = shisha.reduce((s, r) => s + (r.unpaidAmount || 0), 0);

  const acaiByChannel = { '店頭': 0, 'Rocket Now': 0, 'Uber Eats': 0 };
  acai.forEach(r => { if (acaiByChannel[r.channel] !== undefined) acaiByChannel[r.channel] += r.totalAmount || 0; });

  const visitors = shisha.reduce((s, r) => s + (r.totalCount || 0), 0);

  return {
    shisha, acai, expense,
    shishaTotal, acaiTotal, expenseTotal, salesTotal, profit, unpaid,
    acaiByChannel, visitors, tables: shisha.length, acaiCount: acai.length,
  };
}

function renderDailyView(dateStr) {
  if (!dateStr) return;
  const d = computeDaily(dateStr);

  document.getElementById('daily-kpi-grid').innerHTML = kpiHtml([
    { label: '総売上',           value: fmt(d.salesTotal),                    cls: 'dk-green'  },
    { label: '💨 シーシャ売上',  value: fmt(d.shishaTotal),                   cls: 'dk-shisha' },
    { label: '🍇 アサイー売上',  value: fmt(d.acaiTotal),                     cls: 'dk-acai'   },
    { label: '🏪 店頭',          value: fmt(d.acaiByChannel['店頭']),          cls: 'dk-neutral' },
    { label: '🚀 Rocket Now',    value: fmt(d.acaiByChannel['Rocket Now']),   cls: 'dk-neutral' },
    { label: '🛵 Uber Eats',     value: fmt(d.acaiByChannel['Uber Eats']),    cls: 'dk-neutral' },
    { label: '経費合計',          value: fmt(d.expenseTotal),                  cls: 'dk-orange' },
    { label: '営業利益',          value: fmt(d.profit),                        cls: d.profit < 0 ? 'dk-profit is-loss' : 'dk-profit' },
    { label: '未払い',            value: fmt(d.unpaid),                        cls: d.unpaid > 0 ? 'dk-warn' : 'dk-neutral' },
    { label: 'シーシャ来店人数',  value: d.visitors + ' 人',                   cls: 'dk-neutral' },
    { label: 'シーシャ来店組数',  value: d.tables + ' 組',                     cls: 'dk-neutral' },
    { label: 'アサイー販売件数',  value: d.acaiCount + ' 件',                  cls: 'dk-neutral' },
  ]);

  document.getElementById('daily-shisha-list').innerHTML  = buildShishaList(d.shisha, dateStr);
  document.getElementById('daily-acai-list').innerHTML    = buildAcaiList(d.acai, dateStr);
  document.getElementById('daily-expense-list').innerHTML = buildExpenseList(d.expense, dateStr);
}

const CH_EMOJI_MAP = { '店頭': '🏪', 'Rocket Now': '🚀', 'Uber Eats': '🛵', 'その他': '📦' };
const DEPT_EMOJI_MAP = { 'シーシャの経費': '💨', 'アサイーの経費': '🍇', '共通の経費': '🏠' };

function buildShishaList(records) {
  if (!records.length) return '<p class="empty">この日のシーシャ記録はありません</p>';
  return '<div class="record-list">' + records.map(r => `
    <div class="record-row">
      <div class="record-main">
        <div class="record-title">テーブル ${escapeHtml(r.tableNumber || '—')} ／ ${escapeHtml(r.visitTime || '')}〜${escapeHtml(r.leaveTime || '')} ／ ${r.totalCount || 0}人</div>
        <div class="record-meta">シーシャ ${fmt(r.shishaSales || 0)} ／ ドリンク ${fmt(r.drinkSales || 0)} ／ 値引き ${fmt(r.discount || 0)}${r.staffName ? ' ／ ' + escapeHtml(r.staffName) : ''}</div>
      </div>
      <div class="record-amount">${fmt(r.totalAmount || 0)}</div>
      <div class="record-actions">
        <button class="btn-edit" data-type="shisha" data-id="${r.id}">編集</button>
        <button class="btn-del"  data-type="shisha" data-id="${r.id}">削除</button>
      </div>
    </div>`).join('') + '</div>';
}

function buildAcaiList(records) {
  if (!records.length) return '<p class="empty">この日のアサイー記録はありません</p>';
  return '<div class="record-list">' + records.map(r => `
    <div class="record-row">
      <div class="record-main">
        <div class="record-title">${CH_EMOJI_MAP[r.channel] || '📦'} ${escapeHtml(r.channel || '—')} ／ ${escapeHtml(r.productName || '—')}（${escapeHtml(r.size || '—')}）× ${r.quantity || 1}</div>
        <div class="record-meta">粗利 ${fmt(r.grossProfit || 0)} ／ 粗利率 ${r.grossProfitRate || 0}%${r.staffName ? ' ／ ' + escapeHtml(r.staffName) : ''}</div>
      </div>
      <div class="record-amount">${fmt(r.totalAmount || 0)}</div>
      <div class="record-actions">
        <button class="btn-edit" data-type="acai" data-id="${r.id}">編集</button>
        <button class="btn-del"  data-type="acai" data-id="${r.id}">削除</button>
      </div>
    </div>`).join('') + '</div>';
}

function buildExpenseList(records) {
  if (!records.length) return '<p class="empty">この日の経費記録はありません</p>';
  return '<div class="record-list">' + records.map(r => `
    <div class="record-row">
      <div class="record-main">
        <div class="record-title">${DEPT_EMOJI_MAP[r.department] || '💸'} ${escapeHtml(r.category || '—')} ／ ${escapeHtml(r.payee || '—')}</div>
        <div class="record-meta">${escapeHtml(r.department || '—')} ／ ${escapeHtml(r.paymentMethod || '—')} ／ 領収書: ${escapeHtml(r.hasReceipt || '—')}</div>
      </div>
      <div class="record-amount">${fmt(r.amount || 0)}</div>
      <div class="record-actions">
        <button class="btn-edit" data-type="expense" data-id="${r.id}">編集</button>
        <button class="btn-del"  data-type="expense" data-id="${r.id}">削除</button>
      </div>
    </div>`).join('') + '</div>';
}

// ── 月計 ──────────────────────────────────────────────────────────────────────

function computeMonthly(monthStr) {
  const shishaAll  = getShishaSales();
  const acaiAll    = getAcaiSales();
  const expenseAll = getExpenses();

  const shisha  = shishaAll.filter(r => r.date.startsWith(monthStr));
  const acai    = acaiAll.filter(r => r.date.startsWith(monthStr));
  const expense = expenseAll.filter(r => r.date.startsWith(monthStr));

  const shishaTotal  = shisha.reduce((s, r) => s + (r.totalAmount || 0), 0);
  const acaiTotal    = acai.reduce((s, r) => s + (r.totalAmount || 0), 0);
  const expenseTotal = expense.reduce((s, r) => s + (r.amount || 0), 0);
  const salesTotal   = shishaTotal + acaiTotal;
  const profit       = salesTotal - expenseTotal;
  const profitRate   = salesTotal > 0 ? Math.round((profit / salesTotal) * 1000) / 10 : null;
  const unpaid       = shisha.reduce((s, r) => s + (r.unpaidAmount || 0), 0);

  const acaiByChannel = { '店頭': 0, 'Rocket Now': 0, 'Uber Eats': 0, 'その他': 0 };
  acai.forEach(r => { acaiByChannel[r.channel] = (acaiByChannel[r.channel] || 0) + (r.totalAmount || 0); });

  // 前月比
  const [year, mon] = monthStr.split('-').map(Number);
  const prevDate    = new Date(year, mon - 2, 1);
  const prevMonth   = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
  const prevSales   = [...shishaAll, ...acaiAll]
    .filter(r => r.date.startsWith(prevMonth))
    .reduce((s, r) => s + (r.totalAmount || 0), 0);
  const momChange   = prevSales > 0 ? Math.round(((salesTotal - prevSales) / prevSales) * 100) : null;

  // 日別データ（チャート用）
  const daysInMonth = new Date(year, mon, 0).getDate();
  const dailySales  = {};
  const dailyExp    = {};
  for (let i = 1; i <= daysInMonth; i++) {
    const ds = `${monthStr}-${String(i).padStart(2, '0')}`;
    dailySales[ds] = { shisha: 0, acai: 0 };
    dailyExp[ds]   = 0;
  }
  shisha.forEach(r => { if (dailySales[r.date]) dailySales[r.date].shisha += r.totalAmount || 0; });
  acai.forEach(r => { if (dailySales[r.date]) dailySales[r.date].acai   += r.totalAmount || 0; });
  expense.forEach(r => { if (r.date in dailyExp) dailyExp[r.date] += r.amount || 0; });

  const expByCategory = {};
  expense.forEach(r => { expByCategory[r.category] = (expByCategory[r.category] || 0) + (r.amount || 0); });

  return {
    shishaTotal, acaiTotal, expenseTotal, salesTotal, profit, profitRate, unpaid,
    acaiByChannel, momChange, prevSales,
    targetRate: salesTotal > 0 ? Math.round((salesTotal / MONTHLY_TARGET) * 100) : 0,
    dailySales, dailyExp, expByCategory,
  };
}

function renderMonthlyView(monthStr) {
  if (!monthStr) return;
  const d = computeMonthly(monthStr);

  const momText = d.momChange !== null
    ? (d.momChange >= 0 ? '+' : '') + d.momChange + '%'
    : '—';
  const momCls = d.momChange === null ? 'dk-neutral'
    : d.momChange >= 0 ? 'dk-green' : 'dk-profit is-loss';

  document.getElementById('monthly-kpi-grid').innerHTML = kpiHtml([
    { label: '月間総売上',     value: fmt(d.salesTotal),                         cls: 'dk-green'  },
    { label: '💨 シーシャ',   value: fmt(d.shishaTotal),                        cls: 'dk-shisha' },
    { label: '🍇 アサイー',   value: fmt(d.acaiTotal),                          cls: 'dk-acai'   },
    { label: '🏪 店頭',        value: fmt(d.acaiByChannel['店頭']),              cls: 'dk-neutral' },
    { label: '🚀 Rocket Now',  value: fmt(d.acaiByChannel['Rocket Now']),       cls: 'dk-neutral' },
    { label: '🛵 Uber Eats',   value: fmt(d.acaiByChannel['Uber Eats']),        cls: 'dk-neutral' },
    { label: '経費合計',        value: fmt(d.expenseTotal),                       cls: 'dk-orange' },
    { label: '営業利益',        value: fmt(d.profit),                             cls: d.profit < 0 ? 'dk-profit is-loss' : 'dk-profit' },
    { label: '営業利益率',      value: d.profitRate !== null ? d.profitRate + '%' : '—', cls: 'dk-blue' },
    { label: '未払い残高',      value: fmt(d.unpaid),                             cls: d.unpaid > 0 ? 'dk-warn' : 'dk-neutral' },
    { label: '前月比',          value: momText,                                   cls: momCls,     sub: d.prevSales > 0 ? '前月 ' + fmt(d.prevSales) : '' },
    { label: '目標達成率',      value: d.salesTotal > 0 ? d.targetRate + '%' : '—', cls: 'dk-neutral', sub: '目標 ¥500,000' },
  ]);

  renderMonthlyCharts(d);
}

function destroyHistChart(id) {
  if (_histCharts[id]) { _histCharts[id].destroy(); delete _histCharts[id]; }
}

function renderMonthlyCharts(d) {
  const dayKeys = Object.keys(d.dailySales).sort();
  const expPalette = ['#e74c3c','#e67e22','#f1c40f','#2ecc71','#3498db','#9b59b6','#1abc9c','#34495e'];

  // 日別売上推移（積み上げバー）
  destroyHistChart('dailyBar');
  _histCharts['dailyBar'] = new Chart(document.getElementById('hist-chart-daily-bar'), {
    type: 'bar',
    data: {
      labels: dayKeys.map(k => k.slice(8) + '日'),
      datasets: [
        { label: 'シーシャ', data: dayKeys.map(k => d.dailySales[k].shisha),
          backgroundColor: '#1a527688', borderColor: '#1a5276', borderWidth: 1, borderRadius: 3, stack: 'sales' },
        { label: 'アサイー', data: dayKeys.map(k => d.dailySales[k].acai),
          backgroundColor: '#7d3c9888', borderColor: '#7d3c98', borderWidth: 1, borderRadius: 3, stack: 'sales' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top', labels: { font: { size: 11 } } } },
      scales: {
        x: { stacked: true, ticks: { font: { size: 9 } } },
        y: { stacked: true, ticks: { callback: v => '¥' + v.toLocaleString(), font: { size: 9 } } },
      },
    },
  });

  // アサイー チャネル別（ドーナツ）
  destroyHistChart('channel');
  _histCharts['channel'] = new Chart(document.getElementById('hist-chart-channel'), {
    type: 'doughnut',
    data: {
      labels: ['🏪 店頭', '🚀 Rocket Now', '🛵 Uber Eats', '📦 その他'],
      datasets: [{ data: [d.acaiByChannel['店頭'], d.acaiByChannel['Rocket Now'], d.acaiByChannel['Uber Eats'], d.acaiByChannel['その他']],
        backgroundColor: ['#27ae6088', '#2980b988', '#8e44ad88', '#95a5a688'],
        borderColor: ['#27ae60', '#2980b9', '#8e44ad', '#95a5a6'], borderWidth: 2 }],
    },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } } },
  });

  // 経費内訳（ドーナツ）
  destroyHistChart('expense');
  const expLabels = Object.keys(d.expByCategory);
  const expValues = Object.values(d.expByCategory);
  _histCharts['expense'] = new Chart(document.getElementById('hist-chart-expense'), {
    type: 'doughnut',
    data: {
      labels: expLabels.length ? expLabels : ['データなし'],
      datasets: [{ data: expValues.length ? expValues : [1],
        backgroundColor: expLabels.length ? expPalette.slice(0, expLabels.length).map(c => c + '88') : ['#ccc8'],
        borderColor: expLabels.length ? expPalette.slice(0, expLabels.length) : ['#999'], borderWidth: 2 }],
    },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 12 } } } },
  });

  // 営業利益推移（折れ線）
  destroyHistChart('profit');
  const profitData = dayKeys.map(k => (d.dailySales[k].shisha + d.dailySales[k].acai) - d.dailyExp[k]);
  _histCharts['profit'] = new Chart(document.getElementById('hist-chart-profit'), {
    type: 'line',
    data: {
      labels: dayKeys.map(k => k.slice(8) + '日'),
      datasets: [{
        label: '営業利益',
        data: profitData,
        borderColor: '#27ae60',
        backgroundColor: '#27ae6020',
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        pointRadius: 3,
        pointBackgroundColor: profitData.map(v => v < 0 ? '#c0392b' : '#27ae60'),
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { font: { size: 9 } } },
        y: { ticks: { callback: v => '¥' + v.toLocaleString(), font: { size: 9 } } },
      },
    },
  });
}

// ── 編集モーダル ──────────────────────────────────────────────────────────────

let _editType = null;
let _editId   = null;

function openEditModal(type, id) {
  _editType = type;
  _editId   = id;
  const titles = { shisha: '💨 シーシャ売上を編集', acai: '🍇 アサイー売上を編集', expense: '💸 経費を編集' };
  document.getElementById('edit-modal-title').textContent  = titles[type] || '編集';
  document.getElementById('edit-form-body').innerHTML      = buildEditFormHtml(type, id);
  document.getElementById('edit-modal').hidden             = false;
  document.body.style.overflow                             = 'hidden';
}

function closeEditModal() {
  document.getElementById('edit-modal').hidden = true;
  document.body.style.overflow = '';
  _editType = null;
  _editId   = null;
}

function sel(opts, cur) {
  return opts.map(v => `<option${cur === v ? ' selected' : ''}>${escapeHtml(v)}</option>`).join('');
}

function buildEditFormHtml(type, id) {
  if (type === 'shisha') {
    const r = getShishaSales().find(r => r.id === id);
    if (!r) return '<p class="empty">データが見つかりません</p>';
    return `<div class="form-grid">
      <div><label>日付</label><input name="date" type="date" value="${r.date || ''}"></div>
      <div><label>担当者</label><input name="staffName" type="text" value="${escapeHtml(r.staffName)}"></div>
      <div><label>テーブル番号</label><input name="tableNumber" type="text" value="${escapeHtml(r.tableNumber)}"></div>
      <div><label>来店時間</label><input name="visitTime" type="time" value="${r.visitTime || ''}"></div>
      <div><label>退店時間</label><input name="leaveTime" type="time" value="${r.leaveTime || ''}"></div>
      <div><label>顧客区分</label><select name="customerType">${sel(['新規','リピーター','不明'], r.customerType)}</select></div>
      <div><label>男性人数</label><input name="maleCount" type="number" value="${r.maleCount || 0}" min="0"></div>
      <div><label>女性人数</label><input name="femaleCount" type="number" value="${r.femaleCount || 0}" min="0"></div>
      <div><label>シーシャ台数</label><input name="shishaCount" type="number" value="${r.shishaCount || 0}" min="0"></div>
      <div><label>シーシャ売上（円）</label><input name="shishaSales" type="number" value="${r.shishaSales || 0}" min="0"></div>
      <div><label>ドリンク売上（円）</label><input name="drinkSales" type="number" value="${r.drinkSales || 0}" min="0"></div>
      <div><label>フード売上（円）</label><input name="foodSales" type="number" value="${r.foodSales || 0}" min="0"></div>
      <div><label>チャージ売上（円）</label><input name="chargeSales" type="number" value="${r.chargeSales || 0}" min="0"></div>
      <div><label>その他売上（円）</label><input name="otherSales" type="number" value="${r.otherSales || 0}" min="0"></div>
      <div><label>値引き（円）</label><input name="discount" type="number" value="${r.discount || 0}" min="0"></div>
      <div><label>現金（円）</label><input name="cashAmount" type="number" value="${r.cashAmount || 0}" min="0"></div>
      <div><label>カード（円）</label><input name="cardAmount" type="number" value="${r.cardAmount || 0}" min="0"></div>
      <div><label>QR（円）</label><input name="qrAmount" type="number" value="${r.qrAmount || 0}" min="0"></div>
      <div><label>未払い（円）</label><input name="unpaidAmount" type="number" value="${r.unpaidAmount || 0}" min="0"></div>
      <div><label>未払い回収（円）</label><input name="unpaidCollectedAmount" type="number" value="${r.unpaidCollectedAmount || 0}" min="0"></div>
    </div>
    <div style="margin-top:12px"><label>メモ</label><textarea name="memo" rows="2">${escapeHtml(r.memo)}</textarea></div>`;
  }

  if (type === 'acai') {
    const r = getAcaiSales().find(r => r.id === id);
    if (!r) return '<p class="empty">データが見つかりません</p>';
    return `<div class="form-grid">
      <div><label>日付</label><input name="date" type="date" value="${r.date || ''}"></div>
      <div><label>担当者</label><input name="staffName" type="text" value="${escapeHtml(r.staffName)}"></div>
      <div><label>チャネル</label><select name="channel">${sel(['店頭','Rocket Now','Uber Eats','その他'], r.channel)}</select></div>
      <div><label>注文番号</label><input name="orderNumber" type="text" value="${escapeHtml(r.orderNumber)}"></div>
      <div><label>顧客区分</label><select name="customerType">${sel(['不明','新規','リピーター'], r.customerType)}</select></div>
      <div><label>商品名</label><input name="productName" type="text" value="${escapeHtml(r.productName)}"></div>
      <div><label>サイズ</label><select name="size">${sel(['M','S','L'], r.size)}</select></div>
      <div><label>数量</label><input name="quantity" type="number" value="${r.quantity || 1}" min="1"></div>
      <div><label>単価（円）</label><input name="unitPrice" type="number" value="${r.unitPrice || 0}" min="0"></div>
      <div><label>商品売上（円）</label><input name="productSales" type="number" value="${r.productSales || 0}" min="0"></div>
      <div><label>トッピング（円）</label><input name="toppingSales" type="number" value="${r.toppingSales || 0}" min="0"></div>
      <div><label>配送料（円）</label><input name="deliveryFee" type="number" value="${r.deliveryFee || 0}" min="0"></div>
      <div><label>値引き（円）</label><input name="discount" type="number" value="${r.discount || 0}" min="0"></div>
      <div><label>販売手数料（円）</label><input name="platformFee" type="number" value="${r.platformFee || 0}" min="0"></div>
      <div><label>材料費（円）</label><input name="materialCost" type="number" value="${r.materialCost || 0}" min="0"></div>
      <div><label>現金（円）</label><input name="cashAmount" type="number" value="${r.cashAmount || 0}" min="0"></div>
      <div><label>カード（円）</label><input name="cardAmount" type="number" value="${r.cardAmount || 0}" min="0"></div>
      <div><label>QR（円）</label><input name="qrAmount" type="number" value="${r.qrAmount || 0}" min="0"></div>
      <div><label>Rocket Now入金（円）</label><input name="rocketNowAmount" type="number" value="${r.rocketNowAmount || 0}" min="0"></div>
      <div><label>Uber Eats入金（円）</label><input name="uberEatsAmount" type="number" value="${r.uberEatsAmount || 0}" min="0"></div>
      <div><label>その他入金（円）</label><input name="otherAmount" type="number" value="${r.otherAmount || 0}" min="0"></div>
    </div>
    <div style="margin-top:12px"><label>メモ</label><textarea name="memo" rows="2">${escapeHtml(r.memo)}</textarea></div>`;
  }

  if (type === 'expense') {
    const r = getExpenses().find(r => r.id === id);
    if (!r) return '<p class="empty">データが見つかりません</p>';
    return `<div class="form-grid">
      <div><label>日付</label><input name="date" type="date" value="${r.date || ''}"></div>
      <div><label>支払先</label><input name="payee" type="text" value="${escapeHtml(r.payee)}"></div>
      <div><label>部門</label><select name="department">${sel(['シーシャの経費','アサイーの経費','共通の経費'], r.department)}</select></div>
      <div><label>カテゴリ</label><select name="category">${sel(['仕入れ','材料費','人件費','家賃','水道光熱費','広告費','消耗品','交通費','通信費','システム利用料','その他'], r.category)}</select></div>
      <div><label>金額（円）</label><input name="amount" type="number" value="${r.amount || 0}" min="0"></div>
      <div><label>支払方法</label><select name="paymentMethod">${sel(['現金','カード','振込','口座引落','その他'], r.paymentMethod)}</select></div>
      <div><label>領収書</label><select name="hasReceipt">${sel(['あり','なし','後で確認'], r.hasReceipt)}</select></div>
    </div>
    <div style="margin-top:12px"><label>メモ</label><textarea name="memo" rows="2">${escapeHtml(r.memo)}</textarea></div>`;
  }

  return '<p class="empty">不明なデータ種類です</p>';
}

document.getElementById('edit-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  const nums = ['maleCount','femaleCount','shishaCount','shishaSales','drinkSales','foodSales',
    'chargeSales','otherSales','discount','cashAmount','cardAmount','qrAmount','unpaidAmount',
    'unpaidCollectedAmount','quantity','unitPrice','productSales','toppingSales','deliveryFee',
    'platformFee','materialCost','rocketNowAmount','uberEatsAmount','otherAmount','amount'];
  nums.forEach(k => { if (k in data) data[k] = Number(data[k]) || 0; });

  try {
    if (_editType === 'shisha')  updateShishaSale(_editId, data);
    if (_editType === 'acai')    updateAcaiSale(_editId, data);
    if (_editType === 'expense') updateExpense(_editId, data);
    closeEditModal();
    renderHistoryView();
    renderTodayStats();
    showToast('更新しました');
  } catch (err) {
    showToast('エラー: ' + err.message);
  }
});

document.getElementById('edit-modal-close').addEventListener('click', closeEditModal);
document.getElementById('edit-modal-cancel').addEventListener('click', closeEditModal);
document.getElementById('edit-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeEditModal(); });

// 削除・編集ボタン（イベント委譲）
document.getElementById('history').addEventListener('click', e => {
  const del  = e.target.closest('.btn-del');
  const edit = e.target.closest('.btn-edit');

  if (del) {
    if (!confirm('このデータを削除しますか？')) return;
    const { type, id } = del.dataset;
    if (type === 'shisha')  deleteShishaSale(id);
    if (type === 'acai')    deleteAcaiSale(id);
    if (type === 'expense') deleteExpense(id);
    renderDailyView(document.getElementById('hist-date').value);
    renderTodayStats();
    showToast('削除しました');
  }

  if (edit) openEditModal(edit.dataset.type, edit.dataset.id);
});

// ── モード切替・ナビ ──────────────────────────────────────────────────────────

function showHistMode(mode) {
  _histMode = mode;
  document.getElementById('hist-daily-view').hidden   = (mode !== 'daily');
  document.getElementById('hist-monthly-view').hidden = (mode !== 'monthly');
  document.querySelectorAll('.hist-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.hmode === mode));
  renderHistoryView();
}

function renderHistoryView() {
  if (_histMode === 'daily')   renderDailyView(document.getElementById('hist-date').value);
  if (_histMode === 'monthly') renderMonthlyView(document.getElementById('hist-month').value);
}

document.querySelectorAll('.hist-mode-btn').forEach(b => b.addEventListener('click', () => showHistMode(b.dataset.hmode)));

document.getElementById('hist-date').addEventListener('change', e => renderDailyView(e.target.value));
document.getElementById('hist-day-prev').addEventListener('click', () => {
  const d = new Date(document.getElementById('hist-date').value + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  const v = d.toISOString().slice(0, 10);
  document.getElementById('hist-date').value = v;
  renderDailyView(v);
});
document.getElementById('hist-day-next').addEventListener('click', () => {
  const d = new Date(document.getElementById('hist-date').value + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  const v = d.toISOString().slice(0, 10);
  document.getElementById('hist-date').value = v;
  renderDailyView(v);
});

document.getElementById('hist-month').addEventListener('change', e => renderMonthlyView(e.target.value));
document.getElementById('hist-month-prev').addEventListener('click', () => {
  const [y, m] = document.getElementById('hist-month').value.split('-').map(Number);
  const prev = new Date(y, m - 2, 1);
  const v = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
  document.getElementById('hist-month').value = v;
  renderMonthlyView(v);
});
document.getElementById('hist-month-next').addEventListener('click', () => {
  const [y, m] = document.getElementById('hist-month').value.split('-').map(Number);
  const next = new Date(y, m, 1);
  const v = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
  document.getElementById('hist-month').value = v;
  renderMonthlyView(v);
});

// Init
document.getElementById('hist-date').value  = today();
document.getElementById('hist-month').value = today().slice(0, 7);

// ── Init ──────────────────────────────────────────────────────────────────────
renderDashboard();
renderTodayStats();
