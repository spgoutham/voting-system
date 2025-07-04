// netlify/functions/get-results.js
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
    const votesCollection = db.collection('votes');

    // Get all votes
    const allVotes = await votesCollection.find({}).toArray();

    // Organize results by position
    const results = {
      president: {},
      secretary: {},
      treasurer: {}
    };

    // Initialize candidates with 0 votes
    const candidates = {
      president: ['Alice Johnson', 'Bob Smith', 'Carol Davis'],
      secretary: ['David Wilson', 'Emma Brown', 'Frank Miller'],
      treasurer: ['Grace Lee', 'Henry Clark', 'Ivy Taylor']
    };

    // Initialize all candidates with 0 votes
    Object.keys(candidates).forEach(position => {
      candidates[position].forEach(candidate => {
        results[position][candidate] = 0;
      });
    });

    // Fill in actual vote counts
    allVotes.forEach(vote => {
      if (results[vote.position] && candidates[vote.position].includes(vote.candidate)) {
        results[vote.position][vote.candidate] = vote.count;
      }
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(results)
    };

  } catch (error) {
    console.error('Error getting results:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        president: {},
        secretary: {},
        treasurer: {}
      })
    };
  } finally {
    if (client) {
      await client.close();
    }
  }
};