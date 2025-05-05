import axios from 'axios';

module.exports = async (req, res) => {
  try {
    const {
      SHOPIFY_STORE_DOMAIN,
      SHOPIFY_ADMIN_API_KEY,
      SHOPIFY_ADMIN_API_PASSWORD,
      TAGS_TO_CHECK,
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

    // Fetch products from Shopify
    const response = await axios.get(shopifyUrl, auth);
    const products = response.data.products;

    // Define the valid channel combinations
    const validChannels = [
      ["Carro", "Online Store", "Lyve: Shoppable Video & Stream"],
      ["Collective: Supplier", "Online Store", "Lyve: Shoppable Video & Stream"]
    ];

    // Check each product and see if it meets the required channel conditions
    const invalidProducts = [];

    for (const product of products) {
      const productChannels = product.variants.map(variant => variant.metafields.custom.variantchannels || []);
      
      // Check if the product channels match any of the valid combinations
      const isValid = validChannels.some(combination => 
        combination.every(channel => productChannels.some(variantChannels => variantChannels.includes(channel)))
      );

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
}
