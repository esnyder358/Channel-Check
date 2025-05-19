const fetch = require('node-fetch');
const postmark = require('postmark');

const POSTMARK_API_KEY = process.env.POSTMARK_API_KEY;
const EMAIL_TO = process.env.EMAIL_TO; // your email
const EMAIL_FROM = process.env.EMAIL_FROM; // verified sender email

const client = new postmark.ServerClient(POSTMARK_API_KEY);

module.exports = async (req, res) => {
  try {
    const {
      SHOPIFY_STORE_DOMAIN,
      SHOPIFY_ADMIN_API_PASSWORD
    } = process.env;

    if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ADMIN_API_PASSWORD) {
      throw new Error("Missing Shopify credentials in environment.");
    }

    if (!POSTMARK_API_KEY || !EMAIL_TO || !EMAIL_FROM) {
      throw new Error("Missing Postmark email config.");
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
    const MAX_PAGES = 20; // Increase max pages if you want (1000 products max)

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
          matchingProductIds.push(product.id);
        }
      }

      const { hasNextPage, endCursor } = result.data.products.pageInfo;
      if (!hasNextPage) break;
      cursor = endCursor;
      page++;
    }

    if (matchingProductIds.length > 0) {
      // Send email alert
      await client.sendEmail({
        From: EMAIL_FROM,
        To: EMAIL_TO,
        Subject: `⚠️ Shopify Products NOT in Valid Channel Groups - Found ${matchingProductIds.length}`,
        TextBody: `The following product IDs are NOT in valid channel groups (vendors A-B):\n\n${matchingProductIds.join('\n')}`
      });
      console.log(`Email sent for ${matchingProductIds.length} invalid products.`);
    } else {
      console.log('No invalid products found this run.');
    }

    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(`Checked ${page * 50} products. Found ${matchingProductIds.length} invalid products.`);

  } catch (err) {
    res.setHeader('Content-Type', 'text/plain');
    res.status(500).send(`💥 Error: ${err.message}`);
  }
};
