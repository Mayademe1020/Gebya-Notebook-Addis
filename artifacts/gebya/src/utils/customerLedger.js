export function sortCustomerTransactions(items = []) {
  return [...items].sort((a, b) => b.created_at - a.created_at);
}

export function getCustomerBalance(items = []) {
  return items.reduce((sum, item) => {
    if (item.type === 'credit_add') return sum + (item.amount || 0);
    if (item.type === 'payment') return sum - (item.amount || 0);
    return sum;
  }, 0);
}

export function getCustomerLatestDueDate(items = []) {
  return items
    .filter(item => item.type === 'credit_add' && item.due_date)
    .map(item => item.due_date)
    .sort((a, b) => b - a)[0] || null;
}

export function buildCustomerSummaries(customers = [], customerTransactions = []) {
  const txByCustomer = customerTransactions.reduce((acc, item) => {
    if (!acc[item.customer_id]) acc[item.customer_id] = [];
    acc[item.customer_id].push(item);
    return acc;
  }, {});

  return customers
    .map(customer => {
      const items = sortCustomerTransactions(txByCustomer[customer.id] || []);
      const balance = getCustomerBalance(items);
      const lastActivityAt = items[0]?.created_at || customer.updated_at || customer.created_at || 0;

      return {
        ...customer,
        transactions: items,
        balance,
        transaction_count: items.length,
        last_activity_at: lastActivityAt,
        latest_due_date: getCustomerLatestDueDate(items),
      };
    })
    .sort((a, b) => {
      if ((b.balance || 0) !== (a.balance || 0)) return (b.balance || 0) - (a.balance || 0);
      return (b.last_activity_at || 0) - (a.last_activity_at || 0);
    });
}
