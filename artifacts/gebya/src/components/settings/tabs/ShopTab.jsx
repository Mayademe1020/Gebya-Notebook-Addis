import { useState } from 'react';
import ReadinessHero from '../ReadinessHero';
import ShopProfilePanel from '../ShopProfilePanel';
import CatalogPanel from '../CatalogPanel';
import RecurringExpensesPanel from '../RecurringExpensesPanel';
import TabCard from '../TabCard';

export default function ShopTab({
  shopProfile,
  catalogEntries,
  recurringExpenses,
  paymentChannels,
  onProfileSave,
  onSaveCatalogEntry,
  onToggleCatalogEntryActive,
  onRecurringChange,
  lang,
  onNavigate,
}) {
  const [openCards, setOpenCards] = useState(() => new Set());
  const toggleCard = (id) => setOpenCards(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const activeItems = (catalogEntries || []).filter(e => e.active !== false);
  const itemsBadge = activeItems.length > 0 ? `${activeItems.length}` : (lang === 'am' ? 'ባዶ' : 'Empty');
  const itemsTone = activeItems.length > 0 ? 'ok' : 'neutral';
  const itemsSub = activeItems.length > 0
    ? (lang === 'am' ? `${activeItems.length} እቃዎች ተቀምጠዋል` : `${activeItems.length} saved items`)
    : (lang === 'am' ? 'ለመጀመር ይጨምሩ' : 'Add to get started');

  const recurringCount = (recurringExpenses || []).length;
  const recurringBadge = recurringCount > 0 ? `${recurringCount}` : (lang === 'am' ? 'ባዶ' : 'None');
  const recurringTone = recurringCount > 0 ? 'ok' : 'neutral';
  const recurringSub = recurringCount > 0
    ? (lang === 'am' ? `${recurringCount} ወርሃዊ ወጪ` : `${recurringCount} monthly bills`)
    : (lang === 'am' ? 'ኪራይ፣ ኢንተርኔት፣ ወዘተ' : 'Rent, internet, electricity, etc.');

  const handleOpenCard = (cardId) => {
    if (!openCards.has(cardId)) toggleCard(cardId);
  };

  return (
    <div>
      <ReadinessHero
        shopProfile={shopProfile}
        paymentChannels={paymentChannels}
        catalogEntries={catalogEntries}
        recurring={recurringExpenses}
        lang={lang}
        onAction={(cardId, tabId) => {
          if (tabId) {
            onNavigate?.(cardId, tabId);
          } else {
            handleOpenCard(cardId);
          }
        }}
      />

      <div className="mt-2.5" />

      <TabCard
        id="profile"
        icon="🏪"
        title={lang === 'am' ? 'የሱቅ መገለጫ' : 'Shop Profile'}
        subtitle={`${shopProfile?.name || (lang === 'am' ? 'ስም የለም' : 'No name')}${shopProfile?.phone ? ` · ${shopProfile.phone}` : ''}`}
        badge={shopProfile?.name && shopProfile?.phone ? (lang === 'am' ? 'ተዋቅሯል' : 'Set') : (lang === 'am' ? 'ይጨምሩ' : 'Partial')}
        badgeTone={shopProfile?.name && shopProfile?.phone ? 'ok' : 'warn'}
        open={openCards.has('profile')}
        onToggle={() => toggleCard('profile')}
      >
        <ShopProfilePanel shopProfile={shopProfile} onProfileSave={onProfileSave} />
      </TabCard>

      <TabCard
        id="items"
        icon="📦"
        title={lang === 'am' ? 'እቃዎች' : 'Items'}
        subtitle={itemsSub}
        badge={itemsBadge}
        badgeTone={itemsTone}
        open={openCards.has('items')}
        onToggle={() => toggleCard('items')}
      >
        <CatalogPanel
          catalogEntries={catalogEntries}
          onSaveCatalogEntry={onSaveCatalogEntry}
          onToggleCatalogEntryActive={onToggleCatalogEntryActive}
        />
      </TabCard>

      <TabCard
        id="recurring"
        icon="🔁"
        title={lang === 'am' ? 'ወርሃዊ ወጪ' : 'Recurring Expenses'}
        subtitle={recurringSub}
        badge={recurringBadge}
        badgeTone={recurringTone}
        open={openCards.has('recurring')}
        onToggle={() => toggleCard('recurring')}
      >
        <RecurringExpensesPanel
          recurring={recurringExpenses}
          onRecurringChange={onRecurringChange}
        />
      </TabCard>
    </div>
  );
}
