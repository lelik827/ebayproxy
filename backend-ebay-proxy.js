// backend-ebay-proxy.js
import express from 'express';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import cors from 'cors';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

const EBAY_APP_ID = process.env.EBAY_APP_ID;
if (!EBAY_APP_ID) {
  console.error('❌ Missing eBay App ID (EBAY_APP_ID) in environment variables');
  process.exit(1);
}

// Rate limit queue (1 request every 5 seconds)
let requestQueue = [];
let isProcessing = false;

function enqueueRequest(callback) {
  requestQueue.push(callback);
  processQueue();
}

function processQueue() {
  if (isProcessing || requestQueue.length === 0) return;

  isProcessing = true;
  const nextRequest = requestQueue.shift();
  nextRequest();

  // Wait 5 seconds before processing the next request
  setTimeout(() => {
    isProcessing = false;
    processQueue();
  }, 5000);
}

app.get('/api/search', (req, res) => {
  enqueueRequest(() => handleEbaySearch(req, res));
});

async function handleEbaySearch(req, res) {
  const keyword = req.query.keyword;
  if (!keyword) {
    console.warn('⚠️ Missing "keyword" query param');
    return res.status(400).json({ error: 'Missing "keyword" query param' });
  }

  const params = new URLSearchParams({
    'OPERATION-NAME': 'findCompletedItems',
    'SERVICE-VERSION': '1.13.0',
    'SECURITY-APPNAME': EBAY_APP_ID,
    'RESPONSE-DATA-FORMAT': 'JSON',
    'REST-PAYLOAD': 'true',
    'keywords': keyword,
    'itemFilter(0).name': 'SoldItemsOnly',
    'itemFilter(0).value': 'true',
    'paginationInput.entriesPerPage': '5'
  });

  const url = `https://svcs.ebay.com/services/search/FindingService/v1?${params.toString()}`;

  console.log(`🔍 Fetching eBay for: "${keyword}"`);

  try {
    const response = await fetch(url);
    const body = await response.text();

    console.log(`📥 eBay API status: ${response.status}`);
    if (!response.ok) {
      console.error(`❌ eBay API error response body:\n${body}`);
      return res.status(500).json({ error: 'eBay API error', body });
    }

    const json = JSON.parse(body);
    res.json(json);
  } catch (error) {
    console.error('❌ Failed to fetch from eBay:', error);
    res.status(500).json({ error: 'Failed to fetch from eBay', message: error.message });
  }
}

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
