const fetch = require('node-fetch');
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

    const VALID_CHANNEL_GROUPS = [
      ["Online Store", "Carro", "Lyve: Shoppable Video & Stream"],
      ["Online Store", "Collective: Supplier", "Lyve: Shoppable Video & Stream"]
    ];

    const vendorStartsWithAtoM = (vendor) => {
      if (!vendor || typeof vendor !== 'string') return false;
      const firstChar = vendor.trim().charAt(0).toUpperCase();
      return firstChar >= 'A' && firstChar <= 'M';
    };

    const failedProductIds = [];
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
        console.error("Shopify API error:", errorText);
        throw new Error("Shopify API request failed.");
      }

      const linkHeader = response.headers.get('link');
      const data = await response.json();
      const products = data.products || [];

      for (const product of products) {
        if (!vendorStartsWithAtoM(product.vendor)) continue;

        const publishedChannels = (product.published_scope === 'global' ? ["Online Store"] : []);

        if (product.admin_graphql_api_id) {
          // Ideally use the GraphQL API to get full publication info
          // Placeholder until you switch to GraphQL:
        }

        const currentChannels = product.published_channels?.map(ch => ch.name) || publishedChannels;

        const isValid = VALID_CHANNEL_GROUPS.some(group =>
          group.every(required => currentChannels.includes(required))
        );

        if (!isValid) {
          failedProductIds.push(product.id);
        }
      }

      // Handle pagination (only works if link header provided)
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        if (match) {
          const nextUrl = new URL(match[1]);
          pageInfo = nextUrl.searchParams.get("page_info");
          hasNextPage = true;
        } else {
          hasNextPage = false;
        }
      } else {
        hasNextPage = false;
      }
    }

    if (failedProductIds.length > 0) {
      const client = new postmark.ServerClient(POSTMARK_API_KEY);
      await client.sendEmail({
        From: EMAIL_FROM,
        To: EMAIL_TO,
        Subject: "Sales Channel Check: Vendors A–M",
        TextBody: `The following products (vendor A–M) do NOT meet the required channel groups:\n\n${failedProductIds.join('\n')}`
      });
    }

    res.status(200).json({
      success: true,
      checked: "A–M vendors",
      totalFailures: failedProductIds.length,
      productIds: failedProductIds
    });

  } catch (err) {
    console.error("💥 Error occurred:", err);
    res.status(500).json({ error: err.message });
  }
};
