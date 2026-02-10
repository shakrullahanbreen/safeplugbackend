import User from "../models/userModel.js";
import { HTTP_STATUS_200, HTTP_STATUS_201, HTTP_STATUS_400, HTTP_STATUS_401, HTTP_STATUS_404, HTTP_STATUS_500, USERTYPE, USERTYPES } from "../utils/constants.js";
import { sendResponse } from "../utils/helper.js";
import { registrationWelcomeEmail, sendMail, buildEmailTemplate, newUserRegistrationEmailToAdmin } from "../utils/mailer.js";
import { addOrUpdateMember, updateUserRole as updateMailchimpRole, testConnection } from "../utils/mailchimpService.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { stripe } from '../lib/stripe.js';


export const register = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      password,
      re_password,
      phone,
      companyName,
      postalCode,
      addressLine1,
      addressLine2,
      city,
      state,
      businessType,
      businessLicenseUrl,
      agreeTermsAndConditions,
      file,
      gRecaptchaToken,
    } = req.body;

    let error = null;

    // Field validations (one-by-one style)
    if (!firstName) error = "First name is required";
    if (!email) error = "Email is required";
    if (!password) error = "Password is required";
    if (!re_password) error = "Password confirmation is required";
    if (password && re_password && password !== re_password) error = "Passwords do not match";
    if (agreeTermsAndConditions !== true) error = "You must accept the terms and conditions";
    if (!companyName) error = "Company name is required";
    if (!phone) error = "Phone number is required";
    if (!postalCode) error = "Postal code is required";
    if (!addressLine1) error = "Address Line 1 is required";
    // if (!addressLine2) error = "Address Line 2 is required";
    if (!city) error = "City is required";
    if (!state) error = "State is required";
    if (!businessType) error = "Business type is required";
    if (!businessType || !USERTYPES.includes(businessType)) {
      error = "Invalid business type";
    }
    if (!file || file.length === 0) {
      error = "At least one file is required"; // Assuming file is an array of URLs
    }
    // if (!businessLicenseUrl) error = "Business license URL is required";

    // Optional: reCAPTCHA validation
    if (!gRecaptchaToken) error = "reCAPTCHA verification is required";

    // Password strength
    if (password && password.length < 6) {
      error = "Password must be at least 6 characters long";
    }

    // Email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email && !emailRegex.test(email)) {
      error = "Invalid email format";
    }

    // Early return if any error found
    if (error !== null) {
      return sendResponse(res, HTTP_STATUS_400, error);
    }

    // Check for existing user
    const existingEmail = await User.findOne({ email: email.toLowerCase() });
    const existingPhone = await User.findOne({ phone });

    if (existingPhone) error = "Phone number is already registered";
    if (existingEmail) error = "Email is already registered";

    if (error) {
      return sendResponse(res, HTTP_STATUS_401, error);
    }

    // Create Stripe customer
    const customer = await stripe.customers.create({
      name: `${firstName} ${lastName}`,
      email: email.toLowerCase(),
    });

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    // console.log("test",  {firstName,
    //       lastName,
    //       email,
    //       password: hashedPassword,
    //       phone,
    //       companyName,
    //       postalCode,
    //       addressLine1,
    //       addressLine2,
    //       city,
    //       state,
    //       businessType,
    //       role: businessType,
    //       businessLicenseUrl:"",
    //       agreeTermsAndConditions,
    //       stripeCustomerId: customer.id,
    //       // file: file || [], // Handle file array
    //       file:[],
    //       gRecaptchaToken})
    // Create user
    const user = await User.create({
      firstName,
      lastName,
      email: email.toLowerCase(),
      password: hashedPassword,
      phone,
      companyName,
      postalCode,
      addressLine1,
      addressLine2,
      city,
      state,
      businessType,
      role: businessType,
      businessLicenseUrl: "",
      agreeTermsAndConditions,
      stripeCustomerId: customer.id,
      // file: file || [], // Handle file array
      file: file || [],
      gRecaptchaToken, // Store reCAPTCHA token if needed for audit
      // Note: re_password is not stored in DB for security reasons
    });



    // Send email to admin to notify for new user registered
    const adminEmailData = {
      firstName,
      lastName,
      email: email.toLowerCase(),
      phone,
      companyName,
      businessType,
      city,
      state,
      postalCode,
      addressLine1,
      addressLine2,
      createdAt: user.createdAt,
    };
    
    try {
      await newUserRegistrationEmailToAdmin(adminEmailData);
      console.log('✅ Admin notification email sent successfully');
    } catch (emailError) {
      console.error('❌ Failed to send admin notification email:', emailError);
      // Don't fail the registration if admin email fails
    }

    // Send welcome email
    registrationWelcomeEmail(email.toLowerCase(), firstName);
   
    // Add user to Mailchimp
    try {
      const mailchimpData = {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        companyName: user.companyName,
        phone: user.phone,
        city: user.city,
        state: user.state,
        postalCode: user.postalCode
      };
      
      const mailchimpResult = await addOrUpdateMember(mailchimpData);
      if (mailchimpResult.success) {
        console.log('✅ User added to Mailchimp:', user.email);
      } else {
        console.error('❌ Failed to add user to Mailchimp:', mailchimpResult.error);
        // Don't fail registration if Mailchimp fails
      }
    } catch (mailchimpError) {
      console.error('❌ Mailchimp integration error:', mailchimpError);
      // Don't fail registration if Mailchimp fails
    }

    sendResponse(res, HTTP_STATUS_201, "Registration successful", {
      userId: user._id,
      email: user.email,
    });

  } catch (error) {
    console.error("Register error:", error);
    sendResponse(res, HTTP_STATUS_500, "Internal Server Error");
  }
};


export const login = async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return sendResponse(res, HTTP_STATUS_401, "Email or phone and password are required.");
    }

    // Normalize identifier and build case-insensitive email matcher
    const trimmedIdentifier = String(identifier).trim();
    const isEmail = trimmedIdentifier.includes("@");
    const normalizedPhoneOrId = trimmedIdentifier; // phone comparisons are exact

    // Case-insensitive exact-match regex for email
    const escaped = trimmedIdentifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const emailEqI = new RegExp(`^${escaped}$`, "i");

    // Find user by email (case-insensitive) or phone
    const userDetails = await User.findOne({
      $or: [
        ...(isEmail ? [{ email: emailEqI }] : []),
        { phone: normalizedPhoneOrId }
      ]
    });


    if (!userDetails) {
      return sendResponse(res, HTTP_STATUS_404, "User not found.");
    }
    if (userDetails?.verfied !== "approved") {
      return sendResponse(res, HTTP_STATUS_404, "Account not verified. Please check email.");
    }
    // Compare password
    const isMatch = await bcrypt.compare(password, userDetails.password);
    if (!isMatch) {
      return sendResponse(res, HTTP_STATUS_401, "Invalid password.");
    }

    // console.log("User logged in:", userDetails);
    // console.log("Generated token for user:", userDetails.verfied);

    // Generate JWT token with extended user data
    const token = jwt.sign(
      {
        userId: userDetails._id,
        firstName: userDetails.firstName,
        lastName: userDetails.lastName,
        email: userDetails.email,
        phone: userDetails.phone,
        companyName: userDetails.companyName,
        postalCode: userDetails.postalCode,
        addressLine1: userDetails.addressLine1,
        addressLine2: userDetails.addressLine2,
        city: userDetails.city,
        state: userDetails.state,
        businessType: userDetails.businessType,
        role: userDetails.role,
        businessLicenseUrl: userDetails.businessLicenseUrl,
        agreeTermsAndConditions: userDetails.agreeTermsAndConditions,
        verfied: userDetails.verfied
      },
      process.env.TOKEN_SECRET,
      { expiresIn: "30d" }
    );


    return sendResponse(res, HTTP_STATUS_200, "Login successful", {
      token,
      user: {
        id: userDetails._id,
        firstName: userDetails.firstName,
        lastName: userDetails.lastName,
        email: userDetails.email,
        phone: userDetails.phone,
        companyName: userDetails.companyName,
        postalCode: userDetails.postalCode,
        addressLine1: userDetails.addressLine1,
        addressLine2: userDetails.addressLine2,
        city: userDetails.city,
        state: userDetails.state,
        businessType: userDetails.businessType,
        role: userDetails.role,
        businessLicenseUrl: userDetails.businessLicenseUrl,
        agreeTermsAndConditions: userDetails.agreeTermsAndConditions,
        stripeCustomerId: userDetails.stripeCustomerId,
        createdAt: userDetails.createdAt,
        updatedAt: userDetails.updatedAt,
        verfied: userDetails.verfied
      }
    });

  } catch (error) {
    console.error("Login error:", error);
    return sendResponse(res, HTTP_STATUS_500, "Internal Server Error");
  }
};

export const forgotpassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return sendResponse(res, HTTP_STATUS_401, "Email is required.");
    }

    const trimmedEmail = String(email).trim();
    const escaped = trimmedEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const emailEqI = new RegExp(`^${escaped}$`, "i");
    const user = await User.findOne({ email: emailEqI });
    if (!user) {
      return sendResponse(res, HTTP_STATUS_404, "User not found.");
    }

    // Generate 8-digit alphanumeric OTP
    const otp = crypto.randomBytes(4).toString("hex").toUpperCase(); // 8 characters

    // Set OTP and expiry time (1 minute)
    user.otp = otp;
    user.otpExpiry = Date.now() + 2 * 60 * 1000; // 1 minute

    await user.save();

    const magicLink = `${process.env.CLIENT_URL}/change-password?otp=${otp}&email=${encodeURIComponent(trimmedEmail.toLowerCase())}`;

    await sendMail({
      to: trimmedEmail.toLowerCase(),
      subject: "Reset Your Password",
      html: buildEmailTemplate({
        subject: "Reset Your Password",
        title: "Password Reset",
        recipientName: user.firstName,
        contentHtml: `
          <p>Click the button below to reset your password:</p>
          <p><a href="${magicLink}" style="display:inline-block;background:#D23F57;color:#fff;padding:10px 14px;border-radius:6px;text-decoration:none">Reset Password</a></p>
          <p style="margin-top:10px;word-break:break-all"><a href="${magicLink}">${magicLink}</a></p>
          <p>This link (with OTP) will expire in 1 minute.</p>
        `,
      })
    });

    return sendResponse(res, HTTP_STATUS_200, "Password reset link sent to email.");
  } catch (error) {
    console.error("Magic Link OTP Error:", error);
    return sendResponse(res, HTTP_STATUS_500, "Server Error");
  }
};

export const updatePassword = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return sendResponse(res, HTTP_STATUS_400, {
        success: false,
        error: "Both current and new password are required",
      });
    }

    const user = await User.findById(userId).select("+password");
    if (!user) {
      return sendResponse(res, HTTP_STATUS_404, {
        success: false,
        error: "User not found",
      });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return sendResponse(res, HTTP_STATUS_400, {
        success: false,
        error: "Current password is incorrect",
      });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedNewPassword;
    await user.save();

    return sendResponse(res, HTTP_STATUS_200, {
      success: true,
      message: "Password updated successfully",
    });

  } catch (error) {
    console.error("Update Password Error:", error);
    return sendResponse(res, HTTP_STATUS_500, {
      success: false,
      error: "Internal Server Error",
    });
  }
};


export const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return sendResponse(res, HTTP_STATUS_400, "All fields are required.");
    }

    const trimmedEmail = String(email).trim();
    const escaped = trimmedEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const emailEqI = new RegExp(`^${escaped}$`, "i");
    const user = await User.findOne({ email: emailEqI });
    if (!user) {
      return sendResponse(res, HTTP_STATUS_404, "User not found.");
    }

    // Check OTP validity and expiry
    const isExpired = !user.otpExpiry || user.otpExpiry < Date.now();
    const isOtpMatch = user.otp === otp;

    if (!isOtpMatch || isExpired) {
      return sendResponse(res, HTTP_STATUS_401, "Invalid or expired OTP.");
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;

    // Clear OTP fields
    user.otp = undefined;
    user.otpExpiry = undefined;

    await user.save();

    return sendResponse(res, HTTP_STATUS_200, "Password has been reset successfully.");
  } catch (error) {
    console.error("Reset Password Error:", error);
    return sendResponse(res, HTTP_STATUS_500, "Server Error");
  }
};

// export const getAllUsers = async (req, res) => {
//   try {
//     const {
//       page = 1,
//       limit = 10,
//       sortBy = "createdAt",
//       sortOrder = "desc",
//       search = ""
//     } = req.query;

//     const skip = (page<=0 ? 1:page - 1) * limit;

//     // Build search filter
//     const searchFilter = search
//       ? {
//           $or: [
//             { firstName: new RegExp(search, "i") },
//             { lastName: new RegExp(search, "i") },
//             { email: new RegExp(search, "i") },
//             { phone: new RegExp(search, "i") },
//             { companyName: new RegExp(search, "i") }
//           ]
//         }
//       : {};

//     const totalUsers = await User.countDocuments(searchFilter);

//     const users = await User.find(searchFilter)
//       .sort({ [sortBy]: sortOrder === "asc" ? 1 : -1 })
//       .skip(Number(skip))
//       .limit(Number(limit))
//       .select("-password -re_password -gRecaptchaToken");

//     return sendResponse(res, HTTP_STATUS_200, {
//       success: true,
//       message: "Users fetched successfully",
//       data: {
//         users,
//         totalUsers,
//         currentPage: Number(page),
//         totalPages: Math.ceil(totalUsers / limit)
//       }
//     });
//   } catch (error) {
//     console.error("Get All Users Error:", error);
//     return sendResponse(res, HTTP_STATUS_500, {
//       success: false,
//       error: "Internal Server Error"
//     });
//   }
// };



export const getAllUsers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
      search = ""
    } = req.query;

    const { userId, role } = req.user;

    const numericLimit = Number(limit);
    const numericPage = Number(page) <= 0 ? 1 : Number(page);
    const skip = (numericPage - 1) * numericLimit;

    // Validate and sanitize sortBy
    const allowedSortFields = ["firstName", "lastName", "email", "createdAt", "companyName"];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";
    const sortDirection = sortOrder === "asc" ? 1 : -1;

    // Build search filter
    let searchFilter = search
      ? {
        $or: [
          { firstName: new RegExp(search, "i") },
          { lastName: new RegExp(search, "i") },
          { email: new RegExp(search, "i") },
          { phone: new RegExp(search, "i") },
          { companyName: new RegExp(search, "i") },
          {
            $expr: {
              $regexMatch: {
                input: { $concat: ["$firstName", " ", "$lastName"] },
                regex: search,
                options: "i"
              }
            }
          }
        ]
      }
      : {};

    // If user is SalesPerson, only show customers assigned to them
    if (role === "SalesPerson") {
      searchFilter.assignedSalesPerson = userId;
    }

    const totalUsers = await User.countDocuments(searchFilter);

    const users = await User.find(searchFilter)
      .populate("assignedSalesPerson", "firstName lastName email")
      .sort({ [sortField]: sortDirection })
      .skip(skip)
      .limit(numericLimit)
      .select("-password -re_password -gRecaptchaToken"); // Exclude sensitive fields

    return sendResponse(res, HTTP_STATUS_200, {
      success: true,
      message: "Users fetched successfully",
      data: {
        users,
        totalUsers,
        currentPage: numericPage,
        totalPages: Math.ceil(totalUsers / numericLimit)
      }
    });

  } catch (error) {
    console.error("Get All Users Error:", error);
    return sendResponse(res, HTTP_STATUS_500, {
      success: false,
      error: "Internal Server Error"
    });
  }
};



export const approveUser = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return sendResponse(res, HTTP_STATUS_400, { error: "User ID is required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return sendResponse(res, HTTP_STATUS_400, { error: "User not found" });
    }
    if (user.verfied === "rejected" || user.verfied === "approved") {
      return sendResponse(res, HTTP_STATUS_400, {
        error: `User is already ${user.verfied === "rejected" ? "rejected" : "approved"}`,
      });
    }
    // Update user verification status
    await User.findByIdAndUpdate(userId, { verfied: "approved" });

    // Send approval email
    await sendMail({
      to: user.email,
      subject: "Account Approved",
      html: buildEmailTemplate({
        subject: "Account Approved",
        title: "Your account is approved",
        recipientName: user.firstName || "User",
        contentHtml: `
          <p>Your account has been <strong>approved</strong> by the admin.</p>
          <p>You can now log in and access all features of the platform.</p>
        `,
      })
    });

    return sendResponse(res, HTTP_STATUS_200, { success: "User approved successfully" });
  } catch (error) {
    console.error("Approve User Error:", error);
    return sendResponse(res, HTTP_STATUS_500, { error: "Internal server error" });
  }
};



export const rejectUser = async (req, res) => {
  try {
    const { userId, reason } = req.body;

    if (!userId) {
      return sendResponse(res, HTTP_STATUS_400, {
        error: "User ID is required",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return sendResponse(res, HTTP_STATUS_400, {
        error: "User not found",
      });
    }

    // if (user.verfied === "rejected" || user.verfied === "approved") {
    //   return sendResponse(res, HTTP_STATUS_400, {
    //     error: `User is already ${user.verfied === "rejected" ? "rejected" : "approved"}`,
    //   });
    // }

    const rejectionReason = reason || "No reason provided";

    // Update user status to rejected and store reason
    await User.findByIdAndUpdate(userId, {
      verfied: "pending",
      rejectionReason,
    });

    // Send rejection email - DISABLED
    // await sendMail({
    //   to: user.email,
    //   subject: "Account Rejected",
    //   html: buildEmailTemplate({
    //     subject: "Account Rejected",
    //     title: "Account status update",
    //     recipientName: user.firstName || "User",
    //     contentHtml: `
    //       <p>We regret to inform you that your account has been <strong>rejected</strong> by our admin team.</p>
    //       <p><strong>Reason:</strong> ${rejectionReason}</p>
    //       <p>If you believe this is a mistake, please contact support.</p>
    //     `,
    //   })
    // });

    return sendResponse(res, HTTP_STATUS_200, {
      success: "User rejected successfully",
    });
  } catch (error) {
    console.error("Reject User Error:", error);
    return sendResponse(res, HTTP_STATUS_500, {
      error: "Internal server error",
    });
  }
};



export const updateUserRole = async (req, res) => {
  try {
    const { userId, userType } = req.body;

    if (!userId || !userType) {
      return sendResponse(res, HTTP_STATUS_400, {
        error: "User ID and new role are required",
      });
    }

    if (!USERTYPES.includes(userType)) {
      return sendResponse(res, HTTP_STATUS_400, {
        error: "Invalid role type",
      });
    }

    // Get user before updating to get email for Mailchimp
    const userBeforeUpdate = await User.findById(userId);
    if (!userBeforeUpdate) {
      return sendResponse(res, HTTP_STATUS_404, {
        error: "User not found",
      });
    }

    // Prepare update data
    const updateData = { 
      businessType: userType, 
      role: userType 
    };

    // If changing to SalesPerson, clear any assignedSalesPerson field
    // If changing from SalesPerson to another role, clear assignedSalesPerson field
    if (userType === "SalesPerson" || userBeforeUpdate.role === "SalesPerson") {
      updateData.assignedSalesPerson = null;
    }

    // If changing to SalesPerson, also remove this user from any customer assignments
    if (userType === "SalesPerson") {
      await User.updateMany(
        { assignedSalesPerson: userId },
        { $unset: { assignedSalesPerson: 1 } }
      );
    }

    const user = await User.findByIdAndUpdate(userId, updateData, { new: true });

    // Update user role in Mailchimp
    try {
      const mailchimpResult = await updateMailchimpRole(user.email, userType);
      if (mailchimpResult.success) {
        console.log('✅ User role updated in Mailchimp:', user.email, '->', userType);
      } else {
        console.error('❌ Failed to update user role in Mailchimp:', mailchimpResult.error);
        // Don't fail the role update if Mailchimp fails
      }
    } catch (mailchimpError) {
      console.error('❌ Mailchimp role update error:', mailchimpError);
      // Don't fail the role update if Mailchimp fails
    }

    return sendResponse(res, HTTP_STATUS_200, { success: "User role updated successfully" });
  } catch (error) {
    console.error("Update User Role Error:", error);
    return sendResponse(res, HTTP_STATUS_500, { error: "Internal server error" });
  }
};

export const assignCustomerToSalesPerson = async (req, res) => {
  try {
    const { customerId, salesPersonId } = req.body;

    if (!customerId || !salesPersonId) {
      return sendResponse(res, HTTP_STATUS_400, {
        error: "Customer ID and Sales Person ID are required",
      });
    }

    // Check if sales person exists and has SalesPerson role
    const salesPerson = await User.findById(salesPersonId);
    if (!salesPerson) {
      return sendResponse(res, HTTP_STATUS_404, {
        error: "Sales Person not found",
      });
    }

    if (salesPerson.role !== "SalesPerson") {
      return sendResponse(res, HTTP_STATUS_400, {
        error: "User is not a Sales Person",
      });
    }

    // Check if customer exists
    const customer = await User.findById(customerId);
    if (!customer) {
      return sendResponse(res, HTTP_STATUS_404, {
        error: "Customer not found",
      });
    }

    // Ensure customer is not a SalesPerson (SalesPerson cannot be assigned to another SalesPerson)
    if (customer.role === "SalesPerson") {
      return sendResponse(res, HTTP_STATUS_400, {
        error: "Cannot assign a Sales Person as a customer to another Sales Person",
      });
    }

    // Update customer's assigned sales person
    const updatedCustomer = await User.findByIdAndUpdate(
      customerId,
      { assignedSalesPerson: salesPersonId },
      { new: true }
    );

    return sendResponse(res, HTTP_STATUS_200, {
      success: "Customer assigned to Sales Person successfully",
      customer: {
        id: updatedCustomer._id,
        name: `${updatedCustomer.firstName} ${updatedCustomer.lastName}`,
        email: updatedCustomer.email,
        assignedSalesPerson: updatedCustomer.assignedSalesPerson
      }
    });
  } catch (error) {
    console.error("Assign Customer to Sales Person Error:", error);
    return sendResponse(res, HTTP_STATUS_500, { error: "Internal server error" });
  }
};

export const getSalesPersons = async (req, res) => {
  try {
    const salesPersons = await User.find({ role: "SalesPerson" })
      .select("_id firstName lastName email phone")
      .sort({ firstName: 1 });

    return sendResponse(res, HTTP_STATUS_200, {
      success: "Sales Persons retrieved successfully",
      salesPersons
    });
  } catch (error) {
    console.error("Get Sales Persons Error:", error);
    return sendResponse(res, HTTP_STATUS_500, { error: "Internal server error" });
  }
};

export const updateUserProfile = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      phone,
      companyName,
      postalCode,
      addressLine1,
      addressLine2,
      city,
      state,
      files
    } = req.body;
    const userId = req.user?.userId || req.body.userId;
    if (!userId) {
      return sendResponse(res, 400, "User ID is required");
    }
    // Fetch the user
    const user = await User.findById(userId);
    if (!user) {
      return sendResponse(res, 404, "User not found");
    }
    // Optional: Add validations
    if (!firstName) return sendResponse(res, 400, "First name is required");
    if (!phone) return sendResponse(res, 400, "Phone number is required");
    if (!addressLine1 || !city || !state || !postalCode)
      return sendResponse(res, 400, "Complete address is required");
    // Check for duplicate phone number (if changed)
    if (phone !== user.phone) {
      const phoneExists = await User.findOne({ phone });
      if (phoneExists) return sendResponse(res, 400, "Phone number already in use");
    }
    // Update fields
    user.firstName = firstName;
    user.lastName = lastName;
    user.phone = phone;
    user.companyName = companyName;
    user.postalCode = postalCode;
    user.addressLine1 = addressLine1;
    user.addressLine2 = addressLine2;
    user.city = city;
    user.state = state;
    user.file = files;
    await user.save();
    return sendResponse(res, 200, "User information updated successfully", {
      userId: user._id,
      email: user.email,
    });
  } catch (error) {
    console.error("Update user info error:", error);
    return sendResponse(res, 500, "Server error");
  }
};
export const userProfile = async (req, res) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return sendResponse(res, 400, "User ID is required");
    }

    const userDetails = await User.findById(userId).select("-password -re_password -gRecaptchaToken");
    if (!userDetails) {
      return sendResponse(res, 404, "User not found");
    }

    return sendResponse(res, 200, "User information updated successfully", {
      user: {
        id: userDetails._id,
        firstName: userDetails.firstName,
        lastName: userDetails.lastName,
        email: userDetails.email,
        phone: userDetails.phone,
        companyName: userDetails.companyName,
        postalCode: userDetails.postalCode,
        addressLine1: userDetails.addressLine1,
        addressLine2: userDetails.addressLine2,
        city: userDetails.city,
        state: userDetails.state,
        businessType: userDetails.businessType,
        role: userDetails.role,
        businessLicenseUrl: userDetails.businessLicenseUrl,
        agreeTermsAndConditions: userDetails.agreeTermsAndConditions,
        // stripeCustomerId: userDetails.stripeCustomerId,
        file: userDetails.file || [],
        createdAt: userDetails.createdAt,
        updatedAt: userDetails.updatedAt
      }
    });
  } catch (error) {
    console.error("Update user info error:", error);
    return sendResponse(res, 500, "Server error");
  }
};
export const addPaymentMethod = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { paymentMethodId } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Attach payment method to customer
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: user.stripeCustomerId,
    });

    // Optionally set as default for future payments
    await stripe.customers.update(user.stripeCustomerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    // Get method details for local storage
    const method = await stripe.paymentMethods.retrieve(paymentMethodId);

    // Check if already exists
    const alreadyAdded = user.paymentMethods.find(
      (m) => m.stripePaymentMethodId === paymentMethodId
    );
    if (alreadyAdded) {
      return res.status(409).json({ message: 'Payment method already added' });
    }

    // Save to DB
    user.paymentMethods.push({
      stripePaymentMethodId: paymentMethodId,
      brand: method.card.brand,
      last4: method.card.last4,
      exp_month: method.card.exp_month,
      exp_year: method.card.exp_year,
      isDefault: user.paymentMethods.length === 0, // First one is default
    });

    await user.save();

    res.status(200).json({ success: true, message: 'Payment method added successfully' });
  } catch (error) {
    console.error('Add payment method error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// export const getPaymentMethods = async (req, res) => {
//   try {
//     const userId = req.body.user.userId // depending on how you're passing user info

//     console.log("User ID for payment methods:", userId);
//     const user = await User.findById(userId);
//     if (!user) return res.status(404).json({ success: false, message: 'User not found' });

//     const paymentMethods = user.paymentMethods || [];

//     res.status(200).json({
//       success: true,
//       message: 'Payment methods fetched successfully',
//       data: paymentMethods,
//     });
//   } catch (error) {
//     console.error('Get payment methods error:', error);
//     res.status(500).json({ success: false, message: error.message });
//   }
// };

export const getPaymentMethods = async (req, res) => {
  try {
    const userId = req.user?.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Ensure Stripe customer exists
    if (!user.stripeCustomerId) {
      // Create new Stripe customer
      const stripeCustomer = await stripe.customers.create({
        email: user.email,
        name: `${user.firstName} ${user.lastName || ""}`.trim(),
        metadata: { userId: user._id.toString() },
      });
      user.stripeCustomerId = stripeCustomer.id;
      await user.save();
    } else {
      try {
        // Verify customer exists in Stripe
        await stripe.customers.retrieve(user.stripeCustomerId);
      } catch (err) {
        // If customer doesn't exist in Stripe, recreate it
        console.log('Stripe customer not found, recreating...', err.message);
        const stripeCustomer = await stripe.customers.create({
          email: user.email,
          name: `${user.firstName} ${user.lastName || ""}`.trim(),
          metadata: { userId: user._id.toString() },
        });
        user.stripeCustomerId = stripeCustomer.id;
        await user.save();
      }
    }

    // Fetch Stripe payment methods
    const stripePaymentMethods = await stripe.paymentMethods.list({
      customer: user.stripeCustomerId,
      type: 'card',
    });

    // Optional: Get the default payment method from Stripe customer object
    const customer = await stripe.customers.retrieve(user.stripeCustomerId);

    const defaultPaymentMethodId = customer.invoice_settings?.default_payment_method;

    // Format to match your desired response
    const formattedMethods = stripePaymentMethods.data.map((pm) => ({
      stripePaymentMethodId: pm.id,
      brand: pm.card.brand,
      last4: pm.card.last4,
      exp_month: pm.card.exp_month,
      exp_year: pm.card.exp_year,
      isDefault: pm.id === defaultPaymentMethodId,
      _id: pm.id, // Fallback as you may not have Mongo _id for Stripe PMs
    }));

    res.status(200).json({
      success: true,
      message: 'Payment methods fetched successfully',
      data: formattedMethods,
    });
  } catch (error) {
    console.error('Error fetching Stripe payment methods:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Test Mailchimp connection endpoint
export const testMailchimpConnection = async (req, res) => {
  try {
    const result = await testConnection();
    
    if (result.success) {
      return sendResponse(res, HTTP_STATUS_200, "Mailchimp connection successful", result);
    } else {
      return sendResponse(res, HTTP_STATUS_500, "Mailchimp connection failed", result);
    }
  } catch (error) {
    console.error("Test Mailchimp Connection Error:", error);
    return sendResponse(res, HTTP_STATUS_500, "Internal server error", { error: error.message });
  }
};

