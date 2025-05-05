export default async function handler(req, res) {
  console.log("✅ Function hit");
  res.status(200).json({ success: true, message: "Function is working" });
}
