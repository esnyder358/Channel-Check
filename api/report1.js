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

    const IGNORED_CHANNELS = new Set([
      "Blueswitch",
      "Multify",
      "Customer Shipping Rates",
      "Facebook & Instagram",
      "Shop",
      "Google & YouTube",
      "Yotpo Email Marketing & SMS",
      "Pinterest"
    ]);

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

        // Get simulated channel names (replace with real logic when ready)
        let channelNames = getSimulatedChannelNames(product);

        // Filter out ignored channels
        channelNames = channelNames.filter(c => !IGNORED_CHANNELS.has(c));

        // Is this product in at least one valid group?
        const isInValidGroup = validGroups.some(group =>
          group.every(requiredChannel => channelNames.includes(requiredChannel))
        );

        if (!isInValidGroup) {
          matchingProductIds.push(`${product.title} (${product.id})`);
        }
      }

      // Pagination placeholder – only first 250 for now
      hasNextPage = false;
    }

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

// 🧪 TEMP: Simulated channel data
function getSimulatedChannelNames(product) {
  // Example logic for mocking channel names
  if (product.title.includes("Carro")) {
    return ["Online Store", "Carro", "Lyve: Shoppable Video & Stream", "Pinterest"];
  }
  if (product.vendor === "Test Vendor A") {
    return ["Online Store", "Collective: Supplier", "Lyve: Shoppable Video & Stream", "Google & YouTube"];
  }
  if (product.published_scope === "global") {
    return ["Online Store"];
  }
  return [];
}
