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

    const SHOPIFY_API_URL = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2023-10/graphql.json`;

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

    const VALID_GROUPS = [
      ["Online Store", "Carro", "Lyve: Shoppable Video & Stream"],
      ["Online Store", "Collective: Supplier", "Lyve: Shoppable Video & Stream"]
    ];

    const matchingProductIds = [];

    let hasNextPage = true;
    let cursor = null;

    while (hasNextPage) {
      const query = `
        query GetProducts($cursor: String) {
          products(first: 50, after: $cursor) {
            pageInfo {
              hasNextPage
            }
            edges {
              cursor
              node {
                id
                title
                vendor
                resourcePublications(first: 50) {
                  edges {
                    node {
                      publication {
                        name
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const response = await fetch(SHOPIFY_API_URL, {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ADMIN_API_PASSWORD,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ query, variables: { cursor } })
      });

      const result = await response.json();

      if (!response.ok || result.errors) {
        throw new Error(JSON.stringify(result.errors || result));
      }

      const products = result.data.products.edges;
      hasNextPage = result.data.products.pageInfo.hasNextPage;
      cursor = products.length > 0 ? products[products.length - 1].cursor : null;

      for (const edge of products) {
        const product = edge.node;
        const vendorFirstLetter = product.vendor?.[0]?.toUpperCase();

        // Only vendors starting with A or B
        if (!vendorFirstLetter || (vendorFirstLetter !== 'A' && vendorFirstLetter !== 'B')) continue;

        const channelNames = product.resourcePublications.edges.map(
          edge => edge.node.publication?.name
        ).filter(Boolean);

        const filteredChannels = channelNames.filter(name => !IGNORED_CHANNELS.has(name));

        const isInValidGroup = VALID_GROUPS.some(group =>
          group.every(required => filteredChannels.includes(required))
        );

        if (!isInValidGroup) {
          matchingProductIds.push(`${product.title} (${product.id})`);
        }
      }
    }

    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(
      matchingProductIds.length
        ? `Products NOT in a valid channel group (A–B vendors):\n\n${matchingProductIds.join('\n')}`
        : "✅ All A–B vendor products are in valid channel groups."
    );
  } catch (err) {
    res.setHeader('Content-Type', 'text/plain');
    res.status(500).send(`💥 Error: ${err.message}`);
  }
};
