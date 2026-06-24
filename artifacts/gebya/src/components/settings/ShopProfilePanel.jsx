import { useState, useEffect } from 'react';
import { Store, Phone, MessageCircle, Check } from 'lucide-react';
import { useLang } from '../../context/LangContext';
import { normalizeTelegram } from '../../utils/customerTelegram';
import { isValidSubscriber, extractSubscriberDigits } from '../../utils/phoneNumber';

const BUSINESS_TYPE_OPTIONS_EN = [
  { value: 'retail-shop', label: 'Retail shop' },
  { value: 'shoe-market', label: 'Shoe market' },
  { value: 'flower-shop', label: 'Flower shop' },
  { value: 'women-dress-shop', label: "Women's clothing" },
  { value: 'supermarket', label: 'Supermarket / Minimarket' },
  { value: 'grocery', label: 'Grocery (liquor)' },
  { value: 'electronics', label: 'Electronics / accessories' },
  { value: 'pharmacy', label: 'Pharmacy / cosmetics' },
  { value: 'other', label: 'Other' },
];
const BUSINESS_TYPE_OPTIONS_AM = [
  { value: 'retail-shop', label: 'የችርቻሮ ሱቅ' },
  { value: 'shoe-market', label: 'የጫማ መሸጫ' },
  { value: 'flower-shop', label: 'የአበባ ሱቅ' },
  { value: 'women-dress-shop', label: 'የሴቶች ልብስ ሱቅ' },
  { value: 'supermarket', label: 'ሱፐርማርኬት / ሚኒማርኬት' },
  { value: 'grocery', label: 'ግሮሰሪ' },
  { value: 'electronics', label: 'ኤሌክትሮኒክስ / መለዋወጫዎች' },
  { value: 'pharmacy', label: 'ፋርማሲ / መዋቢያ' },
  { value: 'other', label: 'ሌላ' },
];

export default function ShopProfilePanel({ shopProfile, onProfileSave }) {
  const { lang, t } = useLang();

  const [editName, setEditName] = useState(shopProfile?.name || '');
  const [editPhoneDigits, setEditPhoneDigits] = useState(() => {
    const raw = shopProfile?.phone || '';
    return raw.startsWith('+251') ? raw.slice(4) : raw.replace(/\D/g, '').slice(-9);
  });
  const [editTelegram, setEditTelegram] = useState(shopProfile?.telegram || '');
  const [editBusinessType, setEditBusinessType] = useState(shopProfile?.businessType || 'retail-shop');
  const [profileSaved, setProfileSaved] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);

  useEffect(() => {
    const rawPhone = shopProfile?.phone || '';
    setEditName(shopProfile?.name || '');
    setEditPhoneDigits(rawPhone.startsWith('+251') ? rawPhone.slice(4) : rawPhone.replace(/\D/g, '').slice(-9));
    setEditTelegram(shopProfile?.telegram || '');
    setEditBusinessType(shopProfile?.businessType || 'retail-shop');
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
    await onProfileSave(editName.trim(), fullPhone, normalizedTelegram || '', editBusinessType);
    setEditTelegram(normalizedTelegram || '');
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2000);
  };

  const currentFullPhone = editPhoneDigits ? '+251' + editPhoneDigits : '';
  const profileChanged = (
    editName.trim() !== (shopProfile?.name || '') ||
    currentFullPhone !== (shopProfile?.phone || '') ||
    editTelegram.trim() !== (shopProfile?.telegram || '') ||
    editBusinessType !== (shopProfile?.businessType || 'retail-shop')
  );

  return (
    <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden">
      <div className="px-5 pt-5 pb-4 space-y-3">
        <div className="rounded-xl px-4 py-3 text-xs font-medium" style={{ background: '#FAF8F5', color: '#5b6470', border: '1px solid #e8e2d8' }}>
          {lang === 'am'
            ? 'ይህ የዚህ ስልክ ዋና ባለቤት መለያ ነው። እዚህ የሚደረጉ ለውጦች መላውን ሱቅ ማስታወሻ ይነካሉ።'
            : "This profile is the main owner identity for this phone's notebook. Changes here affect the whole shop notebook."}
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
            style={{ borderColor: editName.trim() ? '#C4883A' : '#e8e2d8' }}
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1">
            <Phone className="w-3.5 h-3.5" /> {t.phoneNumber} <span className="text-gray-400 font-normal">{t.onboardPhoneOptional || '(optional)'}</span>
          </label>
          <div className="flex gap-0">
            <div
              className="flex items-center justify-center px-3 py-3 rounded-l-xl border-2 border-r-0 text-sm font-bold"
              style={{ background: '#f5f0e8', borderColor: (phoneTouched && !phoneValid) ? '#dc2626' : '#e8e2d8', color: '#1B4332', minWidth: '64px' }}
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
              style={{ borderColor: (phoneTouched && !phoneValid) ? '#dc2626' : (phoneValid ? '#C4883A' : '#e8e2d8') }}
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
            style={{ borderColor: telegramValid ? '#e8e2d8' : '#dc2626' }}
          />
          {!telegramValid && (
            <p className="text-xs text-red-500 mt-1 font-medium">{t.telegramFormatHint}</p>
          )}
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1">
            <Store className="w-3.5 h-3.5" /> {lang === 'am' ? 'የንግድ አይነት' : 'Business type'}
          </label>
          <select
            value={editBusinessType}
            onChange={e => setEditBusinessType(e.target.value)}
            className="w-full px-4 py-3 border-2 rounded-xl text-sm font-semibold focus:outline-none bg-white"
            style={{ borderColor: '#e8e2d8' }}
          >
            {(lang === 'am' ? BUSINESS_TYPE_OPTIONS_AM : BUSINESS_TYPE_OPTIONS_EN).map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <p className="text-xs mt-1 font-medium text-gray-400">
            {lang === 'am'
              ? 'ለሱቅዎ ተስማሚ ሃሳቦችን ለመስጠት እንጠቀምበታለን።'
              : 'We use this to tailor suggestions for your shop.'}
          </p>
        </div>

        <button
          onClick={handleProfileSave}
          disabled={!editName.trim() || !phoneValid || !telegramValid || (!profileChanged && !profileSaved)}
          className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all min-h-[48px]"
          style={{
            background: profileSaved ? '#15803d' : (editName.trim() && phoneValid && telegramValid && profileChanged ? '#C4883A' : '#e5e7eb'),
            color: (editName.trim() && phoneValid && telegramValid && (profileChanged || profileSaved)) ? '#fff' : '#9ca3af',
          }}
        >
          {profileSaved ? <><Check className="w-4 h-4" /> {t.saved}</> : t.saveChanges}
        </button>
      </div>
    </div>
  );
}
