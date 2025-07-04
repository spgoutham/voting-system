// netlify/functions/manage-nominees.js
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
    const { action, nominee, nominees } = JSON.parse(event.body);

    if (!action) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Action is required' })
      };
    }

    // Connect to MongoDB
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    
    const db = client.db(DB_NAME);
    const nomineesCollection = db.collection('nominees');

    // Get current nominees
    const nomineesData = await nomineesCollection.findOne({ _id: 'current_nominees' });
    let currentNominees = nomineesData ? nomineesData.nominees : [];

    let response = { success: false, message: 'Unknown action' };

    switch (action) {
      case 'add':
        if (!nominee || !nominee.name) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ success: false, message: 'Nominee name is required' })
          };
        }

        // Check if nominee already exists
        const existingNominee = currentNominees.find(n => n.name.toLowerCase() === nominee.name.toLowerCase());
        if (existingNominee) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ success: false, message: 'Nominee already exists' })
          };
        }

        // Add new nominee
        const newNominee = {
          name: nominee.name.trim(),
          tag: nominee.tag || 'Nominee',
          addedAt: new Date(),
          addedBy: 'admin'
        };

        currentNominees.push(newNominee);
        response = { success: true, message: `${newNominee.name} added to nominees list` };
        break;

      case 'remove':
        if (!nominee || !nominee.name) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ success: false, message: 'Nominee name is required' })
          };
        }

        const initialLength = currentNominees.length;
        currentNominees = currentNominees.filter(n => n.name.toLowerCase() !== nominee.name.toLowerCase());
        
        if (currentNominees.length === initialLength) {
          return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ success: false, message: 'Nominee not found' })
          };
        }

        response = { success: true, message: `${nominee.name} removed from nominees list` };
        break;

      case 'setBulk':
        if (!nominees || !Array.isArray(nominees)) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ success: false, message: 'Nominees array is required' })
          };
        }

        // Validate and format nominees
        currentNominees = nominees.map(n => ({
          name: typeof n === 'string' ? n.trim() : n.name.trim(),
          tag: typeof n === 'string' ? 'Nominee' : (n.tag || 'Nominee'),
          addedAt: new Date(),
          addedBy: 'admin'
        })).filter(n => n.name.length > 0);

        response = { success: true, message: `${currentNominees.length} nominees updated` };
        break;

      case 'clear':
        currentNominees = [];
        response = { success: true, message: 'All nominees cleared' };
        break;

      case 'updateTag':
        if (!nominee || !nominee.name) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ success: false, message: 'Nominee name is required' })
          };
        }

        const nomineeIndex = currentNominees.findIndex(n => n.name.toLowerCase() === nominee.name.toLowerCase());
        if (nomineeIndex === -1) {
          return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ success: false, message: 'Nominee not found' })
          };
        }

        currentNominees[nomineeIndex].tag = nominee.tag || 'Nominee';
        currentNominees[nomineeIndex].updatedAt = new Date();
        response = { success: true, message: `${nominee.name} tag updated to "${nominee.tag}"` };
        break;

      default:
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, message: 'Invalid action' })
        };
    }

    // Save updated nominees list
    await nomineesCollection.updateOne(
      { _id: 'current_nominees' },
      { 
        $set: { 
          nominees: currentNominees,
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
        ...response,
        nominees: currentNominees,
        count: currentNominees.length
      })
    };

  } catch (error) {
    console.error('Error managing nominees:', error);
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