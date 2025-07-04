// netlify/functions/get-stats.js
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
    const votersCollection = db.collection('voters');
    const votesCollection = db.collection('votes');
    const candidatesCollection = db.collection('candidates');

    // Get total number of voters who have voted
    const totalVoters = await votersCollection.countDocuments({});

    // Get total votes cast (sum of all vote counts)
    const allVotes = await votesCollection.find({}).toArray();
    const totalVotes = allVotes.reduce((sum, vote) => sum + (vote.count || 0), 0);

    // Get total number of candidates
    const candidatesData = await candidatesCollection.findOne({ _id: 'current_candidates' });
    let totalCandidates = 0;
    if (candidatesData && candidatesData.candidates) {
      totalCandidates = Object.values(candidatesData.candidates)
        .reduce((sum, list) => sum + list.length, 0);
    } else {
      // Default count if no candidates in database
      totalCandidates = 9; // 3 positions × 3 candidates each
    }

    // Get most recent vote time
    const lastVoter = await votersCollection.findOne(
      {}, 
      { sort: { votedAt: -1 } }
    );
    const lastVoteTime = lastVoter ? lastVoter.votedAt : null;

    // Calculate some additional stats
    const avgVotesPerCandidate = totalCandidates > 0 ? (totalVotes / totalCandidates).toFixed(1) : 0;
    
    // Get vote distribution by position
    const votesByPosition = {};
    allVotes.forEach(vote => {
      if (!votesByPosition[vote.position]) {
        votesByPosition[vote.position] = 0;
      }
      votesByPosition[vote.position] += vote.count || 0;
    });

    // Election status (simple logic - could be enhanced)
    let electionStatus = 'ACTIVE';
    if (totalVotes === 0) {
      electionStatus = 'NOT_STARTED';
    } else if (totalVoters > 100) { // Example threshold
      electionStatus = 'HIGH_TURNOUT';
    }

    const stats = {
      totalVoters,
      totalVotes,
      totalCandidates,
      lastVoteTime,
      avgVotesPerCandidate,
      votesByPosition,
      electionStatus,
      timestamp: new Date()
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(stats)
    };

  } catch (error) {
    console.error('Error getting statistics:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        totalVoters: 0,
        totalVotes: 0,
        totalCandidates: 0,
        lastVoteTime: null,
        avgVotesPerCandidate: 0,
        votesByPosition: {},
        electionStatus: 'ERROR',
        timestamp: new Date()
      })
    };
  } finally {
    if (client) {
      await client.close();
    }
  }
};