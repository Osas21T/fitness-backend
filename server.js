// Import required packages
// Think of these as tools you're bringing into your workshop
require('dotenv').config(); // Loads your .env file secrets
const express = require('express'); // Framework to build the server
const axios = require('axios'); // Tool to talk to OpenAI
const multer = require('multer'); // Handles photo uploads
const FormData = require('form-data'); // Formats data for OpenAI
const fs = require('fs').promises; // File system operations

// Create the Express app (your server)
const app = express();
const PORT = process.env.PORT || 3000; // Server will run on port 3000

// Configure multer to store uploaded images temporarily
// This is like having a temporary holding area for incoming photos
const upload = multer({ 
  dest: 'uploads/', // Photos go to an 'uploads' folder
  limits: { fileSize: 10 * 1024 * 1024 } // Max 10MB per image
});

// Middleware - these run on every request
app.use(express.json()); // Allows server to understand JSON data

// FIXED CORS CONFIGURATION - This allows your app to connect to the backend
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    console.log('✅ CORS preflight request handled');
    return res.sendStatus(200);
  }
  
  next();
});

// ============================================
// ENDPOINT: Generate Fitness Transformation
// ============================================
// This is where your mobile app will send requests
app.post('/generate-fitness-image', upload.single('image'), async (req, res) => {
  console.log('📸 Received request to generate fitness image');
  
  try {
    // Step 1: Get the uploaded image and description
    const uploadedImage = req.file; // The user's photo
    const description = req.body.description; // The fitness goal description
    
    // Validation: Make sure we received both image and description
    if (!uploadedImage) {
      return res.status(400).json({ 
        error: 'No image uploaded. Please upload a photo.' 
      });
    }
    
    if (!description) {
      return res.status(400).json({ 
        error: 'No description provided. Please describe your fitness goal.' 
      });
    }
    
    console.log('✅ Image received:', uploadedImage.originalname);
    console.log('✅ Description:', description);
    
    // Step 2: Prepare the prompt for OpenAI
    // We'll create a detailed prompt that combines the user's description
    const fullPrompt = `Transform this person's physique based on this fitness goal: ${description}. 
Create a realistic, natural-looking transformation showing them with this physique. 
Maintain their facial features, skin tone, and overall appearance but modify their body composition, 
muscle definition, and physique as described. The result should look like a real photograph, 
not artificial or overly edited. Keep the same pose, background, and clothing style.`;
    
    console.log('🎨 Sending to OpenAI for generation...');
    
    // Step 3: Create form data for OpenAI API
    const formData = new FormData();
    
    // Read the uploaded image file
    const imageBuffer = await fs.readFile(uploadedImage.path);
    
    // Add the image to form data
    formData.append('image', imageBuffer, {
      filename: uploadedImage.originalname,
      contentType: uploadedImage.mimetype
    });
    
    // Add other required parameters
    formData.append('prompt', fullPrompt);
    formData.append('n', '1'); // Generate 1 image
    formData.append('size', '1024x1024'); // Image size
    formData.append('response_format', 'url'); // Get back a URL to the image
    
    // Step 4: Send request to OpenAI
    const openAIResponse = await axios.post(
      'https://api.openai.com/v1/images/edits', // OpenAI's image edit endpoint
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` // Your secret API key
        },
        maxBodyLength: Infinity, // Allow large files
        timeout: 120000 // Wait up to 2 minutes for response
      }
    );
    
    // Step 5: Get the generated image URL from OpenAI's response
    const generatedImageUrl = openAIResponse.data.data[0].url;
    
    console.log('✨ Image generated successfully!');
    console.log('🔗 Image URL:', generatedImageUrl);
    
    // Step 6: Clean up - delete the temporarily uploaded file
    await fs.unlink(uploadedImage.path);
    console.log('🧹 Cleaned up temporary file');
    
    // Step 7: Send the result back to your mobile app
    res.json({
      success: true,
      imageUrl: generatedImageUrl,
      message: 'Fitness transformation generated successfully!'
    });
    
  } catch (error) {
    console.error('❌ Error generating image:', error.message);
    
    // Clean up uploaded file even if there was an error
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting file:', unlinkError);
      }
    }
    
    // Detailed error messages for debugging
    if (error.response) {
      // OpenAI returned an error
      console.error('OpenAI Error:', error.response.data);
      res.status(500).json({ 
        error: 'OpenAI API error',
        details: error.response.data 
      });
    } else if (error.code === 'ECONNABORTED') {
      // Request timed out
      res.status(504).json({ 
        error: 'Request timed out. Please try again.' 
      });
    } else {
      // Other errors
      res.status(500).json({ 
        error: 'Failed to generate image',
        details: error.message 
      });
    }
  }
});

// ============================================
// HEALTH CHECK ENDPOINT
// ============================================
// Simple endpoint to check if server is running
app.get('/health', (req, res) => {
  res.json({ 
    status: 'Server is running!',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// START THE SERVER
// ============================================
app.listen(PORT, () => {
  console.log('');
  console.log('🚀 ================================');
  console.log('🚀 FITNESS BACKEND SERVER STARTED');
  console.log('🚀 ================================');
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🚀 Health check: http://localhost:${PORT}/health`);
  console.log(`🚀 Generate endpoint: http://localhost:${PORT}/generate-fitness-image`);
  console.log('🚀 ================================');
  console.log('');
  console.log('📝 To test: Upload an image to /generate-fitness-image');
  console.log('💡 Press Ctrl+C to stop the server');
  console.log('');
});

// Create uploads directory if it doesn't exist
const uploadsDir = './uploads';
fs.mkdir(uploadsDir, { recursive: true })
  .then(() => console.log('✅ Uploads directory ready'))
  .catch(err => console.error('Error creating uploads directory:', err));