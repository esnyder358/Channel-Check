const axios = require('axios');

// Your environment variables should be set up in GitHub secrets or locally for testing
const {
  SHOPIFY_STORE_DOMAIN,
  SHOPIFY_ADMIN_API_KEY,
  SHOPIFY_ADMIN_API_PASSWORD,
} = process.env;

async function getMissingSalesChannelsProducts() {
  try {
    console.log("🔧 Starting to fetch products with 'Missing Sales Channels' tag");

    // Check for required Shopify credentials
    if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ADMIN_API_KEY || !SHOPIFY_ADMIN_API_PASSWORD) {
      throw new Error("Missing Shopify credentials in environment.");
    }

    // Shopify API URL to fetch products with the tag "Missing Sales Channels"
    const shopifyUrl = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2023-04/products.json?tag=Missing%20Sales%20Channels`;

    // Authentication headers for Shopify
    const auth = {
      auth: {
        username: SHOPIFY_ADMIN_API_KEY,
        password: SHOPIFY_ADMIN_API_PASSWORD,
      },
    };

    // Fetch products from Shopify
    const response = await axios.get(shopifyUrl, auth);
    const products = response.data.products;

    // Filter products with the "Missing Sales Channels" tag
    const missingSalesChannelsProducts = products.filter(product =>
      product.tags.includes('Missing Sales Channels')
    );

    // Display product IDs for products that have the "Missing Sales Channels" tag
    if (missingSalesChannelsProducts.length === 0) {
      console.log("No products found with the 'Missing Sales Channels' tag.");
    } else {
      console.log("Found products with 'Missing Sales Channels' tag:");
      missingSalesChannelsProducts.forEach(product => {
        console.log(`Product ID: ${product.id}`);
      });
    }
  } catch (error) {
    console.error("Error fetching Shopify products:", error);
  }
}

// Run the function to get the products
getMissingSalesChannelsProducts();
