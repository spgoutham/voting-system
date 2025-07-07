// netlify/functions/debug-election-status.js
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
    const scheduleCollection = db.collection('election_schedule');

    // Get current schedule
    const schedule = await scheduleCollection.findOne({ _id: 'current_schedule' });

    const now = new Date();
    console.log('🕐 Current server time:', now.toISOString());
    
    if (schedule) {
      console.log('📅 Schedule found:', schedule);
      const startTime = new Date(schedule.startTime);
      const endTime = schedule.endTime ? new Date(schedule.endTime) : null;
      
      console.log('🚀 Start time:', startTime.toISOString());
      console.log('🏁 End time:', endTime ? endTime.toISOString() : 'No end time');
      
      const timeUntilStart = startTime.getTime() - now.getTime();
      console.log('⏰ Time until start (ms):', timeUntilStart);
      console.log('⏰ Time until start (seconds):', Math.floor(timeUntilStart / 1000));
      console.log('⏰ Time until start (minutes):', Math.floor(timeUntilStart / 60000));
      
      // Pre-voting time: 1 minute before start time
      const preVotingTime = new Date(startTime.getTime() - (1 * 60 * 1000));
      console.log('⏳ Pre-voting time:', preVotingTime.toISOString());
      
      let status;
      if (now < preVotingTime) {
        status = 'SCHEDULED';
      } else if (now >= preVotingTime && now < startTime) {
        status = 'PRE_VOTING';
      } else if (endTime && now > endTime) {
        status = 'CLOSED';
      } else if (now >= startTime) {
        status = 'OPEN';
      }
      
      console.log('📊 Calculated status:', status);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          debug: true,
          currentTime: now,
          schedule: schedule,
          startTime: startTime,
          endTime: endTime,
          preVotingTime: preVotingTime,
          timeUntilStart: timeUntilStart,
          timeUntilStartSeconds: Math.floor(timeUntilStart / 1000),
          timeUntilStartMinutes: Math.floor(timeUntilStart / 60000),
          calculatedStatus: status,
          serverTimeISO: now.toISOString(),
          startTimeISO: startTime.toISOString(),
          timeDifference: timeUntilStart
        })
      };
    } else {
      console.log('❌ No schedule found');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          debug: true,
          currentTime: now,
          schedule: null,
          message: 'No schedule found',
          serverTimeISO: now.toISOString()
        })
      };
    }

  } catch (error) {
    console.error('Error getting debug election status:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        debug: true,
        error: error.message,
        currentTime: new Date()
      })
    };
  } finally {
    if (client) {
      await client.close();
    }
  }
};