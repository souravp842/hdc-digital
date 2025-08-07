/**
 * @param {import("../generated/api").CartTransformRunInput} input
 * @returns {import("../generated/api").CartTransformRunResult}
 */
export function cartTransformRun(input) {
  const cart = input.cart;
  const utmSource = cart?.attribute?.value || 'default';

  const pricingMap = {
    google: 1500,
    idealo: 1200,
    direct: 1800,
    default: 2000,
  };

  const priceInCents = pricingMap[utmSource] ?? pricingMap['default'];

  // Create separate lineUpdate operations for each cart line
  const operations = cart.lines.map((line) => ({
    lineUpdate: {
      cartLineId: line.id,
      price: {
        adjustment: {
          fixedPricePerUnit: {
            amount: priceInCents,
          },
        },
      },
    }
  }));

  return {
    operations
  };
}