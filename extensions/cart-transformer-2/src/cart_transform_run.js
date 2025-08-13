export function cartTransformRun(input) {
  // Add input validation
  if (!input || !input.cart) {
    console.warn('Invalid input: missing cart data');
    return { operations: [] };
  }

  const cart = input.cart;
  const utmSource = (cart?.attribute?.value || 'direct').toLowerCase();

  console.log('Cart Transform - UTM:', utmSource);

  // More robust cart.lines validation
  const cartLines = cart.lines;
  if (!Array.isArray(cartLines) || cartLines.length === 0) {
    console.warn('No cart lines found or cart.lines is not an array');
    return { operations: [] };
  }

  const operations = cartLines.map((line, index) => {
    try {
      // Additional validation for line object
      if (!line || typeof line !== 'object') {
        console.warn(`Invalid line object at index ${index}`);
        return null;
      }

      const variant = line.merchandise;
      if (!variant) {
        console.warn(`No merchandise found for line at index ${index}`);
        return null;
      }

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
        console.warn(`No pricing metafields for cart line ${line.id || index}. Skipping update.`);
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
          console.warn('Invalid variant pricing JSON for line', line.id || index, e);
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

      if (basePrice == null || Number.isNaN(basePrice)) {
        console.warn(`No valid base price found for cart line ${line.id || index}. Skipping.`);
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

      // Ensure we have a valid line ID
      if (!line.id) {
        console.warn(`Missing line ID for cart line at index ${index}. Skipping.`);
        return null;
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

    } catch (error) {
      console.error(`Error processing cart line at index ${index}:`, error);
      return null;
    }
  }).filter(Boolean);

  console.log(`Processed ${operations.length} cart line operations`);
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