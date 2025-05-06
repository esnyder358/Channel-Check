const fetch = require('node-fetch');
const postmark = require('postmark');

module.exports = async (req, res) => {
  try {
    const {
      SHOPIFY_STORE_DOMAIN,
      SHOPIFY_ADMIN_API_KEY,
      SHOPIFY_ADMIN_API_PASSWORD,
      POSTMARK_API_KEY,
      EMAIL_TO,
      EMAIL_FROM
    } = process.env;

    console.log("🔧 ENV loaded:", {
      SHOPIFY_STORE_DOMAIN,
      EMAIL_TO,
      EMAIL_FROM
    });

    if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ADMIN_API_KEY || !SHOPIFY_ADMIN_API_PASSWORD) {
      throw new Error("Missing Shopify credentials in environment.");
    }

    const missingTagProductIds = [];
    let pageInfo = null;
    let hasNextPage = true;

    // Loop through all pages of products
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
      const products = data.products || [];
      console.log(`📦 Fetched ${products.length} products`);

      // Process each product
      for (const product of products) {
        // Skip products that don't match the vendor filter (A-M)
        const vendor = product.vendor || '';
        if (vendor[0].toUpperCase() < 'A' || vendor[0].toUpperCase() > 'M') continue;

        // Check if the product is in the proper channels
        const productChannels = product.variants
          .map(variant => variant.metafields?.custom?.variantchannels || [])
          .flat();

        const validCombinations = [
          ["Online Store", "Carro", "Lyve: Shoppable Video & Stream"],
          ["Online Store", "Collective: Supplier", "Lyve: Shoppable Video & Stream"]
        ];

        const isValid = validCombinations.some(combination =>
          combination.every(channel =>
            productChannels.some(variantChannels =>
              variantChannels.includes(channel)
            )
          )
        );

        // If the product is not in the valid channels, add to the list of products with missing channels
        if (!isValid) {
          missingTagProductIds.push(product.id);
        }
      }

      // Check if there's a next page of products
      pageInfo = data.links?.next || null;
      hasNextPage = !!pageInfo;
    }

    console.log("🚨 Missing tag product IDs:", missingTagProductIds);

    if (missingTagProductIds.length > 0) {
      const client = new postmark.ServerClient(POSTMARK_API_KEY);
      const sendResult = await client.sendEmail({
        From: EMAIL_FROM,
        To: EMAIL_TO,
        Subject: "Products Missing Proper Channels",
        TextBody: `Products missing proper sales channels:\n\n${missingTagProductIds.join('\n')}`
      });
      console.log("📧 Email sent:", sendResult);
    }

    res.status(200).json({
      message: "Check complete.",
      missing: missingTagProductIds
    });

  } catch (err) {
    console.error("💥 Error occurred:", err);
    res.status(500).json({ error: err.message });
  }
};
