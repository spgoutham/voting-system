// netlify/functions/save-candidates.js
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
    const candidates = JSON.parse(event.body);

    // Validate input structure
    if (!candidates || typeof candidates !== 'object') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Invalid candidates data' })
      };
    }

    // Validate required positions
    const requiredPositions = ['president', 'secretary', 'treasurer'];
    for (const position of requiredPositions) {
      if (!candidates[position] || !Array.isArray(candidates[position])) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ 
            success: false, 
            message: `Missing or invalid ${position} candidates` 
          })
        };
      }
    }

    // Validate candidate names
    for (const position of requiredPositions) {
      for (const candidate of candidates[position]) {
        if (!candidate || typeof candidate !== 'string' || candidate.trim().length === 0) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ 
              success: false, 
              message: `Invalid candidate name in ${position} position` 
            })
          };
        }
      }
    }

    // Connect to MongoDB
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    
    const db = client.db(DB_NAME);
    const candidatesCollection = db.collection('candidates');

    // Save candidates configuration
    await candidatesCollection.updateOne(
      { _id: 'current_candidates' },
      { 
        $set: { 
          candidates: candidates,
          lastUpdated: new Date(),
          updatedBy: 'admin'
        }
      },
      { upsert: true }
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true, 
        message: 'Candidates saved successfully',
        candidates: candidates
      })
    };

  } catch (error) {
    console.error('Error saving candidates:', error);
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