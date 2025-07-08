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
    // Parse request body with error handling
    let requestBody;
    try {
      requestBody = JSON.parse(event.body);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Invalid JSON in request body' })
      };
    }

    const { registerNumber, password, votes, preValidateOnly } = requestBody;

    // Enhanced input validation with better error messages
    if (!registerNumber) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Registration number is required' })
      };
    }

    if (!password) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Password is required' })
      };
    }

    // Normalize registration number - handle both string and number inputs
    const normalizedRegNumber = String(registerNumber).trim();
    const normalizedPassword = String(password).trim();

    console.log('Vote submission attempt:', { 
      regNumber: normalizedRegNumber, 
      hasPassword: !!normalizedPassword,
      preValidateOnly: !!preValidateOnly 
    });

    // Connect to MongoDB with better error handling
    try {
      client = new MongoClient(MONGODB_URI);
      await client.connect();
    } catch (connectionError) {
      console.error('MongoDB connection error:', connectionError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ success: false, message: 'Database connection failed' })
      };
    }
    
    const db = client.db(DB_NAME);
    const credentialsCollection = db.collection('user_credentials');
    const votesCollection = db.collection('votes');
    const votersCollection = db.collection('voters');
    const scheduleCollection = db.collection('election_schedule');

    // Enhanced credential validation with debugging
    console.log('Looking for credential with regNumber:', normalizedRegNumber);
    
    const userCredential = await credentialsCollection.findOne({
      regNumber: normalizedRegNumber,
      password: normalizedPassword,
      isActive: true
    });

    // Debug: Also try to find the user without password to see if the regNumber exists
    if (!userCredential) {
      const userWithoutPassword = await credentialsCollection.findOne({
        regNumber: normalizedRegNumber,
        isActive: true
      });
      
      if (userWithoutPassword) {
        console.log('User found but password mismatch for regNumber:', normalizedRegNumber);
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ 
            success: false, 
            message: 'Invalid password for this registration number' 
          })
        };
      } else {
        console.log('No user found with regNumber:', normalizedRegNumber);
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ 
            success: false, 
            message: 'Registration number not found or inactive' 
          })
        };
      }
    }

    console.log('Credential validation successful for regNumber:', normalizedRegNumber);

    // Check if user has already voted
    if (userCredential.hasVoted) {
      console.log('User has already voted according to credentials:', normalizedRegNumber);
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
      registerNumber: normalizedRegNumber
    });

    if (existingVoter) {
      console.log('User has already voted according to voters collection:', normalizedRegNumber);
      // Update credential to reflect voted status if inconsistent
      await credentialsCollection.updateOne(
        { regNumber: normalizedRegNumber },
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

    // If this is just a pre-validation request, return success
    if (preValidateOnly) {
      console.log('Pre-validation successful for regNumber:', normalizedRegNumber);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          message: 'Credentials validated successfully',
          preValidated: true
        })
      };
    }

    // Check if voting is currently allowed based on schedule
    const schedule = await scheduleCollection.findOne({ _id: 'current_schedule' });
    const now = new Date();

    if (schedule) {
      const startTime = new Date(schedule.startTime);
      const endTime = schedule.endTime ? new Date(schedule.endTime) : null;

      if (now < startTime) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ 
            success: false, 
            message: 'Voting has not started yet. Please wait for the scheduled time.',
            status: 'NOT_STARTED',
            startTime: startTime
          })
        };
      }

      if (endTime && now > endTime) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ 
            success: false, 
            message: 'Voting has ended.',
            status: 'ENDED',
            endTime: endTime
          })
        };
      }
    }

    // Validate votes structure for actual voting
    if (!votes || typeof votes !== 'object') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Votes object is required' })
      };
    }

    if (!votes.president || !votes.secretary || !votes.treasurer) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'All positions must be voted for' })
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
      registerNumber: normalizedRegNumber,
      votedAt: new Date(),
      ipAddress: event.headers['x-forwarded-for'] || event.headers['x-real-ip'] || 'unknown'
    });

    // Update user credential to mark as voted
    await credentialsCollection.updateOne(
      { regNumber: normalizedRegNumber },
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

    console.log('Vote submitted successfully for regNumber:', normalizedRegNumber);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true, 
        message: 'Vote submitted successfully!',
        regNumber: normalizedRegNumber
      })
    };

  } catch (error) {
    console.error('Error submitting vote:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        success: false, 
        message: 'Internal server error: ' + error.message
      })
    };
  } finally {
    if (client) {
      try {
        await client.close();
      } catch (closeError) {
        console.error('Error closing MongoDB connection:', closeError);
      }
    }
  }
};
