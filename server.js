const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const app = express();

app.use(express.json());

// Set your custom secret token (used for Meta Verification Handshake)
const VERIFY_TOKEN = "ENHERBE_SECRET_12345";

// GA4 Configuration (Pulls from Render Environment Variables)
const GA_MEASUREMENT_ID = process.env.GA_MEASUREMENT_ID || "G-XXXXXXXXXX"; 
const GA_API_SECRET = process.env.GA_API_SECRET || "YOUR_GA4_API_SECRET"; 

// Meta CAPI Configuration (Pulls from Render Environment Variables)
const META_PIXEL_ID = process.env.META_PIXEL_ID || "YOUR_META_PIXEL_ID";
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || "YOUR_META_ACCESS_TOKEN";

// Helper function to hash user data for Meta CAPI (Required by Meta policy)
function hashData(data) {
  if (!data) return undefined;
  return crypto.createHash('sha256').update(data.trim().toLowerCase()).digest('hex');
}

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
                
                // Extract added participants and their phone numbers (wa_id)
                const addedParticipants = group?.added_participants || value?.added_participants || [];
                
                for (const participant of addedParticipants) {
                  const phoneNum = participant?.wa_id || participant?.input;
                  if (!phoneNum) continue;

                  console.log(`NEW USER JOINED COMMUNITY: ${groupId} | Phone: ${phoneNum}`);
                  
                  // 1. Send event to GA4
                  const gaResponse = await axios.post(
                    `https://www.google-analytics.com/mp/collect?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`,
                    {
                      client_id: "whatsapp_user_" + phoneNum,
                      events: [{
                        name: "whatsapp_community_join",
                        params: {
                          group_id: groupId,
                          method: "cloud_api_webhook"
                        }
                      }]
                    }
                  );
                  console.log("GA4 Production Ping Status:", gaResponse.status);

                  // 2. Send event directly to Meta Conversions API (CAPI) with Hashed Phone Match
                  const metaResponse = await axios.post(
                    `https://graph.facebook.com/v19.0/${META_PIXEL_ID}/events?access_token=${META_ACCESS_TOKEN}`,
                    {
                      data: [
                        {
                          event_name: "whatsapp_community_join",
                          event_time: Math.floor(Date.now() / 1000),
                          action_source: "other", // Since it's a messaging/app event
                          custom_data: {
                            group_id: groupId,
                            method: "cloud_api_webhook"
                          },
                          user_data: {
                            ph: [hashData(phoneNum)], // Hashed phone number for Meta attribution matching
                            external_id: [hashData(phoneNum)]
                          }
                        }
                      ]
                    }
                  );
                  console.log("Meta CAPI Success Response:", metaResponse.data);
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("Webhook Processing or API Ping Error:", err.response?.data || err.message);
    }
    return res.status(200).send('EVENT_RECEIVED');
  }
  return res.sendStatus(404);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
