require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

async function check() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not found in environment');
    process.exit(1);
  }
  const client = await mongoose.connect(uri);
  const db = client.connection.db;
  console.log('Connected DB Name:', db.databaseName);
  const collections = await db.listCollections().toArray();
  console.log('Collections in test:', collections.map(c => c.name));

  for (const c of collections) {
    const count = await db.collection(c.name).countDocuments();
    console.log(`Collection ${c.name} in test count: ${count}`);
    if (c.name === 'bookings') {
      const docs = await db.collection(c.name).find({}).toArray();
      console.log('Bookings in test:', docs);
    }
  }
  process.exit(0);
}
check().catch(err => { console.error('Error:', err); process.exit(1); });
