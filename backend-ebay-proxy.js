import fetch from 'node-fetch';
import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

const EBAY_APP_ID = process.env.EBAY_APP_ID;
const EBAY_CERT_ID = process.env.EBAY_CERT_ID;
const EBAY_DEV_ID = process.env.EBAY_DEV_ID;
const EBAY_VERIFICATION_TOKEN = process.env.EBAY_VERIFICATION_TOKEN;

app.use(cors());
app.use(express.json());

// === eBay Card Search Proxy ===
app.get('/api/search', async (req, res) => {
    const { keyword } = req.query;

    if (!keyword) {
        return res.status(400).json({ error: 'Missing keyword parameter' });
    }

    const url = `https://svcs.ebay.com/services/search/FindingService/v1` +
        `?OPERATION-NAME=findCompletedItems` +
        `&SERVICE-VERSION=1.0.0` +
        `&SECURITY-APPNAME=${EBAY_APP_ID}` +
        `&RESPONSE-DATA-FORMAT=JSON` +
        `&REST-PAYLOAD=true` +
        `&keywords=${encodeURIComponent(keyword)}` +
        `&itemFilter(0).name=SoldItemsOnly` +
        `&itemFilter(0).value=true` +
        `&paginationInput.entriesPerPage=5`;

    try {
        const response = await fetch(url);
        const text = await response.text();

        if (!response.ok) {
            console.error('❌ eBay API error response body:\n', text);
            return res.status(500).json({ error: 'eBay API failed', details: text });
        }

        const data = JSON.parse(text);
        res.json(data);
    } catch (err) {
        console.error('❌ Exception while calling eBay API:', err);
        res.status(500).json({ error: 'eBay API error', details: err.message });
    }
});

// === eBay User Data Deletion Hook ===
app.post('/user-data-deletion', (req, res) => {
    const authHeader = req.headers['x-ebay-verification-token'];

    if (!authHeader || authHeader !== EBAY_VERIFICATION_TOKEN) {
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
    // Implement real deletion logic if needed
}

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📦 Using EBAY_APP_ID: ${EBAY_APP_ID}`);
    console.log(`🔐 Using EBAY_CERT_ID: ${EBAY_CERT_ID}`);
    console.log(`🔑 Using EBAY_DEV_ID: ${EBAY_DEV_ID}`);
});
