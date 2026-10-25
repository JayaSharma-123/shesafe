// Run: node sms-test.js  -> sends one test SMS to STATION_PHONE
require('dotenv').config();
require('./sms').sendSms(process.env.STATION_PHONE, 'SheSafe test: SMS is working.').then(r => console.log('Result:', r.ok ? 'SENT' : 'NOT SENT', r.reason || ''));