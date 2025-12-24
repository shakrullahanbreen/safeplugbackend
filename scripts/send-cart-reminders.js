import dotenv from "dotenv";
import mongoose from "mongoose";
import Cart from "../models/cartModel.js";
import User from "../models/userModel.js";
import { sendMail } from "../utils/mailer.js";
import { BASE_URL as BRAND_BASE_URL, BRAND_NAME } from "../utils/constants.js";

dotenv.config();

async function connect() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    throw new Error("MONGODB_URI/MONGO_URI env is required");
  }
  await mongoose.connect(uri, { autoIndex: true });
}

function daysAgo(numDays) {
  const d = new Date();
  d.setDate(d.getDate() - numDays);
  return d;
}

async function findAbandonedCarts() {
  const threeDaysAgo = daysAgo(3);

  // Eligible: active carts with items, no reminder in last 3 days, last activity older than 3 days
  const carts = await Cart.find({
    isActive: true,
    items: { $exists: true, $not: { $size: 0 } },
    lastActivityAt: { $lte: threeDaysAgo },
    $or: [
      { reminderSentAt: { $exists: false } },
      { reminderSentAt: null },
      { reminderSentAt: { $lte: threeDaysAgo } }
    ]
  }).lean();

  return carts;
}

function buildReminderEmailHtml({ firstName, cartLink }) {
  const safeName = firstName ? firstName : "there";
  const brand = BRAND_NAME || "Our Store";
  return `
    <p>Hi ${safeName},</p>
    <p>Looks like you left some items in your cart at ${brand}. They’re waiting for you!</p>
    <p><a href="${cartLink}" style="display:inline-block;padding:10px 16px;background:#2B3445;color:#fff;border-radius:6px;text-decoration:none;">View your cart</a></p>
    <p>If you have any questions, just reply to this email.</p>
  `;
}

async function sendReminderForCart(cart) {
  const user = await User.findById(cart.userId).lean();
  if (!user || !user.email) return false;

  const firstName = user.firstName || user.name || "";
  const cartLink = `${process.env.CLIENT_URL || BRAND_BASE_URL || ""}/cart`;
  const subject = "You left items in your cart";
  const html = buildReminderEmailHtml({ firstName, cartLink });

  await sendMail({ to: user.email, subject, html });

  await Cart.updateOne(
    { _id: cart._id },
    {
      $set: { reminderSentAt: new Date() },
      $inc: { abandonedReminderCount: 1 }
    }
  );

  return true;
}

async function run() {
  try {
    await connect();
    const carts = await findAbandonedCarts();
    console.log(`Found ${carts.length} abandoned carts to remind`);

    let success = 0;
    for (const cart of carts) {
      try {
        const sent = await sendReminderForCart(cart);
        if (sent) success += 1;
      } catch (err) {
        console.error("Error sending reminder for cart", cart._id, err.message);
      }
    }

    console.log(`Reminders sent: ${success}/${carts.length}`);
  } catch (err) {
    console.error("Reminder job failed:", err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

// Execute when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  run();
}

export default run;


