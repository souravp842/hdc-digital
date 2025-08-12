export function cartTransformRun(input) {
  const cart = input.cart;
  const utmSource = (cart?.attribute?.value || 'direct').toLowerCase();

  console.log('Cart Transform - UTM:', utmSource);

  const operations = (cart.lines || []).map((line) => {
    const variant = line.merchandise;
    if (!variant) return null;

    const product = variant.product || {};
    const qty = line.quantity || 1;

    // --- Early exit: skip if BOTH variant and product pricing metafields are empty ---
    const noVariantPricing = !variant?.variant_pricing?.value;
    const noProductPricing =
      !product?.base_price?.value &&
      !product?.tiered_price?.value &&
      !product?.base_price_google?.value &&
      !product?.tiered_price_google?.value &&
      !product?.base_price_idealo?.value &&
      !product?.tiered_price_idealo?.value;

    if (noVariantPricing && noProductPricing) {
      console.warn(`No pricing metafields for cart line ${line.id}. Skipping update.`);
      return null;
    }

    // --- 1) Try variant single metafield JSON first ---
    const variantPricingRaw = variant?.variant_pricing?.value;
    let variantPricing = null;
    if (variantPricingRaw) {
      try {
        variantPricing = (typeof variantPricingRaw === 'object')
          ? variantPricingRaw
          : JSON.parse(variantPricingRaw);
      } catch (e) {
        console.warn('Invalid variant pricing JSON for line', line.id, e);
        variantPricing = null;
      }
    }

    // keys depending on utmSource
    const baseKey = utmSource === 'direct' ? 'base_price' : `base_price_${utmSource}`;
    const tierKey = utmSource === 'direct' ? 'tiered_price' : `tiered_price_${utmSource}`;

    let basePrice = null;
    let tieredPriceObj = null;

    // Variant takes priority
    if (variantPricing && typeof variantPricing === 'object' && Object.keys(variantPricing).length > 0) {
      const rawBase = variantPricing[baseKey];
      const rawTier = variantPricing[tierKey];

      basePrice = (rawBase != null) ? Number(rawBase) : null;
      if (rawTier) {
        tieredPriceObj = (typeof rawTier === 'object') ? rawTier : safeJSON(rawTier);
      }
    }

    // Fallback to product metafields
    if (basePrice == null) {
      if (utmSource === 'google') {
        basePrice = safeNumber(product?.base_price_google?.value) ?? safeNumber(product?.base_price?.value);
        tieredPriceObj = safeJSON(product?.tiered_price_google?.value) ?? safeJSON(product?.tiered_price?.value);
      } else if (utmSource === 'idealo') {
        basePrice = safeNumber(product?.base_price_idealo?.value) ?? safeNumber(product?.base_price?.value);
        tieredPriceObj = safeJSON(product?.tiered_price_idealo?.value) ?? safeJSON(product?.tiered_price?.value);
      } else {
        basePrice = safeNumber(product?.base_price?.value);
        tieredPriceObj = safeJSON(product?.tiered_price?.value);
      }
    }

    if (basePrice == null) {
      console.warn(`No base price found for cart line ${line.id} (variant / product empty). Skipping.`);
      return null;
    }

    let finalPrice = Number(basePrice);
    if (tieredPriceObj && typeof tieredPriceObj === 'object' && Object.keys(tieredPriceObj).length > 0) {
      const tierKeys = Object.keys(tieredPriceObj)
        .map(k => Number(k))
        .filter(n => !Number.isNaN(n))
        .sort((a, b) => a - b);

      for (const minQty of tierKeys) {
        if (qty >= minQty) {
          const candidate = Number(tieredPriceObj[minQty]);
          if (!Number.isNaN(candidate)) finalPrice = candidate;
        }
      }
    }

    return {
      lineUpdate: {
        cartLineId: line.id,
        price: {
          adjustment: {
            fixedPricePerUnit: {
              amount: finalPrice
            }
          }
        }
      }
    };
  }).filter(Boolean);

  return { operations };
}

/* Helpers */
function safeJSON(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (e) {
    return null;
  }
}
function safeNumber(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}
