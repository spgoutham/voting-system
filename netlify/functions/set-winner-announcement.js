// netlify/functions/set-winner-announcement.js
const { MongoClient } = require('mongodb');

const MONGODB_URI = 'mongodb+srv://gou8sarav:r4MvYsciylNFHtt9@voting.bg9nvss.mongodb.net/?retryWrites=true&w=majority&appName=voting';
const DB_NAME = 'voting_system';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, message: 'Method not allowed' })
    };
  }

  let client;

  try {
    const requestBody = JSON.parse(event.body);
    const { action, announcementTime, isSealed } = requestBody;

    client = new MongoClient(MONGODB_URI);
    await client.connect();
    
    const db = client.db(DB_NAME);
    const collection = db.collection('winner_announcement');

    if (action === 'clearAnnouncement') {
      // 🔒 FIXED: Properly handle clearing with sealing
      
      // Option 1: Remove announcement but set global seal
      await collection.deleteOne({ _id: 'current_announcement' });
      
      // Set global seal status
      await collection.replaceOne(
        { _id: 'seal_status' },
        { 
          _id: 'seal_status',
          isSealed: true,  // 🔒 ALWAYS SEAL when clearing
          sealedAt: new Date(),
          sealedBy: 'admin'
        },
        { upsert: true }
      );

      console.log('✅ Announcement cleared and results SEALED');

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          message: 'Announcement cleared and results sealed',
          isSealed: true
        })
      };

    } else if (action === 'setAnnouncement') {
      // Set new announcement
      const announcementDoc = {
        _id: 'current_announcement',
        announcementTime: new Date(announcementTime),
        isAnnounced: false,
        isSealed: isSealed || false,
        createdAt: new Date()
      };

      await collection.replaceOne(
        { _id: 'current_announcement' },
        announcementDoc,
        { upsert: true }
      );

      // Clear global seal if unsetting seal
      if (!isSealed) {
        await collection.deleteOne({ _id: 'seal_status' });
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          message: 'Announcement set successfully',
          announcement: announcementDoc
        })
      };

    } else if (action === 'sealResults') {
      // 🔒 SEAL without announcement
      await collection.replaceOne(
        { _id: 'seal_status' },
        { 
          _id: 'seal_status',
          isSealed: true,
          sealedAt: new Date(),
          sealedBy: 'admin'
        },
        { upsert: true }
      );

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          message: 'Results sealed successfully',
          isSealed: true
        })
      };

    } else if (action === 'unsealResults') {
      // 🔓 UNSEAL results
      await collection.deleteOne({ _id: 'seal_status' });
      
      // Also unseal any announcement
      await collection.updateOne(
        { _id: 'current_announcement' },
        { $set: { isSealed: false } }
      );

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          message: 'Results unsealed successfully',
          isSealed: false
        })
      };

    } else {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Invalid action' })
      };
    }

  } catch (error) {
    console.error('Error in set-winner-announcement:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        success: false, 
        message: 'Server error: ' + error.message 
      })
    };
  } finally {
    if (client) {
      await client.close();
    }
  }
};