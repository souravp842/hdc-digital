// extensions/cart-transform/src/run.js

import { DiscountApplicationStrategy } from "../generated/api";

/**
 * @typedef {import("../generated/api").RunInput} RunInput
 * @typedef {import("../generated/api").FunctionRunResult} FunctionRunResult
 * @typedef {import("../generated/api").CartOperation} CartOperation
 */

/**
 * @type {FunctionRunResult}
 */
const EMPTY_DISCOUNT = {
  discountApplicationStrategy: DiscountApplicationStrategy.First,
  discounts: [],
};

/**
 * @param {RunInput} input
 * @returns {FunctionRunResult}
 */
export function run(input) {
  // Get cart lines
  const cartLines = input.cart.lines;
  
  if (!cartLines || cartLines.length === 0) {
    return EMPTY_DISCOUNT;
  }

  // Extract UTM source from cart attributes (this will come from storefront)
  const utmSource = getUtmSourceFromCart(input.cart);
  
  if (!utmSource) {
    return EMPTY_DISCOUNT;
  }

  // Get pricing rules for the traffic source
  const pricingRules = getPricingRules(utmSource);
  
  if (!pricingRules) {
    return EMPTY_DISCOUNT;
  }

  // Generate cart operations for price adjustments
  const cartOperations = generateCartOperations(cartLines, pricingRules);

  if (cartOperations.length === 0) {
    return EMPTY_DISCOUNT;
  }

  return {
    discountApplicationStrategy: DiscountApplicationStrategy.First,
    discounts: [
      {
        targets: [
          {
            cartTransform: {
              operations: cartOperations
            }
          }
        ],
        value: {
          percentage: {
            value: "0.0" // We're using cart operations, not percentage discounts
          }
        }
      }
    ],
  };
}

/**
 * Extract UTM source from cart attributes
 * @param {Object} cart - The cart object
 * @returns {string|null} - The UTM source or null
 */
function getUtmSourceFromCart(cart) {
  if (!cart.attributes || cart.attributes.length === 0) {
    return null;
  }

  // Look for utm_source in cart attributes
  const utmSourceAttribute = cart.attributes.find(
    attr => attr.key === 'utm_source'
  );

  return utmSourceAttribute ? utmSourceAttribute.value : null;
}

/**
 * Get pricing rules based on traffic source
 * @param {string} utmSource - The UTM source
 * @returns {Object|null} - Pricing configuration or null
 */
function getPricingRules(utmSource) {
  // Static pricing rules for different traffic sources
  // Later this will be replaced with metafield data
  const pricingConfig = {
    'google': {
      type: 'percentage',
      adjustment: -10, // 10% discount
      label: 'Google Shopping Price'
    },
    'idealo': {
      type: 'percentage', 
      adjustment: -15, // 15% discount
      label: 'Idealo Special Price'
    },
    'facebook': {
      type: 'fixed',
      adjustment: -5.00, // $5 off
      label: 'Facebook Special Price'
    },
    'direct': {
      type: 'percentage',
      adjustment: -5, // 5% discount for direct traffic
      label: 'Direct Access Price'
    }
  };

  return pricingConfig[utmSource.toLowerCase()] || null;
}

/**
 * Generate cart operations for price adjustments
 * @param {Array} cartLines - Array of cart line items
 * @param {Object} pricingRules - Pricing configuration
 * @returns {Array} - Array of cart operations
 */
function generateCartOperations(cartLines, pricingRules) {
  const operations = [];

  cartLines.forEach(line => {
    if (!line.merchandise || !line.merchandise.id) {
      return;
    }

    // Calculate new price based on pricing rules
    const currentPrice = parseFloat(line.merchandise.price.amount);
    const newPrice = calculateNewPrice(currentPrice, pricingRules);
    
    // Only create operation if price is different
    if (newPrice !== currentPrice && newPrice > 0) {
      operations.push({
        update: {
          cartLineId: line.id,
          price: {
            adjustment: {
              fixedAmountPerUnit: {
                amount: (newPrice - currentPrice).toFixed(2)
              }
            }
          }
        }
      });
    }
  });

  return operations;
}

/**
 * Calculate new price based on pricing rules
 * @param {number} originalPrice - Original price
 * @param {Object} pricingRules - Pricing configuration
 * @returns {number} - New calculated price
 */
function calculateNewPrice(originalPrice, pricingRules) {
  let newPrice = originalPrice;

  switch (pricingRules.type) {
    case 'percentage':
      // Apply percentage adjustment
      const percentageMultiplier = 1 + (pricingRules.adjustment / 100);
      newPrice = originalPrice * percentageMultiplier;
      break;
      
    case 'fixed':
      // Apply fixed amount adjustment
      newPrice = originalPrice + pricingRules.adjustment;
      break;
      
    default:
      newPrice = originalPrice;
  }

  // Ensure price doesn't go below 0
  return Math.max(0, newPrice);
}

/**
 * Helper function to validate cart line has required data
 * @param {Object} line - Cart line item
 * @returns {boolean} - Whether line is valid
 */
function isValidCartLine(line) {
  return line && 
         line.merchandise && 
         line.merchandise.id && 
         line.merchandise.price && 
         line.merchandise.price.amount;
}