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
                
                const gaResponse = await axios.post(
                  `https://www.google-analytics.com/mp/collect?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`,
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
                console.log("GA4 Conversion Fired Successfully! Status:", gaResponse.status);
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
