import { useState, useEffect } from 'react';
import PlanPanel from '../PlanPanel';
import PaymentChannelsSection from '../PaymentChannelsSection';
import BankDataSharing from '../../BankDataSharing';
import DubieRulesPanel from '../DubieRulesPanel';
import TabCard from '../TabCard';

export default function MoneyTab({
  paymentChannels,
  shopProfile,
  shopId,
  onSavePaymentChannels,
  lang,
  planTier,
  entitlements,
  staffCount,
  transactionCount,
  pendingCardId,
}) {
  const [openCards, setOpenCards] = useState(() => {
    const init = new Set();
    if (pendingCardId) init.add(pendingCardId);
    return init;
  });

  useEffect(() => {
    if (pendingCardId && !openCards.has(pendingCardId)) {
      setOpenCards(prev => new Set(prev).add(pendingCardId));
    }
  }, [pendingCardId]);
  const toggleCard = (id) => setOpenCards(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const chTotal = (paymentChannels || []).length;
  const chOnConfigured = (paymentChannels || []).filter(c => c.enabled && (c.usePhoneFromShop || c.phone || c.account)).length;
  const channelBadge = `${chOnConfigured}/${chTotal}`;
  const channelTone = chOnConfigured === 0 ? 'warn' : (chOnConfigured < chTotal ? 'warn' : 'ok');
  const channelSub = chOnConfigured > 0
    ? `${chOnConfigured} ${lang === 'am' ? 'መንገድ ዝግጁ' : 'configured'}`
    : (lang === 'am' ? 'አንድ መንገድ ያዋቅሩ' : 'Set up a payment channel');

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
        title={lang === 'am' ? 'የክፍያ መንገዶች' : 'Payment Channels'}
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
        icon="🏦"
        title={lang === 'am' ? 'የባንክ ውሂብ ማጋራት' : 'Bank Data Sharing'}
        subtitle={lang === 'am' ? 'ንግድ መረጃዎን ከባንኮች ጋር ያጋሩ' : 'Share business data with banks for credit scoring'}
        badgeTone="neutral"
      >
        <BankDataSharing shopId={shopId} lang={lang} />
      </TabCard>

      <TabCard
        icon="📋"
        title={lang === 'am' ? 'የዱቤ ህጎች' : 'Dubie Rules'}
        subtitle={lang === 'am' ? 'ከተወሰነ ቀን በኋላ ዱቤ ምልክት ያድርጉ' : 'Auto-flag overdue after set days'}
        badgeTone="neutral"
      >
        <DubieRulesPanel />
      </TabCard>
    </div>
  );
}
