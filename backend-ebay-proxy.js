import fetch from 'node-fetch';
import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

const EBAY_APP_ID = process.env.EBAY_APP_ID;
const EBAY_VERIFICATION_TOKEN = process.env.EBAY_VERIFICATION_TOKEN; // For deletion webhook if used

app.use(cors());
app.use(express.json());

app.get('/api/search', async (req, res) => {
  const { keyword, soldOnly = 'true' } = req.query;

  if (!keyword) {
    return res.status(400).json({ error: 'Missing keyword parameter' });
  }

  // Choose eBay API endpoint (production)
  const baseUrl = 'https://svcs.ebay.com/services/search/FindingService/v1';

  // Build itemFilter string based on soldOnly param
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

  console.log(`🛠️  Fetching eBay API with URL:\n${url}`);

  try {
    const response = await fetch(url);
    console.log(`🔔 eBay API responded with status: ${response.status}`);

    if (!response.ok) {
      const text = await response.text();
      console.error(`❌ eBay API error response body:\n${text}`);
      return res.status(response.status).json({ error: 'eBay API returned an error', details: text });
    }

    const data = await response.json();
    console.log('📦 eBay API response JSON:', JSON.stringify(data, null, 2));

    // Basic validation of response format
    if (!data.findCompletedItemsResponse) {
      return res.status(500).json({ error: 'Unexpected eBay API response format' });
    }

    res.json(data);

  } catch (err) {
    console.error('🔥 Error fetching from eBay API:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// Your user-data-deletion endpoint here if needed...

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
