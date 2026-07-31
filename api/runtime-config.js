module.exports = function handler(req, res) {
  const gatewayUrl = String(process.env.TOEFL_API_GATEWAY_URL || "").trim().replace(/\/+$/, "");

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    gatewayUrl,
    apiGatewayUrl: gatewayUrl,
    source: gatewayUrl ? "vercel-env" : "unset",
  });
}
