const fs = require('fs');
const lines = fs.readFileSync('d:/Gebya-Notebook-Addis/artifacts/gebya/src/App.jsx', 'utf8').split(/\r?\n/);

const out = [];
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('const setAuthUser = useAuthStore(s => s.setUser);')) {
    out.push(lines[i]);
    out.push('');
    out.push('  // ─── Phase B: Shop state (Zustand) ───');
    out.push('  const shopProfile = useShopStore(s => s.shopProfile);');
    out.push('  const setShopProfile = useShopStore(s => s.setShopProfile);');
    out.push('  const ownerAlertSettings = useShopStore(s => s.ownerAlertSettings);');
    out.push('  const setOwnerAlertSettings = useShopStore(s => s.setOwnerAlertSettings);');
    out.push('  const enabledProviders = useShopStore(s => s.enabledProviders);');
    out.push('  const setEnabledProviders = useShopStore(s => s.setEnabledProviders);');
    out.push('  const recurringExpenses = useShopStore(s => s.recurringExpenses);');
    out.push('  const setRecurringExpenses = useShopStore(s => s.setRecurringExpenses);');
    out.push('  const customQuickAmounts = useShopStore(s => s.customQuickAmounts);');
    out.push('  const setCustomQuickAmounts = useShopStore(s => s.setCustomQuickAmounts);');
    out.push('  const lastPayment = useShopStore(s => s.lastPayment);');
    out.push('  const setLastPayment = useShopStore(s => s.setLastPayment);');
    out.push('  const usageStats = useShopStore(s => s.usageStats);');
    out.push('  const setUsageStats = useShopStore(s => s.setUsageStats);');
    out.push('  const buildActorSnapshot = useCallback(() => (');
    out.push('    resolveActorSnapshot({ shopProfile, staffMembers, activeStaffMemberId })');
    out.push('  ), [shopProfile, staffMembers, activeStaffMemberId]);');
    out.push('');
    out.push('  const currentActorLabel = useMemo(() => (');
    out.push('    getActorDisplayLabel({ shopProfile, staffMembers, activeStaffMemberId })');
    out.push('  ), [shopProfile, staffMembers, activeStaffMemberId]);');
    
    // now we need to skip the bad lines until `const appendVoiceQualityEvent`
    let j = i + 1;
    while (j < lines.length && !lines[j].includes('const appendVoiceQualityEvent')) {
      j++;
    }
    i = j - 1; // set i so next iteration starts at appendVoiceQualityEvent
  } else {
    out.push(lines[i]);
  }
}

fs.writeFileSync('d:/Gebya-Notebook-Addis/artifacts/gebya/src/App.jsx', out.join('\n'));
