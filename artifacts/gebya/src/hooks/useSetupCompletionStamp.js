import { useEffect } from 'react';
import { stampSetupCompletedAt } from '../utils/setupCompletion';

/**
 * Backfill-on-encounter for `setup_completed_at` (Gate D).
 *
 * Runs on boot and whenever the shop data changes: if all five readiness
 * checks are green and no stamp exists yet, stamp it now — that is how shops
 * that completed setup before Gate D get counted. The stamp is immutable and
 * idempotent, so a completed shop costs one settings read per change.
 *
 * Deliberately fired from AppShell (always mounted) rather than from the
 * settings screen, so a completed shop is captured without the owner having
 * to open Settings.
 */
export function useSetupCompletionStamp({ shopProfile, paymentChannels, catalogEntries, recurring }) {
  useEffect(() => {
    stampSetupCompletedAt({ shopProfile, paymentChannels, catalogEntries, recurring })
      .catch(() => { /* metric only — never block the UI */ });
  }, [shopProfile, paymentChannels, catalogEntries, recurring]);
}

export default useSetupCompletionStamp;
