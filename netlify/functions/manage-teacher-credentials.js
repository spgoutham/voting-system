// netlify/functions/manage-teacher-credentials.js
const { MongoClient } = require('mongodb');

const MONGODB_URI = 'mongodb+srv://gou8sarav:r4MvYsciylNFHtt9@voting.bg9nvss.mongodb.net/?retryWrites=true&w=majority&appName=voting';
const DB_NAME = 'voting_system';

// CORS headers
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};

// Generate random password
function generatePassword(length = 8) {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const symbols = '!@#$%&*';
  
  const allChars = uppercase + lowercase + numbers + symbols;
  let password = '';
  
  // Ensure at least one character from each category
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];
  
  // Fill the rest randomly
  for (let i = 4; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  // Shuffle the password
  return password.split('').sort(() => 0.5 - Math.random()).join('');
}

// Validate username
function validateUsername(username) {
  if (!username || username.trim().length === 0) {
    return { isValid: false, message: 'Username is required' };
  }
  
  const trimmedUsername = username.trim();
  
  if (trimmedUsername.length < 3) {
    return { isValid: false, message: 'Username must be at least 3 characters long' };
  }
  
  if (trimmedUsername.length > 50) {
    return { isValid: false, message: 'Username must be less than 50 characters' };
  }
  
  // Allow letters, numbers, dots, underscores, and hyphens
  const usernameRegex = /^[a-zA-Z0-9._-]+$/;
  if (!usernameRegex.test(trimmedUsername)) {
    return { isValid: false, message: 'Username can only contain letters, numbers, dots, underscores, and hyphens' };
  }
  
  return { isValid: true, username: trimmedUsername };
}

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  if (event.httpMethod === 'POST') {
    return await handleCreateTeacherCredential(event);
  } else if (event.httpMethod === 'GET') {
    return await handleGetTeacherCredentials(event);
  } else {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, message: 'Method not allowed' })
    };
  }
};

async function handleCreateTeacherCredential(event) {
  let client;
  
  try {
    const requestBody = JSON.parse(event.body);
    const { username, action } = requestBody;

    if (action === 'delete') {
      return await deleteTeacherCredential(username);
    }

    // Validate username
    const validation = validateUsername(username);
    if (!validation.isValid) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false, 
          message: validation.message 
        })
      };
    }

    const validUsername = validation.username;

    // Connect to MongoDB
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    
    const db = client.db(DB_NAME);
    const credentialsCollection = db.collection('user_credentials');

    // Check if username already exists
    const existingCredential = await credentialsCollection.findOne({
      $or: [
        { username: validUsername },
        { regNumber: validUsername }
      ]
    });

    if (existingCredential) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({ 
          success: false, 
          message: 'Username already exists' 
        })
      };
    }

    // Generate password
    const generatedPassword = generatePassword(10);

    // Create teacher credential
    const teacherCredential = {
      username: validUsername,
      password: generatedPassword,
      userType: 'Teacher',
      isActive: true,
      hasVoted: false,
      votedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'admin'
    };

    // Insert into database
    const result = await credentialsCollection.insertOne(teacherCredential);

    if (result.acknowledged) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Teacher credential created successfully',
          data: {
            username: validUsername,
            password: generatedPassword,
            userType: 'Teacher'
          }
        })
      };
    } else {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          success: false, 
          message: 'Failed to create teacher credential' 
        })
      };
    }

  } catch (error) {
    console.error('Error creating teacher credential:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        success: false, 
        message: 'Internal server error' 
      })
    };
  } finally {
    if (client) {
      await client.close();
    }
  }
}

async function deleteTeacherCredential(username) {
  let client;
  
  try {
    if (!username) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false, 
          message: 'Username is required' 
        })
      };
    }

    // Connect to MongoDB
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    
    const db = client.db(DB_NAME);
    const credentialsCollection = db.collection('user_credentials');

    // Delete the teacher credential
    const result = await credentialsCollection.deleteOne({
      username: username,
      userType: 'Teacher'
    });

    if (result.deletedCount > 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Teacher credential deleted successfully'
        })
      };
    } else {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ 
          success: false, 
          message: 'Teacher credential not found' 
        })
      };
    }

  } catch (error) {
    console.error('Error deleting teacher credential:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        success: false, 
        message: 'Internal server error' 
      })
    };
  } finally {
    if (client) {
      await client.close();
    }
  }
}

async function handleGetTeacherCredentials(event) {
  let client;
  
  try {
    // Connect to MongoDB
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    
    const db = client.db(DB_NAME);
    const credentialsCollection = db.collection('user_credentials');

    // Get all teacher credentials
    const teacherCredentials = await credentialsCollection.find({
      userType: 'Teacher'
    }).sort({ username: 1 }).toArray();

    // Format for response
    const formattedCredentials = teacherCredentials.map(cred => ({
      username: cred.username,
      password: cred.password,
      isActive: cred.isActive,
      hasVoted: cred.hasVoted,
      votedAt: cred.votedAt,
      createdAt: cred.createdAt
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        teacherCredentials: formattedCredentials,
        count: formattedCredentials.length
      })
    };

  } catch (error) {
    console.error('Error getting teacher credentials:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        success: false, 
        message: 'Internal server error',
        teacherCredentials: [],
        count: 0
      })
    };
  } finally {
    if (client) {
      await client.close();
    }
  }
}
