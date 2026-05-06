// Platform margin: how much the platform adds on top of the creator's price.
// Subscriber pays `price * (1 + PLATFORM_MARGIN)`; creator earns `price`.
export const PLATFORM_MARGIN = 0.2; // 20%

export const subscriberPrice = (creatorPrice = 0) =>
  Math.round(creatorPrice * (1 + PLATFORM_MARGIN) * 100) / 100;
