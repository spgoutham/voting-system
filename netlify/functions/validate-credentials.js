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
    // Parse request body with error handling
    let requestBody;
    try {
      requestBody = JSON.parse(event.body);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false, 
          valid: false,
          canVote: false,
          message: 'Invalid JSON in request body'
        })
      };
    }

    const { registerNumber, password } = requestBody;

    // Enhanced input validation
    if (!registerNumber) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false, 
          valid: false,
          canVote: false,
          message: 'Registration number is required'
        })
      };
    }

    if (!password) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false, 
          valid: false,
          canVote: false,
          message: 'Password is required'
        })
      };
    }

    // Normalize registration number - handle both string and number inputs
    const normalizedRegNumber = String(registerNumber).trim();
    const normalizedPassword = String(password).trim();

    console.log('Credential validation attempt:', { 
      regNumber: normalizedRegNumber, 
      hasPassword: !!normalizedPassword 
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
        body: JSON.stringify({ 
          success: false, 
          valid: false,
          canVote: false,
          message: 'Database connection failed'
        })
      };
    }
    
    const db = client.db(DB_NAME);
    const credentialsCollection = db.collection('user_credentials');
    const votersCollection = db.collection('voters');

    // Enhanced credential validation with debugging
    console.log('Looking for credential with regNumber:', normalizedRegNumber);
    
    const userCredential = await credentialsCollection.findOne({
      regNumber: normalizedRegNumber,
      password: normalizedPassword,
      isActive: true
    });

    if (!userCredential) {
      // Debug: Also try to find the user without password to see if the regNumber exists
      const userWithoutPassword = await credentialsCollection.findOne({
        regNumber: normalizedRegNumber,
        isActive: true
      });
      
      if (userWithoutPassword) {
        console.log('User found but password mismatch for regNumber:', normalizedRegNumber);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            success: true,
            valid: false,
            canVote: false,
            message: 'Invalid password for this registration number'
          })
        };
      } else {
        console.log('No user found with regNumber:', normalizedRegNumber);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            success: true,
            valid: false,
            canVote: false,
            message: 'Registration number not found or inactive'
          })
        };
      }
    }

    console.log('Credential validation successful for regNumber:', normalizedRegNumber);

    // Check if user has already voted
    const hasVoted = userCredential.hasVoted || await votersCollection.findOne({
      registerNumber: normalizedRegNumber
    });

    if (hasVoted) {
      console.log('User has already voted:', normalizedRegNumber);
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
    console.log('Credentials valid and user can vote:', normalizedRegNumber);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true,
        valid: true,
        canVote: true,
        message: 'Credentials validated successfully - Ready to vote!',
        regNumber: normalizedRegNumber
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
        message: 'Error validating credentials: ' + error.message
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
