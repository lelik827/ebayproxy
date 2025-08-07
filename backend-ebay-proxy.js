import fetch from 'node-fetch';
import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;
const EBAY_APP_ID = process.env.EBAY_APP_ID;

app.use(cors());
app.use(express.json()); // Allows parsing of JSON bodies in POST requests

// === eBay Card Search Proxy ===
app.get('/api/search', async (req, res) => {
    const { keyword } = req.query;
    if (!keyword) {
        return res.status(400).json({ error: 'Missing keyword parameter' });
    }

    const url = `https://svcs.sandbox.ebay.com/services/search/FindingService/v1?OPERATION-NAME=findCompletedItems&SERVICE-VERSION=1.0.0&SECURITY-APPNAME=${EBAY_APP_ID}&RESPONSE-DATA-FORMAT=JSON&REST-PAYLOAD&keywords=${encodeURIComponent(keyword)}&itemFilter(0).name=SoldItemsOnly&itemFilter(0).value=true&paginationInput.entriesPerPage=5`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'eBay API error', details: err.message });
    }
});

// === eBay Account Deletion Notification ===
app.post('/user-data-deletion', (req, res) => {
    const { eventType, userId, username } = req.body;

    if (eventType !== 'ACCOUNT_DELETION') {
        return res.status(400).json({ error: 'Unsupported event type' });
    }

    console.log(`🗑️ Received deletion request for userId: ${userId}, username: ${username}`);

    // TODO: Replace this with actual logic to delete or anonymize user data
    deleteUserData(userId);

    res.status(200).json({ status: 'User data deleted' });
});

// === Dummy function to simulate deletion ===
function deleteUserData(userId) {
    console.log(`🚨 Deleting user data for userId: ${userId}...`);
    // Implement your data deletion logic here (e.g., database cleanup)
}

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
