import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: 'https://above-monkfish-17358.upstash.io',
  token: 'AUPOAAIjcDEwMWZhZWUwZGFhODI0MjhhYWI2YjUyNWIyMTAzZjcyMXAxMA',
})

await redis.set('foo', 'bar');
const data = await redis.get('foo');

module.exports = async (req, res) => {
  try {
    await redis.set('test-key', 'Hello from Redis!');
    const value = await redis.get('test-key');

    res.status(200).json({ success: true, value });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
