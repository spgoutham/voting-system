// netlify/functions/get-seal-status.js
const { MongoClient } = require('mongodb');

const MONGODB_URI = 'mongodb+srv://gou8sarav:r4MvYsciylNFHtt9@voting.bg9nvss.mongodb.net/?retryWrites=true&w=majority&appName=voting';
const DB_NAME = 'voting_system';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, message: 'Method not allowed' })
    };
  }

  let client;

  try {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    
    const db = client.db(DB_NAME);
    const announcementCollection = db.collection('winner_announcement');

    // Get announcement status
    const announcement = await announcementCollection.findOne({ _id: 'current_announcement' });
    const sealStatus = await announcementCollection.findOne({ _id: 'seal_status' });

    const now = new Date();
    
    // Determine if results are sealed
    let isSealed = false;
    if (announcement && announcement.isSealed) {
      isSealed = true;
    } else if (sealStatus && sealStatus.isSealed) {
      isSealed = true;
    }

    // Determine if results are announced
    let isAnnounced = false;
    if (announcement && announcement.isAnnounced) {
      isAnnounced = true;
    } else if (announcement && announcement.announcementTime && now >= new Date(announcement.announcementTime)) {
      isAnnounced = true;
    }

    // Get scheduled announcement time if any
    let scheduledAnnouncement = null;
    if (announcement && announcement.announcementTime && !isAnnounced) {
      scheduledAnnouncement = announcement.announcementTime;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        isSealed: isSealed,
        isAnnounced: isAnnounced,
        scheduledAnnouncement: scheduledAnnouncement,
        sealDetails: {
          announcementSeal: announcement ? announcement.isSealed : false,
          globalSeal: sealStatus ? sealStatus.isSealed : false,
          sealedAt: sealStatus ? sealStatus.sealedAt : null,
          clearedAt: announcement ? announcement.clearedAt : null
        }
      })
    };

  } catch (error) {
    console.error('Error getting seal status:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        message: 'Error retrieving seal status',
        isSealed: false,
        isAnnounced: false
      })
    };
  } finally {
    if (client) {
      await client.close();
    }
  }
};