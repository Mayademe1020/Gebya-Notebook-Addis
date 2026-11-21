import { useCallback, useEffect, useState } from 'react';
import { History, RefreshCw } from 'lucide-react';
import { useLang } from '../../../context/LangContext';
import { fireToast } from '../../Toast';
import ConfirmDialog from '../../ConfirmDialog';
import { label } from '../../../labels/index.js';
import { formatEthiopian } from '../../../utils/ethiopianCalendar';
import { listCloudSnapshots, downloadCloudSnapshot, restoreSnapshot, restoreLocalSafetySnapshot } from '../../../utils/cloudBackups';
import { getLocalSafetySnapshot } from '../../../utils/localSafetyBackup';

function tableCounts(tables = {}) {
  const size = (name) => (Array.isArray(tables[name]) ? tables[name].length : 0);
  return {
    transactions: size('transactions'),
    customers: size('customers'),
    suppliers: size('suppliers'),
  };
}

function formatDate(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '';
  return formatEthiopian(date);
}

/**
 * The server-side half of backup & restore.
 *
 * The app has always uploaded snapshots; until now nothing listed or restored
 * them, so "log in and your khata comes back" was not true. This section lists
 * what the server holds and restores one in a tap — taking a local copy of the
 * data it replaces first, so a wrong tap is recoverable.
 */
export default function CloudBackupHistory() {
  const { lang } = useLang();

  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [snapshots, setSnapshots] = useState([]);
  const [errorMessage, setErrorMessage] = useState(null);
  const [previous, setPrevious] = useState(null);
  const [busyId, setBusyId] = useState(null); // snapshot id being downloaded
  const [pending, setPending] = useState(null); // downloaded, awaiting confirm
  const [step, setStep] = useState(0);

  const load = useCallback(async () => {
    setStatus('loading');
    setErrorMessage(null);
    const [list, safety] = await Promise.all([listCloudSnapshots(), getLocalSafetySnapshot()]);
    setPrevious(safety);
    if (list.ok) {
      setSnapshots(list.snapshots);
      setStatus('ready');
      return;
    }
    setSnapshots([]);
    setErrorMessage(list.error);
    setStatus('error');
  }, []);

  useEffect(() => { load(); }, [load]);

  const closeConfirm = () => {
    setStep(0);
    setPending(null);
  };

  const runRestore = async (restore) => {
    try {
      const result = await restore();
      if (!result.ok) {
        fireToast(label('settings-data.restore-failed', lang), 2600);
        closeConfirm();
        return;
      }
      fireToast(label('settings-data.restored-reloading', lang), 1800);
      setStep(0);
      setPending(null);
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Cloud restore failed:', err);
      fireToast(label('settings-data.restore-failed', lang), 2600);
      closeConfirm();
    }
  };

  const handleRestoreTap = async (snapshot) => {
    setBusyId(snapshot.id);
    const result = await downloadCloudSnapshot(snapshot.id);
    setBusyId(null);
    if (!result.ok) {
      if (result.error === 'offline') fireToast(label('sync.offline', lang), 2400);
      else if (result.error === 'invalid' || result.error === 'not-found') {
        fireToast(label('settings-data.invalid-backup-file', lang), 2400);
      } else if (result.error === 'unauthorized') {
        fireToast(label('settings-data.restore-failed', lang), 2600);
      } else {
        fireToast(label('settings-data.restore-failed', lang), 2600);
      }
      return;
    }
    setPending({ kind: 'cloud', ...result.snapshot });
    setStep(1);
  };

  const handlePreviousTap = () => {
    if (!previous) return;
    const counts = tableCounts(previous.data?.tables);
    setPending({ kind: 'local', counts, createdAt: previous.created_at, recordCount: previous.record_count });
    setStep(1);
  };

  const renderRow = (row, { current = false, onRestore, busy = false } = {}) => (
    <div key={row.key} className="px-5 py-4 flex items-center gap-4">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--color-bg-hover)' }}>
        <History className="w-5 h-5 text-gray-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-gray-800 truncate">{formatDate(row.date)}</div>
        <div className="text-xs text-gray-500 mt-0.5">
          {row.recordCount} {label('admin.records', lang)}
          {current ? ` · ${label('history.current', lang)}` : ''}
        </div>
      </div>
      <button
        onClick={onRestore}
        disabled={busy}
        className="px-4 py-2 rounded-xl text-sm font-bold min-h-[44px] press-scale disabled:opacity-50"
        style={{ background: 'var(--color-surface-muted)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
      >
        {busy ? label('settings-data.downloading', lang) : label('customers.restore', lang)}
      </button>
    </div>
  );

  return (
    <>
      <div className="px-5 py-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--color-bg-hover)' }}>
          <History className="w-5 h-5 text-gray-600" />
        </div>
        <div className="flex-1">
          <div className="font-bold text-gray-800">{label('settings-backup.title', lang)}</div>
        </div>
        <button
          onClick={load}
          disabled={status === 'loading'}
          aria-label={label('admin.refresh', lang)}
          className="w-10 h-10 rounded-xl flex items-center justify-center press-scale disabled:opacity-40"
          style={{ background: 'var(--color-surface-muted)' }}
        >
          <RefreshCw className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      {status === 'loading' && (
        <div className="px-5 py-4 text-sm text-gray-500">{label('admin.loading', lang)}</div>
      )}

      {status === 'error' && (
        <div className="px-5 py-4">
          <div className="text-sm text-gray-500">
            {errorMessage === 'offline' ? label('sync.offline', lang) : label('settings-backup.could-not-load', lang)}
          </div>
          <button
            onClick={load}
            className="mt-2 px-4 py-2 rounded-xl text-sm font-bold min-h-[44px] press-scale"
            style={{ background: 'var(--color-surface-muted)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
          >
            {label('admin.retry', lang)}
          </button>
        </div>
      )}

      {status === 'ready' && snapshots.length === 0 && (
        <div className="px-5 py-4 text-sm text-gray-500">{label('settings-backup.no-backups-yet', lang)}</div>
      )}

      {status === 'ready' && snapshots.map((snapshot, index) => renderRow({
        key: snapshot.id,
        date: snapshot.createdAt,
        recordCount: snapshot.recordCount,
      }, {
        current: index === 0,
        busy: busyId === snapshot.id,
        onRestore: () => handleRestoreTap(snapshot),
      }))}

      {previous && (
        <>
          <div className="px-5 pt-4 text-xs font-bold text-gray-500">{label('settings-backup.previous-data', lang)}</div>
          {renderRow({
            key: 'local-safety',
            date: previous.created_at,
            recordCount: previous.record_count,
          }, { onRestore: handlePreviousTap })}
        </>
      )}

      <ConfirmDialog
        open={step === 1}
        title={label('settings-data.restore-from-backup', lang)}
        message={label(
          'settings-data.backup-contains-sales-expenses-customers',
          lang,
          pending?.counts?.transactions || 0,
          pending?.counts?.customers || 0,
          pending?.counts?.suppliers || 0,
        )}
        confirmLabel={label('settings-data.continue', lang)}
        cancelLabel={label('common.cancel', lang)}
        tone="default"
        onConfirm={() => setStep(2)}
        onCancel={closeConfirm}
      />

      <ConfirmDialog
        open={step === 2}
        title={label('settings-data.are-you-sure', lang)}
        message={label('settings-data.tip-download-a-backup-of-current-data-first', lang)}
        confirmLabel={label('settings-data.yes-restore-now', lang)}
        cancelLabel={label('settings-data.no-keep-current-data', lang)}
        tone="danger"
        onConfirm={() => runRestore(
          pending?.kind === 'local'
            ? () => restoreLocalSafetySnapshot()
            : () => restoreSnapshot(pending),
        )}
        onCancel={closeConfirm}
      />
    </>
  );
}