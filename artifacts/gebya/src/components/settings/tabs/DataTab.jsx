import { useState } from 'react';
import BackupDataPanel from '../BackupDataPanel';
import DisplayPrivacyPanel from '../DisplayPrivacyPanel';
import ExportPanel from '../ExportPanel';
import PwaInstallPanel from '../../PwaInstallPanel';
import TabCard from '../TabCard';

export default function DataTab({
  transactions,
  customerSummaries,
  supplierSummaries,
  pwa,
  theme,
  setTheme,
  hidden,
  toggle,
  lang,
}) {
  const totalEntries = (transactions || []).length;
  const dataBadge = totalEntries > 0 ? `${totalEntries}` : (lang === 'am' ? 'ባዶ' : 'Empty');
  const dataTone = totalEntries > 0 ? 'ok' : 'neutral';

  const aboutTapHint = lang === 'am' ? 'ስሪት 1.0' : 'Version 1.0';

  return (
    <div>
      <TabCard
        icon="📲"
        title={lang === 'am' ? 'መተግበሪያውን ይጫኑ' : 'Install App'}
        subtitle={pwa?.isStandalone
          ? (lang === 'am' ? 'ተጭኗል' : 'Installed')
          : (lang === 'am' ? 'ያለ ኢንተርኔት ለመስራት ይጫኑ' : 'Install for offline use')}
        badge={pwa?.isStandalone ? (lang === 'am' ? 'ተጭኗል' : 'Installed') : null}
        badgeTone={pwa?.isStandalone ? 'ok' : null}
        defaultOpen={!pwa?.isStandalone}
      >
        <PwaInstallPanel pwa={pwa} variant="settings" />
      </TabCard>

      <TabCard
        icon="☁️"
        title={lang === 'am' ? 'ምትኬ እና ውሂብ' : 'Backup & Data'}
        subtitle={lang === 'am'
          ? `${totalEntries} መዝገብ`
          : `${totalEntries} entries`}
        badge={dataBadge}
        badgeTone={dataTone}
      >
        <BackupDataPanel
          transactions={transactions}
          customerSummaries={customerSummaries}
          supplierSummaries={supplierSummaries}
        />
      </TabCard>

      <TabCard
        icon="📤"
        title={lang === 'am' ? 'ውሂብ ያስወጡ' : 'Export Data'}
        subtitle={lang === 'am' ? 'ለሂሳብ ወይም ለብድር ማመልከቻ' : 'For accountant or loan application'}
        badgeTone="neutral"
      >
        <ExportPanel
          transactions={transactions}
          customerSummaries={customerSummaries}
          supplierSummaries={supplierSummaries}
        />
      </TabCard>

      <TabCard
        icon="🔔"
        title={lang === 'am' ? 'የዕለታዊ ማስታወሻ' : 'Daily Recording Reminder'}
        subtitle={lang === 'am' ? 'የሽያጭ ማስታወሻ ደውል' : 'Get reminded to record sales'}
        badgeTone="neutral"
      >
        <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden px-5 py-4">
          <label className="flex items-center justify-between cursor-pointer">
            <div className="text-sm text-gray-500">
              {lang === 'am' ? 'በምሽቱ 8 ሰዓት ማሳሰቢያ ይድረስ' : 'Get a push at 8:00 PM'}
            </div>
            <label className="switch">
              <input type="checkbox" />
              <span className="slider" />
            </label>
          </label>
        </div>
      </TabCard>

      <TabCard
        icon="🎨"
        title={lang === 'am' ? 'ማሳያ እና ግላዊነት' : 'Display & Privacy'}
        subtitle={lang === 'am' ? 'ጨለማ/ብርሃን ሁነታ፣ መጠኖችን ደብቅ' : 'Dark/light mode, hide amounts'}
        badgeTone="neutral"
      >
        <DisplayPrivacyPanel />
      </TabCard>

      <TabCard
        icon="ℹ️"
        title={lang === 'am' ? 'ስለ ጌብያ' : 'About Gebya'}
        subtitle={aboutTapHint}
        badgeTone="neutral"
      >
        <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden px-5 py-4 text-sm text-gray-500">
          <p className="font-bold text-gray-800 mb-1">Gebya · የንግድ ማስታወሻ</p>
          <p className="text-xs mb-2">Business Notebook for Ethiopian shopkeepers</p>
          <p className="text-xs" style={{ color: '#9ca3af' }}>
            {lang === 'am' ? 'ሁሉም ውሂብ በዚህ ስልክ ላይ ብቻ ይቀመጣል' : 'All data stays on this phone only'}
          </p>
        </div>
      </TabCard>
    </div>
  );
}
