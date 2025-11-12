// Promotion system configuration for support roles
export const PROMOTION_CONFIG = {
  roles: {
    trialSupport: '1409870461801599016',
    support: '1394923861723709512',
    headSupport: '1410581449047937025',
  },
  channels: {
    supportChat: '1394913597003530292',
    buyerChat: '1394913982682234951',
    // Ticket channels are dynamically created by the bot
  },
  thresholds: {
    trialToSupport: {
      tickets: 20,
      messages: 150,
      hours: 12,
      auto: true,
    },
    supportToHead: {
      tickets: 45,
      messages: 300,
      hours: 25,
      auto: false, // requires approval
    },
  },
};