// netlify/functions/get-election-status.js
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
    let electionStatus = {
      currentTime: now,
      votingAllowed: true,
      status: 'OPEN',
      message: 'Voting is open',
      timeRemaining: null,
      timeUntilStart: null,
      timeUntilEnd: null,
      startTime: null,
      endTime: null,
      hasSchedule: false
    };

    if (schedule) {
      electionStatus.hasSchedule = true;
      electionStatus.startTime = schedule.startTime;
      electionStatus.endTime = schedule.endTime;

      const startTime = new Date(schedule.startTime);
      const endTime = schedule.endTime ? new Date(schedule.endTime) : null;

      if (now < startTime) {
        // Voting hasn't started yet
        electionStatus.votingAllowed = false;
        electionStatus.status = 'SCHEDULED';
        electionStatus.message = 'Voting has not started yet';
        electionStatus.timeUntilStart = Math.max(0, startTime.getTime() - now.getTime());
        
        // Calculate countdown values
        const totalSeconds = Math.floor(electionStatus.timeUntilStart / 1000);
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        electionStatus.countdown = {
          days,
          hours,
          minutes,
          seconds,
          totalSeconds
        };

      } else if (endTime && now > endTime) {
        // Voting has ended
        electionStatus.votingAllowed = false;
        electionStatus.status = 'CLOSED';
        electionStatus.message = 'Voting has ended';

      } else if (endTime && now >= startTime && now <= endTime) {
        // Voting is currently active with end time
        electionStatus.votingAllowed = true;
        electionStatus.status = 'OPEN';
        electionStatus.message = 'Voting is currently open';
        electionStatus.timeUntilEnd = Math.max(0, endTime.getTime() - now.getTime());
        
        // Calculate countdown until end
        const totalSeconds = Math.floor(electionStatus.timeUntilEnd / 1000);
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        electionStatus.countdownUntilEnd = {
          days,
          hours,
          minutes,
          seconds,
          totalSeconds
        };

      } else if (now >= startTime && !endTime) {
        // Voting started, no end time set
        electionStatus.votingAllowed = true;
        electionStatus.status = 'OPEN';
        electionStatus.message = 'Voting is currently open';

      } else {
        // Edge case: schedule exists but voting is disabled
        electionStatus.votingAllowed = false;
        electionStatus.status = 'DISABLED';
        electionStatus.message = 'Voting is currently disabled';
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(electionStatus)
    };

  } catch (error) {
    console.error('Error getting election status:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        currentTime: new Date(),
        votingAllowed: true,
        status: 'ERROR',
        message: 'Error checking election status',
        timeRemaining: null,
        timeUntilStart: null,
        timeUntilEnd: null,
        startTime: null,
        endTime: null,
        hasSchedule: false
      })
    };
  } finally {
    if (client) {
      await client.close();
    }
  }
};