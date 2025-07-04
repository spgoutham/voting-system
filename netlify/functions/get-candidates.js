// netlify/functions/get-candidates.js
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
    const candidatesCollection = db.collection('candidates');

    // Get current candidates configuration
    const candidatesData = await candidatesCollection.findOne({ _id: 'current_candidates' });

    // Default candidates if none found
    const defaultCandidates = {
      president: ['Alice Johnson', 'Bob Smith', 'Carol Davis'],
      secretary: ['David Wilson', 'Emma Brown', 'Frank Miller'],
      treasurer: ['Grace Lee', 'Henry Clark', 'Ivy Taylor']
    };

    const candidates = candidatesData ? candidatesData.candidates : defaultCandidates;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(candidates)
    };

  } catch (error) {
    console.error('Error getting candidates:', error);
    
    // Return default candidates on error
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        president: ['Alice Johnson', 'Bob Smith', 'Carol Davis'],
        secretary: ['David Wilson', 'Emma Brown', 'Frank Miller'],
        treasurer: ['Grace Lee', 'Henry Clark', 'Ivy Taylor']
      })
    };
  } finally {
    if (client) {
      await client.close();
    }
  }
};