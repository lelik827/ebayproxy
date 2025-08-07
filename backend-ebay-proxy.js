import fetch from 'node-fetch';
import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

const EBAY_APP_ID = process.env.EBAY_APP_ID;
const EBAY_VERIFICATION_TOKEN = process.env.EBAY_VERIFICATION_TOKEN;

app.use(cors());
app.use(express.json());

// === Rate Limiting State ===
let lastCallTime = 0;
let failureCount = 0;
let backoffDelay = 0; // milliseconds

const MAX_FAILURES = 3;
const BASE_DELAY = 5000; // 5 seconds

// === eBay Search Proxy ===
app.get('/api/search', async (req, res) => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCallTime;
    const effectiveDelay = BASE_DELAY + backoffDelay;

    if (failureCount >= MAX_FAILURES) {
        console.warn(`🛑 Blocked request: failure count (${failureCount}) exceeded limit`);
        return res.status(429).json({ error: 'Too many failed attempts. Try again later.' });
    }

    if (timeSinceLastCall < effectiveDelay) {
        const waitTime = ((effectiveDelay - timeSinceLastCall) / 1000).toFixed(1);
        return res.status(429).json({ error: `Rate limit: wait ${waitTime}s before retrying` });
    }

    lastCallTime = now;

    const { keyword } = req.query;
    if (!keyword) {
        return res.status(400).json({ error: 'Missing keyword parameter' });
    }

    const url = `https://svcs.ebay.com/services/search/FindingService/v1?OPERATION-NAME=findCompletedItems&SERVICE-VERSION=1.0.0&SECURITY-APPNAME=${EBAY_APP_ID}&RESPONSE-DATA-FORMAT=JSON&REST-PAYLOAD&keywords=${encodeURIComponent(keyword)}&itemFilter(0).name=SoldItemsOnly&itemFilter(0).value=true&paginationInput.entriesPerPage=5`;

    try {
        const response = await fetch(url);
        const text = await response.text();

        if (!response.ok) {
            failureCount++;
            backoffDelay += BASE_DELAY;
            console.error(`❌ eBay API error (${response.status}):\n${text}`);
            return res.status(500).json({ error: 'eBay API failed', details: text });
        }

        const data = JSON.parse(text);
        failureCount = 0;
        backoffDelay = 0;

        res.json(data);
    } catch (err) {
        failureCount++;
        backoffDelay += BASE_DELAY;
        console.error('❌ Request failed:', err.message);
        res.status(500).json({ error: 'eBay API error', details: err.message });
    }
});

// === eBay Account Deletion Notification ===
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
    // TODO: Add real deletion logic
}

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
