<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>eBay Card Sales Lookup</title>
<!-- Tailwind CSS CDN -->
<link href="https://unpkg.com/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
<!-- SheetJS for spreadsheet parsing -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
</head>
<body class="bg-gray-100 flex items-center justify-center min-h-screen">
  <div class="bg-white p-6 rounded-lg shadow-lg w-full max-w-2xl">
    <h1 class="text-2xl font-bold mb-4 text-center">eBay Card Sales Lookup</h1>
    <p class="mb-4 text-center">Upload a CSV or Excel file with a 'CardName' or 'Name' column</p>
    <input type="file" id="spreadsheetInput" accept=".csv,.xlsx,.xls" class="mb-4 w-full p-2 border rounded" />
    <button id="searchButton" class="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600">Search eBay</button>
    <div id="results" class="mt-4"></div>
  </div>

<script>
  const spreadsheetInput = document.getElementById('spreadsheetInput');
  const searchButton = document.getElementById('searchButton');
  const resultsDiv = document.getElementById('results');

  // Parse uploaded spreadsheet for card names
  function parseSpreadsheet(file) {
    return new Promise((resolve, reject) => {
      console.log('Reading file:', file.name);
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const json = XLSX.utils.sheet_to_json(sheet);
          const cardNames = json.map(row => row.CardName || row.Name).filter(Boolean);
          if (cardNames.length === 0) {
            throw new Error('No valid card names found. Ensure "CardName" or "Name" column exists.');
          }
          resolve(cardNames);
        } catch (error) {
          console.error('Spreadsheet parsing error:', error);
          reject(error);
        }
      };
      reader.onerror = () => {
        console.error('FileReader error');
        reject(new Error('Failed to read file'));
      };
      reader.readAsArrayBuffer(file);
    });
  }

  // Query backend proxy for eBay sold items data
  async function searchEbay(cardName) {
    const url = `https://ebayproxy.onrender.com/api/search?keyword=${encodeURIComponent(cardName)}`;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      const data = await response.json();
      const items = data.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item || [];
      return items;
    } catch (error) {
      console.error(`eBay API error for "${cardName}":`, error);
      return [];
    }
  }

  // Display results in the page
  function displayResults(cardResults) {
    resultsDiv.innerHTML = '';
    if (cardResults.length === 0) {
      resultsDiv.innerHTML = '<p class="text-red-500">No cards processed.</p>';
      return;
    }
    cardResults.forEach(({ cardName, items }) => {
      const cardDiv = document.createElement('div');
      cardDiv.className = 'border p-4 mb-4 rounded';
      cardDiv.innerHTML = `<h2 class="text-lg font-semibold mb-2">${cardName}</h2>`;

      if (items.length === 0) {
        cardDiv.innerHTML += '<p class="text-red-500">No sold items found.</p>';
      } else {
        items.forEach(item => {
          const itemDiv = document.createElement('div');
          itemDiv.className = 'border-t pt-2 mt-2';
          itemDiv.innerHTML = `
            <p><strong>Title:</strong> ${item.title}</p>
            <p><strong>Price:</strong> ${item.sellingStatus[0].currentPrice[0].__value__} ${item.sellingStatus[0].currentPrice[0]['@currencyId']}</p>
            <p><strong>Sold Date:</strong> ${new Date(item.sellingStatus[0].timeOfSale || item.listingInfo[0].endTime).toLocaleDateString()}</p>
            <a href="${item.viewItemURL}" target="_blank" class="text-blue-500 hover:underline">View on eBay</a>
          `;
          cardDiv.appendChild(itemDiv);
        });
      }

      resultsDiv.appendChild(cardDiv);
    });
  }

  // Handle button click to parse file and search eBay
  searchButton.addEventListener('click', async () => {
    const file = spreadsheetInput.files[0];
    if (!file) {
      resultsDiv.innerHTML = '<p class="text-red-500">Please upload a spreadsheet.</p>';
      return;
    }
    resultsDiv.innerHTML = '<p>Loading...</p>';
    try {
      const cardNames = await parseSpreadsheet(file);
      const cardResults = [];
      for (const cardName of cardNames) {
        const items = await searchEbay(cardName);
        cardResults.push({ cardName, items });
      }
      displayResults(cardResults);
    } catch (error) {
      console.error('Error:', error);
      resultsDiv.innerHTML = `<p class="text-red-500">Error: ${error.message}</p>`;
    }
  });
</script>
</body>
</html>
