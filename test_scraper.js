const https = require('https');
https.get('https://getdaytrends.com/indonesia/trend/%23crypto/', { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const match = data.match(/<div class="desc">\s*([0-9KkMm.,]+)\s*tweets/i) || data.match(/([0-9,.]+[kKmM]?)\s+tweets/i) || data.match(/class="desc"[^>]*>\s*([0-9,KkMm]+)/i);
    console.log("Match:", match ? match[1] : "Not found");
  });
}).on('error', err => console.log(err.message));
