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
    if (btn.dataset.tab === 'summary') renderSummary();
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

// ── Summary ───────────────────────────────────────────────────────────────────
let chartBar, chartPie;

function renderSummary() {
  const month = document.getElementById('sum-month').value;
  const filtered = month
    ? records.filter(r => r.date.startsWith(month))
    : records;

  const total = filtered.reduce((s, r) => s + r.total, 0);
  const byCategory = { shisha: 0, acai: 0, drink: 0 };
  filtered.forEach(r => { byCategory[r.category] = (byCategory[r.category] || 0) + r.total; });

  document.getElementById('kpi-total').textContent  = fmt(total);
  document.getElementById('kpi-shisha').textContent = fmt(byCategory.shisha || 0);
  document.getElementById('kpi-acai').textContent   = fmt(byCategory.acai || 0);
  document.getElementById('kpi-drink').textContent  = fmt(byCategory.drink || 0);

  // 日別集計
  const byDay = {};
  filtered.forEach(r => { byDay[r.date] = (byDay[r.date] || 0) + r.total; });
  const days = Object.keys(byDay).sort();

  // Bar chart
  if (chartBar) chartBar.destroy();
  chartBar = new Chart(document.getElementById('chart-bar'), {
    type: 'bar',
    data: {
      labels: days.map(d => d.slice(5)),
      datasets: [{
        label: '日別売上',
        data: days.map(d => byDay[d]),
        backgroundColor: '#a569bd88',
        borderColor: '#6c3483',
        borderWidth: 2,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { ticks: { callback: v => '¥' + v.toLocaleString() } }
      }
    }
  });

  // Pie chart
  if (chartPie) chartPie.destroy();
  chartPie = new Chart(document.getElementById('chart-pie'), {
    type: 'doughnut',
    data: {
      labels: ['シーシャ', 'アサイー', 'ドリンク'],
      datasets: [{
        data: [byCategory.shisha || 0, byCategory.acai || 0, byCategory.drink || 0],
        backgroundColor: ['#1a527688', '#7d3c9888', '#117a6588'],
        borderColor: ['#1a5276', '#7d3c98', '#117a65'],
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } }
    }
  });
}

document.getElementById('sum-month').addEventListener('change', renderSummary);
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
  renderSummary();
  showToast('全データを削除しました');
});

// ── Init ──────────────────────────────────────────────────────────────────────
renderSummary();
renderTodayStats();
