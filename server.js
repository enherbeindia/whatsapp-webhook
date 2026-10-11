const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// Set your custom secret token (used for Meta Verification Handshake)
const VERIFY_TOKEN = "ENHERBE_SECRET_12345";

// GA4 Configuration
const GA_MEASUREMENT_ID = "G-XXXXXXXXXX"; // Replace with your GA4 Measurement ID
const GA_API_SECRET = "YOUR_GA4_API_SECRET"; // Generated in GA4 Admin -> Data Streams

// 1. GET Request: Handles Meta's Webhook Verification Handshake
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log("WEBHOOK_VERIFIED");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// 2. POST Request: Listens for actual WhatsApp Group/Community Join Events
app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (body.object === 'whatsapp_business_account') {
    body.entry?.forEach(entry => {
      entry.changes?.forEach(async change => {
        
        // Listen specifically for group_participants_update
        if (change.field === 'group_participants_update') {
          const value = change.value;
          
          // Check if event is a user joining the group
          if (value && value.action === 'add') {
            console.log(`NEW USER JOINED COMMUNITY: ${value.group_id}`);
            
            // Forward verified event to GA4 Measurement Protocol
            try {
              await axios.post(
                `https://www.google-analytics.com/mp/collect?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`,
                {
                  client_id: "whatsapp_webhook_user",
                  events: [{
                    name: "whatsapp_community_joined_verified",
                    params: {
                      group_id: value.group_id,
                      method: "cloud_api_webhook"
                    }
                  }]
                }
              );
              console.log("GA4 Conversion Fired Successfully!");
            } catch (err) {
              console.error("GA4 Ping Error:", err.message);
            }
          }
        }
      });
    });
    return res.status(200).send('EVENT_RECEIVED');
  }
  return res.sendStatus(404);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
