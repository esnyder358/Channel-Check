const fetch = require('node-fetch');
const { Redis } = require('@upstash/redis');
const postmark = require('postmark');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const postmarkClient = new postmark.ServerClient(process.env.POSTMARK_API_KEY);

const VALID_CHANNEL_GROUPS = [
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

const PRODUCTS_PER_BATCH = 250;
const CURSOR_KEY = "shopify_cursor";

module.exports = async (req, res) => {
  const debugLog = [];
  try {
    const {
      SHOPIFY_STORE_DOMAIN,
      SHOPIFY_ADMIN_API_PASSWORD,
      EMAIL_FROM,
      EMAIL_TO
    } = process.env;

    if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ADMIN_API_PASSWORD || !EMAIL_FROM || !EMAIL_TO) {
      throw new Error("Missing required environment variables.");
    }

    let cursor = await redis.get(CURSOR_KEY);
    debugLog.push(`👉 Current cursor from Redis: ${cursor || "none"}`);

    let hasNextPage = true;
    let checkedCount = 0;
    const invalidProductIds = [];

    while (hasNextPage && checkedCount < 1000) {
      const query = `
        query GetProducts($cursor: String) {
          products(first: ${PRODUCTS_PER_BATCH}, after: $cursor) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                id
                vendor
                publications(first: 10) {
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

      const variables = { cursor };

      const response = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/admin/api/2023-10/graphql.json`, {
        method: 'POST',
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": SHOPIFY_ADMIN_API_PASSWORD
        },
        body: JSON.stringify({ query, variables })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Shopify API error: ${errorText}`);
      }

      const json = await response.json();

      if (json.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
      }

      const products = json.data.products.edges.map(e => e.node);
      const pageInfo = json.data.products.pageInfo;

      for (const product of products) {
        checkedCount++;

        const channelNames = product.publications.edges
          .map(edge => edge.node.channel?.name)
          .filter(name => name && !IGNORED_CHANNELS.has(name));

        const inValidGroup = VALID_CHANNEL_GROUPS.some(group =>
          group.every(channel => channelNames.includes(channel))
        );

        if (!inValidGroup) {
          invalidProductIds.push(product.id);
        }
      }

      if (pageInfo.hasNextPage) {
        cursor = pageInfo.endCursor;
      } else {
        hasNextPage = false;
        cursor = null;
      }
    }

    if (cursor) {
      await redis.set(CURSOR_KEY, cursor);
      debugLog.push(`✅ Saving new cursor to Redis: ${cursor}`);
    } else {
      await redis.del(CURSOR_KEY);
      debugLog.push(`🧹 Resetting Redis cursor (end reached)`);
    }

    let emailBody;
    if (invalidProductIds.length > 0) {
      emailBody = `Checked ${checkedCount} products.\n\nFound ${invalidProductIds.length} INVALID products (not in valid channel groups):\n\n${invalidProductIds.join('\n')}`;
    } else {
      emailBody = `Checked ${checkedCount} products.\n\n✅ No invalid products found.`;
    }

    debugLog.push(`📬 Email body:\n${emailBody}`);

    await postmarkClient.sendEmail({
      From: EMAIL_FROM,
      To: EMAIL_TO,
      Subject: `Shopify Product Channel Check Report`,
      TextBody: emailBody
    });

    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(debugLog.join('\n'));

  } catch (error) {
    debugLog.push(`💥 Error: ${error.message}`);
    res.setHeader('Content-Type', 'text/plain');
    res.status(500).send(debugLog.join('\n'));
  }
};
