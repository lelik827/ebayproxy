// Add this after your existing imports
import { Buffer } from 'buffer'; // If not already imported

// New route to check rate limits
app.get('/api/check-limits', async (req, res) => {
  if (!EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET) {
    return res.status(500).json({ error: 'Missing eBay credentials' });
  }

  const tokenUrl = 'https://api.ebay.com/identity/v1/oauth2/token';
  const basicAuth = Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString('base64');
  const tokenParams = querystring.stringify({
    grant_type: 'client_credentials',
    scope: 'https://api.ebay.com/oauth/api_scope',
  });

  try {
    // Get OAuth app token
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenParams,
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      return res.status(500).json({ error: `Token fetch failed: ${errorText}` });
    }

    const { access_token } = await tokenResponse.json();

    // Fetch rate limits
    const limitsUrl = 'https://api.ebay.com/developer/analytics/v1/rate_limit';
    const limitsResponse = await fetch(limitsUrl, {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    if (!limitsResponse.ok) {
      const errorText = await limitsResponse.text();
      return res.status(500).json({ error: `Limits fetch failed: ${errorText}` });
    }

    const limitsData = await limitsResponse.json();
    res.json(limitsData);
  } catch (err) {
    console.error('❌ Limits check error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
