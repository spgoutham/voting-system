// netlify/functions/get-winner-announcement.js
const { MongoClient } = require('mongodb');

const MONGODB_URI = 'mongodb+srv://gou8sarav:r4MvYsciylNFHtt9@voting.bg9nvss.mongodb.net/?retryWrites=true&w=majority&appName=voting';
const DB_NAME = 'voting_system';

// CORS headers with cache-busting
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Cache-Control, Pragma',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0'
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
      isSealed: false,
      timeUntilAnnouncement: null,
      announcementTime: null,
      status: 'NO_ANNOUNCEMENT',
      message: 'No winner announcement scheduled',
      winners: null,
      canViewResults: false,
      preFetched: false
    };

    if (announcement) {
      announcementStatus.hasAnnouncement = true;
      announcementStatus.announcementTime = announcement.announcementTime;
      announcementStatus.isSealed = announcement.isSealed || false; // Check if sealed
      
      const announcementTime = new Date(announcement.announcementTime);
      const timeUntilAnnouncement = announcementTime.getTime() - now.getTime();
      
      // Pre-fetch results 30 seconds before announcement
      const preFetchTime = 30000; // 30 seconds
      
      // 🔒 CHECK IF SEALED - If sealed, block all results
      if (announcementStatus.isSealed) {
        announcementStatus.isAnnounced = false;
        announcementStatus.status = 'SEALED';
        announcementStatus.message = 'Results are sealed until the official announcement';
        announcementStatus.canViewResults = false;
        announcementStatus.winners = null;
        
        // Still show countdown if announcement is scheduled
        if (timeUntilAnnouncement > 0) {
          announcementStatus.timeUntilAnnouncement = timeUntilAnnouncement;
          
          const totalSeconds = Math.floor(timeUntilAnnouncement / 1000);
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
        
      } else if (announcement.isAnnounced || now >= announcementTime) {
        // Winners have been announced or time has passed
        announcementStatus.isAnnounced = true;
        announcementStatus.status = 'ANNOUNCED';
        announcementStatus.message = 'Winners have been announced!';
        announcementStatus.canViewResults = true;
        
        // Calculate winners with victory margins
        const results = await getWinnersWithMargins(votesCollection, candidatesCollection);
        announcementStatus.winners = results;
        
      } else if (timeUntilAnnouncement <= preFetchTime) {
        // Pre-fetch phase - calculate results but don't show yet
        announcementStatus.isAnnounced = false;
        announcementStatus.status = 'PRE_FETCH';
        announcementStatus.message = 'Preparing galactic results...';
        announcementStatus.timeUntilAnnouncement = timeUntilAnnouncement;
        announcementStatus.canViewResults = false;
        announcementStatus.preFetched = true;
        
        // Pre-calculate winners for instant display
        const results = await getWinnersWithMargins(votesCollection, candidatesCollection);
        announcementStatus.preFetchedWinners = results;
        
        // Calculate countdown values
        const totalSeconds = Math.floor(timeUntilAnnouncement / 1000);
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
        
      } else {
        // Announcement scheduled but not yet in pre-fetch time
        announcementStatus.isAnnounced = false;
        announcementStatus.status = 'SCHEDULED';
        announcementStatus.message = 'Winner announcement coming soon...';
        announcementStatus.timeUntilAnnouncement = timeUntilAnnouncement;
        announcementStatus.canViewResults = false;
        
        // Calculate countdown values
        const totalSeconds = Math.floor(timeUntilAnnouncement / 1000);
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
      
      // 🔒 IMPORTANT: Only show results if NOT sealed and voting is closed
      if (schedule && schedule.endTime && now > new Date(schedule.endTime)) {
        // Check if there's a sealed flag in the schedule or announcement collection
        const sealedStatus = await announcementCollection.findOne({ _id: 'seal_status' });
        
        if (sealedStatus && sealedStatus.isSealed) {
          // Results are sealed
          announcementStatus.canViewResults = false;
          announcementStatus.status = 'SEALED';
          announcementStatus.message = 'Results are sealed until the official announcement';
          announcementStatus.isSealed = true;
        } else {
          // Voting is closed but no announcement set and not sealed - can view results
          announcementStatus.canViewResults = true;
          announcementStatus.status = 'NO_ANNOUNCEMENT';
          announcementStatus.message = 'Voting closed - Results available';
          
          // Show results with victory margins
          const results = await getWinnersWithMargins(votesCollection, candidatesCollection);
          announcementStatus.winners = results;
        }
      } else {
        // Voting still ongoing or no schedule
        announcementStatus.status = 'VOTING_ONGOING';
        announcementStatus.message = 'Voting is still ongoing';
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
        isSealed: false,
        timeUntilAnnouncement: null,
        announcementTime: null,
        status: 'ERROR',
        message: 'Error checking announcement status',
        winners: null,
        canViewResults: false,
        preFetched: false
      })
    };
  } finally {
    if (client) {
      await client.close();
    }
  }
};

// Enhanced helper function to calculate winners with victory margins
async function getWinnersWithMargins(votesCollection, candidatesCollection) {
  try {
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

    // Calculate winners and margins for each position
    const winners = {};
    const margins = {};
    
    Object.keys(results).forEach(position => {
      const positionResults = results[position];
      const sortedCandidates = Object.entries(positionResults)
        .sort(([,a], [,b]) => b - a);
      
      if (sortedCandidates.length > 0) {
        const winner = sortedCandidates[0];
        const runnerUp = sortedCandidates.length > 1 ? sortedCandidates[1] : null;
        
        const victoryMargin = runnerUp ? winner[1] - runnerUp[1] : winner[1];
        const totalVotes = Object.values(positionResults).reduce((sum, count) => sum + count, 0);
        const winPercentage = totalVotes > 0 ? (winner[1] / totalVotes * 100) : 0;
        
        winners[position] = {
          name: winner[0],
          votes: winner[1],
          position: position,
          victoryMargin: victoryMargin,
          winPercentage: Math.round(winPercentage * 10) / 10, // Round to 1 decimal
          totalVotes: totalVotes,
          isLandslide: victoryMargin > (totalVotes * 0.5), // More than 50% margin
          isCloseRace: victoryMargin <= 3 && totalVotes > 5 // Close if margin <= 3 and meaningful vote count
        };
        
        margins[position] = victoryMargin;
      }
    });

    return {
      winners: winners,
      fullResults: results,
      margins: margins,
      hasResults: Object.keys(winners).length > 0
    };
  } catch (error) {
    console.error('Error calculating winners with margins:', error);
    return null;
  }
}