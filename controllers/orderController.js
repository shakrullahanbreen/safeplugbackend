// File: controllers/orderController.js

import mongoose from "mongoose";
import Cart from "../models/cartModel.js";
import Order from "../models/orderModel.js";
import User from "../models/userModel.js";
import Product from "../models/productModel.js";
// import stripe from "stripe";
import { getMongoId, sendResponse, getShippingCost } from "../utils/helper.js";
import { HTTP_STATUS_401 } from "../utils/constants.js";
import CustomerOrder from "../models/customerOrderModel.js";
import { sendMail, buildEmailTemplate } from "../utils/mailer.js";
import PDFDocument from "pdfkit";
import { Buffer } from "buffer";
import { Transaction } from "../models/transactionsModel.js";
import { stripe } from '../lib/stripe.js';


export const placeOrder = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const {
      cart,
      paymentMethodId,
      shippingMethod,
      shippingAddress,
      billingAddress,
      discount = 0,
    } = req.body;
    
    if (!userId) {
      return sendResponse(res, 400, "User ID is required");
    }

    // ✅ Validate required fields
    if (
      !cart ||
      !paymentMethodId ||
      !shippingAddress ||
      !billingAddress ||
      !shippingMethod
    ) {
      return sendResponse(res, 400, "All fields are required.");
    }

    // ✅ Validate payment method ID format (Stripe payment method IDs start with "pm_")
    if (typeof paymentMethodId !== 'string' || !paymentMethodId.startsWith('pm_')) {
      return sendResponse(res, 400, "Invalid payment method ID format. Payment method ID must start with 'pm_'.");
    }

    // ✅ Only franchises can place orders
    if (req.user.role === "Admin") {
      return sendResponse(
        res,
        403,
        "Unauthorized access. Only franchises can place orders."
      );
    }

    // ✅ STEP 1: Get user
    const existingUser = await User.findById(userId);
    if (!existingUser) {
      return sendResponse(res, 404, "User not found.");
    }

    // ✅ STEP 2: Ensure Stripe customer exists
    if (!existingUser.stripeCustomerId) {
      const stripeCustomer = await stripe.customers.create({
        email: existingUser.email,
        name: `${existingUser.firstName} ${existingUser.lastName || ""}`.trim(),
        metadata: { userId: existingUser._id.toString() },
      });
      existingUser.stripeCustomerId = stripeCustomer.id;
      await existingUser.save();
    } else {
      try {
        await stripe.customers.retrieve(existingUser.stripeCustomerId);
      } catch (err) {
        // If retrieval fails, recreate customer
        const stripeCustomer = await stripe.customers.create({
          email: existingUser.email,
          name: `${existingUser.firstName} ${existingUser.lastName || ""}`.trim(),
          metadata: { userId: existingUser._id.toString() },
        });
        existingUser.stripeCustomerId = stripeCustomer.id;
        await existingUser.save();
      }
    }

    // ✅ STEP 3: Verify payment method
    let paymentMethod;
    try {
      paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    } catch (err) {
      console.error("Error retrieving payment method:", err);
      // Try to find the payment method in the customer's attached methods as a fallback
      try {
        const customerPaymentMethods = await stripe.paymentMethods.list({
          customer: existingUser.stripeCustomerId,
          type: 'card',
        });
        const foundMethod = customerPaymentMethods.data.find(
          (pm) => pm.id === paymentMethodId
        );
        if (foundMethod) {
          paymentMethod = foundMethod;
        } else {
          // Provide more specific error messages based on Stripe error codes
          if (err.code === 'resource_missing') {
            return sendResponse(res, 400, "Payment method not found. Please use a valid payment method.");
          } else if (err.type === 'StripeInvalidRequestError') {
            return sendResponse(res, 400, `Invalid payment method: ${err.message || 'Please check your payment method and try again.'}`);
          } else {
            return sendResponse(res, 400, `Payment method error: ${err.message || 'Invalid payment method.'}`);
          }
        }
      } catch (fallbackErr) {
        console.error("Error in fallback payment method retrieval:", fallbackErr);
        // Provide more specific error messages based on Stripe error codes
        if (err.code === 'resource_missing') {
          return sendResponse(res, 400, "Payment method not found. Please use a valid payment method.");
        } else if (err.type === 'StripeInvalidRequestError') {
          return sendResponse(res, 400, `Invalid payment method: ${err.message || 'Please check your payment method and try again.'}`);
        } else {
          return sendResponse(res, 400, `Payment method error: ${err.message || 'Invalid payment method.'}`);
        }
      }
    }

    // ✅ NEW: Ensure only card payment methods are accepted
    if (paymentMethod.type !== 'card') {
      return sendResponse(
        res,
        400,
        "Only card payment methods are accepted for orders."
      );
    }

    if (
      paymentMethod.customer &&
      paymentMethod.customer !== existingUser.stripeCustomerId
    ) {
      return sendResponse(
        res,
        400,
        "Payment method does not belong to this customer."
      );
    }

    // Attach payment method if not already attached
    if (!paymentMethod.customer) {
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: existingUser.stripeCustomerId,
      });
    }

    // Optionally set as default
    await stripe.customers.update(existingUser.stripeCustomerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    // ✅ STEP 4: Get cart
    const cartDetails = await Cart.findOne({
      _id: getMongoId(cart),
      userId: userId,
    }).populate("items.productId", "pricing name");

    if (!cartDetails || !cartDetails.items || cartDetails.items.length === 0) {
      return sendResponse(res, 404, "Cart not found or is empty.");
    }

    // ✅ STEP 5: Calculate subtotal
    const orderItems = [];
    let subtotal = 0;

    // Map user role to pricing tier
    const roleMapping = {
      wholesale: "Wholesale",
      retailer: "Retailer", 
      chainstore: "ChainStore",
      franchise: "Franchise",
    };
    const pricingKey = roleMapping[existingUser.role?.toLowerCase()] || "Franchise";

    for (const item of cartDetails.items) {
      const itemPrice = item.productId.pricing[pricingKey]?.price || 0;
      // const itemPrice = item.productId.pricing[existingUser.role]?.price || 0;
      const itemTotal = itemPrice * item.quantity;

      orderItems.push({
        product: item.productId._id,
        quantity: item.quantity,
        price: itemPrice,
      });

      subtotal += itemTotal;
    }

    // ✅ STEP 6: Calculate shipping fee
    let shippingFee = 0;
    const amountBeforeShipping = subtotal - discount;

    if (shippingMethod?.toLowerCase() === "ground") {
      if (amountBeforeShipping < 51) shippingFee = 10;
      else if (amountBeforeShipping < 251) shippingFee = 20;
      else if (amountBeforeShipping < 500) shippingFee = 30;
      else shippingFee = 0;
    } else if (shippingMethod?.toLowerCase() === "overnight") {
      if (amountBeforeShipping < 51) shippingFee = 15;
      else if (amountBeforeShipping < 251) shippingFee = 25;
      else if (amountBeforeShipping < 600) shippingFee = 35;
      else if (amountBeforeShipping < 800) shippingFee = 49;
      else shippingFee = 30;
    } else {
      return sendResponse(res, 400, "Invalid shipping method.");
    }

    const totalAmount = amountBeforeShipping + shippingFee;

    // ✅ STEP 7: Optional - Create PaymentIntent for validation only (don't confirm)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalAmount * 100),
      currency: "usd",
      customer: existingUser.stripeCustomerId,
      payment_method: paymentMethodId,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never'
      },
      // Don't confirm yet - just validate the setup
    });

    // ✅ STEP 8: Create Order in DB
    const order = await Order.create({
      user: userId,
      cart,
      items: orderItems,
      billingAddress,
      shippingAddress,
      paymentMethodId,
      shippingMethod,
      amount: totalAmount,
      shippingFee,
      discount,
      status: "Pending",
      paid: "Unpaid",
      paymentIntentId: paymentIntent.id, // Store for later confirmation
    });

    // ✅ STEP 9: Notify admin
    await sendMail({
      to: process.env.ADMIN_EMAIL || "admin@example.com",
      subject: "🛒 New Order Received",
      html: buildEmailTemplate({
        subject: "🛒 New Order Received",
        title: "New Order Details",
        subtitle: "Admin Notification",
        contentHtml: `
          <p>A new order has been placed by <strong>${existingUser.firstName} ${existingUser.lastName || ""}</strong>.</p>
          <p><strong>Order ID:</strong> ${order._id}</p>
          <p><strong>Total Amount:</strong> $${totalAmount.toFixed(2)}</p>
          <p><strong>Shipping Method:</strong> ${shippingMethod}</p>

          <p><strong>Status:</strong> ${order.status}</p>
          <p style="margin-top:10px;">Visit your admin dashboard to review and process this order.</p>
        `,
      }),
    });

    // ✅ STEP 10: Log in Franchise Orders
    await CustomerOrder.create({
      user: userId,
      amount: totalAmount,
      orderId: order._id,
      items: orderItems,
      paymentMethodId,
      shippingAddress,
      billingAddress,
      discount,
    });

    // ✅ STEP 11: Deactivate cart (only after everything succeeds)
    cartDetails.isActive = false;
    await cartDetails.save();

    return sendResponse(res, 200, "Order placed successfully", order);
  } catch (error) {
    console.error("Error placing order:", error);
    return sendResponse(res, 500, "Server error.");
  }
};

export const updateOrder = async (req, res) => {
  try {
    const {
      orderId,
      items,
      user,
      shippingFees,
      discount,
      status,
      shippingMethod,
    } = req.body;

    if (!orderId) {
      return sendResponse(res, 400, "Order ID is required.");
    }

    const existingOrder = await Order.findById(orderId)
      .populate("user")
      .populate("items.product");
    if (!existingOrder) {
      return sendResponse(res, 404, "Order not found.");
    }

    if (
      req.user.role !== "Admin" &&
      existingOrder.user._id.toString() !== userId
    ) {
      return sendResponse(res, 403, "Unauthorized to update this order.");
    }

    const allowedTransitions = {
      Pending: ["Processing", "Cancelled"],
      Processing: ["Delivered", "Cancelled"],
      Delivered: [],
    };

    if (status && !allowedTransitions[existingOrder.status]?.includes(status)) {
      return sendResponse(
        res,
        400,
        `Cannot change status from ${existingOrder.status} to ${status}.`
      );
    }

    const updateData = {};
    let newItems = existingOrder.items;

    if (items) {
      newItems = items;
      updateData.items = newItems;
    }

    if (discount !== undefined) updateData.discount = discount;
    if (shippingMethod) updateData.shippingMethod = shippingMethod;

    const subtotal = newItems.reduce((sum, item) => {
      return sum + item.price * item.quantity;
    }, 0);

    const effectiveDiscount = discount || existingOrder.discount || 0;
    const baseTotal = subtotal - effectiveDiscount;

    let shippingFee =
      shippingFees !== undefined ? shippingFees : existingOrder.shippingFee;

    if (shippingMethod || shippingFees === undefined) {
      const method = shippingMethod || existingOrder.shippingMethod;
      if (method === "Ground") {
        if (baseTotal < 51) shippingFee = 10;
        else if (baseTotal < 251) shippingFee = 20;
        else if (baseTotal < 500) shippingFee = 30;
        else shippingFee = 0;
      } else if (method === "Overnite") {
        if (baseTotal < 51) shippingFee = 15;
        else if (baseTotal < 251) shippingFee = 25;
        else if (baseTotal < 600) shippingFee = 35;
        else if (baseTotal < 800) shippingFee = 49;
        else shippingFee = 30;
      } else {
        return sendResponse(res, 400, "Invalid or missing shipping method.");
      }
      updateData.shippingFee = shippingFee;
    }

    updateData.amount = baseTotal + shippingFee;

    // Handle status changes
    if (status) {
      const validStatuses = ["Pending", "Processing", "Delivered", "Cancelled"];
      if (!validStatuses.includes(status)) {
        return sendResponse(res, 400, { error: "Invalid order status." });
      }
      updateData.status = status;

      // Handle order cancellation - cancel the unconfirmed PaymentIntent
      if (status === "Cancelled") {
        if (existingOrder.paymentIntentId) {
          try {
            await stripe.paymentIntents.cancel(existingOrder.paymentIntentId);
            updateData.paid = "Cancelled";
            console.log(`PaymentIntent ${existingOrder.paymentIntentId} cancelled for order ${orderId}`);
          } catch (stripeError) {
            console.error("Error cancelling PaymentIntent:", stripeError);
            // Continue with order cancellation even if Stripe operation fails
            updateData.paid = "Cancelled";
          }
        }
      }

      // Handle payment confirmation for Processing or Delivered status
      const shouldConfirmPayment = ["Processing", "Delivered"].includes(status);
      const notPaidYet = existingOrder.paid !== "Paid";

      if (shouldConfirmPayment && notPaidYet && existingOrder.paymentIntentId) {
        try {
          // Check if amount changed - if yes, update PaymentIntent before confirming
          const originalAmount = Math.round(existingOrder.amount * 100);
          const newAmount = Math.round(updateData.amount * 100);

          if (originalAmount !== newAmount) {
            console.log(`Updating PaymentIntent amount from $${existingOrder.amount} to $${updateData.amount}`);
            
            // Update PaymentIntent amount
            await stripe.paymentIntents.update(existingOrder.paymentIntentId, {
              amount: newAmount,
              description: `Updated Order ${existingOrder._id.toString()} - ${newItems.length} item(s) - Amount changed from $${existingOrder.amount} to $${updateData.amount}`,
              metadata: {
                orderId: existingOrder._id.toString(),
                userId: existingOrder.user._id.toString(),
                orderStatus: status,
                itemCount: newItems.length.toString(),
                shippingMethod: updateData.shippingMethod || existingOrder.shippingMethod,
                amountUpdated: 'true',
                originalAmount: existingOrder.amount.toString(),
                newAmount: updateData.amount.toString(),
              },
            });
          }

          // Confirm the PaymentIntent (with updated amount if changed)
          const paymentIntent = await stripe.paymentIntents.confirm(
            existingOrder.paymentIntentId,
            {
              off_session: true,
            }
          );

          // Create transaction record
          const userRecord = await User.findById(existingOrder.user._id);
          await Transaction.create({
            userId: userRecord._id,
            amount: updateData.amount,
            stripePaymentIntentId: paymentIntent.id,
            status: paymentIntent.status,
            paymentMethodId: paymentIntent.payment_method,
            createdByAdmin: true,
            amountUpdated: originalAmount !== newAmount,
            originalAmount: originalAmount !== newAmount ? existingOrder.amount : null,
          });

          updateData.paid = paymentIntent.status === "succeeded" ? "Paid" : "Rejected";
          console.log(`PaymentIntent ${existingOrder.paymentIntentId} confirmed for order ${orderId} - Status: ${paymentIntent.status} - Final Amount: $${updateData.amount}`);
        } catch (stripeError) {
          console.error("Error confirming PaymentIntent:", stripeError);
          updateData.paid = "Rejected";

          // Handle specific Stripe errors
          if (stripeError.code === "authentication_required") {
            return sendResponse(
              res,
              400,
              "Payment requires additional authentication. Please contact the customer to update their payment method."
            );
          } else if (stripeError.code === "card_declined") {
            return sendResponse(
              res,
              400,
              "Payment was declined. The customer's card was declined."
            );
          } else if (stripeError.code === "insufficient_funds") {
            return sendResponse(
              res,
              400,
              "Payment failed due to insufficient funds."
            );
          } else {
            return sendResponse(
              res,
              400,
              `Payment failed: ${stripeError.message}`
            );
          }
        }
      }
    }

    const updatedOrder = await Order.findByIdAndUpdate(orderId, updateData, {
      new: true,
      runValidators: true,
    })
      .populate("items.product")
      .populate("user");

    // 📧 Send email notifications based on status change
    if (status === "Processing") {
      const productDetailsHTML = updatedOrder.items
        .map((item) => {
          return `<li>${item.product?.name || "Product"} × ${
            item.quantity
          } — $${item.price}</li>`;
        })
        .join("");

      // Check if order was modified by admin
      const wasModified = updatedOrder.amount !== existingOrder.amount || 
                         updatedOrder.items.length !== existingOrder.items.length;

      const modificationNote = wasModified 
        ? `
          <div style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid #007bff; margin: 15px 0;">
            <h3 style="color: #007bff; margin: 0 0 10px 0;">⚠️ Order Modified</h3>
            <p style="margin: 0;">Your order has been reviewed and modified due to stock availability. The final amount charged is $${updatedOrder.amount}.</p>
            ${updatedOrder.amount !== existingOrder.amount ? `<p style="margin: 5px 0 0 0;"><strong>Original Amount:</strong> $${existingOrder.amount} → <strong>Final Amount:</strong> $${updatedOrder.amount}</p>` : ''}
          </div>
        ` 
        : '';

      await sendMail({
        to: updatedOrder.user.email,
        subject: wasModified ? "✅ Your Order Has Been Confirmed (Modified)" : "✅ Your Order Has Been Confirmed",
        html: buildEmailTemplate({
          subject: wasModified ? "✅ Your Order Has Been Confirmed (Modified)" : "✅ Your Order Has Been Confirmed",
          title: "Order Confirmed",
          recipientName: updatedOrder.user.firstName,
          contentHtml: `
            ${modificationNote}
            <p><strong>Order ID:</strong> ${updatedOrder._id}</p>
            <p><strong>Status:</strong> ${updatedOrder.status}</p>
            <p><strong>Payment Status:</strong> ${updatedOrder.paid}</p>
            <p><strong>Shipping Method:</strong> ${updatedOrder.shippingMethod}</p>
            <p><strong>Shipping Fee:</strong> $${updatedOrder.shippingFee}</p>
            <p><strong>Discount:</strong> $${updatedOrder.discount}</p>
            <p><strong>Total Amount Charged:</strong> $${updatedOrder.amount}</p>
            <p><strong>Items:</strong></p>
            <ul>${productDetailsHTML}</ul>
            <p>Thank you for shopping with us!</p>
          `,
        }),
      });
    }

    if (status === "Cancelled") {
      await sendMail({
        to: updatedOrder.user.email,
        subject: "🚫 Order Cancelled",
        html: buildEmailTemplate({
          subject: "🚫 Order Cancelled",
          title: "Order Cancelled",
          recipientName: updatedOrder.user.firstName,
          contentHtml: `
            <p><strong>Order ID:</strong> ${updatedOrder._id}</p>
            <p><strong>Total Amount:</strong> $${updatedOrder.amount}</p>
            <p>If you have any questions, please contact our support team.</p>
          `,
        }),
      });
    }

    if (status === "Delivered") {
      await sendMail({
        to: updatedOrder.user.email,
        subject: "📦 Your Order Has Been Delivered",
        html: buildEmailTemplate({
          subject: "📦 Your Order Has Been Delivered",
          title: "Order Delivered",
          recipientName: updatedOrder.user.firstName,
          contentHtml: `
            <p><strong>Order ID:</strong> ${updatedOrder._id}</p>
            <p><strong>Status:</strong> ${updatedOrder.status}</p>
            <p>Thank you for shopping with us! We hope you enjoy your purchase.</p>
          `,
        }),
      });
    }

    // Send email if payment failed
    if (["Processing", "Delivered"].includes(status) && updatedOrder.paid === "Rejected") {
      await sendMail({
        to: updatedOrder.user.email,
        subject: "❌ Payment Failed for Your Order",
        html: buildEmailTemplate({
          subject: "❌ Payment Failed for Your Order",
          title: "Payment Failed",
          recipientName: updatedOrder.user.firstName,
          contentHtml: `
            <p>We were unable to process payment for your order.</p>
            <p><strong>Order ID:</strong> ${updatedOrder._id}</p>
            <p><strong>Total Amount:</strong> $${updatedOrder.amount}</p>
            <p>Please update your payment method or contact our support team.</p>
          `,
        }),
      });
    }

    return sendResponse(res, 200, "Order updated successfully", updatedOrder);
  } catch (error) {
    console.error("Error updating order:", error);
    return sendResponse(res, 500, "Server error.");
  }
};
export const acceptOrder = async (req, res) => {
  try {
    const { orderId, status, shippingAddress, customerNote, items, shippingFees } = req.body;

    // Check admin authorization
    if (req.user.role !== "Admin") {
      return sendResponse(res, 403, "Unauthorized. Admin access required.");
    }

    if (!orderId) {
      return sendResponse(res, 400, "Order ID is required");
    }

    // Find the order
    const order = await Order.findById(orderId).populate("items.product");
    if (!order) {
      return sendResponse(res, 404, "Order not found.");
    }

    if (order.status !== "Pending") {
      return sendResponse(res, 400, "Only pending orders can be accepted.");
    }

    // Check stock availability before deducting
    for (const item of items || order.items) {
      const product = await Product.findById(item.product._id || item.product);
      if (!product) {
        return sendResponse(res, 404, `Product ${item.product._id || item.product} not found`);
      }
      
      if (product.stock < item.quantity) {
        return sendResponse(res, 400, `Insufficient stock for ${product.name}. Available: ${product.stock}, Required: ${item.quantity}`);
      }
    }

    // Deduct stock from products using atomic update to avoid triggering full validation
    for (const item of items || order.items) {
      const productId = item.product._id || item.product;
      await Product.updateOne(
        { _id: productId, stock: { $gte: item.quantity } },
        { $inc: { stock: -item.quantity } }
      );
    }

    // Update order with new data
    const updateData = {
      status: status || "Processing",
      approvedAt: new Date(),
    };

    if (shippingAddress) updateData.shippingAddress = shippingAddress;
    if (customerNote) updateData.customerNote = customerNote;
    if (items) updateData.items = items;
    if (shippingFees !== undefined) updateData.shippingFee = shippingFees;

    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      updateData,
      { new: true }
    )
      .populate("items.product", "name stock")
      .populate("user", "firstName lastName email");

    // Send confirmation email to customer
    if (updatedOrder.user && updatedOrder.user.email) {
      const productDetailsHTML = updatedOrder.items.map((item) => {
        return `<li>${item.product?.name || "Product"} × ${item.quantity} — $${item.price}</li>`;
      }).join("");

      await sendMail({
        to: updatedOrder.user.email,
        subject: "✅ Your Order Has Been Confirmed",
        html: `
          <h2>Your order has been confirmed!</h2>
          <p><strong>Order ID:</strong> ${updatedOrder._id}</p>
          <p><strong>Status:</strong> ${updatedOrder.status}</p>
          <p><strong>Shipping Method:</strong> ${updatedOrder.shippingMethod}</p>
          <p><strong>Shipping Fee:</strong> $${updatedOrder.shippingFee}</p>
          <p><strong>Discount:</strong> $${updatedOrder.discount}</p>
          <p><strong>Total Amount:</strong> $${updatedOrder.amount}</p>
          <p><strong>Items:</strong></p>
          <ul>${productDetailsHTML}</ul>
          <p>Thank you for shopping with us!</p>
        `,
      });
    }

    return sendResponse(res, 200, "Order accepted successfully", updatedOrder);
  } catch (err) {
    console.error("Error accepting order:", err);
    return sendResponse(res, 500, "Failed to accept order");
  }
};

export const rejectOrder = async (req, res) => {
  try {
    const { id } = req.body;

    // Check admin authorization
    if (req.user.role !== "Admin") {
      return sendResponse(res, 403, "Unauthorized. Admin access required.");
    }

    if (!id) {
      return sendResponse(res, 400, "Order ID is required");
    }

    // Find and update order status
    const order = await Order.findById(id);
    if (!order) {
      return sendResponse(res, 404, "Order not found.");
    }

    if (order.status !== "Pending") {
      return sendResponse(res, 400, "Only pending orders can be rejected.");
    }

    const updatedOrder = await Order.findByIdAndUpdate(
      id,
      { status: "Rejected" },
      { new: true }
    )
      .populate("items.productId", "name")
      .populate("userId", "firstName lastName email");

    return sendResponse(res, 200, "Order rejected successfully", updatedOrder);
  } catch (err) {
    console.error("Error rejecting order:", err);
    return sendResponse(res, 500, "Failed to reject order");
  }
};

export const updatePaymentStatus = async (req, res) => {
  try {
    const { orderId, paymentStatus } = req.body;
    
    // Check admin authorization
    if (req.user.role !== "Admin") {
      return sendResponse(res, 403, "Unauthorized. Admin access required.");
    }

    // Validate payment status
    const validStatuses = ["Paid", "Unpaid", "Rejected", "None"];
    if (!validStatuses.includes(paymentStatus)) {
      return sendResponse(res, 400, "Invalid payment status.");
    }

    // Check admin authorization
    if (user.role !== "Admin") {
      return sendResponse(res, 403, "Unauthorized. Admin access required.");
    }

    if (!orderId) {
      return sendResponse(res, 400, "Order ID is required");
    }

    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      { paid: paymentStatus },
      { new: true }
    )
      .populate("items.productId", "name")
      .populate("userId", "firstName lastName email");

    if (!updatedOrder) {
      return sendResponse(res, 404, "Order not found.");
    }

    return sendResponse(
      res,
      200,
      "Payment status updated successfully",
      updatedOrder
    );
  } catch (err) {
    console.error("Error updating payment status:", err);
    return sendResponse(res, 500, "Failed to update payment status");
  }
};

export const getAllOrders = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
      status,
      paid,
    } = req.query;
    const { userId, role } = req.user;

    const sortOptions = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

    // Build filter based on user role
    let filter = {};
    if (role === "SalesPerson") {
      // For SalesPerson, get orders from customers assigned to them
      const assignedCustomers = await User.find({ assignedSalesPerson: userId }).select("_id");
      const customerIds = assignedCustomers.map(customer => customer._id);
      filter.user = { $in: customerIds };
    } else if (role !== "Admin") {
      filter.user = userId;
    }

    // Add status filter if provided
    if (status) {
      filter.status = status;
    }

    // Add payment status filter if provided
    if (paid) {
      filter.paid = paid;
    }

    let query = Order.find(filter)
      .populate("items.product", "name images")
      .select("-__v")
      .sort(sortOptions)
      .skip((page - 1) * limit)
      .limit(Number(limit));

    // Conditionally populate user info only for admin and salesperson
    if (role === "Admin" || role === "SalesPerson") {
      query = query.populate("user", "firstName lastName email");
    }

    const orders = await query;
    const totalOrders = await Order.countDocuments(filter);
    console.log("Total Orders:", orders);
    return sendResponse(res, 200, "Orders fetched successfully", {
      orders,
      totalPages: Math.ceil(totalOrders / limit),
      currentPage: Number(page),
      totalOrders,
    });
  } catch (err) {
    console.error("Error fetching orders:", err);
    return sendResponse(res, 500, "Failed to fetch orders");
  }
};

export const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    if (!id) {
      return sendResponse(res, 400, "Order ID is required");
    }

    if (!getMongoId(id)) {
      return sendResponse(res, 400, "Invalid Order ID");
    }

    let order;

    // If user is admin, allow unrestricted access
    if (req.user.role === "Admin") {
      order = await Order.findById(id)
        .populate("items.product", "name images sku")
        .populate({
          path: "user",
          select: "firstName lastName role",
        });
    } else {
      // For regular users, only fetch order if they own it
      order = await Order.findOne({ _id: id, user: userId }).populate(
        "items.product",
        "name images sku"
      );
    }

    if (!order) {
      return sendResponse(res, 404, "Order not found or not authorized");
    }

    return sendResponse(res, 200, "Order fetched successfully", order);
  } catch (err) {
    console.error("Internal Server Error:", err);
    return sendResponse(res, 500, "Internal Server Error:");
  }
};

export const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    console.log("Updating order status to:", status);
    const offer = await Offer.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    return sendResponse(res, 200, "Offer status updated", offer);
  } catch (err) {
    return sendResponse(res, 500, "Failed to update status");
  }
};

// ADMIN APPROVES OFFER AND CHARGES CUSTOMER
export const approveOfferAndCharge = async (req, res) => {
  try {
    const { offerId, updatedItems } = req.body;

    const offer = await Offer.findById(offerId).populate("userId");
    if (!offer || offer.status !== "Pending") {
      return sendResponse(res, 400, "Invalid or already processed offer.");
    }

    let amount = 0;
    updatedItems.forEach((item) => {
      amount += item.unitPrice * item.quantity;
    });

    offer.items = updatedItems;
    offer.status = "Accepted";
    await offer.save();

    const paymentIntent = await stripe.paymentIntents.create({
      customer: offer.userId.stripeCustomerId,
      amount: Math.round(amount * 100),
      currency: "usd",
      payment_method: offer.paymentMethod,
      off_session: true,
      confirm: true,
    });

    return sendResponse(res, 200, "Payment successful", paymentIntent);
  } catch (err) {
    console.error("Charge failed:", err);
    return sendResponse(res, 500, "Payment failed: " + err.message);
  }
};

export const updateTrackingId = async (req, res) => {

  try {
    const { orderId, trackingId } = req.body;

    if (!orderId) return sendResponse(res, 401, { error: "OrderId required." });

    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      { trackingId }, // wrap it in an object
      { new: true, runValidators: true } // optional but recommended
    );

    return sendResponse(res, 200, "TrackingId update successful", updatedOrder);
  } catch (err) {
    console.error("Charge failed:", err);
    return sendResponse(res, 500, "TrackingId update failed : " + err.message);
  }
};

