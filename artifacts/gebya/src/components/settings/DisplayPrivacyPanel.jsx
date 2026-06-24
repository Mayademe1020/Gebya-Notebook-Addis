import { Eye, EyeOff, Sun, Moon } from 'lucide-react';
import { useLang } from '../../context/LangContext';
import { useTheme } from '../../context/ThemeContext';
import { usePrivacy } from '../../context/PrivacyContext';

export default function DisplayPrivacyPanel() {
  const { lang, t } = useLang();
  const { theme, setTheme } = useTheme();
  const { hidden, toggle } = usePrivacy();

  return (
    <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden divide-y divide-green-100/30">
      {/* Theme row */}
      <div className="px-5 py-3">
        <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#9ca3af' }}>
          {t.appearance}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { id: 'light', label: t.lightMode, icon: Sun },
            { id: 'dark', label: t.darkMode, icon: Moon },
          ].map((option) => {
            const active = theme === option.id;
            const Icon = option.icon;
            return (
              <button
                key={option.id}
                onClick={() => setTheme(option.id)}
                className="flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold min-h-[48px] transition-all"
                style={{
                  background: active ? '#1B4332' : '#f5f5f5',
                  color: active ? '#fff' : '#374151',
                  border: active ? '1px solid #1B4332' : '1px solid #e8e2d8',
                }}
              >
                <Icon className="w-4 h-4" />
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
      {/* Hide amounts toggle */}
      <button
        onClick={toggle}
        className="w-full flex items-center gap-4 px-5 py-4 active:bg-green-50 transition-colors min-h-[64px] text-left"
      >
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: hidden ? 'rgba(196,136,58,0.12)' : '#dcfce7' }}>
          {hidden ? <EyeOff className="w-5 h-5 text-green-800" /> : <Eye className="w-5 h-5 text-green-700" />}
        </div>
        <div className="flex-1">
          <div className="font-bold text-gray-800 text-sm">{t.hideAmounts}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {hidden ? t.totalsHidden : t.totalsVisible}
          </div>
        </div>
        <div className={`w-11 h-6 rounded-full transition-colors flex-shrink-0 flex items-center px-0.5 ${hidden ? 'bg-green-700' : 'bg-gray-200'}`}>
          <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${hidden ? 'translate-x-5' : 'translate-x-0'}`} />
        </div>
      </button>
    </div>
  );
}
