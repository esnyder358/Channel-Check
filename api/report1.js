const fetch = require('node-fetch');

const POSTMARK_API_KEY = process.env.POSTMARK_API_KEY;
const POSTMARK_EMAIL_TO = process.env.POSTMARK_EMAIL_TO;
const POSTMARK_EMAIL_FROM = process.env.POSTMARK_EMAIL_FROM;
const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_ADMIN_API_PASSWORD = process.env.SHOPIFY_ADMIN_API_PASSWORD;

const IGNORED_CHANNELS = [
  "Blueswitch",
  "Multify",
  "Customer Shipping Rates",
  "Facebook & Instagram",
  "Shop",
  "Google & YouTube",
  "Yotpo Email Marketing & SMS",
  "Pinterest"
];

const VALID_GROUPS = [
  ["Online Store", "Carro", "Lyve: Shoppable Video & Stream"],
  ["Online Store", "Collective: Supplier", "Lyve: Shoppable Video & Stream"]
];

async function fetchProducts(cursor = null) {
  const query = `
    query GetProducts($cursor: String) {
      products(first: 50, after: $cursor) {
        edges {
          cursor
          node {
            id
            title
            vendor
            publications(first: 20) {
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
        pageInfo {
          hasNextPage
        }
      }
    }
  `;

  const response = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/admin/api/2023-10/graphql.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_PASSWORD,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables: { cursor } }),
  });

  const result = await response.json();
  if (result.errors) {
    throw new Error(`GraphQL error: ${JSON.stringify(result.errors)}`);
  }

  return result.data.products;
}

function isInValidGroup(channels) {
  const filtered = channels.filter(name => !IGNORED_CHANNELS.includes(name));
  return VALID_GROUPS.some(group =>
    group.every(valid => filtered.includes(valid))
  );
}

async function sendEmail(productIds) {
  if (!POSTMARK_API_KEY || !POSTMARK_EMAIL_TO || !POSTMARK_EMAIL_FROM) {
    throw new Error("Missing Postmark environment variables.");
  }

  const response = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'X-Postmark-Server-Token': POSTMARK_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      From: POSTMARK_EMAIL_FROM,
      To: POSTMARK_EMAIL_TO,
      Subject: '⚠️ Invalid Shopify Product Publication Detected',
      TextBody: `The following product IDs are not in a valid publication group:\n\n${productIds.join('\n')}`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to send email: ${await response.text()}`);
  }
}

module.exports = async (req, res) => {
  try {
    let cursor = req.query.cursor || null;
    let hasNextPage = true;
    let checkedCount = 0;
    const invalidProductIds = [];

    while (hasNextPage && checkedCount < 1000) {
      const productsData = await fetchProducts(cursor);
      for (const edge of productsData.edges) {
        const product = edge.node;
        const channels = product.publications.edges.map(pub => pub.node.publication?.name).filter(Boolean);
        const filteredChannels = channels.filter(c => !IGNORED_CHANNELS.includes(c));

        if (!isInValidGroup(filteredChannels)) {
          invalidProductIds.push(product.id);
        }

        checkedCount++;
        cursor = edge.cursor;
      }

      hasNextPage = productsData.pageInfo.hasNextPage;
    }

    if (invalidProductIds.length > 0) {
      await sendEmail(invalidProductIds);
    }

    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(
      invalidProductIds.length
        ? `❌ Found ${invalidProductIds.length} invalid products. Email sent.\n\nChecked ${checkedCount} products.`
        : `✅ All checked products (${checkedCount}) are in valid channel groups.`
    );
  } catch (err) {
    console.error(err);
    res.status(500).send(`💥 Error: ${err.message}`);
  }
};
