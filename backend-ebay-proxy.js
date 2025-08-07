import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import querystring from 'querystring';
import rateLimit from 'express-rate-limit';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Load eBay credentials from environment
const {
  EBAY_CLIENT_ID,
  EBAY_CLIENT_SECRET,
  EBAY_REDIRECT_URI,
} = process.env;

app.use(cors());

// Rate limiting middleware (1 request per 5 seconds)
const searchLimiter = rateLimit({
  windowMs: 5000, // 5 seconds
  max: 1,
  message: 'Too many requests, please wait 5 seconds',
});

// 🔐 /auth/login - Start OAuth flow
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

// 🔐 /auth/callback - Handle OAuth redirect
app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send('Missing auth code');
  }

  console.log('✅ Received code:', code);

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
        'Authorization': `Basic ${basicAuth}`,
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

// 🔍 /api/search - Find sold items
app.get('/api/search', searchLimiter, async (req, res) => {
  const { keyword } = req.query;
  if (!keyword) {
    return res.status(400).json({ error: 'Missing keyword parameter' });
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
      console.error('❌ eBay API error:', JSON.stringify(data, null, 2));
    }

    res.json(data);
  } catch (err) {
    console.error('❌ Search error:', err);
    res.status(500).json({ error: 'eBay API error', details: err.message });
  }
});

// 🟢 Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
