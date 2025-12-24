import NotifyRequest from "../models/notifyRequestModel.js";
import Product from "../models/productModel.js";
import User from "../models/userModel.js";
import { sendResponse } from "../utils/helper.js";
import { HTTP_STATUS_200, HTTP_STATUS_400, HTTP_STATUS_404, HTTP_STATUS_500 } from "../utils/constants.js";
import { sendMail, buildEmailTemplate } from "../utils/mailer.js";
import { addOrUpdateMember } from "../utils/mailchimpService.js";

export const subscribeRestock = async (req, res) => {
  try {
    const { productId, email } = req.body;

    if (!productId || !email) {
      return sendResponse(res, HTTP_STATUS_400, "productId and email are required");
    }

    const product = await Product.findById(productId);
    if (!product) {
      return sendResponse(res, HTTP_STATUS_404, "Product not found");
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if this is a new email (not registered in our database)
    const existingUser = await User.findOne({ email: normalizedEmail });
    const isNewEmail = !existingUser;

    // Subscribe to restock notification
    await NotifyRequest.updateOne(
      { product: product._id, email: normalizedEmail },
      { $setOnInsert: { notified: false } },
      { upsert: true }
    );

    // If it's a new email, add to Mailchimp as a potential customer
    if (isNewEmail) {
      try {
        const mailchimpData = {
          email: normalizedEmail,
          firstName: '', // We don't have this info from notify me
          lastName: '', // We don't have this info from notify me
          role: 'Potential Customer', // Tag as potential customer
          companyName: '',
          phone: '',
          city: '',
          state: '',
          postalCode: ''
        };
        
        const mailchimpResult = await addOrUpdateMember(mailchimpData);
        if (mailchimpResult.success) {
          console.log('✅ New email added to Mailchimp via notify me:', normalizedEmail);
        } else {
          console.error('❌ Failed to add new email to Mailchimp via notify me:', mailchimpResult.error);
          // Don't fail the notification subscription if Mailchimp fails
        }
      } catch (mailchimpError) {
        console.error('❌ Mailchimp integration error in notify me:', mailchimpError);
        // Don't fail the notification subscription if Mailchimp fails
      }
    }

    return sendResponse(res, HTTP_STATUS_200, "Subscribed for restock notification");
  } catch (err) {
    console.error("Error subscribing to restock notification:", err);
    return sendResponse(res, HTTP_STATUS_500, "Internal Server Error");
  }
};

export const triggerRestockEmails = async (productId) => {
  try {
    const product = await Product.findById(productId);
    if (!product) return;

    const pending = await NotifyRequest.find({ product: product._id, notified: false });
    if (!pending.length) return;

    const emailSends = pending.map(async (reqDoc) => {
      const subject = `Back in stock: ${product.name}`;
      const html = buildEmailTemplate({
        subject,
        title: `${product.name} is back in stock!`,
        contentHtml: `
          <p>Good news! The product you were waiting for is available again.</p>
          <p><a href="${process.env.FRONTEND_BASE_URL || "https://"}" target="_blank" style="display:inline-block;background:#D23F57;color:#fff;padding:10px 14px;border-radius:6px;text-decoration:none">Shop now</a></p>
        `,
      });
      try {
        await sendMail({ to: reqDoc.email, subject, html });
        reqDoc.notified = true;
        await reqDoc.save();
      } catch (e) {
        console.error("Failed to send restock email to", reqDoc.email, e);
      }
    });

    await Promise.all(emailSends);
  } catch (err) {
    console.error("Error triggering restock emails:", err);
  }
};

export const sendContactForm = async (req, res) => {
  try {
    const { name, email, phone, message } = req.body;

    // Validate required fields
    if (!name || !email || !message) {
      return sendResponse(res, HTTP_STATUS_400, "Name, email, and message are required");
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return sendResponse(res, HTTP_STATUS_400, "Please provide a valid email address");
    }

    // Send email to admin
    const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
    const subject = "📧 New Contact Form Submission";
    
    const html = buildEmailTemplate({
      subject,
      title: "New Contact Form Submission",
      subtitle: "Customer Inquiry",
      contentHtml: `
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #333; margin-top: 0;">Contact Details</h3>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
          <p><strong>Message:</strong></p>
          <div style="background: white; padding: 15px; border-radius: 4px; border-left: 4px solid #D23F57;">
            ${message.replace(/\n/g, '<br>')}
          </div>
        </div>
        <p style="color: #666; font-size: 14px;">
          <strong>Submitted:</strong> ${new Date().toLocaleString()}
        </p>
        <p style="margin-top: 20px;">
          <a href="mailto:${email}" style="display:inline-block;background:#D23F57;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">
            Reply to Customer
          </a>
        </p>
      `,
    });

    await sendMail({
      to: adminEmail,
      subject,
      html,
    });

    // Send confirmation email to customer
    const customerSubject = "✅ Thank you for contacting us!";
    const customerHtml = buildEmailTemplate({
      subject: customerSubject,
      title: "Thank you for your message!",
      recipientName: name,
      contentHtml: `
        <p>We have received your message and will get back to you as soon as possible.</p>
        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #333;">Your Message:</h4>
          <p style="margin: 0;">${message.replace(/\n/g, '<br>')}</p>
        </div>
        <p>If you have any urgent questions, please don't hesitate to call us or visit our store.</p>
 
      `,
    });

    await sendMail({
      to: email,
      subject: customerSubject,
      html: customerHtml,
    });

    return sendResponse(res, HTTP_STATUS_200, "Message sent successfully! We'll get back to you soon.");
  } catch (err) {
    console.error("Error sending contact form:", err);
    return sendResponse(res, HTTP_STATUS_500, "Failed to send message. Please try again later.");
  }
};


