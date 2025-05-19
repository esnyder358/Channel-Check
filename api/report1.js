const fetch = require('node-fetch');
const postmark = require('postmark');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_API_PASSWORD;
const POSTMARK_API_KEY = process.env.POSTMARK_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM;
const EMAIL_TO = process.env.EMAIL_TO;

const VALID_GROUPS = [
  ["Online Store", "Carro", "Lyve: Shoppable Video & Stream"],
  ["Online Store", "Collective: Supplier", "Lyve: Shoppable Video & Stream"]
];

const IGNORE_CHANNELS = new Set([
  "Blueswitch",
  "Multify",
  "Customer Shipping Rates",
  "Facebook & Instagram",
  "Shop",
  "Google & YouTube",
  "Yotpo Email Marketing & SMS",
  "Pinterest"
]);

module.exports = async (req, res) => {
  try {
    let invalidProducts = [];
    let cursor = req.query.cursor || null;
    let checked = 0;
    let hasNextPage = true;

    while (hasNextPage && checked < 1000) {
      const query = `
        query GetProducts($cursor: String) {
          products(first: 100, after: $cursor) {
            pageInfo {
              hasNextPage
            }
            edges {
              cursor
              node {
                id
                title
                vendor
                publications(first: 100) {
                  edges {
                    node {
                      channel {
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

      const response = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/2023-10/graphql.json`, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query, variables: { cursor } })
      });

      const result = await response.json();

      if (result.errors) throw new Error("GraphQL error: " + JSON.stringify(result.errors));

      const products = result.data.products.edges;
      hasNextPage = result.data.products.pageInfo.hasNextPage;
      cursor = hasNextPage ? products[products.length - 1].cursor : null;

      for (const { node: product } of products) {
        checked++;

        const channelNames = product.publications.edges
          .map(e => e.node.channel?.name)
          .filter(name => name && !IGNORE_CHANNELS.has(name));

        const isValid = VALID_GROUPS.some(group =>
          group.every(required => channelNames.includes(required))
        );

        if (!isValid) {
          invalidProducts.push(product.id);
        }
      }
    }

    // Send Email via Postmark
    const client = new postmark.ServerClient(POSTMARK_API_KEY);
    await client.sendEmail({
      From: EMAIL_FROM,
      To: EMAIL_TO,
      Subject: `Channel Check: ${invalidProducts.length} invalid products`,
      TextBody: invalidProducts.length
        ? `❌ Found ${invalidProducts.length} product(s) not in a valid group:\n\n${invalidProducts.join('\n')}`
        : `✅ Checked ${checked} products. All products are in valid groups.`
    });

    res.status(200).send(`Checked ${checked} products. Found ${invalidProducts.length} invalid products.`);
  } catch (err) {
    console.error(err);
    res.status(500).send(`💥 Error: ${err.message}`);
  }
};
