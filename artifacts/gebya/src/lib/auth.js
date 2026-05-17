export async function getAuthState() {
  return { isAuthenticated: true, encryptionKey: null };
}

export async function verifyAndGetKey(pin) {
  return null;
}

export async function deriveKey(pin) {
  return null;
}

export async function encryptData(data, key) {
  return data;
}

export async function decryptData(data, key) {
  return data;
}
