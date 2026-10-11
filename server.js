const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// Set your custom secret token (used for Meta Verification Handshake)
const VERIFY_TOKEN = "ENHERBE_SECRET_12345";

// GA4 Configuration (Pulls from Render Environment Variables)
const GA_MEASUREMENT_ID = process.env.GA_MEASUREMENT_ID || "G-XXXXXXXXXX"; 
const GA_API_SECRET = process.env.GA_API_SECRET || "YOUR_GA4_API_SECRET"; 

// 1. GET Request: Handles Meta's Webhook Verification Handshake
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log("WEBHOOK_VERIFIED successfully.");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// 2. POST Request: Listens for WhatsApp Group/Community Join Events
app.post('/webhook', async (req, res) => {
  const body = req.body;
  console.log("Incoming Webhook Payload:", JSON.stringify(body, null, 2));

  if (body.object === 'whatsapp_business_account') {
    try {
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          if (change.field === 'group_participants_update') {
            const value = change.value;
            
            // Handle both nested groups array (Meta test tool) and flat objects
            const groupsList = value?.groups || [value];
            
            for (const group of groupsList) {
              const eventType = group?.type || value?.action || value?.event;
              
              if (eventType === 'group_participants_add' || eventType === 'add') {
                const groupId = group?.group_id || value?.group_id || "test_group_id";
                console.log(`NEW USER JOINED COMMUNITY: ${groupId}`);
                
                // Using the GA4 Debug Endpoint to print validation results in Render logs
                const gaResponse = await axios.post(
                  `https://www.google-analytics.com/debug/mp/collect?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`,
                  {
                    client_id: "whatsapp_user_" + Date.now(),
                    events: [{
                      name: "whatsapp_community_join",
                      params: {
                        group_id: groupId,
                        method: "cloud_api_webhook"
                      }
                    }]
                  }
                );
                console.log("GA4 Debug Response:", JSON.stringify(gaResponse.data, null, 2));
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("Webhook Processing or GA4 Ping Error:", err.response?.data || err.message);
    }
    return res.status(200).send('EVENT_RECEIVED');
  }
  return res.sendStatus(404);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
