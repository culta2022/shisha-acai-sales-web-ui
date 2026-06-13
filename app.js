'use strict';

// ── Storage (inlined from src/services/storage.js) ────────────────────────────

function createDefaultBackend() {
  if (typeof localStorage !== 'undefined') {
    return {
      get(key)       { try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; } },
      set(key, rows) { localStorage.setItem(key, JSON.stringify(rows)); },
    };
  }
  const mem = {};
  return {
    get(key)       { return mem[key] ? JSON.parse(mem[key]) : []; },
    set(key, rows) { mem[key] = JSON.stringify(rows); },
  };
}

let _backend = createDefaultBackend();

const KEYS = {
  SHISHA:  'sas_v2_shisha_sales',
  ACAI:    'sas_v2_acai_sales',
  EXPENSE: 'sas_v2_expenses',
};

let _idSeq = 0;
function generateId() {
  return Date.now().toString(36) + (_idSeq++ % 1000).toString(36).padStart(2,'0') + Math.random().toString(36).slice(2, 5);
}

function nowIso() { return new Date().toISOString(); }

const n = (v) => Number(v) || 0;

function computeShishaSale(data) {
  const totalCount     = n(data.maleCount) + n(data.femaleCount);
  const totalAmount    = n(data.shishaSales) + n(data.drinkSales) + n(data.foodSales)
                       + n(data.chargeSales) + n(data.otherSales) - n(data.discount);
  const receivedAmount = n(data.cashAmount) + n(data.cardAmount)
                       + n(data.qrAmount)   + n(data.unpaidCollectedAmount);
  const billableToday  = totalAmount - n(data.unpaidAmount);
  const difference     = receivedAmount - billableToday;
  const shishaCount    = n(data.shishaCount);
  return {
    ...data, totalCount, totalAmount, receivedAmount, difference,
    averageSpendPerCustomer: totalCount  > 0 ? Math.round(totalAmount / totalCount)         : 0,
    averageSpendPerShisha:   shishaCount > 0 ? Math.round(n(data.shishaSales) / shishaCount) : 0,
  };
}

function computeAcaiSale(data) {
  const totalAmount    = n(data.productSales) + n(data.toppingSales)
                       + n(data.deliveryFee)  - n(data.discount) - n(data.platformFee);
  const grossProfit    = totalAmount - n(data.materialCost);
  const grossProfitRate = totalAmount > 0 ? Math.round((grossProfit / totalAmount) * 1000) / 10 : 0;
  const receivedAmount = n(data.cashAmount) + n(data.cardAmount) + n(data.qrAmount)
                       + n(data.rocketNowAmount) + n(data.uberEatsAmount) + n(data.otherAmount);
  const difference     = totalAmount - receivedAmount;
  return { ...data, totalAmount, grossProfit, grossProfitRate, receivedAmount, difference };
}

function computeExpense(data) { return { ...data, amount: n(data.amount) }; }

function makeCrud(key, computeFn) {
  const compute = computeFn || ((d) => d);
  return {
    getAll() { return _backend.get(key); },
    save(data) {
      const rows = _backend.get(key);
      const ts   = nowIso();
      const record = compute({ ...data, id: generateId(), createdAt: ts, updatedAt: ts });
      rows.push(record);
      _backend.set(key, rows);
      return record;
    },
    update(id, data) {
      const rows = _backend.get(key);
      const idx  = rows.findIndex((r) => r.id === id);
      if (idx === -1) throw new Error(`Record not found: ${id}`);
      const updated = compute({ ...rows[idx], ...data, id, createdAt: rows[idx].createdAt, updatedAt: nowIso() });
      rows[idx] = updated;
      _backend.set(key, rows);
      return updated;
    },
    delete(id) {
      const rows     = _backend.get(key);
      const filtered = rows.filter((r) => r.id !== id);
      _backend.set(key, filtered);
      return filtered.length < rows.length;
    },
  };
}

const shishaCrud  = makeCrud(KEYS.SHISHA,  computeShishaSale);
const acaiCrud    = makeCrud(KEYS.ACAI,    computeAcaiSale);
const expenseCrud = makeCrud(KEYS.EXPENSE, computeExpense);

const getShishaSales   = ()      => shishaCrud.getAll();
const saveShishaSale   = (data)  => shishaCrud.save(data);
const deleteShishaSale = (id)    => shishaCrud.delete(id);

const getAcaiSales     = ()      => acaiCrud.getAll();
const saveAcaiSale     = (data)  => acaiCrud.save(data);
const deleteAcaiSale   = (id)    => acaiCrud.delete(id);

const getExpenses      = ()      => expenseCrud.getAll();
const saveExpense      = (data)  => expenseCrud.save(data);
const deleteExpense    = (id)    => expenseCrud.delete(id);

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
  const ids = { landing: 'today-landing', shisha: 'today-shisha', acai: 'today-acai', expense: 'today-expense', bulk: 'today-bulk' };
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
document.getElementById('back-from-bulk').addEventListener('click',     () => showTodaySection('landing'));
document.getElementById('btn-go-bulk').addEventListener('click',        () => showTodaySection('bulk'));

// ── Bulk (日次一括入力・テーブル形式) ─────────────────────────────────────────

document.getElementById('bulk-date').value = today();

function rowNum(cls) { return (tr) => Number(tr.querySelector(cls)?.value) || 0; }

function recalcShishaRow(tr) {
  const g = rowNum;
  const total = g('.sr-shisha')(tr) + g('.sr-drink')(tr) + g('.sr-food')(tr) - g('.sr-disc')(tr);
  tr.querySelector('.sr-total').textContent = fmt(total);
}

function recalcShishaTotals() {
  let sales = 0, guests = 0;
  document.querySelectorAll('#shisha-table-body .shisha-row').forEach(tr => {
    const g = rowNum;
    sales  += g('.sr-shisha')(tr) + g('.sr-drink')(tr) + g('.sr-food')(tr) - g('.sr-disc')(tr);
    guests += g('.sr-male')(tr) + g('.sr-female')(tr);
  });
  document.getElementById('shisha-table-total').textContent  = fmt(sales);
  document.getElementById('shisha-table-guests').textContent = guests + ' 人';
}

function addShishaRow() {
  const tbody = document.getElementById('shisha-table-body');
  const num   = tbody.rows.length + 1;
  const tr    = document.createElement('tr');
  tr.className = 'shisha-row';
  tr.innerHTML = `
    <td><input type="text"   class="sr-table"  placeholder="${num}" style="width:42px"></td>
    <td><input type="time"   class="sr-visit"  style="width:82px"></td>
    <td><input type="time"   class="sr-leave"  style="width:82px"></td>
    <td><input type="number" class="sr-male"   value="0" min="0" style="width:44px"></td>
    <td><input type="number" class="sr-female" value="0" min="0" style="width:44px"></td>
    <td><input type="number" class="sr-count"  value="1" min="0" style="width:44px"></td>
    <td><input type="number" class="sr-shisha" value="0" min="0"></td>
    <td><input type="number" class="sr-drink"  value="0" min="0"></td>
    <td><input type="number" class="sr-food"   value="0" min="0"></td>
    <td><input type="number" class="sr-disc"   value="0" min="0"></td>
    <td class="sr-total col-total">¥0</td>
    <td><input type="number" class="sr-cash"   value="0" min="0"></td>
    <td><input type="number" class="sr-card"   value="0" min="0"></td>
    <td><input type="number" class="sr-qr"     value="0" min="0"></td>
    <td><input type="number" class="sr-unpaid" value="0" min="0"></td>
    <td><button type="button" class="bexp-remove">×</button></td>
  `;
  tr.querySelectorAll('input[type="number"]').forEach(inp => inp.addEventListener('input', () => {
    recalcShishaRow(tr); recalcShishaTotals();
  }));
  tr.querySelector('.bexp-remove').addEventListener('click', () => { tr.remove(); recalcShishaTotals(); });
  tbody.appendChild(tr);
}

document.getElementById('shisha-add-row').addEventListener('click', addShishaRow);

function recalcAcaiRows() {
  let total = 0;
  document.querySelectorAll('.acai-row').forEach(tr => {
    const sales = Number(tr.querySelector('.ar-sales').value) || 0;
    const fee   = Number(tr.querySelector('.ar-fee').value)   || 0;
    const net   = sales - fee;
    tr.querySelector('.ar-net-display').textContent = fmt(net);
    total += net;
  });
  document.getElementById('bulk-ac-total').textContent = fmt(total);
}

document.querySelectorAll('.acai-row input').forEach(inp => inp.addEventListener('input', recalcAcaiRows));

function recalcExpenseTotal() {
  const total = Array.from(document.querySelectorAll('#expense-table-body .bexp-amount'))
    .reduce((s, el) => s + (Number(el.value) || 0), 0);
  document.getElementById('expense-table-total').textContent = fmt(total);
}

function addExpenseRow() {
  const tbody = document.getElementById('expense-table-body');
  const tr    = document.createElement('tr');
  tr.className = 'expense-row';
  tr.innerHTML = `
    <td><select class="bexp-dept">
      <option value="共通の経費">🏠 共通</option>
      <option value="シーシャの経費">💨 シーシャ</option>
      <option value="アサイーの経費">🍇 アサイー</option>
    </select></td>
    <td><select class="bexp-cat">
      <option value="">選択</option>
      <option>仕入れ</option><option>材料費</option><option>人件費</option>
      <option>家賃</option><option>水道光熱費</option><option>広告費</option>
      <option>消耗品</option><option>交通費</option><option>通信費</option>
      <option>システム利用料</option><option>その他</option>
    </select></td>
    <td><input type="number" class="bexp-amount" value="0" min="0"></td>
    <td><button type="button" class="bexp-remove">×</button></td>
  `;
  tr.querySelector('.bexp-remove').addEventListener('click', () => { tr.remove(); recalcExpenseTotal(); });
  tr.querySelector('.bexp-amount').addEventListener('input', recalcExpenseTotal);
  tbody.appendChild(tr);
}

document.getElementById('bulk-add-expense').addEventListener('click', addExpenseRow);

document.getElementById('bulk-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const date  = document.getElementById('bulk-date').value;
  const staff = document.getElementById('bulk-staff').value.trim();
  let count   = 0;

  document.querySelectorAll('#shisha-table-body .shisha-row').forEach(tr => {
    const g = rowNum;
    const shishaSales = g('.sr-shisha')(tr);
    const total = shishaSales + g('.sr-drink')(tr) + g('.sr-food')(tr) - g('.sr-disc')(tr);
    if (total === 0 && g('.sr-male')(tr) + g('.sr-female')(tr) === 0) return;
    saveShishaSale({
      date, staffName: staff,
      tableNumber: tr.querySelector('.sr-table')?.value.trim() || '',
      visitTime:   tr.querySelector('.sr-visit')?.value || '',
      leaveTime:   tr.querySelector('.sr-leave')?.value || '',
      customerType: '不明',
      maleCount: g('.sr-male')(tr), femaleCount: g('.sr-female')(tr), shishaCount: g('.sr-count')(tr),
      shishaSales, drinkSales: g('.sr-drink')(tr), foodSales: g('.sr-food')(tr),
      chargeSales: 0, otherSales: 0, discount: g('.sr-disc')(tr),
      cashAmount: g('.sr-cash')(tr), cardAmount: g('.sr-card')(tr), qrAmount: g('.sr-qr')(tr),
      unpaidAmount: g('.sr-unpaid')(tr), unpaidCollectedAmount: 0, memo: '',
    });
    count++;
  });

  document.querySelectorAll('.acai-row').forEach(tr => {
    const sales = Number(tr.querySelector('.ar-sales').value) || 0;
    if (sales <= 0) return;
    const fee = Number(tr.querySelector('.ar-fee').value) || 0;
    const ch  = tr.dataset.channel;
    saveAcaiSale({
      date, staffName: staff, channel: ch,
      orderNumber: '', customerType: '不明', customerName: '',
      productName: '一括入力', size: '-', quantity: 1,
      unitPrice: sales, productSales: sales,
      toppingSales: 0, deliveryFee: 0, discount: 0, platformFee: fee, materialCost: 0,
      cashAmount:      ch === '店頭'       ? sales : 0,
      cardAmount: 0, qrAmount: 0,
      rocketNowAmount: ch === 'Rocket Now' ? sales - fee : 0,
      uberEatsAmount:  ch === 'Uber Eats'  ? sales - fee : 0,
      otherAmount: 0, memo: '',
    });
    count++;
  });

  document.querySelectorAll('#expense-table-body .expense-row').forEach(tr => {
    const amount = Number(tr.querySelector('.bexp-amount').value) || 0;
    if (amount <= 0) return;
    saveExpense({
      date, payee: '',
      department: tr.querySelector('.bexp-dept').value || '共通の経費',
      category:   tr.querySelector('.bexp-cat').value  || 'その他',
      amount, paymentMethod: '現金', hasReceipt: '後で確認', memo: '',
    });
    count++;
  });

  renderTodayStats();
  document.getElementById('bulk-saved-detail').textContent = `${count}件を保存しました`;
  document.getElementById('bulk-form-wrap').hidden   = true;
  document.getElementById('bulk-saved-state').hidden = false;
  showToast(`${count}件を保存しました`);
});

function resetBulkForm() {
  document.getElementById('bulk-date').value  = today();
  document.getElementById('bulk-staff').value = '';
  document.getElementById('shisha-table-body').innerHTML  = '';
  document.getElementById('expense-table-body').innerHTML = '';
  document.querySelectorAll('.acai-row input').forEach(inp => { inp.value = '0'; });
  document.querySelectorAll('.ar-net-display').forEach(el => { el.textContent = '¥0'; });
  document.getElementById('bulk-ac-total').textContent       = '¥0';
  document.getElementById('shisha-table-total').textContent  = '¥0';
  document.getElementById('shisha-table-guests').textContent = '0 人';
  document.getElementById('expense-table-total').textContent = '¥0';
  addShishaRow(); addShishaRow(); addExpenseRow();
  document.getElementById('bulk-form-wrap').hidden   = false;
  document.getElementById('bulk-saved-state').hidden = true;
}

document.getElementById('bulk-again-btn').addEventListener('click', resetBulkForm);
document.getElementById('bulk-today-btn').addEventListener('click', () => { showTodaySection('landing'); renderTodayStats(); });
document.getElementById('bulk-dashboard-btn').addEventListener('click', () => {
  document.querySelector('nav button[data-tab="summary"]').click();
});

addShishaRow(); addShishaRow(); addExpenseRow();

// ── Shisha Form ───────────────────────────────────────────────────────────────

function showShishaStep(step) {
  document.getElementById('shisha-form-wrap').hidden   = (step !== 'form');
  document.getElementById('shisha-saved-state').hidden = (step !== 'saved');
}

document.getElementById('sh-date').value = today();

function recalcShisha() {
  const nv = (id) => Number(document.getElementById(id)?.value) || 0;

  const shishaSales = nv('sh-shisha');
  const totalAmount = shishaSales + nv('sh-drink') + nv('sh-food')
                    + nv('sh-charge') + nv('sh-other') - nv('sh-discount');

  const maleCount   = nv('sh-male');
  const femaleCount = nv('sh-female');
  const totalCount  = maleCount + femaleCount;
  const shishaCount = nv('sh-count');

  document.getElementById('sh-total-count').textContent      = totalCount + ' 人';
  document.getElementById('sh-calc-total').textContent       = fmt(totalAmount);
  document.getElementById('sh-calc-avg-person').textContent  = fmt(totalCount  > 0 ? Math.round(totalAmount / totalCount)   : 0);
  document.getElementById('sh-calc-avg-shisha').textContent  = fmt(shishaCount > 0 ? Math.round(shishaSales / shishaCount)  : 0);

  const receivedAmount = nv('sh-cash') + nv('sh-card') + nv('sh-qr') + nv('sh-collected');
  const billableToday  = totalAmount - nv('sh-unpaid');
  const difference     = receivedAmount - billableToday;

  document.getElementById('sh-calc-received').textContent = fmt(receivedAmount);
  document.getElementById('sh-calc-diff').textContent     = fmt(difference);

  const statusEl = document.getElementById('sh-calc-diff-status');
  statusEl.textContent = difference === 0 ? 'OK' : '要確認';
  statusEl.className   = difference === 0 ? 'diff-ok' : 'diff-ng';
}

[
  'sh-shisha','sh-drink','sh-food','sh-charge','sh-other','sh-discount',
  'sh-male','sh-female','sh-count',
  'sh-cash','sh-card','sh-qr','sh-unpaid','sh-collected',
].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', recalcShisha);
});

document.getElementById('shisha-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;

  // ゼロ売上・ゼロ来客はガード
  const totalSales = (Number(f.shishaSales.value) + Number(f.drinkSales.value) +
    Number(f.foodSales.value) + Number(f.chargeSales.value) + Number(f.otherSales.value) -
    Number(f.discount.value)) || 0;
  const totalGuests = (Number(f.maleCount.value) + Number(f.femaleCount.value)) || 0;
  if (totalSales === 0 && totalGuests === 0) {
    showToast('売上か来客数を入力してください');
    return;
  }

  // 差額チェック
  const diffEl = document.getElementById('sh-calc-diff-status');
  if (diffEl && diffEl.classList.contains('diff-ng')) {
    if (!confirm('差額が「要確認」のまま保存します。よろしいですか？')) return;
  }

  const saved = saveShishaSale({
    date:                  f.date.value,
    staffName:             f.staffName.value.trim(),
    tableNumber:           f.tableNumber.value.trim(),
    visitTime:             f.visitTime.value,
    leaveTime:             f.leaveTime.value,
    customerType:          f.customerType.value,
    maleCount:             Number(f.maleCount.value)             || 0,
    femaleCount:           Number(f.femaleCount.value)           || 0,
    shishaCount:           Number(f.shishaCount.value)           || 0,
    shishaSales:           Number(f.shishaSales.value)           || 0,
    drinkSales:            Number(f.drinkSales.value)            || 0,
    foodSales:             Number(f.foodSales.value)             || 0,
    chargeSales:           Number(f.chargeSales.value)           || 0,
    otherSales:            Number(f.otherSales.value)            || 0,
    discount:              Number(f.discount.value)              || 0,
    cashAmount:            Number(f.cashAmount.value)            || 0,
    cardAmount:            Number(f.cardAmount.value)            || 0,
    qrAmount:              Number(f.qrAmount.value)              || 0,
    unpaidAmount:          Number(f.unpaidAmount.value)          || 0,
    unpaidCollectedAmount: Number(f.unpaidCollectedAmount.value) || 0,
    memo:                  f.memo.value.trim(),
  });

  const tableLabel = saved.tableNumber ? `テーブル ${saved.tableNumber}` : '—';
  document.getElementById('shisha-saved-detail').textContent =
    `${tableLabel}  ／  ${saved.totalCount}人  ／  ${fmt(saved.totalAmount)}`;

  renderTodayStats();
  showShishaStep('saved');
  showToast('シーシャ売上を保存しました');
});

function resetToggles(form) {
  form.querySelectorAll('.toggle-group').forEach(group => {
    const input = form.querySelector(`[name="${group.dataset.target}"]`);
    const first = group.querySelector('.toggle-btn');
    group.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    if (first) { first.classList.add('active'); if (input) input.value = first.dataset.val; }
  });
}

function resetShishaForm() {
  const form  = document.getElementById('shisha-form');
  const staff = form.querySelector('[name="staffName"]').value;
  form.reset();
  document.getElementById('sh-date').value = today();
  form.querySelector('[name="staffName"]').value = staff;
  resetToggles(form);
  recalcShisha();
}

document.getElementById('shisha-continue-btn').addEventListener('click', () => {
  resetShishaForm();
  showShishaStep('form');
});

document.getElementById('shisha-today-btn').addEventListener('click', () => {
  showTodaySection('landing');
  renderTodayStats();
});

document.getElementById('shisha-dashboard-btn').addEventListener('click', () => {
  document.querySelector('nav button[data-tab="summary"]').click();
});

// ── Acai Form ────────────────────────────────────────────────────────────────
const CH_EMOJI = { '店頭': '🏪', 'Rocket Now': '🚀', 'Uber Eats': '🛵', 'その他': '📦' };

function showAcaiSaved(show) {
  document.getElementById('acai-form-wrap').hidden   = show;
  document.getElementById('acai-saved-state').hidden = !show;
}

// 今日の日付をセット
document.getElementById('acai-date').value = today();

// チャネル変更 → 関連支払い欄をハイライト
document.getElementById('acai-channel-val').addEventListener('change', (e) => {
  const ch = e.target.value;
  document.getElementById('acai-rocket').closest('div').style.background =
    ch === 'Rocket Now' ? '#eaf4fb' : '';
  document.getElementById('acai-uber').closest('div').style.background =
    ch === 'Uber Eats'  ? '#f5eef8' : '';
  recalcAcai();
});

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
    const v      = Number(input.value) || 0;
    const minVal = parseInt(input.getAttribute('min'), 10);
    const floor  = isNaN(minVal) ? 1 : minVal;
    if (btn.dataset.action === 'inc') input.value = v + 1;
    if (btn.dataset.action === 'dec' && v > floor) input.value = v - 1;
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

  if (qty === 0 || up === 0) {
    showToast('数量と単価を入力してください');
    return;
  }

  const diffEl = document.getElementById('calc-diff-status');
  if (diffEl && diffEl.classList.contains('diff-ng')) {
    if (!confirm('差額が「要確認」のまま保存します。よろしいですか？')) return;
  }

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

  const emoji = CH_EMOJI[saved.channel] || '📦';
  document.getElementById('acai-saved-detail').textContent =
    `${emoji} ${saved.channel}  ／  ${saved.productName}（${saved.size}）× ${saved.quantity}  ／  ${fmt(saved.totalAmount)}`;

  renderTodayStats();
  showAcaiSaved(true);
  showToast('アサイー売上を保存しました');
});

function resetAcaiForm() {
  const form  = document.getElementById('acai-form');
  const staff = form.querySelector('[name="staffName"]').value;
  form.reset();
  document.getElementById('acai-date').value = today();
  form.querySelector('[name="staffName"]').value = staff;
  resetToggles(form);
  recalcAcai();
}

document.getElementById('acai-continue-btn').addEventListener('click', () => {
  resetAcaiForm();
  showAcaiSaved(false);
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

  // 部門別経費・利益率
  const shishaExpense    = expense.filter(r => r.department === 'シーシャの経費').reduce((s, r) => s + (r.amount || 0), 0);
  const acaiExpense      = expense.filter(r => r.department === 'アサイーの経費').reduce((s, r) => s + (r.amount || 0), 0);
  const shishaProfitRate = shishaTotal > 0 ? Math.round(((shishaTotal - shishaExpense) / shishaTotal) * 1000) / 10 : null;
  const acaiGross        = acai.reduce((s, r) => s + (r.grossProfit || 0), 0) - acaiExpense;
  const acaiProfitRate   = acaiTotal  > 0 ? Math.round((acaiGross / acaiTotal)  * 1000) / 10 : null;

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
    profit, profitRate, shishaProfitRate, acaiProfitRate,
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
  const rateStr = (v) => v !== null ? v + '%' : '—';
  document.getElementById('dk-profit-rate').textContent        = rateStr(d.profitRate);
  document.getElementById('dk-profit-rate-2').textContent      = rateStr(d.profitRate);
  document.getElementById('dk-shisha-profit-rate').textContent = d.shishaProfitRate  !== null ? d.shishaProfitRate  + '%' : '—';
  document.getElementById('dk-acai-profit-rate').textContent   = d.acaiProfitRate    !== null ? d.acaiProfitRate    + '%' : '—';

  const rateColor = (v) => v === null ? '' : v < 0 ? '#c0392b' : v < 15 ? '#d35400' : '#1e8449';
  document.getElementById('dk-shisha-profit-rate').style.color = rateColor(d.shishaProfitRate);
  document.getElementById('dk-acai-profit-rate').style.color   = rateColor(d.acaiProfitRate);

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
        <button class="btn-del" data-type="shisha" data-id="${r.id}">削除</button>
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
        <button class="btn-del" data-type="acai" data-id="${r.id}">削除</button>
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
        <button class="btn-del" data-type="expense" data-id="${r.id}">削除</button>
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

// ── 削除ボタン（イベント委譲）────────────────────────────────────────────────
document.getElementById('history').addEventListener('click', e => {
  const del = e.target.closest('.btn-del');
  if (!del) return;
  if (!confirm('このデータを削除しますか？')) return;
  const { type, id } = del.dataset;
  if (type === 'shisha')  deleteShishaSale(id);
  if (type === 'acai')    deleteAcaiSale(id);
  if (type === 'expense') deleteExpense(id);
  renderDailyView(document.getElementById('hist-date').value);
  renderTodayStats();
  showToast('削除しました');
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

// ── CSV Export ────────────────────────────────────────────────────────────────
function toCSV(headers, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return (s.includes(',') || s.includes('"') || s.includes('\n'))
      ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [headers.map(esc).join(',')];
  rows.forEach(r => lines.push(r.map(esc).join(',')));
  return '﻿' + lines.join('\r\n');
}

function downloadCSV(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function exportShishaCSV() {
  const headers = ['日付','男性客数','女性客数','合計客数','シーシャ本数',
    'シーシャ売上','ドリンク売上','フード売上','チャージ売上','その他売上','割引',
    '合計売上','現金','カード','QR','未収金','未収回収','受取合計','差異',
    '客単価','シーシャ単価','備考','登録日時'];
  const rows = getShishaSales().sort((a,b) => a.date.localeCompare(b.date)).map(r => [
    r.date, r.maleCount||0, r.femaleCount||0, r.totalCount||0, r.shishaCount||0,
    r.shishaSales||0, r.drinkSales||0, r.foodSales||0, r.chargeSales||0, r.otherSales||0, r.discount||0,
    r.totalAmount||0, r.cashAmount||0, r.cardAmount||0, r.qrAmount||0,
    r.unpaidAmount||0, r.unpaidCollectedAmount||0, r.receivedAmount||0, r.difference||0,
    r.averageSpendPerCustomer||0, r.averageSpendPerShisha||0, r.note||'', r.createdAt||'',
  ]);
  downloadCSV(toCSV(headers, rows), `シーシャ売上_${today()}.csv`);
}

function exportAcaiCSV() {
  const headers = ['日付','チャネル','商品売上','トッピング','配送料','割引','プラットフォーム手数料',
    '合計売上','原材料費','粗利','粗利率(%)','現金','カード','QR','ロケットナウ','Uber Eats','その他',
    '受取合計','差異','備考','登録日時'];
  const rows = getAcaiSales().sort((a,b) => a.date.localeCompare(b.date)).map(r => [
    r.date, r.channel||'', r.productSales||0, r.toppingSales||0, r.deliveryFee||0,
    r.discount||0, r.platformFee||0, r.totalAmount||0, r.materialCost||0,
    r.grossProfit||0, r.grossProfitRate||0,
    r.cashAmount||0, r.cardAmount||0, r.qrAmount||0,
    r.rocketNowAmount||0, r.uberEatsAmount||0, r.otherAmount||0,
    r.receivedAmount||0, r.difference||0, r.note||'', r.createdAt||'',
  ]);
  downloadCSV(toCSV(headers, rows), `アサイー売上_${today()}.csv`);
}

function exportExpenseCSV() {
  const headers = ['日付','部門','カテゴリ','備考','金額','登録日時'];
  const rows = getExpenses().sort((a,b) => a.date.localeCompare(b.date)).map(r => [
    r.date, r.dept||'', r.category||'', r.note||'', r.amount||0, r.createdAt||'',
  ]);
  downloadCSV(toCSV(headers, rows), `経費_${today()}.csv`);
}

function exportAllCSV() {
  exportShishaCSV();
  setTimeout(exportAcaiCSV,  300);
  setTimeout(exportExpenseCSV, 600);
  showToast('CSVを3ファイル出力しました');
}

document.getElementById('btn-export-shisha').addEventListener('click',  exportShishaCSV);
document.getElementById('btn-export-acai').addEventListener('click',    exportAcaiCSV);
document.getElementById('btn-export-expense').addEventListener('click', exportExpenseCSV);
document.getElementById('btn-export-all').addEventListener('click',     exportAllCSV);

// ── Init ──────────────────────────────────────────────────────────────────────
renderDashboard();
renderTodayStats();
