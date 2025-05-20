const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

module.exports = async (req, res) => {
  try {
    await redis.set('test-key', 'Hello from Redis!');
    const value = await redis.get('test-key');

    res.status(200).json({ success: true, value });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
