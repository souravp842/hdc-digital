export function cartTransformRun(input) {
  const cart = input.cart;
  const utmSource = cart?.attribute?.value || 'direct';

  console.log('**********************************');
  console.log('UTM Source:', utmSource);

  const operations = cart.lines.map((line) => {
    const product = line.merchandise?.product;
    if (!product) return null;

    let basePrice, tieredPrice;

    switch (utmSource) {
      case 'google':
        basePrice = Number(product?.base_price_google?.value);
        tieredPrice = safeJSON(product?.tiered_price_google?.value);
        console.log('yes google');
        console.log(basePrice);
        console.log(tieredPrice);
        break;

      case 'idealo':
        basePrice = Number(product?.base_price_idealo?.value);
        tieredPrice = safeJSON(product?.tiered_price_idealo?.value);
        break;

      default: // direct
        basePrice = Number(product?.base_price?.value);
        tieredPrice = safeJSON(product?.tiered_price?.value);
        console.log('direct');
        console.log(basePrice);
        console.log(tieredPrice);
        break;
    }


    if (!basePrice) return null;

    const qty = line.quantity;
    let priceInCents = basePrice;

    if (tieredPrice) {
      const tierKeys = Object.keys(tieredPrice).map(Number).sort((a, b) => a - b);
      for (const tierQty of tierKeys) {
        if (qty >= tierQty) {
          priceInCents = tieredPrice[tierQty];
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

function safeJSON(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (e) {
    return null;
  }
}
