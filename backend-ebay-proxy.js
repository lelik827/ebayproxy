import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import querystring from 'querystring';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { Buffer } from 'buffer'; // Added for OAuth token handling

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// For __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const {
  EBAY_CLIENT_ID,
  EBAY_CLIENT_SECRET,
  EBAY_REDIRECT_URI,
} = process.env;

// Trust proxies (fixes X-Forwarded-For validation error on Render)
// Set to 1 to trust the first proxy hop, avoiding the permissive 'true' setting
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json());

// Serve static frontend files from 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting middleware (1 request per 5 seconds)
const searchLimiter = rateLimit({
  windowMs: 5000,
  max: 1,
  message: 'Too many requests, please wait 5 seconds',
});

// OAuth routes (same as before, but keeping in case you need them later)
app.get('/auth/login', (req, res) => {
  const scope = 'https://api.ebay.com/oauth/api_scope';
  const query = querystring.stringify({
    client_id: EBAY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: EBAY_REDIRECT_URI,
    scope,
  });
  const ebayAuthUrl = `https://auth.ebay.com/oauth2/authorize?${query}`;
  res.redirect(ebayAuthUrl);
});

app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send('Missing auth code');
  }

  const tokenUrl = 'https://api.ebay.com/identity/v1/oauth2/token';
  const basicAuth = Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString('base64');
  const tokenParams = querystring.stringify({
    grant_type: 'authorization_code',
    code,
    redirect_uri: EBAY_REDIRECT_URI,
  });

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenParams,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Token exchange failed:', errorText);
      return res.status(500).send(`Token exchange failed:\n${errorText}`);
    }

    const tokenData = await response.json();
    console.log('🔑 Access Token:', tokenData.access_token);
    res.send('✅ eBay OAuth completed successfully! You can close this window.');
  } catch (err) {
    console.error('❌ OAuth error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// eBay search API proxy
app.get('/api/search', searchLimiter, async (req, res) => {
  const { keyword } = req.query;
  if (!keyword) {
    return res.status(400).json({ error: 'Missing keyword parameter' });
  }

  if (!EBAY_CLIENT_ID) {
    console.error('❌ EBAY_CLIENT_ID not set in environment variables');
    return res.status(500).json({ error: 'Server configuration error: Missing eBay AppID' });
  }

  const searchUrl = `https://svcs.ebay.com/services/search/FindingService/v1` +
    `?OPERATION-NAME=findCompletedItems` +
    `&SERVICE-VERSION=1.0.0` +
    `&SECURITY-APPNAME=${EBAY_CLIENT_ID}` +
    `&RESPONSE-DATA-FORMAT=JSON` +
    `&REST-PAYLOAD` +
    `&keywords=${encodeURIComponent(keyword)}` +
    `&itemFilter(0).name=SoldItemsOnly` +
    `&itemFilter(0).value=true` +
    `&paginationInput.entriesPerPage=5`;

  try {
    const response = await fetch(searchUrl);
    const data = await response.json();

    if (data.errorMessage) {
      console.error('❌ eBay API error:', JSON.stringify(data.errorMessage, null, 2));
      return res.status(500).json({ error: 'eBay API error', details: data.errorMessage });
    }

    res.json(data);
  } catch (err) {
    console.error('❌ Search error:', err.message);
    res.status(500).json({ error: 'eBay API error', details: err.message });
  }
});

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

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
