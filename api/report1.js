const fetch = require('node-fetch');

module.exports = async (req, res) => {
  try {
    const {
      SHOPIFY_STORE_DOMAIN,
      SHOPIFY_ADMIN_API_PASSWORD
    } = process.env;

    if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ADMIN_API_PASSWORD) {
      throw new Error("Missing Shopify credentials in environment.");
    }

    const validGroups = [
      ["Online Store", "Carro", "Lyve: Shoppable Video & Stream"],
      ["Online Store", "Collective: Supplier", "Lyve: Shoppable Video & Stream"]
    ];

    const matchingProductIds = [];
    let pageInfo = null;
    let hasNextPage = true;

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
        throw new Error(`Shopify API error: ${errorText}`);
      }

      const data = await response.json();
      const products = data.products || [];

      for (const product of products) {
        const vendorFirstLetter = product.vendor?.[0]?.toUpperCase();
        if (!vendorFirstLetter || vendorFirstLetter < 'A' || vendorFirstLetter > 'G') continue;

        const channelNames = (product.published_scope === 'global')
          ? ["Online Store"] // fallback assumption
          : [];

        // If your app has access to real channel publishing data, use it here
        if (product.admin_graphql_api_id.includes('Product')) {
          // This is where you'd check real sales channel info if available
          // For now, assume channelNames comes from metafields or something else you control
        }

        const isInValidGroup = validGroups.some(group =>
          group.every(channel => channelNames.includes(channel))
        );

        if (!isInValidGroup) {
          matchingProductIds.push(product.id);
        }
      }

      // Simplified: Shopify may not return real `page_info`, so we limit pagination for now
      hasNextPage = false;
    }

    // 🖥 Output plain text in browser
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(
      matchingProductIds.length
        ? `Products NOT in a valid channel group (A–G vendors):\n\n${matchingProductIds.join('\n')}`
        : "✅ All A–G vendor products are in valid channel groups."
    );
  } catch (err) {
    res.setHeader('Content-Type', 'text/plain');
    res.status(500).send(`💥 Error: ${err.message}`);
  }
};
