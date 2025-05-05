import axios from 'axios';

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

    // Check for required Shopify credentials
    if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ADMIN_API_KEY || !SHOPIFY_ADMIN_API_PASSWORD) {
      throw new Error("Missing Shopify credentials in environment.");
    }

    // Construct Shopify API URL
    const shopifyUrl = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2023-04/products.json`;

    // Authentication headers for Shopify
    const auth = {
      auth: {
        username: SHOPIFY_ADMIN_API_KEY,
        password: SHOPIFY_ADMIN_API_PASSWORD
      }
    };

    // Fetch products from Shopify
    const response = await axios.get(shopifyUrl, auth);
    const products = response.data.products;

    // Define the valid channel combinations
    const validChannels = [
      ["Online Store", "Carro", "Lyve: Shoppable Video & Stream"],
      ["Online Store", "Collective: Supplier", "Lyve: Shoppable Video & Stream"]
    ];

    // Check each product and see if it meets the required channel conditions
    const invalidProducts = [];

    for (const product of products) {
      // Fetch variant metafields (ensure the metafields are loaded correctly from Shopify)
      const productChannels = product.variants.map(variant => {
        const variantMetafields = variant.metafields?.custom?.variantchannels || [];
        return variantMetafields;
      });

      // Check if the product channels match any of the valid combinations
      const isValid = validChannels.some(combination =>
        combination.every(channel =>
          productChannels.some(variantChannels =>
            variantChannels.includes(channel)
          )
        )
      );

      // Add product to invalid products if it doesn't match any valid combinations
      if (!isValid) {
        invalidProducts.push({
          id: product.id,
          title: product.title,
          channels: productChannels,
        });
      }
    }

    // Respond with the invalid products list
    res.status(200).json({
      success: true,
      message: "Report generated successfully",
      invalidProducts: invalidProducts,
    });
  } catch (error) {
    console.error("Error fetching Shopify products:", error);
    res.status(500).json({ success: false, message: "Failed to generate report", error: error.message });
  }
};
