export function isOwnerId(id?: string) {
  try {
    const owner = process.env.OWNER_ID;
    return !!(owner && id && owner === id);
  } catch (e) {
    return false;
  }
}
