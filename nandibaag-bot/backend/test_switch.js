const axios = require('axios');
async function test() {
  try {
    const res = await axios.post('http://localhost:5000/api/settings/switch-all-chats', { mode: 'human' });
    console.log("SUCCESS:", res.data);
  } catch(e) {
    console.log("ERROR:", e.response ? e.response.data : e.message);
  }
}
test();
