// netlify/functions/reset-all-data.js
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
    // Parse request body to check for confirmation
    const { confirmReset, resetType } = JSON.parse(event.body || '{}');

    if (!confirmReset) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false, 
          message: 'Reset confirmation required. This will delete all voting data and announcements.' 
        })
      };
    }

    // Connect to MongoDB
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    
    const db = client.db(DB_NAME);
    const votesCollection = db.collection('votes');
    const votersCollection = db.collection('voters');
    const credentialsCollection = db.collection('user_credentials');
    const announcementCollection = db.collection('winner_announcement');

    let clearedCollections = [];

    if (resetType === 'votes_only' || !resetType) {
      // Clear votes and voters, reset credential voted status
      await Promise.all([
        votesCollection.deleteMany({}),
        votersCollection.deleteMany({}),
        announcementCollection.deleteMany({}), // Clear winner announcements
        credentialsCollection.updateMany(
          {},
          { 
            $unset: { 
              hasVoted: "",
              votedAt: "",
              lastVoteIP: ""
            }
          }
        )
      ]);
      
      clearedCollections = ['votes', 'voters', 'winner announcements'];
    } else if (resetType === 'complete') {
      // Clear everything including credentials
      await Promise.all([
        votesCollection.deleteMany({}),
        votersCollection.deleteMany({}),
        credentialsCollection.deleteMany({}),
        announcementCollection.deleteMany({}) // Clear winner announcements
      ]);
      
      clearedCollections = ['votes', 'voters', 'credentials', 'winner announcements'];
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true, 
        message: `Successfully reset ${clearedCollections.join(', ')}. Results are now sealed.`,
        clearedCollections: clearedCollections,
        resetType: resetType || 'votes_only'
      })
    };

  } catch (error) {
    console.error('Error resetting data:', error);
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