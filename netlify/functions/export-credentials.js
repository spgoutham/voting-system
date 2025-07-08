// netlify/functions/export-credentials.js
const { MongoClient } = require('mongodb');

const MONGODB_URI = 'mongodb+srv://gou8sarav:r4MvYsciylNFHtt9@voting.bg9nvss.mongodb.net/?retryWrites=true&w=majority&appName=voting';
const DB_NAME = 'voting_system';

// CORS headers for CSV download
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'text/csv'
};

const jsonHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
};

// Helper function to escape CSV fields
function escapeCSVField(field) {
  if (field === null || field === undefined) {
    return '';
  }
  
  const stringField = String(field);
  
  // If field contains comma, quote, or newline, wrap in quotes and escape internal quotes
  if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
    return `"${stringField.replace(/"/g, '""')}"`;
  }
  
  return stringField;
}

// Helper function to format date for CSV
function formatDateForCSV(date) {
  if (!date) return '';
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: jsonHeaders,
      body: ''
    };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: jsonHeaders,
      body: JSON.stringify({ success: false, message: 'Method not allowed' })
    };
  }

  // Get export type from query parameters
  const exportType = event.queryStringParameters?.type || 'full';
  
  let client;
  
  try {
    // Connect to MongoDB
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    
    const db = client.db(DB_NAME);
    const credentialsCollection = db.collection('user_credentials');

    // Get all credentials sorted by registration number/username
    const allCredentials = await credentialsCollection.find({})
      .sort({ regNumber: 1, username: 1 })
      .toArray();

    if (allCredentials.length === 0) {
      return {
        statusCode: 404,
        headers: jsonHeaders,
        body: JSON.stringify({ 
          success: false, 
          message: 'No credentials found to export' 
        })
      };
    }

    let csvContent;
    let filename;

    if (exportType === 'simple') {
      // Simple export: just username/registration and password
      const csvHeader = 'Username/Registration,Password';
      
      const csvRows = allCredentials.map(cred => {
        const username = escapeCSVField(cred.username || cred.regNumber);
        const password = escapeCSVField(cred.password);
        return `${username},${password}`;
      });

      csvContent = [csvHeader, ...csvRows].join('\n');
      filename = 'login_credentials';
      
    } else {
      // Full export: all data
      const csvHeader = 'Username/Registration,Password,Type,Status,Voted,Voted At,Created At,Last Updated';
      
      const csvRows = allCredentials.map(cred => {
        const username = escapeCSVField(cred.username || cred.regNumber);
        const password = escapeCSVField(cred.password);
        const type = escapeCSVField(cred.userType || 'Student');
        const status = escapeCSVField(cred.isActive ? 'Active' : 'Inactive');
        const hasVoted = escapeCSVField(cred.hasVoted ? 'Yes' : 'No');
        const votedAt = escapeCSVField(formatDateForCSV(cred.votedAt));
        const createdAt = escapeCSVField(formatDateForCSV(cred.createdAt));
        const updatedAt = escapeCSVField(formatDateForCSV(cred.updatedAt || cred.createdAt));
        
        return `${username},${password},${type},${status},${hasVoted},${votedAt},${createdAt},${updatedAt}`;
      });

      csvContent = [csvHeader, ...csvRows].join('\n');
      filename = 'full_credentials_data';
    }

    // Add BOM for proper Excel UTF-8 support
    const csvWithBOM = '\uFEFF' + csvContent;

    // Set appropriate filename in header
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    const finalFilename = `${filename}_${dateStr}_${timeStr}.csv`;

    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Disposition': `attachment; filename="${finalFilename}"`
      },
      body: csvWithBOM
    };

  } catch (error) {
    console.error('Error exporting credentials:', error);
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({ 
        success: false, 
        message: 'Internal server error while exporting credentials' 
      })
    };
  } finally {
    if (client) {
      await client.close();
    }
  }
};
