const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
(async () => {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  
  const ActivityLog = mongoose.connection.db.collection('activitylogs');
  const logs = await ActivityLog.find({ action: { $regex: /booking/i } }).sort({ createdAt: -1 }).toArray();
  
  console.log('BOOKING ACTIVITY LOGS:', logs.length);
  logs.forEach(l => {
    console.log(l.createdAt + ' | ' + l.action + ' | ' + l.details);
  });
  
  process.exit(0);
})();
