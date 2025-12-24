// routes/recaptcha.js
import express from "express";
const recaptchaRouter = express.Router();
import axios from "axios";

/**
 * @route POST /api/recaptcha/verify
 * @desc Verify reCAPTCHA token
 * @access Public
 */
recaptchaRouter.post('/', async (req, res) => {
  try {
    // Get the secret key from environment variables
    const secretKey = process.env.RECAPTCHA_SECRET_KEY;
    
    if (!secretKey) {
      console.error("RECAPTCHA_SECRET_KEY is not set in environment variables.");
      return res.status(500).json({ 
        success: false, 
        error: "Server configuration error" 
      });
    }
    
    // Get the token from request body
    const { gRecaptchaToken } = req.body;
    
    if (!gRecaptchaToken) {
      return res.status(400).json({ 
        success: false, 
        error: "reCAPTCHA token is required" 
      });
    }
    
    // Create form data for the POST request
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', gRecaptchaToken);
    
    // Make a POST request to the Google reCAPTCHA verify API
    const response = await axios.post(
      "https://www.google.com/recaptcha/api/siteverify",
      formData.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    
    // Check the response for success and score
    if (response.data.success && response.data.score > 0.5) {
      console.log("reCAPTCHA score:", response.data.score);
      
      // Return success response
      return res.status(200).json({
        success: true,
        score: response.data.score,
      });
    } else {
      // Log failure and return appropriate response
      console.error("reCAPTCHA verification failed:", response.data);
      
      return res.status(403).json({
        success: false,
        error: "reCAPTCHA verification failed",
        details: response.data
      });
    }
  } catch (error) {
    // Handle any exceptions
    console.error("Error during reCAPTCHA verification:", error);
    
    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

export default recaptchaRouter;