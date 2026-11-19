import ReadinessHero from '../ReadinessHero';
import ShopProfilePanel from '../ShopProfilePanel';
import CatalogPanel from '../CatalogPanel';
import RecurringExpensesPanel from '../RecurringExpensesPanel';
import TabCard from '../TabCard';
import useAccordion from '../useAccordion';
import { label } from '../../../labels/index';

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
  const { openCards, toggleCard, openCard } = useAccordion();

  const activeItems = (catalogEntries || []).filter(e => e.active !== false);
  const itemsBadge = activeItems.length > 0 ? `${activeItems.length}` : (label('settings-shop.empty', lang));
  const itemsTone = activeItems.length > 0 ? 'ok' : 'neutral';
  const itemsSub = activeItems.length > 0
    ? (label('settings-shop.saved-items', lang, activeItems.length))
    : (label('settings-shop.add-to-get-started', lang));

  const recurringCount = (recurringExpenses || []).length;
  const recurringBadge = recurringCount > 0 ? `${recurringCount}` : (label('settings-shop.none', lang));
  const recurringTone = recurringCount > 0 ? 'ok' : 'neutral';
  const recurringSub = recurringCount > 0
    ? (label('settings-shop.monthly-bills', lang, recurringCount))
    : (label('settings-shop.rent-internet-electricity-etc', lang));

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
            openCard(cardId);
          }
        }}
      />

      <div className="mt-2.5" />

      <TabCard
        id="profile"
        icon="🏪"
        title={label('settings-shop.shop-profile', lang)}
        subtitle={`${shopProfile?.name || (label('settings-shop.no-name', lang))}${shopProfile?.phone ? ` · ${shopProfile.phone}` : ''}`}
        badge={shopProfile?.name && shopProfile?.phone ? (label('settings-shop.set', lang)) : (label('settings-shop.partial', lang))}
        badgeTone={shopProfile?.name && shopProfile?.phone ? 'ok' : 'warn'}
        open={openCards.has('profile')}
        onToggle={() => toggleCard('profile')}
      >
        <ShopProfilePanel shopProfile={shopProfile} onProfileSave={onProfileSave} />
      </TabCard>

      <TabCard
        id="items"
        icon="📦"
        title={label('settings-shop.items', lang)}
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
        title={label('settings-shop.recurring-expenses', lang)}
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
