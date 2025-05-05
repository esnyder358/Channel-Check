const fetch = require('node-fetch');
const postmark = require('postmark');

module.exports = async (req, res) => {
  try {
    const {
      SHOPIFY_STORE_DOMAIN,
      SHOPIFY_ADMIN_API_KEY,
      SHOPIFY_ADMIN_API_PASSWORD,
      TAGS_TO_CHECK, // Environmental variable for the tag
      POSTMARK_API_KEY,
      EMAIL_TO,
      EMAIL_FROM
    } = process.env;

    console.log("🔧 ENV loaded:", {
      SHOPIFY_STORE_DOMAIN,
      TAGS_TO_CHECK,
      EMAIL_TO,
      EMAIL_FROM
    });

    if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ADMIN_API_KEY || !SHOPIFY_ADMIN_API_PASSWORD) {
      throw new Error("Missing Shopify credentials in environment.");
    }

    // Tag to check: TAGS_TO_CHECK (should be "Missing Sales Channels")
    const missingTag = TAGS_TO_CHECK.trim().toLowerCase();
    const productIdsWithTag = [];
    let products = [];
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
        console.error("❌ Shopify API error:", errorText);
        throw new Error("Shopify API request failed.");
      }

      const data = await response.json();
      products = data.products || [];
      console.log(`📦 Fetched ${products.length} products`);

      // Check each product for the "Missing Sales Channels" tag
      for (const product of products) {
        const productTags = product.tags.toLowerCase().split(',').map(t => t.trim());
        const hasMissingSalesChannelsTag = productTags.includes(missingTag);
        if (hasMissingSalesChannelsTag) {
          productIdsWithTag.push(product.id);
        }
      }

      // Shopify REST pagination (simplified assumption for now)
      hasNextPage = false; // Adjust pagination logic if necessary
    }

    console.log("🚨 Products with 'Missing Sales Channels' tag:", productIdsWithTag);

    if (productIdsWithTag.length > 0) {
      const client = new postmark.ServerClient(POSTMARK_API_KEY);
      const sendResult = await client.sendEmail({
        From: EMAIL_FROM,
        To: EMAIL_TO,
        Subject: "Products with 'Missing Sales Channels' Tag",
        TextBody: `Products with the 'Missing Sales Channels' tag:\n\n${productIdsWithTag.join('\n')}`
      });
      console.log("📧 Email sent:", sendResult);
    }

    res.status(200).json({
      message: "Check complete.",
      productsWithTag: productIdsWithTag
    });

  } catch (err) {
    console.error("💥 Error occurred:", err);
    res.status(500).json({ error: err.message });
  }
};
