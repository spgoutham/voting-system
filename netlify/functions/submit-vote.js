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
    const { registerNumber, password, votes } = JSON.parse(event.body);

    // Validate input
    if (!registerNumber || !password || !votes) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Registration number, password, and votes are required' })
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
    const credentialsCollection = db.collection('user_credentials');
    const votesCollection = db.collection('votes');
    const votersCollection = db.collection('voters');

    // Validate credentials on server side
    const userCredential = await credentialsCollection.findOne({
      regNumber: registerNumber.toString(),
      password: password,
      isActive: true
    });

    if (!userCredential) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ 
          success: false, 
          message: 'Invalid registration number or password' 
        })
      };
    }

    // Check if user has already voted
    if (userCredential.hasVoted) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false, 
          message: 'You have already voted!' 
        })
      };
    }

    // Double-check in voters collection as well
    const existingVoter = await votersCollection.findOne({
      registerNumber: registerNumber.toString()
    });

    if (existingVoter) {
      // Update credential to reflect voted status if inconsistent
      await credentialsCollection.updateOne(
        { regNumber: registerNumber.toString() },
        { $set: { hasVoted: true, votedAt: existingVoter.votedAt } }
      );
      
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false, 
          message: 'You have already voted!' 
        })
      };
    }

    // Get current candidates to validate votes
    const candidatesCollection = db.collection('candidates');
    const candidatesData = await candidatesCollection.findOne({ _id: 'current_candidates' });
    
    const defaultCandidates = {
      president: ['Alice Johnson', 'Bob Smith', 'Carol Davis'],
      secretary: ['David Wilson', 'Emma Brown', 'Frank Miller'],
      treasurer: ['Grace Lee', 'Henry Clark', 'Ivy Taylor']
    };

    const currentCandidates = candidatesData ? candidatesData.candidates : defaultCandidates;

    // Validate that voted candidates exist in current candidate list
    const positions = ['president', 'secretary', 'treasurer'];
    for (const position of positions) {
      if (!currentCandidates[position] || !currentCandidates[position].includes(votes[position])) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ 
            success: false, 
            message: `Invalid candidate selected for ${position}: ${votes[position]}` 
          })
        };
      }
    }

    // Record voter to prevent duplicate voting
    await votersCollection.insertOne({
      registerNumber: registerNumber.toString(),
      votedAt: new Date(),
      ipAddress: event.headers['x-forwarded-for'] || event.headers['x-real-ip'] || 'unknown'
    });

    // Update user credential to mark as voted
    await credentialsCollection.updateOne(
      { regNumber: registerNumber.toString() },
      { 
        $set: { 
          hasVoted: true, 
          votedAt: new Date(),
          lastVoteIP: event.headers['x-forwarded-for'] || event.headers['x-real-ip'] || 'unknown'
        }
      }
    );

    // Submit votes for each position
    const votePromises = Object.entries(votes).map(([position, candidate]) => {
      return votesCollection.updateOne(
        { position: position, candidate: candidate },
        { 
          $inc: { count: 1 },
          $setOnInsert: { position: position, candidate: candidate, createdAt: new Date() },
          $set: { lastUpdated: new Date() }
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
        message: 'Vote submitted successfully!',
        regNumber: registerNumber
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