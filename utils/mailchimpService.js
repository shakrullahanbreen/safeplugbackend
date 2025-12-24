import mailchimp from '@mailchimp/mailchimp_marketing';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

// Configure Mailchimp
mailchimp.setConfig({
  apiKey: process.env.MAILCHIMP_API_KEY,
  server: process.env.MAILCHIMP_SERVER_PREFIX, // e.g., 'us1'
});

const LIST_ID = process.env.MAILCHIMP_LIST_ID;

/**
 * Add or update a member in Mailchimp
 * @param {Object} userData - User data object
 * @param {string} userData.email - User email
 * @param {string} userData.firstName - User first name
 * @param {string} userData.lastName - User last name
 * @param {string} userData.role - User role/business type
 * @param {string} userData.companyName - Company name
 * @param {string} userData.phone - Phone number
 * @param {string} userData.city - City
 * @param {string} userData.state - State
 * @param {string} userData.postalCode - Postal code
 * @returns {Promise<Object>} Mailchimp response
 */
export const addOrUpdateMember = async (userData) => {
  try {
    const {
      email,
      firstName,
      lastName,
      role,
      companyName,
      phone,
      city,
      state,
      postalCode
    } = userData;

    // Map user role to Mailchimp tags
    const roleTag = mapRoleToTag(role);

    const memberData = {
      email_address: email.toLowerCase(),
      status: 'subscribed',
      merge_fields: {
        FNAME: firstName || '',
        LNAME: lastName || '',
        COMPANY: companyName || '',
        PHONE: phone || '',
        CITY: city || '',
        STATE: state || '',
        ZIP: postalCode || '',
        ROLE: role || ''
      },
      tags: [roleTag]
    };

    // Try to add member, if exists, update instead
    try {
      const response = await mailchimp.lists.addListMember(LIST_ID, memberData);
      console.log('✅ User added to Mailchimp:', email);
      return { success: true, response, action: 'added' };
    } catch (error) {
      if (error.status === 400 && error.title === 'Member Exists') {
        // Member exists, update instead
        const subscriberHash = crypto
          .createHash('md5')
          .update(email.toLowerCase())
          .digest('hex');

        const updateResponse = await mailchimp.lists.updateListMember(
          LIST_ID,
          subscriberHash,
          memberData
        );
        console.log('✅ User updated in Mailchimp:', email);
        return { success: true, response: updateResponse, action: 'updated' };
      }
      throw error;
    }
  } catch (error) {
    console.error('❌ Mailchimp error:', error);
    return { 
      success: false, 
      error: error.message || 'Unknown Mailchimp error',
      details: error
    };
  }
};

/**
 * Update user role in Mailchimp
 * @param {string} email - User email
 * @param {string} newRole - New user role
 * @returns {Promise<Object>} Mailchimp response
 */
export const updateUserRole = async (email, newRole) => {
  try {
    const subscriberHash = crypto
      .createHash('md5')
      .update(email.toLowerCase())
      .digest('hex');

    const roleTag = mapRoleToTag(newRole);

    const memberData = {
      merge_fields: {
        ROLE: newRole
      },
      tags: [roleTag]
    };

    const response = await mailchimp.lists.updateListMember(
      LIST_ID,
      subscriberHash,
      memberData
    );

    console.log('✅ User role updated in Mailchimp:', email, '->', newRole);
    return { success: true, response, action: 'role_updated' };
  } catch (error) {
    console.error('❌ Mailchimp role update error:', error);
    return { 
      success: false, 
      error: error.message || 'Unknown Mailchimp error',
      details: error
    };
  }
};

/**
 * Remove user from Mailchimp
 * @param {string} email - User email
 * @returns {Promise<Object>} Mailchimp response
 */
export const removeMember = async (email) => {
  try {
    const subscriberHash = crypto
      .createHash('md5')
      .update(email.toLowerCase())
      .digest('hex');

    await mailchimp.lists.deleteListMember(LIST_ID, subscriberHash);
    console.log('✅ User removed from Mailchimp:', email);
    return { success: true, action: 'removed' };
  } catch (error) {
    console.error('❌ Mailchimp removal error:', error);
    return { 
      success: false, 
      error: error.message || 'Unknown Mailchimp error',
      details: error
    };
  }
};

/**
 * Map user role to Mailchimp tag
 * @param {string} role - User role
 * @returns {string} Tag name for Mailchimp
 */
const mapRoleToTag = (role) => {
  const roleMap = {
    'Retailer': 'Retailer',
    'Wholesale': 'Wholesale',
    'ChainStore': 'Chain Store',
    'Franchise': 'Franchise',
    'SalesPerson': 'Sales Person',
    'Admin': 'Admin',
    'Potential Customer': 'Potential Customer'
  };
  
  return roleMap[role] || 'Franchise';
};

/**
 * Get member info from Mailchimp
 * @param {string} email - User email
 * @returns {Promise<Object>} Member info or null
 */
export const getMemberInfo = async (email) => {
  try {
    const subscriberHash = crypto
      .createHash('md5')
      .update(email.toLowerCase())
      .digest('hex');

    const response = await mailchimp.lists.getListMember(LIST_ID, subscriberHash);
    return { success: true, member: response };
  } catch (error) {
    if (error.status === 404) {
      return { success: false, error: 'Member not found' };
    }
    console.error('❌ Mailchimp get member error:', error);
    return { 
      success: false, 
      error: error.message || 'Unknown Mailchimp error',
      details: error
    };
  }
};

/**
 * Test Mailchimp connection
 * @returns {Promise<Object>} Connection test result
 */
export const testConnection = async () => {
  try {
    const response = await mailchimp.ping.get();
    console.log('✅ Mailchimp connection successful');
    return { success: true, response };
  } catch (error) {
    console.error('❌ Mailchimp connection failed:', error);
    return { 
      success: false, 
      error: error.message || 'Connection failed',
      details: error
    };
  }
};
