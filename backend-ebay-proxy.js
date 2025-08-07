import fetch from 'node-fetch';
import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

const EBAY_APP_ID = process.env.EBAY_APP_ID;
const EBAY_VERIFICATION_TOKEN = process.env.EBAY_VERIFICATION_TOKEN;

app.use(cors());
app.use(express.json());

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache
const cache = new Map(); // key: keyword+soldOnly, value: { timestamp, data }

async function fetchEbayData(url, retries = 3, backoff = 1000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url);
      const text = await response.text();

      if (!response.ok) {
        if (response.status === 500 && text.includes('RateLimiter')) {
          console.warn(`⚠️ Rate limit hit on attempt ${attempt}, backing off ${backoff}ms...`);
          if (attempt === retries) {
            throw new Error('Rate limit exceeded, max retries reached');
          }
          await new Promise(r => setTimeout(r, backoff));
          backoff *= 2;
          continue;
        }
        throw new Error(`eBay API error: ${response.status} - ${text}`);
      }

      return JSON.parse(text);
    } catch (err) {
      if (attempt === retries) {
        throw err;
      }
      console.warn(`⚠️ Fetch error on attempt ${attempt}, retrying:`, err.message);
      await new Promise(r => setTimeout(r, backoff));
      backoff *= 2;
    }
  }
}

app.get('/api/search', async (req, res) => {
  const { keyword, soldOnly = 'true' } = req.query;

  if (!keyword) {
    return res.status(400).json({ error: 'Missing keyword parameter' });
  }

  const baseUrl = EBAY_APP_ID.includes('-SBX-')
    ? 'https://svcs.sandbox.ebay.com/services/search/FindingService/v1'
    : 'https://svcs.ebay.com/services/search/FindingService/v1';

  const soldFilter = soldOnly === 'true'
    ? '&itemFilter(0).name=SoldItemsOnly&itemFilter(0).value=true'
    : '';

  const url = `${baseUrl}?OPERATION-NAME=findCompletedItems` +
              `&SERVICE-VERSION=1.13.0` +
              `&SECURITY-APPNAME=${EBAY_APP_ID}` +
              `&RESPONSE-DATA-FORMAT=JSON` +
              `&REST-PAYLOAD` +
              `&keywords=${encodeURIComponent(keyword)}` +
              `${soldFilter}` +
              `&paginationInput.entriesPerPage=5`;

  const cacheKey = `${keyword}-${soldOnly}`;
  const cached = cache.get(cacheKey);

  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
    console.log(`♻️ Returning cached data for "${keyword}" (soldOnly=${soldOnly})`);
    return res.json(cached.data);
  }

  console.log(`🛠️ Fetching eBay API with URL:\n${url}`);

  try {
    const data = await fetchEbayData(url);
    cache.set(cacheKey, { timestamp: Date.now(), data });
    res.json(data);
  } catch (err) {
    console.error('🔥 Error fetching from eBay API:', err.message);
    if (err.message.includes('Rate limit')) {
      res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
    } else {
      res.status(500).json({ error: 'Internal server error', details: err.message });
    }
  }
});

// (Include your user-data-deletion endpoint here if needed...)

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
