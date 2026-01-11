// Import required packages
require('dotenv').config(); // Loads your .env file secrets
const express = require('express'); // Framework to build the server
const multer = require('multer'); // Handles photo uploads
const fs = require('fs').promises; // File system operations
const path = require('path');
const * as fal from '@fal-ai/serverless-client';

// Configure Fal.ai with your API key
fal.config({
  credentials: process.env.FAL_API_KEY
});

// Create the Express app (your server)
const app = express();
const PORT = process.env.PORT || 3000;

// Configure multer to store uploaded images temporarily
const uploadsDir = path.join(__dirname, 'uploads');
const upload = multer({ 
  dest: uploadsDir,
  limits: { fileSize: 10 * 1024 * 1024 }, // Max 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG and PNG images are allowed'));
    }
  }
});

// Middleware
app.use(express.json());

// CORS Configuration
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

// ============================================
// HELPER FUNCTION: Convert image to base64
// ============================================
async function imageToBase64(filePath) {
  const imageBuffer = await fs.readFile(filePath);
  const base64 = imageBuffer.toString('base64');
  const mimeType = path.extname(filePath) === '.png' ? 'image/png' : 'image/jpeg';
  return `data:${mimeType};base64,${base64}`;
}

// ============================================
// ENDPOINT: Health Check
// ============================================
app.get('/health', (req, res) => {
  res.json({ 
    status: 'Server is running!',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// ENDPOINT: Generate Fitness Transformation
// ============================================
app.post('/generate-fitness-image', upload.single('image'), async (req, res) => {
  console.log('\n📸 Received request to generate fitness image');
  
  try {
    // Step 1: Validate inputs
    const uploadedImage = req.file;
    const description = req.body.description;
    
    if (!uploadedImage) {
      return res.status(400).json({ 
        success: false,
        error: 'No image uploaded. Please upload a photo.' 
      });
    }
    
    if (!description) {
      return res.status(400).json({ 
        success: false,
        error: 'No description provided. Please describe your fitness goal.' 
      });
    }
    
    console.log(`✅ Image received: ${uploadedImage.originalname}`);
    console.log(`✅ Description: ${description}`);
    
    // Step 2: Convert image to base64 data URL
    console.log('🔄 Converting image to base64...');
    const imageDataUrl = await imageToBase64(uploadedImage.path);
    
    // Step 3: Create detailed prompt for transformation
    const transformationPrompt = `Transform this person's physique to match this fitness goal: ${description}. 
Make realistic changes to body composition, muscle definition, and physique. 
Keep the same person's face, skin tone, and identity. 
The result should look natural and photorealistic, like a real fitness transformation photo.`;
    
    console.log('🎨 Sending to Fal.ai for transformation...');
    
    // Step 4: Call Fal.ai API (v0.14.3 syntax)
    // Using fal-ai/flux-pro/v1.1-ultra for high-quality transformations
    const result = await fal.run('fal-ai/flux-pro/v1.1-ultra', {
      input: {
        prompt: transformationPrompt,
        image_url: imageDataUrl,
        num_inference_steps: 28,
        guidance_scale: 3.5,
        num_images: 1,
        enable_safety_checker: true,
        output_format: 'jpeg'
      }
    });
    
    // Step 5: Get the generated image URL
    if (!result || !result.images || result.images.length === 0) {
      throw new Error('No image was generated');
    }
    
    const generatedImageUrl = result.images[0].url;
    
    console.log('✨ Image generated successfully!');
    console.log(`🔗 Image URL: ${generatedImageUrl}`);
    
    // Step 6: Clean up - delete temporary file
    await fs.unlink(uploadedImage.path);
    console.log('🧹 Cleaned up temporary file');
    
    // Step 7: Return success response
    res.json({
      success: true,
      imageUrl: generatedImageUrl,
      message: 'Fitness transformation generated successfully!'
    });
    
  } catch (error) {
    console.error('❌ Error generating image:', error);
    
    // Clean up uploaded file
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting file:', unlinkError);
      }
    }
    
    // Send error response
    res.status(500).json({ 
      success: false,
      error: 'Failed to generate fitness transformation',
      details: error.message
    });
  }
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, async () => {
  console.log('\n🚀 ================================');
  console.log('🚀 FITNESS BACKEND SERVER STARTED');
  console.log('🚀 ================================');
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🚀 Health check: http://localhost:${PORT}/health`);
  console.log(`🚀 Generate endpoint: http://localhost:${PORT}/generate-fitness-image`);
  console.log('🚀 ================================');
  console.log('📝 Using Fal.ai for AI transformations');
  console.log('💡 Press Ctrl+C to stop the server\n');
  
  // Create uploads directory
  try {
    await fs.mkdir(uploadsDir, { recursive: true });
    console.log('✅ Uploads directory ready');
  } catch (err) {
    console.error('Error creating uploads directory:', err);
  }
});