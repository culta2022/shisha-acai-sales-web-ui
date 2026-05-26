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
    if (btn.dataset.tab === 'summary') renderSummary();
    if (btn.dataset.tab === 'history') renderHistory();
  });
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
