// netlify/functions/get-nominees.js
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
    const nomineesCollection = db.collection('nominees');

    // Get current nominees list
    const nomineesData = await nomineesCollection.findOne({ _id: 'current_nominees' });

    // Default nominees if none found
    const defaultNominees = [];

    const nominees = nomineesData ? nomineesData.nominees : defaultNominees;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        nominees: nominees,
        count: nominees.length
      })
    };

  } catch (error) {
    console.error('Error getting nominees:', error);
    
    // Return empty list on error
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        nominees: [],
        count: 0
      })
    };
  } finally {
    if (client) {
      await client.close();
    }
  }
};