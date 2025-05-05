import axios from 'axios';

export default async function handler(req, res) {
  try {
    // Retrieve Shopify API credentials and domain from environment variables
    const { SHOPIFY_API_KEY, SHOPIFY_API_PASSWORD, SHOPIFY_STORE_DOMAIN } = process.env;
    
    // Shopify Storefront URL and API URL
    const shopifyUrl = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2023-04/products.json`;
    
    // Basic Authentication Header for Shopify API
    const auth = {
      auth: {
        username: SHOPIFY_API_KEY,
        password: SHOPIFY_API_PASSWORD,
      },
    };

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
