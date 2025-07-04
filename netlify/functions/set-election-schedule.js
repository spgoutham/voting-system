// netlify/functions/set-election-schedule.js
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
    const { action, startTime, endTime, durationMinutes } = JSON.parse(event.body);

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
    const scheduleCollection = db.collection('election_schedule');

    let scheduleData;
    const now = new Date();

    switch (action) {
      case 'setTimer':
        // Set voting to start after specified minutes from now
        if (!durationMinutes || durationMinutes < 1) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ success: false, message: 'Duration in minutes is required' })
          };
        }

        const startDate = new Date(now.getTime() + (durationMinutes * 60 * 1000));
        scheduleData = {
          _id: 'current_schedule',
          startTime: startDate,
          endTime: null, // No end time set
          isActive: true,
          createdAt: now,
          createdBy: 'admin',
          timerDuration: durationMinutes
        };
        break;

      case 'setSchedule':
        // Set specific start and end times
        if (!startTime) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ success: false, message: 'Start time is required' })
          };
        }

        const start = new Date(startTime);
        const end = endTime ? new Date(endTime) : null;

        if (start <= now) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ success: false, message: 'Start time must be in the future' })
          };
        }

        if (end && end <= start) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ success: false, message: 'End time must be after start time' })
          };
        }

        scheduleData = {
          _id: 'current_schedule',
          startTime: start,
          endTime: end,
          isActive: true,
          createdAt: now,
          createdBy: 'admin'
        };
        break;

      case 'startNow':
        // Start voting immediately
        scheduleData = {
          _id: 'current_schedule',
          startTime: now,
          endTime: null,
          isActive: true,
          createdAt: now,
          createdBy: 'admin'
        };
        break;

      case 'stopVoting':
        // Stop voting immediately
        scheduleData = {
          _id: 'current_schedule',
          startTime: now,
          endTime: now,
          isActive: false,
          createdAt: now,
          createdBy: 'admin'
        };
        break;

      case 'clearSchedule':
        // Remove all scheduling (voting always available)
        await scheduleCollection.deleteOne({ _id: 'current_schedule' });
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            success: true, 
            message: 'Election schedule cleared. Voting is now always available.' 
          })
        };

      default:
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, message: 'Invalid action' })
        };
    }

    // Update or insert schedule
    await scheduleCollection.updateOne(
      { _id: 'current_schedule' },
      { $set: scheduleData },
      { upsert: true }
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true, 
        message: 'Election schedule updated successfully',
        schedule: {
          startTime: scheduleData.startTime,
          endTime: scheduleData.endTime,
          isActive: scheduleData.isActive
        }
      })
    };

  } catch (error) {
    console.error('Error setting election schedule:', error);
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