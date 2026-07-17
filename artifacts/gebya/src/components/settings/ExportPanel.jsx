import { useState } from 'react';
import { Download } from 'lucide-react';
import { useLang } from '../../context/LangContext';
import { exportToJSON, exportToCSV } from './backup/useBackupData';

export default function ExportPanel({ transactions, customerSummaries, supplierSummaries }) {
  const { lang } = useLang();
  const [exporting, setExporting] = useState(null);
  const [lastBackupAt, setLastBackupAt] = useState(null);

  const handleExportCSV = async () => {
    setExporting('csv');
    try {
      await exportToCSV(transactions, lang);
    } catch { /* ignore */ }
    setExporting(null);
  };

  const handleExportJSON = async () => {
    setExporting('json');
    try {
      await exportToJSON(lang, setLastBackupAt);
    } catch { /* ignore */ }
    setExporting(null);
  };

  return (
    <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden">
      <div className="px-5 py-4 space-y-2">
        <button
          onClick={handleExportCSV}
          disabled={exporting === 'csv'}
          className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 min-h-[48px] disabled:opacity-50"
          style={{ background: '#f5f5f5', color: '#374151' }}
        >
          <Download className="w-4 h-4" />
          {exporting === 'csv' ? (lang === 'am' ? 'በማውረድ ላይ...' : 'Downloading...') : (lang === 'am' ? 'ወደ CSV ያውርዱ' : 'Export to CSV')}
        </button>
        <button
          onClick={handleExportJSON}
          disabled={exporting === 'json'}
          className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 min-h-[48px] disabled:opacity-50"
          style={{ background: '#f5f5f5', color: '#374151' }}
        >
          <Download className="w-4 h-4" />
          {exporting === 'json' ? (lang === 'am' ? 'በማውረድ ላይ...' : 'Downloading...') : (lang === 'am' ? 'ወደ JSON ያውርዱ' : 'Export to JSON (full backup)')}
        </button>
      </div>
    </div>
  );
}
