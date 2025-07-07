// netlify/functions/extend-voting-time.js
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
    const { additionalMinutes } = JSON.parse(event.body);

    if (!additionalMinutes || additionalMinutes < 1) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Additional minutes is required and must be positive' })
      };
    }

    // Connect to MongoDB
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    
    const db = client.db(DB_NAME);
    const scheduleCollection = db.collection('election_schedule');

    // Get current schedule
    const schedule = await scheduleCollection.findOne({ _id: 'current_schedule' });

    if (!schedule) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'No active election schedule found' })
      };
    }

    const now = new Date();
    const startTime = new Date(schedule.startTime);
    
    // Check if voting is currently active
    if (now < startTime) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Voting has not started yet' })
      };
    }

    // Calculate new end time
    let newEndTime;
    if (schedule.endTime) {
      // Extend existing end time
      newEndTime = new Date(new Date(schedule.endTime).getTime() + (additionalMinutes * 60 * 1000));
    } else {
      // Set end time for the first time (current time + additional minutes)
      newEndTime = new Date(now.getTime() + (additionalMinutes * 60 * 1000));
    }

    // Update schedule with new end time
    await scheduleCollection.updateOne(
      { _id: 'current_schedule' },
      { 
        $set: { 
          endTime: newEndTime,
          lastExtended: now,
          lastExtensionMinutes: additionalMinutes,
          updatedBy: 'admin'
        }
      }
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true, 
        message: `Voting time extended by ${additionalMinutes} minutes`,
        newEndTime: newEndTime,
        additionalMinutes: additionalMinutes
      })
    };

  } catch (error) {
    console.error('Error extending voting time:', error);
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