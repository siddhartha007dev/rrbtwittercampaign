const axios = require('axios');
const cheerio = require('cheerio');
const instances = ['https://nitter.privacydev.net', 'https://nitter.projectsegfau.lt', 'https://nitter.moomoo.me', 'https://xcancel.com'];
async function test() {
   for (let url of instances) {
     try {
       const res = await axios.get(url + '/search?f=tweets&q=%23test', { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, timeout: 6000 });
       const $ = cheerio.load(res.data);
       console.log(url, 'found:', $('.timeline-item').length);
     } catch(e) {
       console.log(url, 'failed:', e.message);
     }
   }
}
test();
