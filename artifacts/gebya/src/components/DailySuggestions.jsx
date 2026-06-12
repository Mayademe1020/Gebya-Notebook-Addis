import { useLang } from '../context/LangContext';

const SUGGESTIONS_EN = [
  {
    id: 'no_sales',
    condition: (sales) => sales === 0,
    icon: '💰',
    message: () => "No sales recorded today — add one?",
    action: 'sale',
    actionLabel: 'Record a Sale',
  },
  {
    id: 'no_expenses',
    condition: (sales, expenses) => sales > 0 && expenses === 0,
    icon: '🛒',
    message: () => "No expenses recorded today — add one?",
    action: 'expense',
    actionLabel: 'Record Expense',
  },
];

const SUGGESTIONS_AM = [
  {
    id: 'no_sales',
    condition: (sales) => sales === 0,
    icon: '💰',
    message: () => "ዛሬ ሽያጭ አልተመዘገበም — ይጨምሩ?",
    action: 'sale',
    actionLabel: 'ሽያጭ ምዝግብ',
  },
  {
    id: 'no_expenses',
    condition: (sales, expenses) => sales > 0 && expenses === 0,
    icon: '🛒',
    message: () => "ዛሬ ወጪ አልተመዘገበም — ይጨምሩ?",
    action: 'expense',
    actionLabel: 'ወጪ ምዝግብ',
  },
];

export default function DailySuggestions({ todayTransactions, onAction }) {
  const { lang } = useLang();
  const suggestions = lang === 'am' ? SUGGESTIONS_AM : SUGGESTIONS_EN;

  const salesCount = todayTransactions.filter(tx => tx.type === 'sale').length;
  const expensesCount = todayTransactions.filter(tx => tx.type === 'expense').length;

  const suggestion = suggestions.find(s => s.condition(salesCount, expensesCount));

  if (!suggestion) return null;

  const message = suggestion.message(salesCount, expensesCount);

  return (
    <div
      className="px-4 py-3 flex items-center gap-3 animate-elastic"
      style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-xs)' }}
    >
      <span className="text-2xl flex-shrink-0">{suggestion.icon}</span>
      <p className="flex-1 text-sm text-gray-600 font-medium leading-snug font-sans">{message}</p>
      <button
        onClick={() => onAction(suggestion.action)}
        className="flex-shrink-0 px-3 py-2 text-xs font-bold text-white transition-all press-scale font-sans"
        style={{ background: '#1B4332', borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-xs)' }}
      >
        {suggestion.actionLabel}
      </button>
    </div>
  );
}
