const axios = require('axios');
const postmark = require('postmark');

module.exports = async (req, res) => {
  try {
    const {
      SHOPIFY_STORE_DOMAIN,
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

    if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ADMIN_API_PASSWORD) {
      throw new Error("Missing Shopify credentials in environment.");
    }

    const fetchProducts = async () => {
      let allProducts = [];
      let pageInfo = null;
      let hasNextPage = true;

      while (hasNextPage) {
        const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2023-10/products.json?limit=250${pageInfo ? `&page_info=${pageInfo}` : ''}`;

        const response = await axios.get(url, {
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_PASSWORD,
            'Content-Type': 'application/json'
          }
        });

        const linkHeader = response.headers['link'];
        if (linkHeader && linkHeader.includes('rel="next"')) {
          const match = linkHeader.match(/page_info=([^&>]+)/);
          pageInfo = match ? match[1] : null;
        } else {
          hasNextPage = false;
        }

        allProducts = allProducts.concat(response.data.products);
      }

      return allProducts;
    };

    const fetchProductChannels = async (productId) => {
      const gid = `gid://shopify/Product/${productId}`;
      const query = {
        query: `{
          product(id: "${gid}") {
            publications(first: 10) {
              edges {
                node {
                  publication {
                    name
                  }
                }
              }
            }
          }
        }`
      };

      const response = await axios.post(
        `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2023-10/graphql.json`,
        query,
        {
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_PASSWORD,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data.data.product.publications.edges.map(
        edge => edge.node.publication.name
      );
    };

    const validChannelGroups = [
      ["Online Store", "Carro", "Lyve: Shoppable Video & Stream"],
      ["Online Store", "Collective: Supplier", "Lyve: Shoppable Video & Stream"]
    ];

    const allProducts = await fetchProducts();
    const invalidProductIds = [];

    for (const product of allProducts) {
      const channelNames = await fetchProductChannels(product.id);

      const matchesGroup = validChannelGroups.some(group =>
        group.every(reqChannel => channelNames.includes(reqChannel))
      );

      if (!matchesGroup) {
        invalidProductIds.push(product.id);
      }
    }

    console.log("🚨 Products not in valid channel groups:", invalidProductIds);

    if (invalidProductIds.length > 0) {
      const client = new postmark.ServerClient(POSTMARK_API_KEY);
      await client.sendEmail({
        From: EMAIL_FROM,
        To: EMAIL_TO,
        Subject: "Products Missing Required Channel Groups",
        TextBody: `The following product IDs do not match required channel groups:\n\n${invalidProductIds.join('\n')}`
      });
    }

    res.status(200).json({
      success: true,
      missing: invalidProductIds
    });

  } catch (error) {
    console.error("💥 Error generating report:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};
