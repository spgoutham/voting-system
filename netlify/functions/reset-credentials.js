// netlify/functions/reset-credentials.js
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

// Function to generate random password
function generatePassword(length = 8) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// Generate valid registration numbers
function generateValidRegNumbers() {
  const validRegNumbers = [];
  
  // Range 1: 142222243001 to 142222243058, excluding 142222243044 and 142222243055
  for (let i = 142222243001; i <= 142222243058; i++) {
    if (i !== 142222243044 && i !== 142222243055) {
      validRegNumbers.push(i.toString());
    }
  }
  
  // Range 2: 142222243301 to 142222243306
  for (let i = 142222243301; i <= 142222243306; i++) {
    validRegNumbers.push(i.toString());
  }
  
  return validRegNumbers;
}

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
    const { confirmReset } = JSON.parse(event.body || '{}');

    if (!confirmReset) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false, 
          message: 'Reset confirmation required. This will delete all existing credentials and votes.' 
        })
      };
    }

    // Connect to MongoDB
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    
    const db = client.db(DB_NAME);
    const credentialsCollection = db.collection('user_credentials');
    const votersCollection = db.collection('voters');
    const votesCollection = db.collection('votes');

    // Clear all existing data
    await Promise.all([
      credentialsCollection.deleteMany({}),
      votersCollection.deleteMany({}),
      votesCollection.deleteMany({})
    ]);

    // Generate valid registration numbers
    const validRegNumbers = generateValidRegNumbers();
    
    // Create new credentials for each registration number
    const credentials = validRegNumbers.map(regNumber => ({
      regNumber: regNumber,
      password: generatePassword(8),
      isActive: true,
      hasVoted: false,
      createdAt: new Date()
    }));

    // Insert all new credentials
    await credentialsCollection.insertMany(credentials);

    // Return the new credentials for admin reference
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true, 
        message: `All data reset. ${credentials.length} new user credentials created successfully`,
        credentials: credentials.map(cred => ({
          regNumber: cred.regNumber,
          password: cred.password
        }))
      })
    };

  } catch (error) {
    console.error('Error resetting credentials:', error);
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