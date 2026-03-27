import Dexie from 'dexie';

export const db = new Dexie('GebyaDB');

db.version(1).stores({
  transactions: '++id, type, amount, item_name, cost_price, quantity, profit, is_credit, customer_id, customer_name, created_at, ethiopian_date',
  customers: '++id, name, phone, total_debt',
  credit_records: '++id, customer_id, customer_name, original_amount, paid_amount, remaining_amount, due_date, status, created_at',
  settings: 'key, value'
});

db.version(2).stores({
  transactions: '++id, type, amount, item_name, cost_price, quantity, profit, is_credit, customer_id, customer_name, created_at, ethiopian_date',
  customers: '++id, name, phone, total_debt',
  credit_records: '++id, customer_id, customer_name, original_amount, paid_amount, remaining_amount, due_date, status, created_at',
  settings: 'key, value'
});

db.version(3).stores({
  transactions: '++id, type, amount, item_name, cost_price, quantity, profit, is_credit, customer_id, customer_name, created_at, ethiopian_date, payment_type, payment_provider, updated_at',
  customers: '++id, name, phone, total_debt',
  credit_records: '++id, customer_id, customer_name, original_amount, paid_amount, remaining_amount, due_date, status, created_at, direction',
  settings: 'key, value'
});

db.version(4).stores({
  transactions: '++id, type, amount, item_name, cost_price, quantity, profit, is_credit, customer_id, customer_name, created_at, ethiopian_date, payment_type, payment_provider, updated_at',
  customers: '++id, name, phone, total_debt',
  credit_records: '++id, customer_id, customer_name, original_amount, paid_amount, remaining_amount, due_date, status, created_at, direction',
  settings: 'key, value',
  analytics: 'key, value',
});

db.version(5).stores({
  transactions: '++id, type, amount, item_name, cost_price, quantity, profit, is_credit, customer_id, customer_name, created_at, ethiopian_date, payment_type, payment_provider, updated_at, source',
  customers: '++id, name, phone, total_debt',
  credit_records: '++id, customer_id, customer_name, original_amount, paid_amount, remaining_amount, due_date, status, created_at, direction',
  settings: 'key, value',
  analytics: 'key, value',
});

db.version(6).stores({
  transactions: '++id, type, amount, item_name, cost_price, quantity, profit, is_credit, customer_id, customer_name, created_at, ethiopian_date, payment_type, payment_provider, updated_at, source, raw_transcript, detected_total, was_edited, transcription_provider, parsing_confidence, voice_note, raw_audio_ref',
  customers: '++id, name, phone, total_debt',
  credit_records: '++id, customer_id, customer_name, original_amount, paid_amount, remaining_amount, due_date, status, created_at, direction',
  settings: 'key, value',
  analytics: 'key, value',
});

db.version(7).stores({
  transactions: '++id, type, amount, item_name, cost_price, quantity, profit, is_credit, customer_id, customer_name, created_at, ethiopian_date, payment_type, payment_provider, updated_at, source, raw_transcript, detected_total, was_edited, transcription_provider, parsing_confidence, voice_note, raw_audio_ref',
  customers: '++id, name, phone, total_debt',
  credit_records: '++id, customer_id, customer_name, original_amount, paid_amount, remaining_amount, due_date, status, created_at, direction',
  settings: 'key, value',
  analytics: 'key, value',
  credit_payment_logs: '++id, credit_record_id, amount, payment_method, paid_at',
});

db.version(8).stores({
  transactions: '++id, type, amount, item_name, cost_price, quantity, profit, is_credit, customer_id, customer_name, created_at, ethiopian_date, payment_type, payment_provider, updated_at, source, raw_transcript, detected_total, was_edited, transcription_provider, parsing_confidence, voice_note, raw_audio_ref',
  customers: '++id, name, phone, total_debt',
  credit_records: '++id, customer_id, customer_name, original_amount, paid_amount, remaining_amount, due_date, status, created_at, direction',
  settings: 'key, value',
  analytics: 'key, value',
  credit_payment_logs: '++id, credit_record_id, amount, payment_method, paid_at',
});

db.version(9).stores({
  transactions: '++id, type, amount, item_name, cost_price, quantity, profit, is_credit, customer_id, customer_name, created_at, ethiopian_date, payment_type, payment_provider, updated_at, source, raw_transcript, detected_total, was_edited, transcription_provider, parsing_confidence, voice_note, raw_audio_ref',
  customers: '++id, display_name, note, phone_number, telegram_username, telegram_chat_id, created_at, updated_at',
  customer_transactions: '++id, customer_id, type, amount, due_date, created_at, updated_at',
  settings: 'key, value',
  analytics: 'key, value',
});

db.on('ready', async () => {
  const privacySetting = await db.settings.get('privacy_mode');
  if (!privacySetting) {
    await db.settings.put({ key: 'privacy_mode', value: 'hidden' });
  }
});

export default db;
