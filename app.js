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
    if (btn.dataset.tab === 'history') renderHistory();
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

// ── History ───────────────────────────────────────────────────────────────────
function renderHistory() {
  const filterDate = document.getElementById('hist-date').value;
  const filterCat  = document.getElementById('hist-cat').value;

  let data = [...records].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  if (filterDate) data = data.filter(r => r.date === filterDate);
  if (filterCat)  data = data.filter(r => r.category === filterCat);

  const tbody = document.getElementById('history-tbody');
  tbody.innerHTML = '';

  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty">データがありません</td></tr>';
    return;
  }

  data.forEach(r => {
    const labels = { shisha: 'シーシャ', acai: 'アサイー', drink: 'ドリンク' };
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.date}</td>
      <td><span class="tag tag-${r.category}">${labels[r.category]}</span></td>
      <td>${r.item}</td>
      <td style="text-align:right">${r.qty}</td>
      <td style="text-align:right">${fmt(r.price)}</td>
      <td style="text-align:right;font-weight:700">${fmt(r.total)}</td>
      <td>${r.note}</td>
    `;
    tbody.appendChild(tr);
  });
}

document.getElementById('hist-date').addEventListener('change', renderHistory);
document.getElementById('hist-cat').addEventListener('change', renderHistory);

// ── CSV Export ────────────────────────────────────────────────────────────────
document.getElementById('btn-csv').addEventListener('click', () => {
  if (!records.length) { showToast('データがありません'); return; }
  const header = ['日付', 'カテゴリ', '品目', '数量', '単価', '合計', 'メモ'];
  const labels = { shisha: 'シーシャ', acai: 'アサイー', drink: 'ドリンク' };
  const rows = records.map(r => [
    r.date, labels[r.category], r.item, r.qty, r.price, r.total, r.note
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  const csv = '﻿' + [header.join(','), ...rows].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `sales_${today()}.csv`;
  a.click();
  showToast('CSVをダウンロードしました');
});

// ── Delete All (with confirm) ──────────────────────────────────────────────────
document.getElementById('btn-clear').addEventListener('click', () => {
  if (!records.length) { showToast('データがありません'); return; }
  if (!confirm('全データを削除しますか？この操作は元に戻せません。')) return;
  records = [];
  saveRecords(records);
  renderHistory();
  renderDashboard();
  showToast('全データを削除しました');
});

// ── Init ──────────────────────────────────────────────────────────────────────
renderDashboard();
renderTodayStats();
