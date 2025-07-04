// netlify/functions/get-credentials.js
const { MongoClient } = require('mongodb');

const MONGODB_URI = 'mongodb+srv://gou8sarav:r4MvYsciylNFHtt9@voting.bg9nvss.mongodb.net/?retryWrites=true&w=majority&appName=voting';
const DB_NAME = 'voting_system';

// CORS headers
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, message: 'Method not allowed' })
    };
  }

  let client;

  try {
    // Connect to MongoDB
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    
    const db = client.db(DB_NAME);
    const credentialsCollection = db.collection('user_credentials');

    // Get all credentials sorted by registration number
    const allCredentials = await credentialsCollection.find({})
      .sort({ regNumber: 1 })
      .toArray();

    // Format credentials for admin view
    const formattedCredentials = allCredentials.map(cred => ({
      regNumber: cred.regNumber,
      password: cred.password,
      isActive: cred.isActive,
      hasVoted: cred.hasVoted,
      votedAt: cred.votedAt || null,
      createdAt: cred.createdAt
    }));

    // Generate summary statistics
    const summary = {
      totalCredentials: allCredentials.length,
      activeCredentials: allCredentials.filter(c => c.isActive).length,
      votedCredentials: allCredentials.filter(c => c.hasVoted).length,
      pendingVotes: allCredentials.filter(c => c.isActive && !c.hasVoted).length,
      voterTurnout: allCredentials.length > 0 
        ? ((allCredentials.filter(c => c.hasVoted).length / allCredentials.length) * 100).toFixed(1)
        : 0
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        credentials: formattedCredentials,
        summary: summary
      })
    };

  } catch (error) {
    console.error('Error getting credentials:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        success: false, 
        message: 'Internal server error',
        credentials: [],
        summary: {
          totalCredentials: 0,
          activeCredentials: 0,
          votedCredentials: 0,
          pendingVotes: 0,
          voterTurnout: 0
        }
      })
    };
  } finally {
    if (client) {
      await client.close();
    }
  }
};