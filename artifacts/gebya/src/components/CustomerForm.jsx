import { useCallback, useEffect, useState } from 'react';
import { Save, X } from 'lucide-react';
import { useLang } from '../context/LangContext';
import { normalizeTelegram } from '../utils/customerTelegram';

function readContactName(contact) {
  if (Array.isArray(contact?.name) && contact.name[0]) return contact.name[0];
  if (contact?.name) return String(contact.name);
  return '';
}

function readContactPhone(contact) {
  if (Array.isArray(contact?.tel) && contact.tel[0]) return contact.tel[0];
  if (contact?.tel) return String(contact.tel);
  return '';
}

function CustomerForm({ onSave, onDone }) {
  const { t } = useLang();
  const [displayName, setDisplayName] = useState('');
  const [note, setNote] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [telegramUsername, setTelegramUsername] = useState('');
  const [contactsSupported, setContactsSupported] = useState(false);
  const [saving, setSaving] = useState(false);

  const phoneValid = !phoneDigits || /^[79]\d{8}$/.test(phoneDigits);
  const phoneEntered = phoneDigits.length > 0;

  useEffect(() => {
    const canPickContacts = typeof navigator !== 'undefined'
      && Boolean(navigator.contacts?.select)
      && Boolean(navigator.ContactsManager);
    setContactsSupported(canPickContacts);
  }, []);

  const normalizedTelegram = normalizeTelegram(telegramUsername);
  const telegramValid = !telegramUsername.trim() || !!normalizedTelegram;
  const canSave = displayName.trim().length > 0 && telegramValid;

  const handlePickContact = useCallback(async () => {
    if (!contactsSupported || !navigator.contacts?.select) return;

    try {
      const [contact] = await navigator.contacts.select(['name', 'tel'], { multiple: false });
      if (!contact) return;

      const pickedName = readContactName(contact).trim();
      const pickedPhone = readContactPhone(contact).trim();

      if (pickedName && !displayName.trim()) setDisplayName(pickedName);
      if (pickedPhone) {
        const cleaned = pickedPhone.replace(/\D/g, '');
        if (cleaned.length === 9) {
          setPhoneDigits(cleaned);
        } else if (cleaned.length === 10 && (cleaned.startsWith('0'))) {
          setPhoneDigits(cleaned.slice(1));
        }
      }
    } catch {
    }
  }, [contactsSupported, displayName]);

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const fullPhone = phoneEntered && phoneValid ? '+251' + phoneDigits : null;
      const didSave = await onSave?.({
        display_name: displayName.trim(),
        note: note.trim() || null,
        phone_number: fullPhone,
        telegram_username: normalizedTelegram || null,
        telegram_notify_enabled: false,
      });
      if (didSave) onDone?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 animate-fade">
      <div className="bg-white w-full max-w-md max-h-[92vh] overflow-y-auto animate-slide-up" style={{ borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0', boxShadow: 'var(--shadow-lg)' }}>
        <div className="sticky top-0 bg-white z-10 px-6 pt-5 pb-4 border-b" style={{ borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0', borderColor: 'var(--color-border-light)' }}>
          <div className="flex justify-between items-center gap-3">
            <div>
              <h2 className="text-xl font-black text-gray-900">New customer</h2>
              <p className="text-sm mt-1" style={{ color: '#6b7280' }}>Reminders need contact info.</p>
            </div>
            <button onClick={onDone} aria-label={t.close} className="p-2 rounded-full hover:bg-gray-100 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center press-scale">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-gray-700 font-semibold mb-2">
              Customer name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Customer name"
              autoFocus
              className="w-full p-4 border-2 focus:outline-none text-base min-h-[52px]"
              style={{ borderRadius: 'var(--radius-md)', borderColor: displayName.trim() ? '#1B4332' : '#e8e2d8' }}
            />
          </div>

          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
              <label className="block text-gray-700 font-semibold">
                Mobile number
              </label>
              <button
                type="button"
                onClick={handlePickContact}
                disabled={!contactsSupported}
                className="px-3 py-2 text-xs font-black border min-h-[40px] press-scale disabled:opacity-45 disabled:cursor-not-allowed"
                style={{ background: contactsSupported ? '#eff6ff' : '#f9fafb', color: contactsSupported ? '#1d4ed8' : '#9ca3af', borderColor: contactsSupported ? '#bfdbfe' : '#e5e7eb', borderRadius: 'var(--radius-sm)' }}
              >
                Pick from contacts
              </button>
            </div>
            <div className="flex gap-0">
              <div
                className="flex items-center justify-center px-3 py-3 border-2 border-r-0 text-sm font-bold flex-shrink-0"
                style={{ background: 'rgba(27,67,50,0.06)', borderColor: (phoneTouched && phoneEntered && !phoneValid) ? '#dc2626' : '#e8e2d8', color: '#1B4332', minWidth: '64px', borderRadius: 'var(--radius-sm) 0 0 var(--radius-sm)' }}
              >
                +251
              </div>
              <input
                type="tel"
                inputMode="numeric"
                value={phoneDigits}
                onChange={(e) => {
                  let raw = e.target.value.replace(/\D/g, '');
                  if (raw.length === 10 && (raw.startsWith('07') || raw.startsWith('09'))) {
                    raw = raw.slice(1);
                  }
                  if (raw.length <= 9) setPhoneDigits(raw);
                }}
                onBlur={() => setPhoneTouched(true)}
                placeholder="9XXXXXXXX"
                maxLength={9}
                className="flex-1 p-3 border-2 text-base focus:outline-none min-h-[48px]"
                style={{ borderRadius: '0 var(--radius-sm) var(--radius-sm) 0', borderColor: (phoneTouched && phoneEntered && !phoneValid) ? '#dc2626' : (phoneEntered && phoneValid ? '#1B4332' : '#e8e2d8') }}
              />
            </div>
            {phoneTouched && phoneEntered && !phoneValid && (
              <p className="text-xs mt-1.5 font-medium text-red-600">
                Phone must start with 7 or 9 (9 digits)
              </p>
            )}
            {!phoneEntered && (
              <p className="text-xs mt-1.5 font-medium" style={{ color: '#b45309' }}>
                SMS reminders need a mobile number.
              </p>
            )}
          </div>

          <div>
            <label className="block text-gray-700 font-semibold mb-2">
              Telegram
            </label>
            <input
              type="text"
              value={telegramUsername}
              onChange={(e) => setTelegramUsername(e.target.value)}
              placeholder="@username or t.me/name"
              className="w-full p-4 border-2 focus:outline-none text-base min-h-[52px]"
              style={{ borderRadius: 'var(--radius-md)', borderColor: telegramValid ? '#e8e2d8' : '#dc2626' }}
            />
            {!telegramValid && (
              <p className="text-xs font-medium mt-2 text-red-600">
                {t.telegramFormatHint}
              </p>
            )}
            <p className="text-xs mt-2" style={{ color: '#6b7280' }}>
              Bot connection can be added later.
            </p>
          </div>

          <div>
            <label className="block text-gray-700 font-semibold mb-2">
              Note
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note"
              rows={3}
              className="w-full p-3 border-2 focus:outline-none text-sm resize-none"
              style={{ borderRadius: 'var(--radius-md)', borderColor: '#e8e2d8' }}
            />
          </div>
        </div>

        <div className="px-6 pb-8 pt-2">
          <button onClick={handleSave} disabled={!canSave || saving} className="w-full p-4 font-black text-white text-base flex items-center justify-center gap-2 min-h-[56px] press-scale" style={{ background: canSave ? '#1B4332' : '#e5e7eb', color: canSave ? '#fff' : '#9ca3af', borderRadius: 'var(--radius-md)', boxShadow: canSave ? '0 4px 0 #0f2b20, var(--shadow-sm)' : 'none' }}>
            <Save className="w-5 h-5" />
            {saving ? t.saving : 'Save customer'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CustomerForm;

