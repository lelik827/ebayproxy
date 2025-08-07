import fetch from 'node-fetch';
import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

const EBAY_APP_ID = process.env.EBAY_APP_ID;
const EBAY_VERIFICATION_TOKEN = process.env.EBAY_VERIFICATION_TOKEN;

app.use(cors());
app.use(express.json());

let lastCallTime = 0;
let failureCount = 0;
let backoffDelay = 0; // ms

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

    const url = `https://svcs.ebay.com/services/search/FindingService/v1?OPERATION-NAME=findCompletedItems&SERVICE-VERSION=
