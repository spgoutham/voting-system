// netlify/functions/set-winner-announcement.js
const { MongoClient } = require('mongodb');

const MONGODB_URI = 'mongodb+srv://gou8sarav:r4MvYsciylNFHtt9@voting.bg9nvss.mongodb.net/?retryWrites=true&w=majority&appName=voting';
const DB_NAME = 'voting_system';

// CORS headers
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
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
    // Parse request body
    const { action, minutes } = JSON.parse(event.body);

    if (!action) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Action is required' })
      };
    }

    // Connect to MongoDB
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    
    const db = client.db(DB_NAME);
    const announcementCollection = db.collection('winner_announcement');

    const now = new Date();
    let announcementData;

    switch (action) {
      case 'setTimer':
        if (!minutes || minutes < 1) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ success: false, message: 'Minutes is required and must be positive' })
          };
        }

        const announcementTime = new Date(now.getTime() + (minutes * 60 * 1000));
        announcementData = {
          _id: 'current_announcement',
          announcementTime: announcementTime,
          isAnnounced: false,
          isActive: true,
          createdAt: now,
          createdBy: 'admin',
          timerMinutes: minutes
        };
        break;

      case 'announceNow':
        announcementData = {
          _id: 'current_announcement',
          announcementTime: now,
          isAnnounced: true,
          isActive: true,
          createdAt: now,
          createdBy: 'admin'
        };
        break;

      case 'clearAnnouncement':
        await announcementCollection.deleteOne({ _id: 'current_announcement' });
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            success: true, 
            message: 'Winner announcement cleared' 
          })
        };

      default:
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, message: 'Invalid action' })
        };
    }

    // Update or insert announcement
    await announcementCollection.updateOne(
      { _id: 'current_announcement' },
      { $set: announcementData },
      { upsert: true }
    );

    let message;
    if (action === 'setTimer') {
      message = `Winner announcement set for ${minutes} minutes from now`;
    } else if (action === 'announceNow') {
      message = 'Winners announced immediately! Results are now public';
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true, 
        message: message,
        announcement: {
          announcementTime: announcementData.announcementTime,
          isAnnounced: announcementData.isAnnounced,
          isActive: announcementData.isActive
        }
      })
    };

  } catch (error) {
    console.error('Error setting winner announcement:', error);
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