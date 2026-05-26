// Node.js 動作確認 — 実行: node test/storage.test.js
import {
  setStorageBackend,
  getShishaSales, saveShishaSale, updateShishaSale, deleteShishaSale,
  getAcaiSales,   saveAcaiSale,   updateAcaiSale,   deleteAcaiSale,
  getExpenses,    saveExpense,    updateExpense,     deleteExpense,
} from '../src/services/storage.js';

// ── テスト用インメモリバックエンドを注入 ──────────────────────────────────────
const mem = {};
setStorageBackend({
  get(k)    { return mem[k] ? JSON.parse(mem[k]) : []; },
  set(k, v) { mem[k] = JSON.stringify(v); },
});

// ── テストランナー ────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function test(label, fn) {
  try {
    fn();
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${label}`);
    console.error(`    → ${e.message}`);
    failed++;
  }
}

function assert(cond, msg)  { if (!cond)    throw new Error(msg || 'assertion failed'); }
function eq(a, b)           { if (a !== b)  throw new Error(`expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── ShishaSale ───────────────────────────────────────────────────────────');

test('初期状態は空配列', () => {
  eq(getShishaSales().length, 0);
});

let shishaId;

test('saveShishaSale: 保存・自動計算フィールドが正しく生成される', () => {
  const r = saveShishaSale({
    date:                  '2026-05-26',
    staffName:             '田中',
    tableNumber:           '2',
    visitTime:             '19:00',
    leaveTime:             '21:00',
    customerType:          'リピーター',
    maleCount:             2,
    femaleCount:           1,
    shishaCount:           2,
    shishaSales:           6000,
    drinkSales:            1500,
    foodSales:             0,
    chargeSales:           0,
    otherSales:            0,
    discount:              500,
    cashAmount:            7000,
    cardAmount:            0,
    qrAmount:              0,
    unpaidAmount:          0,
    unpaidCollectedAmount: 0,
    memo:                  'テスト',
  });
  shishaId = r.id;

  assert(r.id,        'id が生成されている');
  assert(r.createdAt, 'createdAt が生成されている');
  assert(r.updatedAt, 'updatedAt が生成されている');

  eq(r.totalCount,              3);       // 2+1
  eq(r.totalAmount,             7000);    // 6000+1500+0+0+0-500
  eq(r.receivedAmount,          7000);    // cashAmount+unpaidCollectedAmount
  eq(r.difference,              0);       // receivedAmount - billableToday
  eq(r.averageSpendPerCustomer, 2333);    // round(7000/3)
  eq(r.averageSpendPerShisha,   3000);    // 6000/2
});

test('getShishaSales: 1件取得できる', () => {
  eq(getShishaSales().length, 1);
});

test('updateShishaSale: フィールド更新・再計算される', () => {
  const u = updateShishaSale(shishaId, { staffName: '佐藤', drinkSales: 2000 });
  eq(u.staffName,   '佐藤');
  eq(u.totalAmount, 7500);   // 6000+2000+0+0+0-500
  assert(u.updatedAt >= u.createdAt, 'updatedAt が更新されている');
});

test('updateShishaSale: 存在しない id はエラー', () => {
  try {
    updateShishaSale('nonexistent_id', {});
    assert(false, 'エラーが発生するはず');
  } catch (e) {
    assert(e.message.includes('not found'), `エラーメッセージ: ${e.message}`);
  }
});

test('deleteShishaSale: 削除後は0件', () => {
  assert(deleteShishaSale(shishaId), '削除成功=true');
  eq(getShishaSales().length, 0);
});

test('deleteShishaSale: 存在しない id は false を返す', () => {
  assert(!deleteShishaSale('ghost_id'), '存在しない場合はfalse');
});

// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── AcaiSale ─────────────────────────────────────────────────────────────');

let acaiId;

test('saveAcaiSale: 保存・粗利・粗利率が正しく計算される', () => {
  const r = saveAcaiSale({
    date:            '2026-05-26',
    staffName:       '鈴木',
    channel:         'Uber Eats',
    orderNumber:     'UE-0001',
    customerType:    '不明',
    productName:     'アサイーボウル',
    size:            'M',
    quantity:        2,
    unitPrice:       1200,
    productSales:    2400,
    toppingSales:    200,
    deliveryFee:     300,
    discount:        0,
    platformFee:     609,  // ~21%
    materialCost:    800,
    uberEatsAmount:  2900,
    memo:            'テスト注文',
  });
  acaiId = r.id;

  assert(r.id, 'id が生成されている');
  eq(r.totalAmount,    2900);   // 2400+200+300-0
  eq(r.grossProfit,    1491);   // 2900-609-800
  eq(r.grossProfitRate, Math.round((1491/2900)*1000)/10);
  eq(r.receivedAmount, 2900);   // uberEatsAmount
  eq(r.difference,     0);
});

test('saveAcaiSale: 店頭チャネル・割引あり', () => {
  const r = saveAcaiSale({
    date:          '2026-05-26',
    channel:       '店頭',
    productName:   'アサイーボウル',
    size:          'S',
    quantity:      1,
    unitPrice:     900,
    productSales:  900,
    toppingSales:  0,
    deliveryFee:   0,
    discount:      100,
    platformFee:   0,
    materialCost:  300,
    cashAmount:    800,
  });
  eq(r.totalAmount,    800);    // 900-100
  eq(r.grossProfit,    500);    // 800-0-300
  eq(r.receivedAmount, 800);
  eq(r.difference,     0);
  deleteAcaiSale(r.id);        // クリーンアップ
});

test('updateAcaiSale: discount追加で再計算される', () => {
  const u = updateAcaiSale(acaiId, { discount: 200 });
  eq(u.totalAmount, 2700);  // 2400+200+300-200
});

test('deleteAcaiSale: 削除後は0件', () => {
  assert(deleteAcaiSale(acaiId));
  eq(getAcaiSales().length, 0);
});

// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── Expense ──────────────────────────────────────────────────────────────');

let expId;

test('saveExpense: 保存できる', () => {
  const r = saveExpense({
    date:          '2026-05-26',
    payee:         '業務スーパー',
    department:    'アサイーの経費',
    category:      '材料費',
    amount:        5000,
    paymentMethod: '現金',
    hasReceipt:    'あり',
    memo:          '仕入れ',
  });
  expId = r.id;
  assert(r.id);
  eq(r.amount, 5000);
  assert(r.createdAt);
});

test('saveExpense: amountが文字列でも数値に変換される', () => {
  const r = saveExpense({ date: '2026-05-26', amount: '3500', category: '消耗品' });
  try {
    eq(r.amount, 3500);
  } finally {
    deleteExpense(r.id); // アサートの成否に関わらずクリーンアップ
  }
});

test('updateExpense: amount・hasReceiptを更新できる', () => {
  const u = updateExpense(expId, { amount: 5500, hasReceipt: '後で確認' });
  eq(u.amount,     5500);
  eq(u.hasReceipt, '後で確認');
});

test('getExpenses: 1件取得できる', () => {
  eq(getExpenses().length, 1);
});

test('deleteExpense: 削除後は0件', () => {
  assert(deleteExpense(expId));
  eq(getExpenses().length, 0);
});

// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── 複数件・独立性チェック ──────────────────────────────────────────────');

test('ShishaSale と AcaiSale のストレージは独立している', () => {
  const s = saveShishaSale({ date: '2026-05-26', shishaSales: 3000, maleCount: 1, cashAmount: 3000 });
  const a = saveAcaiSale({ date: '2026-05-26', productSales: 1000, cashAmount: 1000 });
  eq(getShishaSales().length, 1);
  eq(getAcaiSales().length,   1);
  deleteShishaSale(s.id);
  deleteAcaiSale(a.id);
  eq(getShishaSales().length, 0);
  eq(getAcaiSales().length,   0);
});

// ── Result ────────────────────────────────────────────────────────────────────
const total = passed + failed;
console.log(`\n結果: ${passed}/${total} passed${failed > 0 ? `, ${failed} failed` : ' ✓'}\n`);
if (failed > 0) process.exit(1);
