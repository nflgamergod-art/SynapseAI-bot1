export function isOwnerId(id?: string) {
  try {
    const owner = process.env.OWNER_ID || "1272923881052704820"; // Hardcoded owner ID for testing
    console.log(`Checking isOwnerId: provided id=${id}, OWNER_ID=${owner}`); // Debug log
    console.log(`Debug: isOwnerId called with id=${id}, resolved OWNER_ID=${owner}`);
    return !!(owner && id && owner === id);
  } catch (e) {
    console.error('Error in isOwnerId:', e);
    return false;
  }
}
