import mongoose from 'mongoose';

const TransactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    amount: Number,
    currency: { type: String, default: 'usd' },
    paymentMethodId: String,
    status: { type: String, enum: ['succeeded', 'failed', 'requires_action'], default: 'succeeded' },
    stripePaymentIntentId: String,
    createdByAdmin: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
});

export const Transaction = mongoose.model('Transaction', TransactionSchema);