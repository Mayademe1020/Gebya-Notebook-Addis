export const QUICK_NOTE_TYPES = [
  'dubie',
  'supplier',
  'cheque',
  'payment_proof',
  'staff',
  'buy_stock',
  'other',
];

export const QUICK_NOTE_STATUSES = {
  PENDING: 'pending',
  DONE: 'done',
  DISMISSED: 'dismissed',
  CONVERTED: 'converted',
};

export function normalizeQuickNoteType(value) {
  const legacyMap = {
    customer_credit: 'dubie',
    supplier_payment: 'supplier',
    cheque_reminder: 'cheque',
    pickup_delivery: 'other',
    other_note: 'other',
  };
  const nextValue = legacyMap[value] || value;
  return QUICK_NOTE_TYPES.includes(nextValue) ? nextValue : 'other';
}

export function normalizeQuickNoteDraft(payload = {}) {
  const rawText = String(payload.raw_text || payload.rawText || '').trim();
  const status = Object.values(QUICK_NOTE_STATUSES).includes(payload.status)
    ? payload.status
    : QUICK_NOTE_STATUSES.PENDING;
  return {
    raw_text: rawText,
    type: normalizeQuickNoteType(payload.type),
    status,
    due_date: Number(payload.due_date) > 0 ? Number(payload.due_date) : null,
    amount: Number(payload.amount) > 0 ? Number(payload.amount) : null,
    person_name: String(payload.person_name || '').trim() || null,
    note: String(payload.note || '').trim() || null,
  };
}

export function isPendingQuickNote(note) {
  return note?.status === QUICK_NOTE_STATUSES.PENDING;
}

function startOfLocalDay(ms) {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function endOfLocalDay(ms) {
  return startOfLocalDay(ms) + (24 * 60 * 60 * 1000);
}

export function buildQuickNoteDueActions(notes = [], referenceMs = Date.now()) {
  const todayStart = startOfLocalDay(referenceMs);
  const tomorrowStart = endOfLocalDay(referenceMs);
  const dueNotes = notes.filter((note) => isPendingQuickNote(note) && Number(note.due_date || 0) > 0);
  const mapNote = (note) => ({
    ...note,
    action_kind: 'quick_note',
    title: note.person_name || note.raw_text,
    amount: Number(note.amount || 0) || null,
    note: note.raw_text,
  });

  return {
    dueToday: dueNotes
      .filter((note) => note.due_date >= todayStart && note.due_date < tomorrowStart)
      .map(mapNote)
      .sort((a, b) => Number(a.due_date || 0) - Number(b.due_date || 0)),
    overdue: dueNotes
      .filter((note) => note.due_date < todayStart)
      .map(mapNote)
      .sort((a, b) => Number(a.due_date || 0) - Number(b.due_date || 0)),
  };
}

export function sortQuickNotes(notes = []) {
  return [...notes].sort((a, b) => {
    if ((a.status === QUICK_NOTE_STATUSES.PENDING) !== (b.status === QUICK_NOTE_STATUSES.PENDING)) {
      return a.status === QUICK_NOTE_STATUSES.PENDING ? -1 : 1;
    }
    return (Number(b.updated_at || b.created_at) || 0) - (Number(a.updated_at || a.created_at) || 0);
  });
}

export function quickNoteTypeLabel(type, lang = 'en') {
  const labels = {
    dubie: { en: 'Dubie', am: 'Dubie' },
    supplier: { en: 'Supplier', am: 'Supplier' },
    cheque: { en: 'Cheque', am: 'Cheque' },
    payment_proof: { en: 'Payment proof', am: 'Payment proof' },
    staff: { en: 'Staff', am: 'Staff' },
    buy_stock: { en: 'Buy stock', am: 'Buy stock' },
    other: { en: 'Other', am: 'Other' },
  };
  return labels[normalizeQuickNoteType(type)]?.[lang === 'am' ? 'am' : 'en'] || labels.other.en;
}
