// netlify/functions/get-results.js
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
    const votesCollection = db.collection('votes');
    const candidatesCollection = db.collection('candidates');
    const announcementCollection = db.collection('winner_announcement');

    // 🔒 CHECK SEALING STATUS FIRST
    const announcement = await announcementCollection.findOne({ _id: 'current_announcement' });
    const sealedStatus = await announcementCollection.findOne({ _id: 'seal_status' });
    
    const now = new Date();
    let isSealed = false;
    let canViewResults = false;

    // Check if results are sealed
    if (announcement && announcement.isSealed) {
      isSealed = true;
    } else if (sealedStatus && sealedStatus.isSealed) {
      isSealed = true;
    }

    // Check if announcement has been made
    if (announcement && announcement.isAnnounced) {
      canViewResults = true;
    } else if (announcement && announcement.announcementTime && now >= new Date(announcement.announcementTime)) {
      canViewResults = true;
    }

    // If sealed and not announced, deny access
    if (isSealed && !canViewResults) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ 
          success: false,
          message: 'Results are sealed until the official announcement',
          isSealed: true,
          canViewResults: false
        })
      };
    }

    // 🔒 ADDITIONAL CHECK: If no announcement but voting is closed, check if results should be hidden
    if (!announcement) {
      const scheduleCollection = db.collection('election_schedule');
      const schedule = await scheduleCollection.findOne({ _id: 'current_schedule' });
      
      // If voting is not closed yet, deny access
      if (!schedule || !schedule.endTime || now < new Date(schedule.endTime)) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ 
            success: false,
            message: 'Results not available - voting is still ongoing',
            isSealed: false,
            canViewResults: false
          })
        };
      }
      
      // Check for global seal status when no announcement exists
      if (sealedStatus && sealedStatus.isSealed) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ 
            success: false,
            message: 'Results are sealed until the official announcement',
            isSealed: true,
            canViewResults: false
          })
        };
      }
    }

    // 🔓 IF WE REACH HERE, RESULTS CAN BE SHOWN
    
    // Get current candidates from database
    const candidatesData = await candidatesCollection.findOne({ _id: 'current_candidates' });
    
    // Default candidates if none found in database
    const defaultCandidates = {
      president: ['RAJESH', 'VARUN', 'AKHASH', 'SARAN'],
      secretary: ['PRIYANKA', 'ABINAYA'],
      treasurer: ['JEYA PRAKASH']
    };

    const candidates = candidatesData ? candidatesData.candidates : defaultCandidates;

    // Get all votes
    const allVotes = await votesCollection.find({}).toArray();

    // Organize results by position
    const results = {
      president: {},
      secretary: {},
      treasurer: {}
    };

    // Initialize all candidates with 0 votes (using current candidates from database)
    Object.keys(candidates).forEach(position => {
      candidates[position].forEach(candidate => {
        results[position][candidate] = 0;
      });
    });

    // Fill in actual vote counts
    allVotes.forEach(vote => {
      if (results[vote.position] && candidates[vote.position].includes(vote.candidate)) {
        results[vote.position][vote.candidate] = vote.count;
      }
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ...results,
        meta: {
          isSealed: false,
          canViewResults: true,
          timestamp: now
        }
      })
    };

  } catch (error) {
    console.error('Error getting results:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        success: false,
        message: 'Error retrieving results',
        president: {},
        secretary: {},
        treasurer: {}
      })
    };
  } finally {
    if (client) {
      await client.close();
    }
  }
};