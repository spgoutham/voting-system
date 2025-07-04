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
    const credentialsCollection = db.collection('user_credentials');
    const votersCollection = db.collection('voters');
    const votesCollection = db.collection('votes');
    const candidatesCollection = db.collection('candidates');

    // Get total number of registered voters (from credentials)
    const totalRegisteredVoters = await credentialsCollection.countDocuments({ isActive: true });

    // Get total number of voters who have actually voted
    const totalVotersWhoVoted = await credentialsCollection.countDocuments({ 
      isActive: true, 
      hasVoted: true 
    });

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
    const lastVoter = await credentialsCollection.findOne(
      { hasVoted: true }, 
      { sort: { votedAt: -1 } }
    );
    const lastVoteTime = lastVoter ? lastVoter.votedAt : null;

    // Calculate additional stats
    const voterTurnoutPercentage = totalRegisteredVoters > 0 
      ? ((totalVotersWhoVoted / totalRegisteredVoters) * 100).toFixed(1) 
      : 0;
    
    const avgVotesPerCandidate = totalCandidates > 0 ? (totalVotes / totalCandidates).toFixed(1) : 0;
    
    // Get vote distribution by position
    const votesByPosition = {};
    allVotes.forEach(vote => {
      if (!votesByPosition[vote.position]) {
        votesByPosition[vote.position] = 0;
      }
      votesByPosition[vote.position] += vote.count || 0;
    });

    // Election status (enhanced logic)
    let electionStatus = 'ACTIVE';
    if (totalVotes === 0) {
      electionStatus = 'NOT_STARTED';
    } else if (totalVotersWhoVoted === totalRegisteredVoters) {
      electionStatus = 'COMPLETED';
    } else if (voterTurnoutPercentage >= 80) {
      electionStatus = 'HIGH_TURNOUT';
    } else if (voterTurnoutPercentage >= 50) {
      electionStatus = 'GOOD_TURNOUT';
    } else {
      electionStatus = 'LOW_TURNOUT';
    }

    // Get breakdown by registration number ranges for additional insights
    const range1Voters = await credentialsCollection.countDocuments({
      regNumber: { $regex: '^14222224300[1-9]$|^142222243[0-4][0-9]$|^142222243058$' },
      hasVoted: true,
      isActive: true
    });
    
    const range2Voters = await credentialsCollection.countDocuments({
      regNumber: { $regex: '^14222224330[1-6]$' },
      hasVoted: true,
      isActive: true
    });

    const stats = {
      totalVoters: totalVotersWhoVoted,
      totalVotes,
      totalCandidates,
      totalRegisteredVoters,
      voterTurnoutPercentage,
      lastVoteTime,
      avgVotesPerCandidate,
      votesByPosition,
      electionStatus,
      voterBreakdown: {
        range1Voted: range1Voters,
        range2Voted: range2Voters,
        totalVoted: totalVotersWhoVoted,
        totalRegistered: totalRegisteredVoters
      },
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
        totalRegisteredVoters: 0,
        voterTurnoutPercentage: 0,
        lastVoteTime: null,
        avgVotesPerCandidate: 0,
        votesByPosition: {},
        electionStatus: 'ERROR',
        voterBreakdown: {
          range1Voted: 0,
          range2Voted: 0,
          totalVoted: 0,
          totalRegistered: 0
        },
        timestamp: new Date()
      })
    };
  } finally {
    if (client) {
      await client.close();
    }
  }
};