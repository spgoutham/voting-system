// netlify/functions/set-winner-announcement.js
const { MongoClient } = require('mongodb');

const MONGODB_URI = 'mongodb+srv://gou8sarav:r4MvYsciylNFHtt9@voting.bg9nvss.mongodb.net/?retryWrites=true&w=majority&appName=voting';
const DB_NAME = 'voting_system';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
    const { action, minutes } = JSON.parse(event.body);
    
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    
    const db = client.db(DB_NAME);
    const announcementCollection = db.collection('winner_announcement');

    switch (action) {
      case 'setTimer':
        if (!minutes || minutes < 1) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ success: false, message: 'Invalid minutes provided' })
          };
        }

        const announcementTime = new Date(Date.now() + (minutes * 60 * 1000));
        
        await announcementCollection.updateOne(
          { _id: 'current_announcement' },
          {
            $set: {
              announcementTime: announcementTime,
              isAnnounced: false,
              isSealed: false, // Unsealed when setting timer
              setAt: new Date()
            }
          },
          { upsert: true }
        );

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: `Winner announcement scheduled for ${minutes} minutes from now`
          })
        };

      case 'announceNow':
        await announcementCollection.updateOne(
          { _id: 'current_announcement' },
          {
            $set: {
              announcementTime: new Date(),
              isAnnounced: true,
              isSealed: false, // Unsealed when announcing
              setAt: new Date()
            }
          },
          { upsert: true }
        );

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: 'Winners announced immediately!'
          })
        };

      case 'clearAnnouncement':
        // THIS IS THE KEY FIX - PROPERLY SEAL RESULTS
        await announcementCollection.updateOne(
          { _id: 'current_announcement' },
          {
            $set: {
              isAnnounced: false,
              isSealed: true, // 🔒 SEAL THE RESULTS
              clearedAt: new Date(),
              announcementTime: null
            }
          },
          { upsert: true }
        );

        // Also set global seal status for extra security
        await announcementCollection.updateOne(
          { _id: 'seal_status' },
          {
            $set: {
              isSealed: true,
              sealedAt: new Date(),
              reason: 'Manual seal via admin panel'
            }
          },
          { upsert: true }
        );

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: 'Winner announcement cleared and results sealed successfully'
          })
        };

      case 'sealResults':
        // Explicit seal action
        await announcementCollection.updateOne(
          { _id: 'seal_status' },
          {
            $set: {
              isSealed: true,
              sealedAt: new Date(),
              reason: 'Manual seal via admin panel'
            }
          },
          { upsert: true }
        );

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: 'Results sealed successfully'
          })
        };

      case 'unsealResults':
        // Explicit unseal action
        await announcementCollection.updateOne(
          { _id: 'seal_status' },
          {
            $set: {
              isSealed: false,
              unsealedAt: new Date(),
              reason: 'Manual unseal via admin panel'
            }
          },
          { upsert: true }
        );

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: 'Results unsealed successfully'
          })
        };

      default:
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
        message: 'Internal server error'
      })
    };
  } finally {
    if (client) {
      await client.close();
    }
  }
};