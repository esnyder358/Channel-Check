// pages/api/report.js (for Vercel with GraphQL and A-M vendor filter)

import { request, gql } from 'graphql-request';

export default async function handler(req, res) {
  try {
    const {
      SHOPIFY_STORE_DOMAIN,
      SHOPIFY_ADMIN_API_PASSWORD,
    } = process.env;

    const endpoint = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2023-10/graphql.json`;
    const headers = {
      'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_PASSWORD,
      'Content-Type': 'application/json',
    };

    const validChannelGroups = [
      ['Online Store', 'Carro', 'Lyve: Shoppable Video & Stream'],
      ['Online Store', 'Collective: Supplier', 'Lyve: Shoppable Video & Stream']
    ];

    let productIds = [];
    let cursor = null;
    let hasNextPage = true;

    while (hasNextPage) {
      const query = gql`
        query FetchProducts($cursor: String) {
          products(first: 50, after: $cursor, query: "vendor:A* OR vendor:B* OR vendor:C* OR vendor:D* OR vendor:E* OR vendor:F* OR vendor:G* OR vendor:H* OR vendor:I* OR vendor:J* OR vendor:K* OR vendor:L* OR vendor:M*") {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                id
                title
                variants(first: 50) {
                  edges {
                    node {
                      metafield(namespace: "custom", key: "variantchannels") {
                        value
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const data = await request(endpoint, query, { cursor }, headers);
      const edges = data.products.edges;

      for (const edge of edges) {
        const product = edge.node;

        const allChannels = product.variants.edges
          .map(v => {
            const val = v.node.metafield?.value;
            try {
              return val ? JSON.parse(val) : [];
            } catch (e) {
              return [];
            }
          });

        const isValid = validChannelGroups.some(group =>
          group.every(channel =>
            allChannels.some(variantChannels => variantChannels.includes(channel))
          )
        );

        if (!isValid) {
          const productId = product.id.replace('gid://shopify/Product/', '');
          productIds.push(productId);
        }
      }

      hasNextPage = data.products.pageInfo.hasNextPage;
      cursor = data.products.pageInfo.endCursor;
    }

    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(productIds.join('\n'));

  } catch (err) {
    console.error('Error:', err);
    res.status(500).send('Internal Server Error');
  }
}
