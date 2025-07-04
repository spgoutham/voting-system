// netlify/functions/submit-vote.js
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
    const { email, registerNumber, votes } = JSON.parse(event.body);

    // Validate input
    if (!email || !registerNumber || !votes) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Missing required fields' })
      };
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Invalid email format' })
      };
    }

    // Validate votes structure
    if (!votes.president || !votes.secretary || !votes.treasurer) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'All positions must be voted for' })
      };
    }

    // Connect to MongoDB
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    
    const db = client.db(DB_NAME);
    const votersCollection = db.collection('voters');
    const votesCollection = db.collection('votes');

    // Check if user has already voted (by email or register number)
    const existingVoter = await votersCollection.findOne({
      $or: [
        { email: email.toLowerCase() },
        { registerNumber: registerNumber.toUpperCase() }
      ]
    });

    if (existingVoter) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'You have already voted!' })
      };
    }

    // Record voter to prevent duplicate voting
    await votersCollection.insertOne({
      email: email.toLowerCase(),
      registerNumber: registerNumber.toUpperCase(),
      votedAt: new Date(),
      ipAddress: event.headers['x-forwarded-for'] || event.headers['x-real-ip'] || 'unknown'
    });

    // Submit votes for each position
    const votePromises = Object.entries(votes).map(([position, candidate]) => {
      return votesCollection.updateOne(
        { position: position, candidate: candidate },
        { 
          $inc: { count: 1 },
          $setOnInsert: { position: position, candidate: candidate }
        },
        { upsert: true }
      );
    });

    await Promise.all(votePromises);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true, 
        message: 'Vote submitted successfully!' 
      })
    };

  } catch (error) {
    console.error('Error submitting vote:', error);
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