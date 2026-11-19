import { lazy, Suspense, useEffect, useState } from 'react';
import BackupDataPanel from '../BackupDataPanel';
import DisplayPrivacyPanel from '../DisplayPrivacyPanel';
import ExportPanel from '../ExportPanel';
import PwaInstallPanel from '../../PwaInstallPanel';
import SyncStatusIndicator from '../../SyncStatusIndicator';
import TabCard from '../TabCard';
import ReminderSettings from '../ReminderSettings';
import NotificationPreferences from '../NotificationPreferences';
import PasswordSettings from '../PasswordSettings';
import { isErrorReportingEnabled, setErrorReportingPreference } from '../../../sentry';
import { label } from '../../../labels/index.js';

// Build info injected at bundle time by Vite
const BUILD_VERSION = import.meta.env?.VITE_APP_VERSION || 'dev';
const BUILD_DATE = import.meta.env?.VITE_BUILD_DATE || '';

export default function DataTab({
  pwa,
  transactions,
  customerSummaries,
  lang,
  shopId,
}) {
  const totalEntries = (transactions || []).length;
  const dataBadge = totalEntries > 0 ? `${totalEntries}` : (label('settings-data.empty', lang));
  const dataTone = totalEntries > 0 ? 'ok' : 'neutral';

  // Error-reporting consent (Sentry). Default ON, user can switch off.
  const [errorReporting, setErrorReportingState] = useState(true);
  useEffect(() => {
    setErrorReportingState(isErrorReportingEnabled());
  }, []);

  const toggleErrorReporting = () => {
    const next = !errorReporting;
    setErrorReportingPreference(next);
    setErrorReportingState(next);
  };

  return (
    <div>
      {/* Reminders, notification prefs, and password — rendered ONCE, here at
          the top of the Data tab. These used to be rendered outside the tab
          panels in SettingsPage, which duplicated them on every tab. */}
      <div className="mt-4">
        <ReminderSettings shopId={shopId} lang={lang} />
      </div>
      <div className="mt-4">
        <NotificationPreferences lang={lang} />
      </div>
      <div className="mt-4">
        <PasswordSettings lang={lang} />
      </div>

      {/* Your Data — backup + export combined */}
      <TabCard
        icon="📦"
        title={label('settings-data.your-data', lang)}
        subtitle={label('settings-data.entries-backup-export', lang, totalEntries)}
        badge={dataBadge}
        badgeTone={dataTone}
      >
        <BackupDataPanel
          transactions={transactions}
          customerSummaries={customerSummaries}
        />
        <div className="mt-3">
          <ExportPanel transactions={transactions} />
        </div>
      </TabCard>

      {/* Display & Privacy */}
      <TabCard
        icon="🎨"
        title={label('settings-data.display-privacy', lang)}
        subtitle={label('settings-data.dark-light-mode-hide-amounts', lang)}
        badgeTone="neutral"
      >
        <DisplayPrivacyPanel />
        <div
          className="mt-3 flex items-center justify-between gap-3 px-4 py-3 rounded-xl"
          style={{ background: 'var(--color-surface-soft, #f6f6f4)', border: '1px solid var(--color-border-light)' }}
        >
          <div className="min-w-0">
            <p className="text-xs font-bold text-gray-700">
              {label('settings-data.error-usage-reporting', lang)}
            </p>
            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              {label('settings-data.helps-fix-crashes-and-improve-the-app-never', lang)}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={errorReporting}
            aria-label={label('settings-data.error-usage-reporting', lang)}
            onClick={toggleErrorReporting}
            className="flex-shrink-0 relative inline-flex h-7 w-12 items-center rounded-full transition-colors"
            style={{ background: errorReporting ? 'var(--color-primary, #1B4332)' : 'var(--color-bg-disabled, #d9d9d4)' }}
          >
            <span
              className="inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform"
              style={{ transform: errorReporting ? 'translateX(26px)' : 'translateX(3px)' }}
            />
          </button>
        </div>
      </TabCard>

      {/* Install App */}
      {pwa && pwa.shouldShowInstallPrompt && (
        <TabCard
          icon="📲"
          title={label('settings-data.install-the-app', lang)}
          subtitle={label('settings-data.use-it-like-a-native-app-works-offline-too', lang)}
          badgeTone="neutral"
        >
          <PwaInstallPanel pwa={pwa} />
        </TabCard>
      )}

      {/* Sync Status */}
      <TabCard
        icon="☁️"
        title={label('settings-data.sync-status', lang)}
        subtitle={label('settings-data.cloud-sync-status-backup', lang)}
        badgeTone="neutral"
      >
        <SyncStatusIndicator onSyncNow />
      </TabCard>

      {/* Help & Support */}
      <TabCard
        icon="❓"
        title={label('settings-data.help-support', lang)}
        subtitle={label('settings-data.get-answers-report-a-problem', lang)}
        badgeTone="neutral"
      >
        <div className="space-y-3">
          {/* FAQ */}
          <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden px-5 py-4 text-sm text-gray-500">
            <p className="font-bold text-gray-800 mb-2">{label('settings-data.common-questions', lang)}</p>
            <div className="space-y-2">
              <div>
                <p className="text-xs font-bold text-gray-700">{label('settings-data.how-do-i-remind-a-customer-about-dubie', lang)}</p>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {label('settings-data.open-the-customer-tap-remind-choose-telegram', lang)}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-gray-700">{label('settings-data.how-do-i-add-a-discount-to-a-sale', lang)}</p>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {label('settings-data.while-recording-a-sale-tap-add-discount', lang)}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-gray-700">{label('settings-data.where-is-my-data-stored', lang)}</p>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {label('settings-data.all-data-stays-on-this-phone-only-nothing-is', lang)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </TabCard>

      {/* About Gebya */}
      <TabCard
        icon="ℹ️"
        title={label('settings-data.about-gebya', lang)}
        subtitle={BUILD_VERSION}
        badgeTone="neutral"
      >
        <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden px-5 py-4 text-sm text-gray-500">
          <p className="font-bold text-gray-800 mb-1">Gebya · የንግድ ማስታወሻ</p>
          <p className="text-xs mb-2">Business Notebook for Ethiopian shopkeepers</p>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {label('settings-data.all-data-stays-on-this-phone-only', lang)}
          </p>
          {BUILD_DATE && (
            <p className="text-[10px] mt-2" style={{ color: 'var(--color-text-soft)' }}>
              {label('settings-data.built', lang)}: {BUILD_DATE}
            </p>
          )}
        </div>
      </TabCard>
    </div>
  );
}
