const fetch = require('node-fetch');
const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_ADMIN_API_PASSWORD = process.env.SHOPIFY_ADMIN_API_PASSWORD;

const POSTMARK_API_KEY = process.env.POSTMARK_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM;
const EMAIL_TO = process.env.EMAIL_TO;

// Your valid sales channel groups (products can have extra channels besides these groups)
const validGroups = [
  ["Online Store", "Carro", "Lyve: Shoppable Video & Stream"],
  ["Online Store", "Collective: Supplier", "Lyve: Shoppable Video & Stream"]
];

// List of ignored sales channels that do not affect validation
const ignoredChannels = [
  "Blueswitch",
  "Multify",
  "Customer Shipping Rates",
  "Facebook & Instagram",
  "Shop",
  "Google & YouTube",
  "Yotpo Email Marketing & SMS",
  "Pinterest",
];

async function getCursor() {
  return await redis.get('productCursor');
}

async function setCursor(cursor) {
  await redis.set('productCursor', cursor);
}

async function sendEmail(subject, body) {
  const response = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": POSTMARK_API_KEY,
    },
    body: JSON.stringify({
      From: EMAIL_FROM,
      To: EMAIL_TO,
      Subject: subject,
      TextBody: body,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Postmark API error: ${errText}`);
  }
}

module.exports = async (req, res) => {
  try {
    if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ADMIN_API_PASSWORD) {
      throw new Error("Missing Shopify credentials in environment.");
    }
    if (!POSTMARK_API_KEY || !EMAIL_FROM || !EMAIL_TO) {
      throw new Error("Missing Postmark email credentials in environment.");
    }

    let cursor = await getCursor(); // null if none stored yet
    let hasNextPage = true;
    let checkedCount = 0;
    const invalidProductIds = [];

    while (hasNextPage) {
      // Shopify GraphQL Admin API query with cursor pagination
      const query = `
      {
        products(first: 100${cursor ? `, after: "${cursor}"` : ''}) {
          edges {
            cursor
            node {
              id
              vendor
              publications {
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
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }`;

      const response = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/admin/api/2023-10/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_PASSWORD,
        },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Shopify API error: ${errorText}`);
      }

      const json = await response.json();
      if (json.errors) {
        throw new Error(`GraphQL error: ${JSON.stringify(json.errors)}`);
      }

      const products = json.data.products.edges;

      for (const productEdge of products) {
        const product = productEdge.node;
        const vendorFirstLetter = product.vendor?.[0]?.toUpperCase();

        // Filter vendors by first letter if needed; currently no filtering (all vendors)
        // If you want to filter to A-B vendors, uncomment:
        // if (!vendorFirstLetter || vendorFirstLetter < 'A' || vendorFirstLetter > 'B') continue;

        // Gather product channel names, excluding ignored channels
        const channelNames = product.publications.edges
          .map(e => e.node.channel?.name)
          .filter(name => name && !ignoredChannels.includes(name));

        // Check if product channels include at least one of the validGroups as a subset (allow extra channels)
        const isValid = validGroups.some(group =>
          group.every(channel => channelNames.includes(channel))
        );

        if (!isValid) {
          invalidProductIds.push(product.id);
        }
      }

      checkedCount += products.length;

      // Pagination info
      hasNextPage = json.data.products.pageInfo.hasNextPage;
      cursor = json.data.products.pageInfo.endCursor;

      // Save cursor for next run
      await setCursor(cursor);

      // To avoid long-running functions, break early (optional)
      // Comment out if you want full scan every run
      // if (checkedCount >= 500) break;
    }

    // Compose email body & subject
    let emailSubject = '';
    let emailBody = '';

    if (invalidProductIds.length > 0) {
      emailSubject = `Shopify Check: ${invalidProductIds.length} products NOT in valid channel groups`;
      emailBody = `The following product IDs were found NOT in valid channel groups:\n\n${invalidProductIds.join('\n')}`;
    } else {
      emailSubject = `Shopify Check: All products are in valid channel groups`;
      emailBody = `✅ Checked ${checkedCount} products. No invalid products found.`;
    }

    // Send email report
    await sendEmail(emailSubject, emailBody);

    // Respond success
    res.status(200).send(emailBody);
  } catch (err) {
    res.status(500).send(`💥 Error: ${err.message}`);
  }
};
