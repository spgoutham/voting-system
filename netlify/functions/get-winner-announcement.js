// netlify/functions/get-winner-announcement.js
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
    const announcementCollection = db.collection('winner_announcement');
    const votesCollection = db.collection('votes');
    const candidatesCollection = db.collection('candidates');

    // Get current announcement
    const announcement = await announcementCollection.findOne({ _id: 'current_announcement' });

    const now = new Date();
    let announcementStatus = {
      currentTime: now,
      hasAnnouncement: false,
      isAnnounced: false,
      timeUntilAnnouncement: null,
      announcementTime: null,
      status: 'NO_ANNOUNCEMENT',
      message: 'No winner announcement scheduled',
      winners: null,
      canViewResults: false
    };

    if (announcement) {
      announcementStatus.hasAnnouncement = true;
      announcementStatus.announcementTime = announcement.announcementTime;
      
      const announcementTime = new Date(announcement.announcementTime);
      
      if (announcement.isAnnounced || now >= announcementTime) {
        // Winners have been announced or time has passed
        announcementStatus.isAnnounced = true;
        announcementStatus.status = 'ANNOUNCED';
        announcementStatus.message = 'Winners have been announced!';
        announcementStatus.canViewResults = true;
        
        // Calculate winners
        const results = await getWinners(votesCollection, candidatesCollection);
        announcementStatus.winners = results;
        
      } else {
        // Announcement scheduled but not yet time
        announcementStatus.isAnnounced = false;
        announcementStatus.status = 'SCHEDULED';
        announcementStatus.message = 'Winner announcement coming soon...';
        announcementStatus.timeUntilAnnouncement = announcementTime.getTime() - now.getTime();
        announcementStatus.canViewResults = false;
        
        // Calculate countdown values
        const totalSeconds = Math.floor(announcementStatus.timeUntilAnnouncement / 1000);
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        announcementStatus.countdown = {
          days,
          hours,
          minutes,
          seconds,
          totalSeconds
        };
      }
    } else {
      // No announcement set - check if voting is closed to determine default behavior
      const scheduleCollection = db.collection('election_schedule');
      const schedule = await scheduleCollection.findOne({ _id: 'current_schedule' });
      
      if (schedule && schedule.endTime && now > new Date(schedule.endTime)) {
        // Voting is closed but no announcement set - can view results
        announcementStatus.canViewResults = true;
        announcementStatus.status = 'NO_ANNOUNCEMENT';
        announcementStatus.message = 'Voting closed - Results available';
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(announcementStatus)
    };

  } catch (error) {
    console.error('Error getting winner announcement:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        currentTime: new Date(),
        hasAnnouncement: false,
        isAnnounced: false,
        timeUntilAnnouncement: null,
        announcementTime: null,
        status: 'ERROR',
        message: 'Error checking announcement status',
        winners: null,
        canViewResults: false
      })
    };
  } finally {
    if (client) {
      await client.close();
    }
  }
};

// Helper function to calculate winners
async function getWinners(votesCollection, candidatesCollection) {
  try {
    // Get current candidates from database
    const candidatesData = await candidatesCollection.findOne({ _id: 'current_candidates' });
    
    // Default candidates if none found in database
    const defaultCandidates = {
      president: ['Alice Johnson', 'Bob Smith', 'Carol Davis'],
      secretary: ['David Wilson', 'Emma Brown', 'Frank Miller'],
      treasurer: ['Grace Lee', 'Henry Clark', 'Ivy Taylor']
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

    // Initialize all candidates with 0 votes
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

    // Calculate winners for each position
    const winners = {};
    Object.keys(results).forEach(position => {
      const positionResults = results[position];
      const sortedCandidates = Object.entries(positionResults)
        .sort(([,a], [,b]) => b - a);
      
      if (sortedCandidates.length > 0) {
        winners[position] = {
          name: sortedCandidates[0][0],
          votes: sortedCandidates[0][1],
          position: position
        };
      }
    });

    return {
      winners: winners,
      fullResults: results
    };
  } catch (error) {
    console.error('Error calculating winners:', error);
    return null;
  }
}