import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { BRAND_NAME, BRAND_PRIMARY_HEX, SUPPORT_EMAIL as BRAND_SUPPORT_EMAIL, BASE_URL as BRAND_BASE_URL } from './constants.js';
dotenv.config();

// ESM-safe __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Brand config centralized in utils/constants.js

// Create transporter function to ensure we always use current env variables
const createTransporter = () => {
    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_PASS;

    console.log("gmailUser:___________:",gmailUser)
    
    if (!gmailUser || !gmailPass) {
        throw new Error('GMAIL_USER and GMAIL_PASS must be set in environment variables');
    }
    
    return nodemailer.createTransport({
        service: 'Gmail', // Use the email service you prefer
        auth: {
            user: gmailUser,
            pass: gmailPass
        },
        secure: false,
        port: 465,
        tls: {
            rejectUnauthorized: false
        }
    });
};

// Cached transporter with env var tracking
let transporter = null;
let cachedGmailUser = null;

// Get or create transporter, recreating if env vars changed
const getTransporter = () => {
    const currentGmailUser = process.env.GMAIL_USER;
    
    // Recreate transporter if env vars changed or if it doesn't exist
    if (!transporter || cachedGmailUser !== currentGmailUser) {
        if (cachedGmailUser !== currentGmailUser && cachedGmailUser) {
            console.log('📧 GMAIL_USER changed from', cachedGmailUser, 'to', currentGmailUser, '- recreating transporter');
        }
        transporter = createTransporter();
        cachedGmailUser = currentGmailUser;
    }
    
    return transporter;
};



// Build a consistent, branded email HTML wrapper
export const buildEmailTemplate = ({ subject, preheader = '', title, subtitle = '', contentHtml = '', recipientName = '' }) => {
    const safeSubject = subject || '';
    const safeTitle = title || safeSubject || BRAND_NAME;
    const safePreheader = preheader || '';
    const headerAccent = BRAND_PRIMARY_HEX;
    const year = new Date().getFullYear();

    return `
<!doctype html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeSubject}</title>
    <style>
      /* Clients strip head styles; keep critical inline, but some modern clients keep these */
      .hover-underline:hover { text-decoration: underline !important; }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f6f8fb;color:#2B3445;">
    <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden">${safePreheader}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f8fb;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:640px;max-width:100%;background:#ffffff;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,0.06);overflow:hidden;">
            <tr>
              <td style="padding:20px 24px;background:${headerAccent};">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="left" style="vertical-align:middle;">
                      <a href="${BRAND_BASE_URL}" style="text-decoration:none;display:inline-block">
                        <img src="cid:brand-logo" alt="${BRAND_NAME} Logo" height="36" style="display:block;height:36px;width:auto;border:0;outline:none;text-decoration:none" />
                      </a>
                    </td>
                    <td align="right" style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14px;">
                      ${BRAND_NAME}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 24px 8px 24px;border-bottom:1px solid #E3E9EF;">
                <div style="font-family:Arial,Helvetica,sans-serif;color:#7D879C;font-size:12px;letter-spacing:.3px;text-transform:uppercase;">${safeSubject}</div>
                <h1 style="margin:6px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:28px;color:#2B3445;">${safeTitle}</h1>
                ${subtitle ? `<div style="margin-top:6px;color:#4B566B;font-family:Arial,Helvetica,sans-serif;font-size:14px;">${subtitle}</div>` : ''}
                ${recipientName ? `<div style="margin-top:12px;color:#4B566B;font-family:Arial,Helvetica,sans-serif;font-size:14px;">Hi ${recipientName},</div>` : ''}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px 24px 24px;">
                <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:#373F50;">
                  ${contentHtml}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 24px 24px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F3F5F9;border:1px solid #E3E9EF;border-radius:8px;">
                  <tr>
                    <td style="padding:16px 20px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#4B566B;">
                      <div style="margin:0 0 6px 0;color:#373F50;">Best regards,</div>
                      <div style="margin:0 0 2px 0;font-weight:bold;color:#2B3445;">${BRAND_NAME} Team</div>
                      ${BRAND_SUPPORT_EMAIL ? `<div><a class="hover-underline" href="mailto:${BRAND_SUPPORT_EMAIL}" style="color:${headerAccent};text-decoration:none;">${BRAND_SUPPORT_EMAIL}</a></div>` : ''}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px 24px 24px;border-top:1px solid #E3E9EF;background:#ffffff;">
                <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:16px;color:#7D879C;">
                  <div style="margin-bottom:6px;">
                    © ${year} ${BRAND_NAME}. All rights reserved.
                  </div>
            
                  <div>
                    <a href="${BRAND_BASE_URL}" style="color:${headerAccent};text-decoration:none">Visit ${BRAND_NAME}</a>
                  </div>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
 </html>`;
};

export const sendMail = async ({ to, subject, html, attachments = [] }) => {
    try {
        // Get transporter (will recreate if env vars changed)
        const currentTransporter = getTransporter();
        const gmailUser = process.env.GMAIL_USER;
        
        console.log('📧 Sending email from:', gmailUser);
        console.log('📧 Sending email to:', to);

        const logoPath = path.resolve(__dirname, 'logo3.jpeg');
        const finalAttachments = [
            { filename: 'logo3.jpeg', path: logoPath, cid: 'brand-logo' },
            ...attachments
        ];

        const info = await currentTransporter.sendMail({
            from: gmailUser,
            to,
            subject,
            html,
            attachments: finalAttachments,
        });

        console.log('✅ Email sent successfully from:', gmailUser);
        console.log('✅ Email response:', info.response);
        return info;
    } catch (error) {
        console.error('❌ Error sending email:', error);
        console.error('❌ Current GMAIL_USER:', process.env.GMAIL_USER);
        throw error;
    }
};

export const registrationWelcomeEmail = async (to, username) => {
    const subject = `🎉 Welcome to ${BRAND_NAME}!`;
    const contentHtml = `
      <p>Welcome to <strong>${BRAND_NAME}</strong>! 🎉</p>
      <p>We’re excited to have you on board. Get ready to explore and make the most out of our platform.</p>
      <p>Your account will be activated shortly, and you will receive a confirmation email soon.</p>
    `;
    const html = buildEmailTemplate({ subject, title: 'Welcome!', recipientName: username, contentHtml });
    return await sendMail({ to, subject, html });
};


export const orderCreateEmailToAdmin = async (offerDetails) => {
  const {
    userName,
    userEmail,
    productName,
    price,
    createdAt,
  } = offerDetails;

  const to = process.env.ADMIN_EMAIL;
  const subject = '📥 New Incoming Offer Received';

  const contentHtml = `
      <p style="margin:0 0 10px 0;"><strong>From:</strong> ${userName} (${userEmail})</p>
      <p style="margin:0 0 6px 0;"><strong>Product:</strong> ${productName}</p>
      <p style="margin:0 0 6px 0;"><strong>Offered Price:</strong> $${price}</p>
      <p style="margin:0 0 12px 0;"><strong>Submitted At:</strong> ${new Date(createdAt).toLocaleString()}</p>
      <p style="margin:12px 0 0 0;">Please review this offer in your admin dashboard.</p>
  `;
  const html = buildEmailTemplate({ subject, title: 'New Offer Alert', contentHtml, subtitle: `${BRAND_NAME} Admin Notification` });

  return await sendMail({ to, subject, html });
};

export const newUserRegistrationEmailToAdmin = async (userDetails) => {
  const {
    firstName,
    lastName,
    email,
    phone,
    companyName,
    businessType,
    city,
    state,
    postalCode,
    addressLine1,
    addressLine2,
    createdAt,
  } = userDetails;

  const to = process.env.ADMIN_EMAIL;
  const subject = '👤 New User Registration - Approval Required';

  const contentHtml = `
      <div style="background:#F8F9FA;border:1px solid #E3E9EF;border-radius:8px;padding:16px;margin-bottom:16px;">
        <h3 style="margin:0 0 12px 0;color:#2B3445;font-size:16px;">User Information</h3>
        <p style="margin:0 0 8px 0;"><strong>Name:</strong> ${firstName} ${lastName}</p>
        <p style="margin:0 0 8px 0;"><strong>Email:</strong> ${email}</p>
        <p style="margin:0 0 8px 0;"><strong>Phone:</strong> ${phone}</p>
        <p style="margin:0 0 8px 0;"><strong>Company:</strong> ${companyName}</p>
        <p style="margin:0 0 8px 0;"><strong>Business Type:</strong> ${businessType}</p>
      </div>
      
      <div style="background:#F8F9FA;border:1px solid #E3E9EF;border-radius:8px;padding:16px;margin-bottom:16px;">
        <h3 style="margin:0 0 12px 0;color:#2B3445;font-size:16px;">Address Information</h3>
        <p style="margin:0 0 6px 0;">${addressLine1}</p>
        ${addressLine2 ? `<p style="margin:0 0 6px 0;">${addressLine2}</p>` : ''}
        <p style="margin:0 0 6px 0;">${city}, ${state} ${postalCode}</p>
      </div>
      
      <p style="margin:0 0 8px 0;"><strong>Registration Date:</strong> ${new Date(createdAt).toLocaleString()}</p>
      <p style="margin:12px 0 0 0;color:#E74C3C;font-weight:bold;">⚠️ This user requires admin approval before they can access the platform.</p>
      <p style="margin:8px 0 0 0;">Please review the user details and approve/reject their registration in your admin dashboard.</p>
  `;
  const html = buildEmailTemplate({ subject, title: 'New User Registration', contentHtml, subtitle: `${BRAND_NAME} Admin Notification` });

  return await sendMail({ to, subject, html });
};
