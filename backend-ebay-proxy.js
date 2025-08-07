import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import querystring from 'querystring';
import rateLimit from 'express-rate-limit';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Load eBay credentials from environment variables
const {
  EBAY_APP_ID,        // App ID for Finding API calls (SECURITY-APPNAME)
  EBAY_CLIENT_ID,     // OAuth Client ID
  EBAY_CLIENT_SECRET, // OAuth Client Secret
  EBAY_REDIRECT_URI,  // OAuth Redirect URI
} = process.env;

if (!EBAY_APP_ID) console.warn('⚠️ Missing EBAY_APP_ID env variable');
if (!EBAY_CLIENT_ID) console.warn('⚠️ Missing EBAY_CLIENT_ID env variable');
if (!EBAY_CLIENT_SECRET) console.warn('⚠️ Missing EBAY_CLIENT_SECRET env variable');
if (!EBAY_REDIRECT_URI) console.warn('⚠️ Missing EBAY_REDIRECT_URI env variable');

app.use(cors());
app.use(express.json());

// Rate limiting middleware: max 1 request per 5 seconds
const searchLimiter = rateLimit({
  windowMs: 5000,
  max: 1,
  message: { error: 'Too many requests, please wait 5 seconds' },
});

// === OAuth Login - Redirect user to eBay for authorization ===
app.get('/auth/login', (req, res) => {
  const scope = 'https://api.ebay.com/oauth/api_scope';
  const query = querystring.stringify({
    client_id: EBAY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: EBAY_REDIRECT_URI,
    scope,
  });
  const ebayAuthUrl = `https://auth.ebay.com/oauth2/authorize?${query}`;
  console.log('Redirecting to eBay OAuth:', ebayAuthUrl);
  res.redirect(ebayAuthUrl);
});

// === OAuth Callback - Exchange code for access token ===
app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    console.error('Missing authorization code in callback');
    return res.status(400).send('Missing authorization code');
  }

  console.log('✅ Received authorization code:', code);

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

    const text = await response.text();

    if (!response.ok) {
      console.error('❌ Token exchange failed:', text);
      return res.status(response.status).send(`Token exchange failed:\n${text}`);
    }

    const tokenData = JSON.parse(text);
    console.log('🔑 Access Token obtained:', tokenData.access_token);

    // TODO: Save tokenData.access_token and refresh_token securely for later use

    res.send('✅ eBay OAuth completed successfully! You can close this window.');
  } catch (err) {
    console.error('❌ OAuth error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// === eBay Finding API Search Endpoint with rate limiting ===
app.get('/api/search', searchLimiter, async (req, res) => {
  const { keyword } = req.query;
  if (!keyword) {
    return res.status(400).json({ error: 'Missing keyword parameter' });
  }

  // Construct Finding API URL with correct EBAY_APP_ID (App ID, not OAuth Client ID)
  const searchUrl = `https://svcs.ebay.com/services/search/FindingService/v1` +
    `?OPERATION-NAME=findCompletedItems` +
    `&SERVICE-VERSION=1.0.0` +
    `&SECURITY-APPNAME=${EBAY_APP_ID}` +
    `&RESPONSE-DATA-FORMAT=JSON` +
    `&REST-PAYLOAD` +
    `&keywords=${encodeURIComponent(keyword)}` +
    `&itemFilter(0).name=SoldItemsOnly` +
    `&itemFilter(0).value=true` +
    `&paginationInput.entriesPerPage=5`;

  console.log(`🔍 Searching eBay for "${keyword}" with URL:\n${searchUrl}`);

  try {
    const response = await fetch(searchUrl);
    const data = await response.json();

    if (data.errorMessage) {
      console.error('❌ eBay API error response:', JSON.stringify(data.errorMessage, null, 2));
      return res.status(500).json({ error: 'eBay API error', details: data.errorMessage });
    }

    res.json(data);
  } catch (err) {
    console.error('❌ eBay API fetch error:', err);
    res.status(500).json({ error: 'eBay API fetch error', details: err.message });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://
