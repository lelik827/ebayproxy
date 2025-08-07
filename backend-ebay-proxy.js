import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config(); // Load .env variables

const app = express();
const PORT = process.env.PORT || 3000;

// === eBay App Credentials ===
const EBAY_CLIENT_ID = process.env.EBAY_CLIENT_ID;
const EBAY_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET;
const EBAY_REDIRECT_URI = 'https://ebayproxy.onrender.com/auth/callback';
const EBAY_VERIFICATION_TOKEN = process.env.EBAY_VERIFICATION_TOKEN;

let ebayAccessToken = null;
let accessTokenExpiresAt = 0;

app.use(cors());
app.use(express.json());

// === eBay OAuth Redirect ===
app.get('/auth/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) {
        return res.status(400).send('Missing authorization code');
    }

    try {
        const basicAuth = Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString('base64');

        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('code', code);
        params.append('redirect_uri', EBAY_REDIRECT_URI);

        const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${basicAuth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('❌ Token exchange failed:', data);
            return res.status(500).send('Token exchange failed');
        }

        ebayAccessToken = data.access_token;
        accessTokenExpiresAt = Date.now() + data.expires_in * 1000;

        console.log('✅ eBay OAuth access token acquired');
        res.send('eBay authorization successful! You can now use the proxy.');
    } catch (err) {
        console.error('❌ OAuth error:', err);
        res.status(500).send('Internal Server Error during OAuth');
    }
});

// === Search eBay using OAuth token ===
app.get('/api/search', async (req, res) => {
    const { keyword } = req.query;

    if (!ebayAccessToken || Date.now() >= accessTokenExpiresAt) {
        return res.status(401).json({ error: 'eBay access token missing or expired' });
    }

    if (!keyword) {
        return res.status(400).json({ error: 'Missing keyword parameter' });
    }

    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(keyword)}&limit=5`;

    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${ebayAccessToken}`,
                'Content-Type': 'application/json',
            },
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('❌ eBay API error response body:\n', data);
            return res.status(response.status).json(data);
        }

        res.json(data);
    } catch (err) {
        console.error('❌ Fetch error from eBay API:', err);
        res.status(500).json({ error: 'eBay API fetch failed', details: err.message });
    }
});

// === eBay Account Deletion Hook ===
app.post('/user-data-deletion', (req, res) => {
    const token = req.headers['x-ebay-verification-token'];

    if (!token || token !== EBAY_VERIFICATION_TOKEN) {
        console.warn('❌ Invalid or missing eBay verification token');
        return res.status(403).json({ error: 'Forbidden: invalid token' });
    }

    const { eventType, userId, username } = req.body;

    if (eventType !== 'ACCOUNT_DELETION') {
        return res.status(400).json({ error: 'Unsupported event type' });
    }

    console.log(`✅ Verified deletion request for userId: ${userId}, username: ${username}`);
    deleteUserData(userId);

    res.status(200).json({ status: 'User data deleted' });
});

function deleteUserData(userId) {
    console.log(`🧹 Deleting user data for userId: ${userId}...`);
    // TODO: Actually delete user data from your storage
}

// === Server Start ===
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
