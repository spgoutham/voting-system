// .netlify/functions/export-voting-stats.js
const { MongoClient } = require('mongodb');

const MONGODB_URI = 'mongodb+srv://gou8sarav:r4MvYsciylNFHtt9@voting.bg9nvss.mongodb.net/?retryWrites=true&w=majority&appName=voting';
const DB_NAME = 'voting_system';

// CORS headers
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'text/csv; charset=utf-8',
  'Content-Disposition': 'attachment; filename="voting_statistics.csv"'
};

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: 'Method not allowed'
    };
  }

  let client;

  try {
    // Get export type from query parameters
    const exportType = event.queryStringParameters?.type || 'complete';

    // Connect to MongoDB
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    
    const db = client.db(DB_NAME);
    const credentialsCollection = db.collection('user_credentials');
    const votersCollection = db.collection('voters');
    const votesCollection = db.collection('votes');

    let csvContent = '';

    switch (exportType) {
      case 'individual':
        csvContent = await generateIndividualVotesCSV(votersCollection, credentialsCollection);
        headers['Content-Disposition'] = 'attachment; filename="individual_votes.csv"';
        break;
      
      case 'summary':
        csvContent = await generateCandidateResultsCSV(votesCollection);
        headers['Content-Disposition'] = 'attachment; filename="candidate_results.csv"';
        break;
      
      case 'complete':
      default:
        csvContent = await generateCompleteStatisticsCSV(votersCollection, credentialsCollection, votesCollection);
        headers['Content-Disposition'] = 'attachment; filename="complete_statistics.csv"';
        break;
    }

    return {
      statusCode: 200,
      headers,
      body: csvContent
    };

  } catch (error) {
    console.error('Error exporting voting statistics:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        success: false, 
        message: 'Error exporting voting statistics: ' + error.message 
      })
    };
  } finally {
    if (client) {
      await client.close();
    }
  }
};

// Generate CSV for individual votes (who voted for whom)
async function generateIndividualVotesCSV(votersCollection, credentialsCollection) {
  const voters = await votersCollection.find({}).sort({ votedAt: 1 }).toArray();
  
  let csv = 'Registration Number,Username,President Vote,Secretary Vote,Treasurer Vote,Voted At,IP Address\n';
  
  for (const voter of voters) {
    // Get additional info from credentials if available
    const credential = await credentialsCollection.findOne({ regNumber: voter.registerNumber });
    const username = credential?.username || voter.registerNumber;
    
    const row = [
      escapeCSV(voter.registerNumber),
      escapeCSV(username),
      escapeCSV(voter.votes?.president || 'N/A'),
      escapeCSV(voter.votes?.secretary || 'N/A'),
      escapeCSV(voter.votes?.treasurer || 'N/A'),
      voter.votedAt ? new Date(voter.votedAt).toLocaleString() : 'N/A',
      escapeCSV(voter.ipAddress || 'N/A')
    ].join(',');
    
    csv += row + '\n';
  }
  
  // Add summary section
  csv += '\n\nSUMMARY\n';
  csv += `Total Votes Cast,${voters.length}\n`;
  csv += `Export Generated,${new Date().toLocaleString()}\n`;
  
  return csv;
}

// Generate CSV for candidate results summary
async function generateCandidateResultsCSV(votesCollection) {
  const votes = await votesCollection.find({}).toArray();
  
  let csv = 'Position,Candidate,Vote Count,Percentage\n';
  
  // Group votes by position
  const votesByPosition = {};
  votes.forEach(vote => {
    if (!votesByPosition[vote.position]) {
      votesByPosition[vote.position] = {};
    }
    votesByPosition[vote.position][vote.candidate] = vote.count || 0;
  });
  
  // Calculate totals and percentages
  Object.keys(votesByPosition).forEach(position => {
    const positionVotes = votesByPosition[position];
    const totalVotes = Object.values(positionVotes).reduce((sum, count) => sum + count, 0);
    
    // Sort candidates by vote count (descending)
    const sortedCandidates = Object.entries(positionVotes)
      .sort(([,a], [,b]) => b - a);
    
    sortedCandidates.forEach(([candidate, count]) => {
      const percentage = totalVotes > 0 ? ((count / totalVotes) * 100).toFixed(2) : '0.00';
      const row = [
        escapeCSV(position),
        escapeCSV(candidate),
        count,
        percentage + '%'
      ].join(',');
      csv += row + '\n';
    });
    
    // Add subtotal
    csv += `${escapeCSV(position)},TOTAL,${totalVotes},100.00%\n\n`;
  });
  
  csv += `Export Generated,${new Date().toLocaleString()}\n`;
  
  return csv;
}

// Generate complete statistics CSV
async function generateCompleteStatisticsCSV(votersCollection, credentialsCollection, votesCollection) {
  const voters = await votersCollection.find({}).sort({ votedAt: 1 }).toArray();
  const votes = await votesCollection.find({}).toArray();
  const totalCredentials = await credentialsCollection.countDocuments({ isActive: true });
  const votedCredentials = await credentialsCollection.countDocuments({ hasVoted: true, isActive: true });
  
  let csv = 'COMPLETE VOTING STATISTICS REPORT\n';
  csv += `Generated: ${new Date().toLocaleString()}\n\n`;
  
  // Overall Statistics
  csv += 'OVERALL STATISTICS\n';
  csv += 'Metric,Value\n';
  csv += `Total Registered Voters,${totalCredentials}\n`;
  csv += `Total Votes Cast,${voters.length}\n`;
  csv += `Voter Turnout,${totalCredentials > 0 ? ((votedCredentials / totalCredentials) * 100).toFixed(2) : 0}%\n`;
  csv += `Average Votes per Position,${votes.length > 0 ? (voters.length * 3 / Object.keys(groupVotesByPosition(votes)).length).toFixed(2) : 0}\n\n`;
  
  // Vote Results by Position
  csv += 'RESULTS BY POSITION\n';
  csv += 'Position,Candidate,Votes,Percentage,Status\n';
  
  const votesByPosition = groupVotesByPosition(votes);
  Object.keys(votesByPosition).forEach(position => {
    const positionVotes = votesByPosition[position];
    const totalVotes = Object.values(positionVotes).reduce((sum, count) => sum + count, 0);
    
    const sortedCandidates = Object.entries(positionVotes).sort(([,a], [,b]) => b - a);
    
    sortedCandidates.forEach(([candidate, count], index) => {
      const percentage = totalVotes > 0 ? ((count / totalVotes) * 100).toFixed(2) : '0.00';
      const status = index === 0 ? 'WINNER' : 'RUNNER-UP';
      const row = [
        escapeCSV(position),
        escapeCSV(candidate),
        count,
        percentage + '%',
        status
      ].join(',');
      csv += row + '\n';
    });
    csv += '\n';
  });
  
  // Detailed Vote Records
  csv += 'DETAILED VOTE RECORDS\n';
  csv += 'Voter ID,Registration Number,President,Secretary,Treasurer,Vote Time,IP Address\n';
  
  voters.forEach((voter, index) => {
    const row = [
      `VOTER_${String(index + 1).padStart(3, '0')}`,
      escapeCSV(voter.registerNumber),
      escapeCSV(voter.votes?.president || 'N/A'),
      escapeCSV(voter.votes?.secretary || 'N/A'),
      escapeCSV(voter.votes?.treasurer || 'N/A'),
      voter.votedAt ? new Date(voter.votedAt).toLocaleString() : 'N/A',
      escapeCSV(voter.ipAddress || 'N/A')
    ].join(',');
    csv += row + '\n';
  });
  
  // Voting Timeline
  csv += '\nVOTING TIMELINE\n';
  csv += 'Hour,Votes Cast,Cumulative Total\n';
  
  const timeline = generateVotingTimeline(voters);
  let cumulative = 0;
  timeline.forEach(hour => {
    cumulative += hour.count;
    csv += `${hour.hour},${hour.count},${cumulative}\n`;
  });
  
  return csv;
}

// Helper function to group votes by position
function groupVotesByPosition(votes) {
  const grouped = {};
  votes.forEach(vote => {
    if (!grouped[vote.position]) {
      grouped[vote.position] = {};
    }
    grouped[vote.position][vote.candidate] = vote.count || 0;
  });
  return grouped;
}

// Helper function to generate voting timeline
function generateVotingTimeline(voters) {
  const timeline = {};
  
  voters.forEach(voter => {
    if (voter.votedAt) {
      const date = new Date(voter.votedAt);
      const hour = date.getHours();
      const hourKey = `${String(hour).padStart(2, '0')}:00`;
      
      if (!timeline[hourKey]) {
        timeline[hourKey] = 0;
      }
      timeline[hourKey]++;
    }
  });
  
  // Convert to array and sort by hour
  return Object.entries(timeline)
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => a.hour.localeCompare(b.hour));
}

// Helper function to escape CSV values
function escapeCSV(value) {
  if (value === null || value === undefined) {
    return '';
  }
  
  const stringValue = String(value);
  
  // If the value contains a comma, newline, or quote, wrap it in quotes
  if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
    // Escape existing quotes by doubling them
    return '"' + stringValue.replace(/"/g, '""') + '"';
  }
  
  return stringValue;
}