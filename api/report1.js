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
    let cursor = null;
    let page = 1;

    const MAX_PAGES = 10; // safety limit: max pages to fetch per request (adjust as needed)

    const query = `
      query GetProducts($cursor: String) {
        products(first: 50, after: $cursor) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
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

    while (page <= MAX_PAGES) {
      const response = await fetch(SHOPIFY_API_URL, {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ADMIN_API_PASSWORD,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ query, variables: { cursor } })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Shopify API error: ${errorText}`);
      }

      const result = await response.json();

      if (result.errors) {
        throw new Error(JSON.stringify(result.errors));
      }

      const products = result.data.products.edges;

      for (const edge of products) {
        const product = edge.node;
        const vendorFirstLetter = product.vendor?.[0]?.toUpperCase();

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

      const { hasNextPage, endCursor } = result.data.products.pageInfo;
      if (!hasNextPage) break;
      cursor = endCursor;
      page++;
    }

    res.setHeader('Content-Type', 'text/plain');

    if (matchingProductIds.length === 0) {
      res.status(200).send(`✅ All A–B vendor products (up to ${page*50}) are in valid channel groups.`);
    } else {
      res.status(200).send(
        `Products NOT in a valid channel group (A–B vendors, checked up to ${page*50} products):\n\n` +
        matchingProductIds.join('\n')
      );
    }
  } catch (err) {
    res.setHeader('Content-Type', 'text/plain');
    res.status(500).send(`💥 Error: ${err.message}`);
  }
};
