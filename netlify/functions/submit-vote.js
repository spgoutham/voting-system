// .netlify/functions/export-voting-stats.js - CORRECTED VERSION BASED ON YOUR SYSTEM
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

    let csvContent = '';

    switch (exportType) {
      case 'individual':
        csvContent = await generateVoterListCSV(db);
        headers['Content-Disposition'] = 'attachment; filename="voter_list.csv"';
        break;
      
      case 'summary':
        csvContent = await generateCandidateResultsCSV(db);
        headers['Content-Disposition'] = 'attachment; filename="candidate_results.csv"';
        break;
      
      case 'complete':
      default:
        csvContent = await generateCompleteStatisticsCSV(db);
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

// Generate CSV showing who voted (but not their specific choices)
// Your system doesn't store individual vote choices, only aggregated counts
async function generateVoterListCSV(db) {
  console.log('Generating voter list CSV...');
  
  try {
    const credentialsCollection = db.collection('user_credentials');
    const votersCollection = db.collection('voters');
    
    // Get all voters who have voted
    const votedCredentials = await credentialsCollection.find({ 
      hasVoted: true,
      isActive: true 
    }).sort({ votedAt: 1 }).toArray();
    
    console.log(`Found ${votedCredentials.length} voters in credentials`);
    
    let csv = 'Registration Number,Username,Voted At,Vote IP,Status,User Type\n';
    
    if (votedCredentials.length === 0) {
      csv += 'No votes found,N/A,N/A,N/A,N/A,N/A\n';
    } else {
      for (const voter of votedCredentials) {
        // Get additional voting details from voters collection
        const voterDetails = await votersCollection.findOne({ 
          registerNumber: voter.regNumber 
        });
        
        // Determine user type (student vs teacher)
        const userType = voter.username ? 'Teacher' : 'Student';
        
        const row = [
          escapeCSV(voter.regNumber || 'N/A'),
          escapeCSV(voter.username || voter.regNumber || 'N/A'),
          voter.votedAt ? new Date(voter.votedAt).toLocaleString() : 'N/A',
          escapeCSV(voter.lastVoteIP || voterDetails?.ipAddress || 'N/A'),
          'Voted',
          userType
        ].join(',');
        
        csv += row + '\n';
      }
    }
    
    // Add summary section
    csv += '\n\nSUMMARY\n';
    csv += `Total Voters,${votedCredentials.length}\n`;
    csv += `Students Voted,${votedCredentials.filter(v => !v.username).length}\n`;
    csv += `Teachers Voted,${votedCredentials.filter(v => v.username).length}\n`;
    csv += `Export Generated,${new Date().toLocaleString()}\n`;
    
    // Important note about vote privacy
    csv += '\n\nIMPORTANT NOTE\n';
    csv += 'Vote Privacy,"Individual vote choices are not stored in this system for privacy protection"\n';
    csv += 'Available Data,"This export shows WHO voted and WHEN, but not their specific candidate choices"\n';
    csv += 'Vote Results,"See candidate results export for vote counts by candidate"\n';
    
    return csv;
    
  } catch (error) {
    console.error('Error in generateVoterListCSV:', error);
    let csv = 'ERROR,Could not retrieve voter data,N/A,N/A,N/A,N/A\n';
    csv += `Error Message,${error.message},N/A,N/A,N/A,N/A\n`;
    return csv;
  }
}

// Generate CSV for candidate results (this works with your system)
async function generateCandidateResultsCSV(db) {
  try {
    const votesCollection = db.collection('votes');
    const votes = await votesCollection.find({}).toArray();
    
    console.log(`Found ${votes.length} vote records`);
    
    let csv = 'Position,Candidate,Vote Count,Percentage,Status\n';
    
    if (votes.length === 0) {
      csv += 'No votes found,Check if voting has started,0,0%,N/A\n';
      return csv;
    }
    
    // Group votes by position
    const votesByPosition = {};
    votes.forEach(vote => {
      const position = vote.position;
      const candidate = vote.candidate;
      const count = vote.count || 0;
      
      if (!votesByPosition[position]) {
        votesByPosition[position] = {};
      }
      votesByPosition[position][candidate] = count;
    });
    
    // Calculate totals and percentages for each position
    Object.keys(votesByPosition).forEach(position => {
      const positionVotes = votesByPosition[position];
      const totalVotes = Object.values(positionVotes).reduce((sum, count) => sum + count, 0);
      
      // Sort candidates by vote count (descending)
      const sortedCandidates = Object.entries(positionVotes)
        .sort(([,a], [,b]) => b - a);
      
      sortedCandidates.forEach(([candidate, count], index) => {
        const percentage = totalVotes > 0 ? ((count / totalVotes) * 100).toFixed(2) : '0.00';
        const status = index === 0 ? 'WINNER' : `RANK ${index + 1}`;
        
        const row = [
          escapeCSV(position.toUpperCase()),
          escapeCSV(candidate),
          count,
          percentage + '%',
          status
        ].join(',');
        csv += row + '\n';
      });
      
      // Add position total
      csv += `${escapeCSV(position.toUpperCase())},TOTAL VOTES,${totalVotes},100.00%,SUMMARY\n\n`;
    });
    
    // Overall summary
    const totalVotesCast = votes.reduce((sum, vote) => sum + (vote.count || 0), 0);
    const positions = Object.keys(votesByPosition).length;
    
    csv += 'OVERALL SUMMARY\n';
    csv += `Total Votes Cast,${totalVotesCast}\n`;
    csv += `Positions Voted For,${positions}\n`;
    csv += `Average Votes per Position,${positions > 0 ? (totalVotesCast / positions).toFixed(2) : 0}\n`;
    csv += `Export Generated,${new Date().toLocaleString()}\n`;
    
    return csv;
    
  } catch (error) {
    console.error('Error in generateCandidateResultsCSV:', error);
    return `ERROR,${error.message},0,0%,ERROR\n`;
  }
}

// Generate complete statistics CSV
async function generateCompleteStatisticsCSV(db) {
  try {
    const credentialsCollection = db.collection('user_credentials');
    const votersCollection = db.collection('voters');
    const votesCollection = db.collection('votes');
    
    // Get basic statistics
    const totalCredentials = await credentialsCollection.countDocuments({ isActive: true });
    const votedCredentials = await credentialsCollection.countDocuments({ hasVoted: true, isActive: true });
    const studentVoters = await credentialsCollection.countDocuments({ hasVoted: true, isActive: true, username: { $exists: false } });
    const teacherVoters = await credentialsCollection.countDocuments({ hasVoted: true, isActive: true, username: { $exists: true } });
    
    let csv = 'COMPLETE VOTING STATISTICS REPORT\n';
    csv += `Generated: ${new Date().toLocaleString()}\n`;
    csv += `System: Class Election Voting System\n\n`;
    
    // Overall Statistics
    csv += 'OVERALL STATISTICS\n';
    csv += 'Metric,Value,Percentage\n';
    csv += `Total Registered Users,${totalCredentials},100.00%\n`;
    csv += `Total Voters,${votedCredentials},${totalCredentials > 0 ? ((votedCredentials / totalCredentials) * 100).toFixed(2) : 0}%\n`;
    csv += `Student Voters,${studentVoters},${votedCredentials > 0 ? ((studentVoters / votedCredentials) * 100).toFixed(2) : 0}%\n`;
    csv += `Teacher Voters,${teacherVoters},${votedCredentials > 0 ? ((teacherVoters / votedCredentials) * 100).toFixed(2) : 0}%\n`;
    csv += `Pending Voters,${totalCredentials - votedCredentials},${totalCredentials > 0 ? (((totalCredentials - votedCredentials) / totalCredentials) * 100).toFixed(2) : 0}%\n\n`;
    
    // Candidate Results Section
    csv += 'CANDIDATE RESULTS BY POSITION\n';
    const candidateResults = await generateCandidateResultsCSV(db);
    // Extract just the results part (skip the header)
    const candidateLines = candidateResults.split('\n');
    const resultsStart = candidateLines.findIndex(line => line.includes('Position,Candidate')) + 1;
    csv += candidateLines.slice(resultsStart).join('\n');
    csv += '\n';
    
    // Voter List Section
    csv += 'VOTER LIST (WHO VOTED)\n';
    const voterList = await generateVoterListCSV(db);
    // Extract just the voter records (skip the header)
    const voterLines = voterList.split('\n');
    const votersStart = voterLines.findIndex(line => line.includes('Registration Number,Username')) + 1;
    const votersEnd = voterLines.findIndex(line => line.includes('SUMMARY'));
    csv += voterLines.slice(votersStart, votersEnd !== -1 ? votersEnd : undefined).join('\n');
    csv += '\n';
    
    // Voting Timeline
    csv += 'VOTING TIMELINE\n';
    const timeline = await generateVotingTimeline(db);
    csv += 'Time Period,Votes Cast,Cumulative Total\n';
    let cumulative = 0;
    timeline.forEach(period => {
      cumulative += period.count;
      csv += `${period.period},${period.count},${cumulative}\n`;
    });
    csv += '\n';
    
    // System Information
    csv += 'SYSTEM INFORMATION\n';
    csv += 'Aspect,Details\n';
    csv += 'Vote Privacy,"Individual vote choices are not stored for privacy protection"\n';
    csv += 'Data Available,"Voter registration, voting timestamps, candidate vote counts"\n';
    csv += 'Vote Counting,"Aggregated counts by candidate and position"\n';
    csv += 'User Types,"Students (registration numbers) and Teachers (usernames)"\n';
    csv += `Report Generated,${new Date().toLocaleString()}\n`;
    
    return csv;
    
  } catch (error) {
    console.error('Error in generateCompleteStatisticsCSV:', error);
    return `ERROR GENERATING COMPLETE REPORT: ${error.message}\nGenerated: ${new Date().toLocaleString()}\n`;
  }
}

// Generate voting timeline
async function generateVotingTimeline(db) {
  try {
    const credentialsCollection = db.collection('user_credentials');
    const voters = await credentialsCollection.find({ 
      hasVoted: true, 
      votedAt: { $exists: true } 
    }).sort({ votedAt: 1 }).toArray();
    
    const timeline = {};
    
    voters.forEach(voter => {
      if (voter.votedAt) {
        const date = new Date(voter.votedAt);
        const hour = date.getHours();
        const hourKey = `${date.toDateString()} ${String(hour).padStart(2, '0')}:00`;
        
        if (!timeline[hourKey]) {
          timeline[hourKey] = 0;
        }
        timeline[hourKey]++;
      }
    });
    
    // Convert to array and sort by time
    return Object.entries(timeline)
      .map(([period, count]) => ({ period, count }))
      .sort((a, b) => new Date(a.period).getTime() - new Date(b.period).getTime());
      
  } catch (error) {
    console.error('Error generating timeline:', error);
    return [];
  }
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