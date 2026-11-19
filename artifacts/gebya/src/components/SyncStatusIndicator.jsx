import { useState, useEffect, useCallback } from 'react';
import { Check, AlertCircle, RefreshCw, Cloud, Clock } from 'lucide-react';
import { useLang } from '../context/LangContext';
import db from '../db';
import { label } from '../labels/index.js';

const SYNC_CHECK_INTERVAL = 30000;
const FIRST_SYNC_THRESHOLD = 60000;

export default function SyncStatusIndicator({ onSyncNow }) {
  const { lang } = useLang();
  const [syncState, setSyncState] = useState({
    lastSyncedAt: null,
    pendingCount: 0,
    isSyncing: false,
    error: null,
    isFirstSync: true
  });

  const computeSyncStatus = useCallback(async () => {
    try {
      const lastSyncedRow = await db.settings.get('gebya_last_synced_at');
      const lastSyncedAt = lastSyncedRow?.value || null;
      
      const pendingCount = await db.sync_outbox.count();
      const now = Date.now();
      
      const isFirstSync = !lastSyncedAt || (now - lastSyncedAt) > FIRST_SYNC_THRESHOLD;
      
      setSyncState({
        lastSyncedAt,
        pendingCount,
        isSyncing: false,
        error: null,
        isFirstSync
      });
    } catch (err) {
      setSyncState(prev => ({
        ...prev,
        error: 'Failed to check sync status'
      }));
    }
  }, []);

  useEffect(() => {
    computeSyncStatus();
    
    const interval = setInterval(computeSyncStatus, SYNC_CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [computeSyncStatus]);

  const handleSyncNow = async () => {
    if (syncState.isSyncing) return;
    
    setSyncState(prev => ({ ...prev, isSyncing: true, error: null }));
    
    try {
      const token = await getCurrentUserToken();
      
      if (!token) {
        setSyncState(prev => ({
          ...prev,
          isSyncing: false,
          error: label('sync.no-auth-token-manual-sync-will-not-upload', lang)
        }));
        await new Promise(r => setTimeout(r, 2000));
        setSyncState(prev => ({ ...prev, isSyncing: false, error: null }));
        return;
      }

      const pending = await db.sync_outbox.limit(100).toArray();
      
      if (pending.length === 0) {
        await db.settings.put({ key: 'gebya_last_synced_at', value: Date.now() });
        await computeSyncStatus();
        return;
      }

      const response = await fetch('/api/sync/push', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          device_id: await getDeviceId(),
          tables: { transactions: pending }
        })
      });

      if (response.ok) {
        const deletedCount = await db.sync_outbox.where('table').anyOf('transactions').delete();
        await db.settings.put({ key: 'gebya_last_synced_at', value: Date.now() });
        await computeSyncStatus();
      } else {
        throw new Error(`Sync failed: ${response.status}`);
      }
    } catch (err) {
      setSyncState(prev => ({
        ...prev,
        error: err.message || 'Sync failed'
      }));
    } finally {
      setSyncState(prev => ({ ...prev, isSyncing: false }));
    }
  };

  const getDeviceId = async () => {
    const ident = await db.identity.get('me');
    return ident?.device_id || 'unknown-device';
  };

  const getCurrentUserToken = async () => {
    const ident = await db.identity.get('me');
    return ident?.auth_token || null;
  };

  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return null;
    const now = Date.now();
    const diffMs = now - timestamp;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return label('sync.just-now', lang);
    if (diffMins < 60) return `${diffMins} ${label('sync.min', lang)} ${label('sync.ago', lang)}`;
    
    const hours = Math.floor(diffMins / 60);
    if (hours < 24) return `${hours} ${label('sync.hr', lang)} ${label('sync.ago', lang)}`;
    
    const days = Math.floor(hours / 24);
    return `${days} ${label('sync.day', lang)} ${label('sync.ago', lang)}`;
  };

  const getStatusConfig = () => {
    if (syncState.error && !syncState.isSyncing) {
      return {
        type: 'error',
        icon: AlertCircle,
        text: syncState.error,
        action: 'retry',
        actionLabel: label('sync.retry-2', lang)
      };
    }
    
    if (syncState.isSyncing) {
      return {
        type: 'syncing',
        icon: RefreshCw,
        text: label('sync.syncing-2', lang),
        spinning: true
      };
    }
    
    if (syncState.pendingCount > 0) {
      return {
        type: 'pending',
        icon: Clock,
        text: `(${syncState.pendingCount}) ${label('sync.pending', lang)}`,
        action: 'sync',
        actionLabel: label('sync.sync', lang)
      };
    }
    
    if (syncState.lastSyncedAt) {
      return {
        type: 'synced',
        icon: Check,
        text: `✓ ${formatTimeAgo(syncState.lastSyncedAt)}`,
        action: 'sync',
        actionLabel: label('sync.sync', lang)
      };
    }
    
    return {
      type: 'first',
      icon: Cloud,
      text: label('sync.first-sync-pending', lang),
      action: 'sync',
      actionLabel: label('sync.sync', lang)
    };
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
      <Icon 
        className={`w-3.5 h-3.5 ${config.spinning ? 'animate-spin' : ''}`} 
        style={{ 
          color: config.type === 'error' ? 'var(--color-danger)' : 
                 config.type === 'synced' ? 'var(--color-success)' : 
                 'var(--color-primary)' 
        }}
      />
      <span style={{ color: syncState.error ? 'var(--color-danger-text)' : 'var(--color-text-muted)' }}>
        {config.text}
      </span>
      {onSyncNow && (
        <button
          onClick={config.action === 'sync' || config.action === 'retry' ? handleSyncNow : undefined}
          disabled={syncState.isSyncing}
          className="ml-1 px-1.5 py-0.5 rounded text-xs font-medium underline hover:no-underline disabled:opacity-50"
          style={{ 
            color: config.action ? 'var(--color-primary)' : 'var(--color-text-muted)' 
          }}
        >
          {config.actionLabel}
        </button>
      )}
    </div>
  );
}