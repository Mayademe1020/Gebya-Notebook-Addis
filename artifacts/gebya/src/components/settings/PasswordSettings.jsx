import { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { fireToast } from '../Toast';
import { getAuthToken } from '../../utils/syncEngine';
import { setPassword, removePassword } from '../../utils/authClient';
import { label } from '../../labels/index.js';

function PasswordSettings({ lang }) {
  const hasPassword = useAuthStore(s => s.hasPassword);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPasswordValue] = useState('');

  const handleSetPassword = async () => {
    if (password.length < 6) {
      fireToast(
        label('settings-data.password-must-be-at-least-6-characters', lang),
        2500
      );
      return;
    }
    setLoading(true);
    try {
      const token = await getAuthToken();
      if (!token) {
        fireToast(label('settings-data.sign-in-required', lang), 3000);
        return;
      }
      await setPassword(token, password);
      useAuthStore.setState({ hasPassword: true });
      fireToast(
        label('settings-data.password-saved-successfully', lang),
        2000
      );
      setPasswordValue('');
    } catch (err) {
      console.error('Failed to set password:', err);
      fireToast(label('settings-data.failed-to-save-password', lang), 2500);
    } finally {
      setLoading(false);
    }
  };

  const handleRemovePassword = async () => {
    if (!confirm(label('settings-data.you-will-use-otp-again-remove-password', lang))) {
      return;
    }
    setLoading(true);
    try {
      const token = await getAuthToken();
      if (!token) {
        fireToast(label('settings-data.sign-in-required', lang), 3000);
        return;
      }
      await removePassword(token);
      useAuthStore.setState({ hasPassword: false });
      fireToast(
        label('settings-data.password-removed-successfully', lang),
        2000
      );
    } catch (err) {
      console.error('Failed to remove password:', err);
      fireToast(label('settings-data.failed-to-remove-password', lang), 2500);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border overflow-hidden mt-4" style={{ borderColor: 'var(--color-border)' }}>
      <div
        className="px-4 py-3 border-b"
        style={{ borderColor: 'var(--color-border-light)', background: 'var(--color-surface-subtle)' }}
      >
        <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
          {label('settings-data.password-login', lang)}
        </span>
      </div>
      <div className="px-4 py-3 space-y-3">
        <div className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
          {label('settings-data.set-a-password-for-faster-logins-or-use-otp', lang)}
        </div>

        {hasPassword ? (
          <>
            <button
              onClick={handleRemovePassword}
              disabled={loading}
              className="btn btn--danger w-full"
              aria-label={label('settings-data.remove-password', lang)}
            >
              {loading ? '...' : (label('settings-data.remove-password', lang))}
            </button>
          </>
        ) : (
          <>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">
                {label('settings-data.new-password', lang)}
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPasswordValue(e.target.value)}
                placeholder={label('settings-data.6-32-characters', lang)}
                maxLength={32}
                className="w-full px-3 py-2.5 border-2 text-sm focus:outline-none focus:border-primary"
                style={{ borderColor: 'var(--color-border)', borderRadius: 0 }}
                aria-label={label('settings-data.new-password', lang)}
              />
              <button
                onClick={() => setShowPassword(!showPassword)}
                className="mt-1.5 text-xs font-medium"
                style={{ color: 'var(--color-primary)' }}
                aria-label={showPassword
                  ? (label('settings-data.hide', lang))
                  : (label('settings-data.show', lang))
                }
              >
                {showPassword
                  ? (label('settings-data.hide', lang))
                  : (label('settings-data.show', lang))}
              </button>
            </div>
            <button
              onClick={handleSetPassword}
              disabled={loading || password.length < 6}
              className="btn btn--primary w-full"
              aria-label={label('settings-data.set-password', lang)}
            >
              {loading
                ? (label('settings-data.saving-2', lang))
                : (label('settings-data.set-password', lang))}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default PasswordSettings;
