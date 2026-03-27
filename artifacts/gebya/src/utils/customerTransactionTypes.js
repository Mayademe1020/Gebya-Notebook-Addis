export const CUSTOMER_TRANSACTION_TYPES = Object.freeze({
  CREDIT_ADD: 'credit_add',
  PAYMENT: 'payment',
});

export function isValidCustomerTransactionType(value) {
  return value === CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD || value === CUSTOMER_TRANSACTION_TYPES.PAYMENT;
}

