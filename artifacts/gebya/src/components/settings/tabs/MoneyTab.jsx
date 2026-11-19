import PlanPanel from '../PlanPanel';
import PaymentChannelsSection from '../PaymentChannelsSection';
import DubieRulesPanel from '../DubieRulesPanel';
import TabCard from '../TabCard';
import useAccordion from '../useAccordion';
import { label } from '../../../labels/index.js';

export default function MoneyTab({
  paymentChannels,
  shopProfile,
  shopId,
  onSavePaymentChannels,
  onNavigate,
  lang,
  planTier,
  entitlements,
  staffCount,
  transactionCount,
  pendingCardId,
}) {
  const { openCards, toggleCard } = useAccordion(pendingCardId);

  const chTotal = (paymentChannels || []).length;
  const chOnConfigured = (paymentChannels || []).filter(c => c.enabled && (c.usePhoneFromShop || c.phone || c.account)).length;
  const channelBadge = `${chOnConfigured}/${chTotal}`;
  const channelTone = chOnConfigured === 0 ? 'warn' : (chOnConfigured < chTotal ? 'warn' : 'ok');
  const channelSub = chOnConfigured > 0
    ? `${chOnConfigured} ${label('settings-money.configured-2', lang)}`
    : (label('settings-money.set-up-a-payment-channel', lang));

  const shopPhone = shopProfile?.phone || '';

  return (
    <div>
      <div className="mb-2.5">
        <PlanPanel
          tier={planTier}
          entitlements={entitlements}
          staffCount={staffCount}
          transactionCount={transactionCount}

        />
      </div>

      <TabCard
        id="channels"
        icon="💳"
        title={label('settings-money.payment-channels-2', lang)}
        subtitle={channelSub}
        badge={channelBadge}
        badgeTone={channelTone}
        open={openCards.has('channels')}
        onToggle={() => toggleCard('channels')}
      >
        <PaymentChannelsSection
          channels={paymentChannels}
          shopPhone={shopPhone}
          enabledCount={(paymentChannels || []).filter(c => c.enabled).length}
          configuredCount={chOnConfigured}
          onChange={(next) => onSavePaymentChannels?.(next)}
          lang={lang}
        />
      </TabCard>

      <TabCard
        id="dubie-rules"
        icon="⚖️"
        title={label('settings-money.dubie-credit-rules', lang)}
        subtitle={label('settings-money.overdue-threshold-reminders-in-data-tab', lang)}
        badgeTone="neutral"
        open={openCards.has('dubie-rules')}
        onToggle={() => toggleCard('dubie-rules')}
      >
        <DubieRulesPanel onNavigate={onNavigate} />
      </TabCard>
    </div>
  );
}
