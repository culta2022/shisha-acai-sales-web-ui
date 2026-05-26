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
    uberEatsAmount:  2291, // Uber から入金される純額（2900-609）
    memo:            'テスト注文',
  });
  acaiId = r.id;

  assert(r.id, 'id が生成されている');
  // 合計売上 = 2400+200+300-0-609 = 2291（手数料控除後）
  eq(r.totalAmount,    2291);
  eq(r.grossProfit,    1491);   // 2291-800
  eq(r.grossProfitRate, Math.round((1491/2291)*1000)/10);
  eq(r.receivedAmount, 2291);   // uberEatsAmount
  eq(r.difference,     0);      // 合計売上 - 受取 = 0
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
  // 合計売上 = 2400+200+300-200-609 = 2091
  eq(u.totalAmount, 2091);
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
console.log('\n── チャネル別テスト保存 ──────────────────────────────────────────────');

test('店頭: 現金払い・差額0', () => {
  const r = saveAcaiSale({
    date: '2026-05-26', channel: '店頭', staffName: '田中',
    productName: 'アサイーボウル', size: 'M', quantity: 2, unitPrice: 1000,
    productSales: 2000, toppingSales: 200, deliveryFee: 0, discount: 0,
    platformFee: 0, materialCost: 600, cashAmount: 2200,
    customerType: '新規',
  });
  eq(r.channel,       '店頭');
  eq(r.totalAmount,    2200);  // 2000+200+0-0-0
  eq(r.grossProfit,    1600);  // 2200-600
  eq(r.receivedAmount, 2200);
  eq(r.difference,     0);
  deleteAcaiSale(r.id);
});

test('Rocket Now: 手数料控除後の純額受取・差額0', () => {
  const r = saveAcaiSale({
    date: '2026-05-26', channel: 'Rocket Now', orderNumber: 'RN-001',
    productName: 'アサイーボウル', size: 'L', quantity: 1, unitPrice: 1200,
    productSales: 1200, toppingSales: 0, deliveryFee: 300, discount: 0,
    platformFee: 250, materialCost: 400, rocketNowAmount: 1250,
    customerType: 'リピーター',
  });
  eq(r.channel,       'Rocket Now');
  eq(r.totalAmount,    1250);  // 1200+0+300-0-250
  eq(r.grossProfit,    850);   // 1250-400
  eq(r.receivedAmount, 1250);
  eq(r.difference,     0);
  deleteAcaiSale(r.id);
});

test('Uber Eats: 複数個・割引あり・差額0', () => {
  const r = saveAcaiSale({
    date: '2026-05-26', channel: 'Uber Eats', orderNumber: 'UE-00456',
    productName: 'アサイースムージー', size: 'S', quantity: 3, unitPrice: 800,
    productSales: 2400, toppingSales: 0, deliveryFee: 300, discount: 100,
    platformFee: 620, materialCost: 720, uberEatsAmount: 1980,
    customerType: '不明',
  });
  eq(r.channel,       'Uber Eats');
  eq(r.totalAmount,    1980);  // 2400+0+300-100-620
  eq(r.grossProfit,    1260);  // 1980-720
  eq(r.receivedAmount, 1980);
  eq(r.difference,     0);
  deleteAcaiSale(r.id);
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
