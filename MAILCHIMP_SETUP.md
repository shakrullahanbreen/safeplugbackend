# Mailchimp Integration Setup Guide

This guide explains how to set up and use the Mailchimp integration in the SIFRA application.

## Features

1. **Automatic User Registration**: When a user registers, they are automatically added to your Mailchimp list
2. **Role Updates**: When an admin changes a user's role, the Mailchimp member is updated accordingly
3. **Tag Management**: Users are automatically tagged based on their business type/role

## Setup Instructions

### 1. Get Mailchimp API Credentials

1. Log in to your Mailchimp account
2. Go to Account → Extras → API keys
3. Create a new API key or copy an existing one
4. Note your server prefix (e.g., "us1", "us2", etc.)

### 2. Get Your List ID

1. In Mailchimp, go to Audience → All contacts
2. Click on the list you want to use
3. Go to Settings → Audience name and defaults
4. Copy the "Audience ID" (this is your List ID)

### 3. Set Up Merge Fields (Optional but Recommended)

In your Mailchimp list settings, add these merge fields:
- `FNAME` - First Name
- `LNAME` - Last Name  
- `COMPANY` - Company Name
- `PHONE` - Phone Number
- `CITY` - City
- `STATE` - State
- `ZIP` - Postal Code
- `ROLE` - User Role

### 4. Configure Environment Variables

Create a `.env` file in the `eseekBE` directory with the following variables:

```env
# Mailchimp Configuration
MAILCHIMP_API_KEY=your_mailchimp_api_key_here
MAILCHIMP_SERVER_PREFIX=us1
MAILCHIMP_LIST_ID=your_mailchimp_list_id_here
```

Replace the placeholder values with your actual Mailchimp credentials.

### 5. Test the Integration

1. Start your backend server
2. Make a GET request to `/api/users/test-mailchimp` (requires admin authentication)
3. Check the response to ensure the connection is working

## How It Works

### User Registration Flow

1. User fills out registration form
2. User is created in the database
3. User is automatically added to Mailchimp with:
   - Email address
   - First and last name
   - Company information
   - Contact details
   - Role-based tag

### Admin Role Update Flow

1. Admin changes user role in the dashboard
2. Database is updated with new role
3. Mailchimp member is updated with:
   - New role in merge fields
   - Updated tag based on new role

## User Role Tags

The system automatically assigns tags based on user roles:
- `Retailer` → "Retailer" tag
- `Wholesale` → "Wholesale" tag  
- `ChainStore` → "Chain Store" tag
- `Franchise` → "Franchise" tag
- `Admin` → "Admin" tag

## Error Handling

- If Mailchimp integration fails during registration, the user registration still succeeds
- If Mailchimp integration fails during role update, the role update still succeeds
- All errors are logged to the console for debugging

## API Endpoints

### Test Mailchimp Connection
- **GET** `/api/users/test-mailchimp`
- **Auth**: Admin required
- **Description**: Tests the Mailchimp API connection

## Troubleshooting

### Common Issues

1. **"Invalid API Key" Error**
   - Verify your API key is correct
   - Ensure the API key is active in Mailchimp

2. **"List Not Found" Error**
   - Verify your List ID is correct
   - Ensure the list exists in your Mailchimp account

3. **"Server Prefix Invalid" Error**
   - Check your server prefix (usually "us1", "us2", etc.)
   - Find this in your Mailchimp API key settings

4. **Merge Field Errors**
   - Ensure all required merge fields exist in your Mailchimp list
   - Check field names match exactly (case-sensitive)

### Debug Mode

Enable debug logging by checking the console output when:
- Users register
- Admin updates user roles
- Testing the connection

## Security Notes

- Never commit your `.env` file to version control
- Use environment variables for all sensitive data
- Regularly rotate your Mailchimp API keys
- Monitor API usage in your Mailchimp account

## Support

For issues with this integration, check:
1. Console logs for error messages
2. Mailchimp API documentation
3. Your Mailchimp account settings
4. Environment variable configuration
