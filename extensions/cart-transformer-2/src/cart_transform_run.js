export function cartTransformRun(input) {
  const cart = input.cart;
  const utmSource = cart?.attribute?.value || 'default';

  const operations = cart.lines.map((line) => {
    const metafieldValue = line.merchandise?.product?.metafield?.value;
    if (!metafieldValue) return null;

    let priceData;
    try {
      priceData = JSON.parse(metafieldValue);
    } catch (e) {
      return null;
    }

    const sourcePrices = priceData[utmSource] || priceData['direct'] || priceData['default'];
    if (!sourcePrices) return null;

    // pick tiered price based on quantity
    const qty = line.quantity;
    let priceInCents = sourcePrices.base_price;
    if (sourcePrices.tiers) {
      const tierKeys = Object.keys(sourcePrices.tiers).map(Number).sort((a, b) => a - b);
      for (const tierQty of tierKeys) {
        if (qty >= tierQty) {
          priceInCents = sourcePrices.tiers[tierQty];
        }
      }
    }

    return {
      lineUpdate: {
        cartLineId: line.id,
        price: {
          adjustment: {
            fixedPricePerUnit: {
              amount: priceInCents,
            },
          },
        },
      },
    };
  }).filter(Boolean);

  return { operations };
}
