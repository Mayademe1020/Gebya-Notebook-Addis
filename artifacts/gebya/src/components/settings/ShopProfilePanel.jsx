import { useState, useEffect } from 'react';
import { Store, Phone, MessageCircle, Check } from 'lucide-react';
import { useLang } from '../../context/LangContext';
import { normalizeTelegram } from '../../utils/customerTelegram';
import { isValidSubscriber, extractSubscriberDigits } from '../../utils/phoneNumber';
import { label } from '../../labels/index';

export default function ShopProfilePanel({ shopProfile, onProfileSave }) {
  const { lang, t } = useLang();

  const [editName, setEditName] = useState(shopProfile?.name || '');
  const [editPhoneDigits, setEditPhoneDigits] = useState(() => {
    const raw = shopProfile?.phone || '';
    return raw.startsWith('+251') ? raw.slice(4) : raw.replace(/\D/g, '').slice(-9);
  });
  const [editTelegram, setEditTelegram] = useState(shopProfile?.telegram || '');
  const [profileSaved, setProfileSaved] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);

  useEffect(() => {
    const rawPhone = shopProfile?.phone || '';
    setEditName(shopProfile?.name || '');
    setEditPhoneDigits(rawPhone.startsWith('+251') ? rawPhone.slice(4) : rawPhone.replace(/\D/g, '').slice(-9));
    setEditTelegram(shopProfile?.telegram || '');
  }, [shopProfile]);

  const phoneValid = !editPhoneDigits || isValidSubscriber(editPhoneDigits);
  const normalizedTelegram = normalizeTelegram(editTelegram);
  const telegramValid = !editTelegram.trim() || !!normalizedTelegram;

  const handlePhoneChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (raw.length <= 9) setEditPhoneDigits(raw);
  };

  const handleProfileSave = async () => {
    if (!editName.trim() || !phoneValid || !telegramValid) return;
    const fullPhone = editPhoneDigits ? '+251' + editPhoneDigits : '';
    await onProfileSave(editName.trim(), fullPhone, normalizedTelegram || '');
    setEditTelegram(normalizedTelegram || '');
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2000);
  };

  const currentFullPhone = editPhoneDigits ? '+251' + editPhoneDigits : '';
  const profileChanged = (
    editName.trim() !== (shopProfile?.name || '') ||
    currentFullPhone !== (shopProfile?.phone || '') ||
    editTelegram.trim() !== (shopProfile?.telegram || '')
  );

  return (
    <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden">
      <div className="px-5 pt-5 pb-4 space-y-3">
        <div className="rounded-xl px-4 py-3 text-xs font-medium" style={{ background: 'var(--color-surface-muted)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
          {label('settings-shop.this-profile-is-the-main-owner-identity-for', lang)}
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1">
            <Store className="w-3.5 h-3.5" /> {t.userName} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={editName}
            onChange={e => setEditName(e.target.value)}
            placeholder={t.onboardNamePlaceholder || 'e.g. Tigist'}
            className="w-full px-4 py-3 border-2 rounded-xl text-sm font-semibold focus:outline-none"
            style={{ borderColor: editName.trim() ? 'var(--color-accent-amber)' : 'var(--color-border)' }}
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1">
            <Phone className="w-3.5 h-3.5" /> {t.phoneNumber} <span className="text-gray-400 font-normal">{t.onboardPhoneOptional || '(optional)'}</span>
          </label>
          <div className="flex gap-0">
            <div
              className="flex items-center justify-center px-3 py-3 rounded-l-xl border-2 border-r-0 text-sm font-bold"
              style={{ background: 'var(--color-surface-muted)', borderColor: (phoneTouched && !phoneValid) ? 'var(--color-danger)' : 'var(--color-border)', color: 'var(--color-primary)', minWidth: '64px' }}
            >
              +251
            </div>
            <input
              type="tel"
              inputMode="numeric"
              value={editPhoneDigits}
              onChange={handlePhoneChange}
              onBlur={() => setPhoneTouched(true)}
              placeholder="9XXXXXXXX"
              maxLength={9}
              className="flex-1 px-4 py-3 border-2 rounded-r-xl text-sm focus:outline-none"
              style={{ borderColor: (phoneTouched && !phoneValid) ? 'var(--color-danger)' : (phoneValid ? 'var(--color-accent-amber)' : 'var(--color-border)') }}
            />
          </div>
          {phoneTouched && !phoneValid && editPhoneDigits.length > 0 && (
            <p className="text-xs text-red-500 mt-1 font-medium">{t.phoneInvalid}</p>
          )}
          {editPhoneDigits.length === 0 && (
            <p className="text-xs mt-1 font-medium text-gray-400">{t.onboardPhoneHelper || 'You can add your phone later in Settings.'}</p>
          )}
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1">
            <MessageCircle className="w-3.5 h-3.5" /> {t.telegramLabel}
          </label>
          <input
            type="text"
            value={editTelegram}
            onChange={e => setEditTelegram(e.target.value)}
            placeholder={t.telegramPlaceholder}
            className="w-full px-4 py-3 border-2 rounded-xl text-sm focus:outline-none"
            style={{ borderColor: telegramValid ? 'var(--color-border)' : 'var(--color-danger)' }}
          />
          {!telegramValid && (
            <p className="text-xs text-red-500 mt-1 font-medium">{t.telegramFormatHint}</p>
          )}
        </div>

        <button
          onClick={handleProfileSave}
          disabled={!editName.trim() || !phoneValid || !telegramValid || (!profileChanged && !profileSaved)}
          className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all min-h-[48px]"
          style={{
            background: profileSaved ? 'var(--color-success-text)' : (editName.trim() && phoneValid && telegramValid && profileChanged ? 'var(--color-accent-amber)' : 'var(--color-bg-disabled)'),
            color: (editName.trim() && phoneValid && telegramValid && (profileChanged || profileSaved)) ? 'var(--color-bg-white)' : 'var(--color-text-muted)',
          }}
        >
          {profileSaved ? <><Check className="w-4 h-4" /> {t.saved}</> : t.saveChanges}
        </button>
      </div>
    </div>
  );
}
