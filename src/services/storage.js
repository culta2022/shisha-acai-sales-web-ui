'use strict';

// ── Backend abstraction ───────────────────────────────────────────────────────
// ここだけ差し替えれば DB / Google Sheets API に移行できる。
// デフォルト: localStorage（ブラウザ）or インメモリ（Node.js / テスト）

function createDefaultBackend() {
  if (typeof localStorage !== 'undefined') {
    return {
      get(key)       { try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; } },
      set(key, rows) { localStorage.setItem(key, JSON.stringify(rows)); },
    };
  }
  // Node.js / テスト用インメモリフォールバック
  const mem = {};
  return {
    get(key)       { return mem[key] ? JSON.parse(mem[key]) : []; },
    set(key, rows) { mem[key] = JSON.stringify(rows); },
  };
}

let _backend = createDefaultBackend();

/** テスト・移行時にバックエンドを差し替える */
export function setStorageBackend(backend) {
  _backend = backend;
}

// ── Storage keys ──────────────────────────────────────────────────────────────
const KEYS = {
  SHISHA:  'sas_v2_shisha_sales',
  ACAI:    'sas_v2_acai_sales',
  EXPENSE: 'sas_v2_expenses',
};

// ── Utilities ─────────────────────────────────────────────────────────────────
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function nowIso() {
  return new Date().toISOString();
}

const n = (v) => Number(v) || 0;

// ── Computed fields ───────────────────────────────────────────────────────────

function computeShishaSale(data) {
  const totalCount   = n(data.maleCount) + n(data.femaleCount);
  const totalAmount  = n(data.shishaSales) + n(data.drinkSales) + n(data.foodSales)
                     + n(data.chargeSales) + n(data.otherSales) - n(data.discount);
  // unpaidAmount: 当日未払いとして後日回収予定の金額
  // receivedAmount: 当日実際に受け取った現金・カード・QR ＋ 旧未払い回収分
  const receivedAmount = n(data.cashAmount) + n(data.cardAmount)
                       + n(data.qrAmount)   + n(data.unpaidCollectedAmount);
  const billableToday  = totalAmount - n(data.unpaidAmount);
  const difference     = receivedAmount - billableToday;
  const shishaCount    = n(data.shishaCount);

  return {
    ...data,
    totalCount,
    totalAmount,
    receivedAmount,
    difference,
    averageSpendPerCustomer: totalCount  > 0 ? Math.round(totalAmount / totalCount)         : 0,
    averageSpendPerShisha:   shishaCount > 0 ? Math.round(n(data.shishaSales) / shishaCount) : 0,
  };
}

function computeAcaiSale(data) {
  // 合計売上 = 商品売上 + トッピング + 配送料 - 値引き - 販売手数料（仕様書準拠）
  const totalAmount    = n(data.productSales) + n(data.toppingSales)
                       + n(data.deliveryFee) - n(data.discount) - n(data.platformFee);
  const grossProfit    = totalAmount - n(data.materialCost);
  const grossProfitRate = totalAmount > 0
    ? Math.round((grossProfit / totalAmount) * 1000) / 10
    : 0;
  const receivedAmount = n(data.cashAmount)    + n(data.cardAmount)
                       + n(data.qrAmount)      + n(data.rocketNowAmount)
                       + n(data.uberEatsAmount) + n(data.otherAmount);
  // 差額 = 合計売上 - 受け取った合計（仕様書準拠）
  const difference     = totalAmount - receivedAmount;

  return {
    ...data,
    totalAmount,
    grossProfit,
    grossProfitRate,
    receivedAmount,
    difference,
  };
}

// ── Generic CRUD factory ──────────────────────────────────────────────────────
// _backend はモジュールスコープの let なので、setStorageBackend() で差し替えると
// ここで返す全関数が即座に新しいバックエンドを参照する（参照渡し）。

function makeCrud(key, computeFn) {
  const compute = computeFn || ((d) => d);

  return {
    getAll() {
      return _backend.get(key);
    },

    save(data) {
      const rows = _backend.get(key);
      const ts   = nowIso();
      const record = compute({
        ...data,
        id:        generateId(),
        createdAt: ts,
        updatedAt: ts,
      });
      rows.push(record);
      _backend.set(key, rows);
      return record;
    },

    update(id, data) {
      const rows = _backend.get(key);
      const idx  = rows.findIndex((r) => r.id === id);
      if (idx === -1) throw new Error(`Record not found: ${id}`);
      const updated = compute({
        ...rows[idx],
        ...data,
        id,
        createdAt: rows[idx].createdAt,
        updatedAt: nowIso(),
      });
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

function computeExpense(data) {
  return { ...data, amount: n(data.amount) };
}

// ── CRUD instances ────────────────────────────────────────────────────────────
const shishaCrud  = makeCrud(KEYS.SHISHA,  computeShishaSale);
const acaiCrud    = makeCrud(KEYS.ACAI,    computeAcaiSale);
const expenseCrud = makeCrud(KEYS.EXPENSE, computeExpense);

// ── Public API ────────────────────────────────────────────────────────────────

// ShishaSale
export const getShishaSales   = ()        => shishaCrud.getAll();
export const saveShishaSale   = (data)    => shishaCrud.save(data);
export const updateShishaSale = (id, d)   => shishaCrud.update(id, d);
export const deleteShishaSale = (id)      => shishaCrud.delete(id);

// AcaiSale
export const getAcaiSales     = ()        => acaiCrud.getAll();
export const saveAcaiSale     = (data)    => acaiCrud.save(data);
export const updateAcaiSale   = (id, d)   => acaiCrud.update(id, d);
export const deleteAcaiSale   = (id)      => acaiCrud.delete(id);

// Expense
export const getExpenses      = ()        => expenseCrud.getAll();
export const saveExpense      = (data)    => expenseCrud.save(data);
export const updateExpense    = (id, d)   => expenseCrud.update(id, d);
export const deleteExpense    = (id)      => expenseCrud.delete(id);
