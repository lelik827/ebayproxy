import fetch from 'node-fetch';
import express from 'express';
import cors from 'cors';
import querystring from 'querystring';

const app = express();
const PORT = process.env.PORT || 3000;

const EBAY_APP_ID = process.env.EBAY_APP_ID; // Client ID
const EBAY_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET;
const EBAY_REDIRECT_URI = process.env.EBAY_REDIRECT_URI; // e.g. https://ebayproxy.onrender.com/auth/callback

app.use(cors());
app.use(express.json());

// In-memory token store (replace with DB for production)
let oauthToken = null;
let oauthTokenExpiry = null;

// Step 1: Redirect user to eBay to authorize your app
app.get('/auth/login', (req, res) => {
  const authUrl = 'https://auth.ebay.com/oauth2/authorize?' + querystring.stringify({
    client_id: EBAY_APP_ID,
    redirect_uri: EBAY_REDIRECT_URI,
    response_type: 'code',
    scope: 'https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/developeranalytics.readonly',
    state: 'YOUR_RANDOM_STATE_STRING', // Replace with a random string or generate dynamically for security
  });
  res.redirect(authUrl);
});

// Step 2: Handle callback from eBay with authorization code
app.get('/auth/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).send('Missing authorization code');
  }

  // Step 3: Exchange authorization code for OAuth tokens
  try {
    const tokenResponse = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${EBAY_APP_ID}:${EBAY_CLIENT_SECRET}`).toString('base64'),
      },
      body: querystring.stringify({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: EBAY_REDIRECT_URI,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('Token exchange failed:', tokenData);
      return res.status(500).send('Failed to get OAuth token');
    }

    // Save token and expiry
    oauthToken = tokenData.access_token;
    oauthTokenExpiry = Date.now() + (tokenData.expires_in * 1000);

    console.log('✅ OAuth token acquired:', oauthToken);

    res.send('Authorization successful! You can now use the API.');
  } catch (error) {
    console.error('Error exchanging code for token:', error);
    res.status(500).send('OAuth error');
  }
});

// Helper middleware to ensure valid token
async function ensureValidToken(req, res, next) {
  if (!oauthToken || Date.now() >= oauthTokenExpiry) {
    return res.status(401).json({ error: 'OAuth token missing or expired. Please authenticate via /auth/login' });
  }
  next();
}

// Example protected route using OAuth token (Analytics API)
app.get('/analytics/rate-limit', ensureValidToken, async (req, res) => {
  try {
    const response = await fetch('https://api.ebay.com/developer/analytics/v1_beta/rate_limit', {
      headers: {
        Authorization: `Bearer ${oauthToken}`,
        'Content-Type': 'application/json',
      },
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Your existing eBay search proxy route remains unchanged (or update to OAuth if you want)

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
