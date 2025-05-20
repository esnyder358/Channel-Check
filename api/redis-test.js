const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

module.exports = async (req, res) => {
  try {
    const testKey = "redis_test_key";
    const testValue = "Hello from Redis via Vercel";

    // Set key
    await redis.set(testKey, testValue);

    // Get key
    const value = await redis.get(testKey);

    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(`✅ Redis set/get success:\n\n${testKey} = ${value}`);
  } catch (error) {
    res.setHeader('Content-Type', 'text/plain');
    res.status(500).send(`❌ Redis test failed: ${error.message}`);
  }
};
