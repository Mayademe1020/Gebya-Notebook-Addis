import db from '../db';
import { fireToast } from '../components/Toast';

export const BADGE_DEFINITIONS = [
  {
    id: 'first_sale',
    emoji: '🥇',
    title: 'First Sale',
    titleAm: 'የመጀመሪያ ሽያጭ',
    description: 'Recorded your first sale',
    descriptionAm: 'የመጀመሪያ ሽያጭ ተመዝግቧል',
    check: (stats) => (stats.featureCounts?.sales || 0) >= 1,
  },
  {
    id: 'streak_7',
    emoji: '🔥',
    title: '7-Day Streak',
    titleAm: 'ለ7 ቀናት ተከታታይ',
    description: 'Used Gebya 7 days in a row',
    descriptionAm: 'ለ7 ተከታታይ ቀናት ገበያ ተጠቅሟል',
    check: (stats) => (stats.streak || 0) >= 7,
  },
  {
    id: 'first_1000_birr',
    emoji: '💰',
    title: 'First 1,000 Birr Day',
    titleAm: 'የ1,000 ብር ቀን',
    description: 'Had a sales day over 1,000 birr',
    descriptionAm: 'ከ1,000 ብር በላይ ሽያጭ ተደርጓል',
    check: (stats) => (stats.bestDayTotal || 0) >= 1000,
  },
  {
    id: 'transactions_50',
    emoji: '📊',
    title: '50 Transactions',
    titleAm: '50 ግቤቶች',
    description: 'Recorded 50 transactions',
    descriptionAm: '50 ግቤቶች ተመዝግበዋል',
    check: (stats) => {
      const fc = stats.featureCounts || {};
      return (fc.sales || 0) + (fc.expenses || 0) + (fc.credits || 0) >= 50;
    },
  },
  {
    id: 'first_credit_repaid',
    emoji: '✅',
    title: 'First Dubie Repaid',
    titleAm: 'የመጀመሪያ ዱቤ ተከፍሏል',
    description: 'A customer fully repaid a Dubie',
    descriptionAm: 'ደንበኛ ዱቤ ሙሉ ተከፍሏል',
    check: (stats) => (stats.creditsRepaid || 0) >= 1,
  },
];

export async function checkAndAwardBadges(stats, lang = 'en') {
  try {
    const earnedRow = await db.analytics.get('earned_badges');
    let earned = [];
    try { earned = earnedRow ? JSON.parse(earnedRow.value) : []; } catch { earned = []; }

    const newBadges = [];
    for (const badge of BADGE_DEFINITIONS) {
      if (!earned.includes(badge.id) && badge.check(stats)) {
        earned.push(badge.id);
        newBadges.push(badge);
      }
    }

    if (newBadges.length > 0) {
      await db.analytics.put({ key: 'earned_badges', value: JSON.stringify(earned) });
      for (const b of newBadges) {
        const title = lang === 'am' ? b.titleAm : b.title;
        fireToast(`${b.emoji} ${title} badge unlocked!`, 3000);
      }
    }

    return earned;
  } catch (err) {
    if (import.meta.env.DEV) console.error('Badge check failed');
    return [];
  }
}

export async function getEarnedBadges() {
  try {
    const row = await db.analytics.get('earned_badges');
    try { return row ? JSON.parse(row.value) : []; } catch { return []; }
  } catch { return []; }
}
