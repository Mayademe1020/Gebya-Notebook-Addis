import { useState } from 'react';
import { Download } from 'lucide-react';
import { useLang } from '../../context/LangContext';
import { exportToCSV } from './backup/useBackupData';
import { label } from '../../labels/index.js';

export default function ExportPanel({ transactions }) {
  const { lang } = useLang();
  const [exporting, setExporting] = useState(false);

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      await exportToCSV(transactions, lang);
    } catch { /* ignore */ }
    setExporting(false);
  };

  return (
    <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden">
      <div className="px-5 py-4">
        <button
          onClick={handleExportCSV}
          disabled={exporting}
          className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 min-h-[48px] disabled:opacity-50"
          style={{ background: 'var(--color-surface-muted)', color: 'var(--color-text)' }}
        >
          <Download className="w-4 h-4" />
          {exporting ? (label('settings-data.downloading', lang)) : (label('settings-data.export-to-csv', lang))}
        </button>
      </div>
    </div>
  );
}
