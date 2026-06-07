import { expect, test } from '@playwright/test';

const STAFF_SALE_EVENT_KIND = 'staff_sale_event';

async function resetDb(page) {
  await page.goto('/manifest.webmanifest');
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = window.indexedDB.deleteDatabase('GebyaDB');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('GebyaDB deletion was blocked by an open connection'));
    });
  });
  await page.evaluate(() => localStorage.setItem('gebya_lang', 'en'));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
}

async function openTeamSection(page) {
  await page.getByRole('button', { name: /settings/i }).first().click();
  await page.getByRole('button', { name: /team/i }).click();
}

function teamActorSelect(page) {
  return page.getByRole('combobox').first();
}

async function installAlertCapture(page) {
  await page.evaluate(() => {
    window.__gebyaLastAlert = null;
    window.alert = (message) => {
      window.__gebyaLastAlert = String(message);
    };
  });
}

async function getLastAlert(page) {
  return page.evaluate(() => window.__gebyaLastAlert || null);
}

async function getLastSaveError(page) {
  return page.evaluate(() => window.__gebyaLastSaveError || null);
}

async function readStore(page, storeName: string) {
  return page.evaluate(async (name) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = window.indexedDB.open('GebyaDB');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<unknown[]>((resolve, reject) => {
        const tx = db.transaction(name, 'readonly');
        const store = tx.objectStore(name);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }, storeName);
}

async function addLegacyTransaction(page, record: Record<string, unknown>) {
  await page.evaluate(async (payload) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = window.indexedDB.open('GebyaDB');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('transactions', 'readwrite');
        tx.objectStore('transactions').add(payload);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }, record);
}

test('staff selection is shown on new records and persists in history after reload', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await resetDb(page);
  await page.reload({ waitUntil: 'domcontentloaded' });

  await page.getByPlaceholder(/e\.g\. tigist/i).fill('Tigist Shop');
  await page.getByRole('button', { name: /start using gebya/i }).click();
  await installAlertCapture(page);

  await openTeamSection(page);

  await page.getByPlaceholder(/staff name/i).fill('Almaz');
  await page.getByRole('button', { name: /^add$/i }).click();
  await expect(page.getByRole('button', { name: /^use$/i })).toBeVisible();

  await page.getByRole('button', { name: /^use$/i }).click();
  await expect(teamActorSelect(page)).toHaveValue('1');

  await page.locator('nav').getByRole('button', { name: /today/i }).click();
  await page.getByRole('button', { name: /^sale$/i }).click();
  await expect(page.getByText(/^almaz$/i).first()).toBeVisible();

  await page.getByPlaceholder(/add details/i).fill('Bread');
  await page.getByPlaceholder(/^0$/).fill('120');
  await page.getByRole('button', { name: /save sale/i }).click();
  await expect.poll(async () => ({
    alert: await getLastAlert(page),
    error: await getLastSaveError(page),
  })).toEqual({ alert: null, error: null });

  await expect(page.getByText(/staff sales today/i)).toBeVisible();
  await expect(page.getByText(/^almaz$/i).first()).toBeVisible();

  await page.locator('nav').getByRole('button', { name: /report/i }).click();
  await expect(page.getByText(/entered by almaz/i)).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('nav').getByRole('button', { name: /report/i }).click();
  await expect(page.getByText(/entered by almaz/i)).toBeVisible();
});

test('inactivating the current staff member warns the owner and falls back to owner', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await resetDb(page);
  await page.reload({ waitUntil: 'domcontentloaded' });

  await page.getByPlaceholder(/e\.g\. tigist/i).fill('Tigist Shop');
  await page.getByRole('button', { name: /start using gebya/i }).click();
  await installAlertCapture(page);

  await openTeamSection(page);

  await page.getByPlaceholder(/staff name/i).fill('Almaz');
  await page.getByRole('button', { name: /^add$/i }).click();
  await page.getByRole('button', { name: /^use$/i }).click();

  await page.getByRole('button', { name: /inactivate/i }).click();
  await expect(page.getByText(/currently selected for new records on this phone/i)).toBeVisible();
  await expect(page.getByText(/past records stay attributed to this staff member/i)).toBeVisible();
  await page.getByRole('button', { name: /inactivate now/i }).click();

  await expect(page.getByText(/inactive - past records stay attributed to this staff member/i)).toBeVisible();
  await expect(teamActorSelect(page)).toHaveValue('');
});

test('renaming a staff member updates future attribution while keeping past snapshots', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await resetDb(page);
  await page.reload({ waitUntil: 'domcontentloaded' });

  await page.getByPlaceholder(/e\.g\. tigist/i).fill('Tigist Shop');
  await page.getByRole('button', { name: /start using gebya/i }).click();
  await installAlertCapture(page);

  await openTeamSection(page);

  await page.getByPlaceholder(/staff name/i).fill('Almaz');
  await page.getByRole('button', { name: /^add$/i }).click();
  await page.getByRole('button', { name: /^use$/i }).click();

  await page.locator('nav').getByRole('button', { name: /today/i }).click();
  await page.getByRole('button', { name: /^sale$/i }).click();
  await page.getByPlaceholder(/add details/i).fill('Bread');
  await page.getByPlaceholder(/^0$/).fill('120');
  await page.getByRole('button', { name: /save sale/i }).click();
  await expect.poll(async () => ({
    alert: await getLastAlert(page),
    error: await getLastSaveError(page),
  })).toEqual({ alert: null, error: null });
  await expect(page.getByText(/staff sales today/i)).toBeVisible();
  await expect(page.getByText(/^almaz$/i).first()).toBeVisible();

  await openTeamSection(page);
  await page.getByRole('button', { name: /^edit$/i }).click();
  await page.getByRole('textbox', { name: 'Staff name' }).nth(1).fill('Mahi');
  await page.getByRole('button', { name: /^save$/i }).click();
  await expect(teamActorSelect(page)).toHaveValue('1');

  await page.locator('nav').getByRole('button', { name: /today/i }).click();
  await page.getByRole('button', { name: /^sale$/i }).click();
  await expect(page.getByText(/^mahi$/i).first()).toBeVisible();
  await page.getByPlaceholder(/add details/i).fill('Sugar');
  await page.getByPlaceholder(/^0$/).fill('90');
  await page.getByRole('button', { name: /save sale/i }).click();
  await expect.poll(async () => ({
    alert: await getLastAlert(page),
    error: await getLastSaveError(page),
  })).toEqual({ alert: null, error: null });

  await expect(page.getByText(/staff sales today/i)).toBeVisible();
  await expect(page.getByText(/^mahi$/i).first()).toBeVisible();
  await expect(page.getByText(/2 sales/i).first()).toBeVisible();

  await page.locator('nav').getByRole('button', { name: /report/i }).click();
  await expect(page.getByText(/entered by almaz/i)).toBeVisible();
  await expect(page.getByText(/entered by mahi/i)).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await openTeamSection(page);
  await expect(teamActorSelect(page)).toHaveValue('1');
  await expect(page.getByRole('button', { name: /^current$/i })).toBeVisible();

  await page.locator('nav').getByRole('button', { name: /report/i }).click();
  await expect(page.getByText(/entered by almaz/i)).toBeVisible();
  await expect(page.getByText(/entered by mahi/i)).toBeVisible();
});

test('legacy transactions without staff or item metadata still render', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await resetDb(page);
  await page.reload({ waitUntil: 'domcontentloaded' });

  await page.getByPlaceholder(/e\.g\. tigist/i).fill('Tigist Shop');
  await page.getByRole('button', { name: /start using gebya/i }).click();

  await addLegacyTransaction(page, {
    type: 'sale',
    amount: 250,
    item_name: 'Legacy charger sale',
    quantity: 1,
    cost_price: 0,
    profit: null,
    is_credit: false,
    payment_type: 'cash',
    created_at: Date.now(),
    updated_at: Date.now(),
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/legacy charger sale/i).first()).toBeVisible();
  await expect(page.getByText(/250(?:\.00)? birr/i).first()).toBeVisible();

  await page.locator('nav').getByRole('button', { name: /report/i }).click();
  await expect(page.getByText(/legacy charger sale/i).first()).toBeVisible();
});

test('staff sales memory supports code and amount search with local high-value owner alerts', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('gebya_lang', 'en'));
  await page.route('**/api/staff-sales/events', async (route) => {
    const payload = route.request().postDataJSON();
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({
        accepted: true,
        event_id: payload.event_id,
        transaction_id: payload.transaction_id,
        status: 'persisted',
        duplicate: false,
        received_at_server: new Date().toISOString(),
      }),
    });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await resetDb(page);
  await page.reload({ waitUntil: 'domcontentloaded' });

  await page.getByPlaceholder(/e\.g\. tigist/i).fill('Tigist Shop');
  await page.getByRole('button', { name: /start using gebya/i }).click();
  await installAlertCapture(page);

  await openTeamSection(page);
  const staffNameInput = page.getByPlaceholder(/staff name/i).first();
  await staffNameInput.fill('Abel');
  await page.getByRole('button', { name: /^add$/i }).click();
  await expect(page.getByText(/^abel$/i).last()).toBeVisible();
  await expect(staffNameInput).toHaveValue('');
  await staffNameInput.fill('Mimi');
  await page.getByRole('button', { name: /^add$/i }).click();
  await expect(page.getByText(/^mimi$/i).last()).toBeVisible();

  await page.getByRole('button', { name: /^use$/i }).first().click();
  await page.locator('nav').getByRole('button', { name: /today/i }).click();
  await page.getByRole('button', { name: /^sale$/i }).click();
  await page.getByPlaceholder(/add details/i).fill('charger CH-25');
  await page.getByPlaceholder(/^0$/).fill('1500');
  await page.getByRole('button', { name: /save sale/i }).click();
  await expect.poll(async () => ({
    alert: await getLastAlert(page),
    error: await getLastSaveError(page),
  })).toEqual({ alert: null, error: null });

  await openTeamSection(page);
  await page.getByRole('button', { name: /^use$/i }).last().click();
  await page.locator('nav').getByRole('button', { name: /today/i }).click();
  await page.getByRole('button', { name: /^sale$/i }).click();
  await page.getByPlaceholder(/add details/i).fill('phone case glass cable');
  await page.getByPlaceholder(/^0$/).fill('10000');
  await page.getByRole('button', { name: /break down into items/i }).click();
  await page.getByRole('button', { name: /add first item/i }).click();
  await page.getByPlaceholder(/item 1/i).fill('phone case');
  await page.getByPlaceholder(/^0$/).last().fill('3000');
  await page.getByRole('button', { name: /add another item/i }).click();
  await page.getByPlaceholder(/item 2/i).fill('glass');
  await page.getByPlaceholder(/^0$/).last().fill('4000');
  await page.getByRole('button', { name: /add another item/i }).click();
  await page.getByPlaceholder(/item 3/i).fill('cable');
  await page.getByPlaceholder(/^0$/).last().fill('3000');
  await page.getByRole('button', { name: /save sale/i }).click();
  await expect.poll(async () => ({
    alert: await getLastAlert(page),
    error: await getLastSaveError(page),
  })).toEqual({ alert: null, error: null });

  await expect.poll(async () => {
    const transactions = await readStore(page, 'transactions') as any[];
    const ownerAlerts = await readStore(page, 'owner_alerts') as any[];
    const staffSaleEvents = await readStore(page, 'staff_sale_events') as any[];
    const syncQueue = await readStore(page, 'sync_queue') as any[];
    const sales = transactions.filter(tx => tx.type === 'sale');
    const staffSaleQueue = syncQueue.filter(row => row.kind === STAFF_SALE_EVENT_KIND);
    const abelSale = sales.find(tx => tx.actor_name_snapshot === 'Abel' && tx.item_code === 'CH-25' && Number(tx.amount) === 1500);
    const mimiSale = sales.find(tx => tx.actor_name_snapshot === 'Mimi' && Number(tx.amount) === 10000 && String(tx.item_note || tx.item_name || '').includes('phone case'));
    const abelEvent = staffSaleEvents.find(event => event.transaction_id === abelSale?.transaction_id);
    const mimiEvent = staffSaleEvents.find(event => event.transaction_id === mimiSale?.transaction_id);
    const abelQueue = staffSaleQueue.find(row => row.payload?.event_id === abelEvent?.event_id);
    const mimiQueue = staffSaleQueue.find(row => row.payload?.event_id === mimiEvent?.event_id);
    return {
      saleCount: sales.length,
      abelSale: Boolean(abelSale),
      mimiSale: Boolean(mimiSale),
      eventCount: staffSaleEvents.length,
      queueCount: staffSaleQueue.length,
      abelEvent: Boolean(
        abelEvent
        && abelEvent.staff_name_snapshot === 'Abel'
        && abelEvent.staff_id === String(abelSale?.actor_staff_member_id)
        && abelEvent.shop_id === 'local_demo_shop'
        && abelEvent.item_code === 'CH-25'
        && abelEvent.item_note === 'charger CH-25'
        && Number(abelEvent.amount) === 1500
        && abelEvent.device_id === abelSale?.device_id
        && abelEvent.event_type === 'sale_created'
        && abelEvent.sync_status === 'synced'
        && abelEvent.schema_version === 1
        && typeof abelEvent.created_at_device === 'number'
        && typeof abelEvent.synced_at === 'number'
        && typeof abelEvent.received_at_server === 'string'
      ),
      mimiEvent: Boolean(
        mimiEvent
        && mimiEvent.staff_name_snapshot === 'Mimi'
        && Number(mimiEvent.amount) === 10000
        && String(mimiEvent.item_note || '').includes('phone case')
        && mimiEvent.event_type === 'sale_created'
        && mimiEvent.sync_status === 'synced'
      ),
      abelQueue: Boolean(
        abelQueue
        && abelQueue.status === 'sent'
        && abelQueue.record_table === 'staff_sale_events'
        && abelQueue.record_type === 'sale_created'
        && abelQueue.transaction_id === abelSale?.transaction_id
        && abelQueue.payload?.transaction_id === abelSale?.transaction_id
        && abelQueue.payload?.staff_name_snapshot === 'Abel'
      ),
      mimiQueue: Boolean(mimiQueue && mimiQueue.status === 'sent' && mimiQueue.payload?.staff_name_snapshot === 'Mimi'),
      alertCount: ownerAlerts.length,
      mimiAlert: ownerAlerts.some(alert => alert.actor_name_snapshot === 'Mimi' && Number(alert.amount) === 10000),
      abelAlert: ownerAlerts.some(alert => alert.actor_name_snapshot === 'Abel'),
    };
  }).toEqual({
    saleCount: 2,
    abelSale: true,
    mimiSale: true,
    eventCount: 2,
    queueCount: 2,
    abelEvent: true,
    mimiEvent: true,
    abelQueue: true,
    mimiQueue: true,
    alertCount: 1,
    mimiAlert: true,
    abelAlert: false,
  });

  await expect(page.getByText(/staff sales today/i)).toBeVisible();
  await expect(page.getByText(/^abel$/i).first()).toBeVisible();
  await expect(page.getByText(/^mimi$/i).first()).toBeVisible();
  await expect(page.getByText(/owner alerts/i)).toBeVisible();
  await expect(page.getByText(/10,000|10000/i).first()).toBeVisible();

  await page.locator('nav').getByRole('button', { name: /report/i }).click();
  const search = page.getByPlaceholder(/search/i);

  await search.fill('charger');
  await expect(page.getByText(/charger CH-25/i).first()).toBeVisible();
  await expect(page.getByText(/entered by abel/i)).toBeVisible();

  await search.fill('CH-25');
  await expect(page.getByText(/charger CH-25/i).first()).toBeVisible();

  await search.fill('10,000');
  await expect(page.getByText(/phone case.*glass.*cable/i).first()).toBeVisible();
  await expect(page.getByText(/entered by mimi/i)).toBeVisible();

  await search.fill('Mimi');
  await expect(page.getByText(/phone case.*glass.*cable/i).first()).toBeVisible();

  await search.fill(new Date().toISOString().slice(0, 10));
  await expect(page.getByText(/charger CH-25/i).first()).toBeVisible();
  await expect(page.getByText(/phone case.*glass.*cable/i).first()).toBeVisible();
});

test('shop check summary cards follow the selected time range', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('gebya_lang', 'en'));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await resetDb(page);
  await page.reload({ waitUntil: 'domcontentloaded' });

  await page.getByPlaceholder(/e\.g\. tigist/i).fill('Tigist Shop');
  await page.getByRole('button', { name: /start using gebya/i }).click();

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const makeTx = (amount: number, createdAt: number, item: string) => ({
    type: 'sale',
    amount,
    item_name: item,
    item_note: item,
    quantity: 1,
    created_at: createdAt,
    updated_at: createdAt,
    ethiopian_date: '',
    actor_name_snapshot: 'Owner',
    actor_role: 'owner',
    actor_staff_member_id: null,
  });

  await addLegacyTransaction(page, makeTx(100, yesterday.getTime(), 'yesterday sale'));
  await addLegacyTransaction(page, makeTx(25, now.getTime(), 'today sale'));

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('nav').getByRole('button', { name: /report/i }).click();
  await expect(page.getByRole('heading', { name: /shop check/i })).toBeVisible();

  await expect(page.getByText('25.00').first()).toBeVisible();
  await page.getByRole('button', { name: /^week$/i }).click();
  await expect(page.getByText('125.00').first()).toBeVisible();
});
