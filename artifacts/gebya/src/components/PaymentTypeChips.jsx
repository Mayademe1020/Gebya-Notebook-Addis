import { useLang } from '../context/LangContext';

export const ALL_BANKS = ['CBE', 'Dashen', 'Awash', 'Abyssinia'];
export const ALL_WALLETS = ['telebirr', 'CBE Birr'];
export const DEFAULT_PROVIDERS = { banks: [...ALL_BANKS], wallets: [...ALL_WALLETS] };

// Flat list: Cash + each enabled bank + each enabled wallet, all in one scrollable row.
// Tap any chip → sets both paymentType + paymentProvider in one shot.
function PaymentTypeChips({ paymentType, provider, onTypeChange, onProviderChange, enabledProviders }) {
  const { t } = useLang();

  const enabledBanks   = enabledProviders?.banks   || ALL_BANKS;
  const enabledWallets = enabledProviders?.wallets || ALL_WALLETS;

  const options = [
    { id: 'cash', label: t.cash, emoji: '💵', type: 'cash', provider: '' },
    ...enabledBanks.map(b => ({
      id: `bank:${b}`,
      label: b,
      emoji: '🏦',
      type: 'bank',
      provider: b,
    })),
    ...enabledWallets.map(w => ({
      id: `wallet:${w}`,
      label: w,
      emoji: '📱',
      type: 'wallet',
      provider: w,
    })),
  ];

  const isSelected = (opt) => {
    if (opt.type === 'cash') return paymentType === 'cash';
    return paymentType === opt.type && provider === opt.provider;
  };

  const handlePick = (opt) => {
    onTypeChange(opt.type);
    onProviderChange(opt.provider);
  };

  return (
    <div>
      <label
        className="block text-[10px] font-bold uppercase tracking-widest mb-1.5"
        style={{ color: '#6b7280' }}
      >
        {t.paymentType}
      </label>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {options.map(opt => {
          const selected = isSelected(opt);
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => handlePick(opt)}
              className="flex-shrink-0 flex items-center justify-center gap-1.5 py-2 px-3 border-2 text-xs font-bold transition-all min-h-[40px] press-scale"
              style={{
                borderRadius: 'var(--radius-sm)',
                borderColor: selected ? '#1B4332' : '#e8e2d8',
                background: selected ? 'rgba(27,67,50,0.08)' : '#fff',
                color: selected ? '#1B4332' : '#6b7280',
                whiteSpace: 'nowrap',
              }}
            >
              <span className="text-sm">{opt.emoji}</span>
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default PaymentTypeChips;
