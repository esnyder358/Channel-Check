const fetch = require('node-fetch');

module.exports = async (req, res) => {
  try {
    const {
      SHOPIFY_STORE_DOMAIN,
      SHOPIFY_ADMIN_API_PASSWORD
    } = process.env;

    if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ADMIN_API_PASSWORD) {
      throw new Error("Missing Shopify credentials.");
    }

    const requiredChannelGroups = [
      ["Online Store", "Carro", "Lyve: Shoppable Video & Stream"],
      ["Online Store", "Collective: Supplier", "Lyve: Shoppable Video & Stream"]
    ];

    const invalidProductIds = [];
    let hasNextPage = true;
    let pageInfo = null;

    while (hasNextPage) {
      const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2023-10/products.json?limit=250${pageInfo ? `&page_info=${pageInfo}` : ''}`;
      const response = await fetch(url, {
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ADMIN_API_PASSWORD,
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Shopify API error:", errorText);
        throw new Error("Shopify API request failed.");
      }

      const data = await response.json();
      const products = data.products || [];

      for (const product of products) {
        const vendor = product.vendor || '';
        const firstLetter = vendor.trim().charAt(0).toUpperCase();

        // Only process vendors starting with A–M
        if (firstLetter < 'A' || firstLetter > 'M') continue;

        // Example stub — replace this with how you actually retrieve the product's channels
        const productChannels = product.metafields?.custom?.variantchannels || [];

        const isValid = requiredChannelGroups.some(group =>
          group.every(channel => productChannels.includes(channel))
        );

        if (!isValid) {
          invalidProductIds.push(product.id);
        }
      }

      // Pagination (this needs to be improved if needed for full product set)
      hasNextPage = false;
    }

    // Respond as plain text
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(invalidProductIds.join('\n'));

  } catch (err) {
    console.error("Error generating report:", err);
    res.status(500).send(`Error: ${err.message}`);
  }
};
