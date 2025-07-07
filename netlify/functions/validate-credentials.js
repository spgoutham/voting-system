// netlify/functions/validate-credentials.js
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
    const { registerNumber, password } = JSON.parse(event.body);

    // Validate input
    if (!registerNumber || !password) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false, 
          message: 'Registration number and password are required',
          valid: false
        })
      };
    }

    // Connect to MongoDB
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    
    const db = client.db(DB_NAME);
    const credentialsCollection = db.collection('user_credentials');
    const votersCollection = db.collection('voters');

    // Validate credentials
    const userCredential = await credentialsCollection.findOne({
      regNumber: registerNumber.toString(),
      password: password,
      isActive: true
    });

    if (!userCredential) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true,
          valid: false,
          message: 'Invalid registration number or password',
          canVote: false
        })
      };
    }

    // Check if user has already voted
    const hasVoted = userCredential.hasVoted || await votersCollection.findOne({
      registerNumber: registerNumber.toString()
    });

    if (hasVoted) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true,
          valid: true,
          canVote: false,
          message: 'Valid credentials but you have already voted',
          alreadyVoted: true
        })
      };
    }

    // Valid credentials and can vote
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true,
        valid: true,
        canVote: true,
        message: 'Credentials validated successfully - Ready to vote!',
        regNumber: registerNumber
      })
    };

  } catch (error) {
    console.error('Error validating credentials:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        success: false, 
        valid: false,
        canVote: false,
        message: 'Error validating credentials' 
      })
    };
  } finally {
    if (client) {
      await client.close();
    }
  }
};