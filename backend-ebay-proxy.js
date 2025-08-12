import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// For __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { EBAY_CLIENT_ID } = process.env;

// Enable trust proxy for Render's environment
app.set('trust proxy', 1); // Trust the first proxy (Render's load balancer)

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting middleware (1 request per 5 seconds)
const searchLimiter = rateLimit({
  windowMs: 5000, // 5 seconds
  max: 1, // 1 request per window
  message: 'Too many requests, please wait 5 seconds',
});

// eBay search API proxy with retry logic
app.get('/api/search', searchLimiter, async (req, res) => {
  const { keyword } = req.query;
  if (!keyword) {
    return res.status(400).json({ error: 'Missing keyword parameter' });
  }

  const searchUrl = `https://svcs.ebay.com/services/search/FindingService/v1` +
    `?OPERATION-NAME=findCompletedItems` +
    `&SERVICE-VERSION=1.0.0` +
    `&SECURITY-APPNAME=${EBAY_CLIENT_ID}` +
    `&RESPONSE-DATA-FORMAT=JSON` +
    `&REST-PAYLOAD` +
    `&keywords=${encodeURIComponent(keyword)}` +
    `&itemFilter(0).name=SoldItemsOnly` +
    `&itemFilter(0).value=true` +
    `&paginationInput.entriesPerPage=5`;

  // Retry logic for rate limit errors
  const maxRetries = 3;
  let attempt = 1;

  while (attempt <= maxRetries) {
    try {
      const response = await fetch(searchUrl);
      const data = await response.json();

      if (data.errorMessage) {
        const error = data.errorMessage[0].error[0];
        console.error(`❌ eBay API error (attempt ${attempt}):`, JSON.stringify(error, null, 2));
        if (error.errorId[0] === '10001' && attempt < maxRetries) {
          // Rate limit error, wait and retry
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 1s, 2s, 4s
          console.log(`Rate limit hit, retrying after ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          attempt++;
          continue;
        }
        return res.status(500).json({ error: 'eBay API error', details: error.message[0] });
      }

      res.json(data);
      return;
    } catch (err) {
      console.error(`❌ Search error (attempt ${attempt}):`, err);
      if (attempt === maxRetries) {
        res.status(500).json({ error: 'eBay API error', details: err.message });
      }
      attempt++;
    }
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
