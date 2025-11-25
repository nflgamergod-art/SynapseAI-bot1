const express = require('express');
const Stripe = require('stripe');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_YOUR_KEY_HERE');

// Initialize email transporter
const emailTransporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT || 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

// Database file paths
const KEYS_DB = path.join(__dirname, '../data/keys.json');
const ORDERS_DB = path.join(__dirname, '../data/orders.json');

// Initialize database files
async function initDatabase() {
    try {
        await fs.mkdir(path.join(__dirname, '../data'), { recursive: true });
        
        try {
            await fs.access(KEYS_DB);
        } catch {
            await fs.writeFile(KEYS_DB, JSON.stringify({ products: {} }));
        }
        
        try {
            await fs.access(ORDERS_DB);
        } catch {
            await fs.writeFile(ORDERS_DB, JSON.stringify({ orders: [] }));
        }
    } catch (error) {
        console.error('Database initialization error:', error);
    }
}

// Read database
async function readDB(file) {
    try {
        const data = await fs.readFile(file, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('DB read error:', error);
        return file === KEYS_DB ? { products: {} } : { orders: [] };
    }
}

// Write database
async function writeDB(file, data) {
    try {
        await fs.writeFile(file, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('DB write error:', error);
    }
}

// Get available key for product
async function getAvailableKey(productId) {
    const db = await readDB(KEYS_DB);
    const productKeys = db.products[productId] || [];
    const availableKey = productKeys.find(k => !k.used);
    return availableKey;
}

// Mark key as used
async function markKeyAsUsed(productId, key) {
    const db = await readDB(KEYS_DB);
    const productKeys = db.products[productId] || [];
    const keyObj = productKeys.find(k => k.key === key);
    if (keyObj) {
        keyObj.used = true;
        keyObj.usedAt = new Date().toISOString();
        await writeDB(KEYS_DB, db);
    }
}

// Create order record
async function createOrder(orderData) {
    const db = await readDB(ORDERS_DB);
    const order = {
        id: crypto.randomUUID(),
        ...orderData,
        createdAt: new Date().toISOString(),
        status: 'pending'
    };
    db.orders.push(order);
    await writeDB(ORDERS_DB, db);
    return order;
}

// Update order status
async function updateOrder(orderId, updates) {
    const db = await readDB(ORDERS_DB);
    const order = db.orders.find(o => o.id === orderId);
    if (order) {
        Object.assign(order, updates);
        await writeDB(ORDERS_DB, db);
    }
    return order;
}

// Send email with serial key
async function sendSerialKeyEmail(email, name, productName, serialKey, orderId) {
    const mailOptions = {
        from: process.env.EMAIL_FROM || 'store@example.com',
        to: email,
        subject: `Your Serial Key - Order #${orderId}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #6366f1;">Thank You for Your Purchase!</h2>
                <p>Hi ${name},</p>
                <p>Your order has been successfully processed. Here are your details:</p>
                
                <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="margin-top: 0;">Product: ${productName}</h3>
                    <p><strong>Order ID:</strong> ${orderId}</p>
                    <p><strong>Serial Key:</strong></p>
                    <div style="background: white; padding: 15px; border-radius: 4px; font-family: monospace; font-size: 18px; letter-spacing: 2px; color: #6366f1; font-weight: bold;">
                        ${serialKey}
                    </div>
                </div>
                
                <p><strong>Important:</strong></p>
                <ul>
                    <li>Keep this serial key safe - it cannot be recovered if lost</li>
                    <li>Do not share this key with others</li>
                    <li>Contact support if you have any issues</li>
                </ul>
                
                <p>Thank you for your business!</p>
                <p style="color: #6b7280; font-size: 12px; margin-top: 30px;">
                    This is an automated email. Please do not reply directly to this message.
                </p>
            </div>
        `
    };
    
    try {
        await emailTransporter.sendMail(mailOptions);
        console.log('Serial key email sent to:', email);
    } catch (error) {
        console.error('Email send error:', error);
    }
}

// ==================== API ENDPOINTS ====================

// Create Stripe checkout session
app.post('/api/create-stripe-session', async (req, res) => {
    try {
        const { items, email, name, total } = req.body;
        
        // Create line items for Stripe
        const lineItems = items.map(item => ({
            price_data: {
                currency: 'usd',
                product_data: {
                    name: item.name,
                    description: item.description
                },
                unit_amount: Math.round(item.price * 100) // Convert to cents
            },
            quantity: item.quantity || 1
        }));
        
        // Create checkout session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: lineItems,
            mode: 'payment',
            success_url: `${req.headers.origin}/?success=true&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.headers.origin}/?canceled=true`,
            customer_email: email,
            metadata: {
                customerName: name,
                products: JSON.stringify(items.map(i => ({ id: i.id, name: i.name })))
            }
        });
        
        // Create order record
        await createOrder({
            email,
            name,
            items,
            total,
            paymentMethod: 'stripe',
            stripeSessionId: session.id
        });
        
        res.json({ url: session.url, sessionId: session.id });
    } catch (error) {
        console.error('Stripe session error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Stripe webhook handler
app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    try {
        const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
        
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            
            // Find order by session ID
            const ordersDb = await readDB(ORDERS_DB);
            const order = ordersDb.orders.find(o => o.stripeSessionId === session.id);
            
            if (order && order.status === 'pending') {
                // Assign serial keys
                const serialKeys = [];
                for (const item of order.items) {
                    const keyObj = await getAvailableKey(item.id);
                    if (keyObj) {
                        await markKeyAsUsed(item.id, keyObj.key);
                        serialKeys.push({ product: item.name, key: keyObj.key });
                    }
                }
                
                // Update order
                await updateOrder(order.id, {
                    status: 'completed',
                    serialKeys,
                    completedAt: new Date().toISOString()
                });
                
                // Send email
                if (serialKeys.length > 0) {
                    for (const sk of serialKeys) {
                        await sendSerialKeyEmail(
                            order.email,
                            order.name,
                            sk.product,
                            sk.key,
                            order.id
                        );
                    }
                }
            }
        }
        
        res.json({ received: true });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(400).send(`Webhook Error: ${error.message}`);
    }
});

// Create Bitcoin payment
app.post('/api/create-bitcoin-payment', async (req, res) => {
    try {
        const { items, email, name, total } = req.body;
        
        // In production, integrate with a Bitcoin payment processor
        // For now, we'll create a mock response
        const btcAddress = process.env.BTC_ADDRESS || 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
        const btcRate = 50000; // Mock BTC/USD rate - fetch from API in production
        const btcAmount = (total / btcRate).toFixed(8);
        
        // Create order
        const order = await createOrder({
            email,
            name,
            items,
            total,
            paymentMethod: 'bitcoin',
            btcAddress,
            btcAmount,
            btcAmountUSD: total
        });
        
        res.json({
            success: true,
            orderId: order.id,
            address: btcAddress,
            btcAmount,
            qrCode: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=bitcoin:${btcAddress}?amount=${btcAmount}`,
            message: 'Send the exact BTC amount to complete your order'
        });
    } catch (error) {
        console.error('Bitcoin payment error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Check order status (for Stripe redirect)
app.get('/api/order-status', async (req, res) => {
    try {
        const { session_id } = req.query;
        
        const ordersDb = await readDB(ORDERS_DB);
        const order = ordersDb.orders.find(o => o.stripeSessionId === session_id);
        
        if (order && order.serialKeys && order.serialKeys.length > 0) {
            res.json({
                success: true,
                serialKey: order.serialKeys[0].key,
                order
            });
        } else {
            res.json({ success: false, message: 'Order not found or not completed' });
        }
    } catch (error) {
        console.error('Order status error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Admin: Add serial keys
app.post('/api/admin/add-keys', async (req, res) => {
    try {
        const { productId, keys, adminKey } = req.body;
        
        // Simple admin authentication - use proper auth in production
        if (adminKey !== process.env.ADMIN_KEY) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        const db = await readDB(KEYS_DB);
        if (!db.products[productId]) {
            db.products[productId] = [];
        }
        
        const newKeys = keys.map(k => ({
            key: k,
            used: false,
            addedAt: new Date().toISOString()
        }));
        
        db.products[productId].push(...newKeys);
        await writeDB(KEYS_DB, db);
        
        res.json({
            success: true,
            message: `Added ${keys.length} keys to product ${productId}`,
            total: db.products[productId].length
        });
    } catch (error) {
        console.error('Add keys error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Admin: Get key statistics
app.get('/api/admin/key-stats', async (req, res) => {
    try {
        const { adminKey } = req.query;
        
        if (adminKey !== process.env.ADMIN_KEY) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        const db = await readDB(KEYS_DB);
        const stats = {};
        
        for (const [productId, keys] of Object.entries(db.products)) {
            stats[productId] = {
                total: keys.length,
                available: keys.filter(k => !k.used).length,
                used: keys.filter(k => k.used).length
            };
        }
        
        res.json(stats);
    } catch (error) {
        console.error('Key stats error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Start server
initDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 Storefront API running on port ${PORT}`);
        console.log(`📝 Make sure to set these environment variables:`);
        console.log(`   - STRIPE_SECRET_KEY`);
        console.log(`   - STRIPE_WEBHOOK_SECRET`);
        console.log(`   - ADMIN_KEY`);
        console.log(`   - BTC_ADDRESS (optional)`);
        console.log(`   - EMAIL_HOST, EMAIL_USER, EMAIL_PASS (for sending keys)`);
    });
});

module.exports = app;
