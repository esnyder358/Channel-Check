export default async function handler(req, res) {
  console.log("API route hit");

  // ... rest of your code
}

const fetch = require('node-fetch');

// Fetch products from Shopify using API credentials
async function fetchShopifyProducts() {
  const response = await fetch(`https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2023-04/products.json`, {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${process.env.SHOPIFY_API_KEY}:${process.env.SHOPIFY_API_PASSWORD}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json();
  return data.products; // Return the list of products from Shopify
}

// Define the valid channel combinations
function filterProductsByChannel(products) {
  const validCombos = [
    ["Carro", "Online Store", "Lyve: Shoppable Video & Stream"], // Combo 1
    ["Collective: Supplier", "Online Store", "Lyve: Shoppable Video & Stream"], // Combo 2
  ];

  return products.filter(product => {
    // Get the unique channels for the product (assuming each product variant has a 'channel_ids' field)
    const productChannels = product.variants.flatMap(variant => variant.channel_ids);

    // Check if the product matches any of the valid combinations
    const isValidCombo = validCombos.some(combo => 
      combo.every(channel => productChannels.includes(channel))
    );

    // If the product does not belong to a valid combo, include it in the report
    return !isValidCombo;
  });
}

// Send the filtered list of products via Postmark email
async function sendEmailWithPostmark(subject, body) {
  const response = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': process.env.POSTMARK_API_KEY,
    },
    body: JSON.stringify({
      From: process.env.EMAIL_FROM,
      To: process.env.EMAIL_TO,
      Subject: subject,
      HtmlBody: body,
      TextBody: body,
    }),
  });

  const result = await response.json();
  console.log(result);
}

// Generate the report for products not in valid channel combinations
async function generateReport() {
  const products = await fetchShopifyProducts(); // Fetch products from Shopify
  const filteredProducts = filterProductsByChannel(products); // Filter by channels

  if (filteredProducts.length > 0) {
    let body = "<h1>Products not in specified channels:</h1><ul>";
    
    filteredProducts.forEach(product => {
      body += `<li>${product.title}</li>`; // Add each filtered product to the list
    });
    
    body += "</ul>";
    
    await sendEmailWithPostmark('Weekly Channel Check Report', body); // Send via Postmark email
  } else {
    console.log('No products found to report.');
  }
}

// Run the report generation function
generateReport();
