# 🚀 Digital Storefront - Modern E-Commerce Platform

A modern, professional e-commerce storefront with **Stripe** and **Bitcoin** payment integration, automatic serial key delivery, and admin management panel.

## ✨ Features

### Customer Features
- 🎨 **Modern UI/UX** - Sleek, responsive design that works on all devices
- 🛒 **Shopping Cart** - Smooth cart experience with real-time updates
- 💳 **Multiple Payment Methods**
  - Stripe (Credit/Debit Cards)
  - Bitcoin (Cryptocurrency)
- 🔑 **Instant Key Delivery** - Serial keys sent immediately after payment
- 📧 **Email Notifications** - Automated emails with purchase details
- 🔒 **Secure Checkout** - SSL encrypted payments

### Admin Features
- 📊 **Dashboard** - View key statistics and inventory
- ➕ **Key Management** - Add serial keys for products
- 🎲 **Key Generator** - Generate random keys automatically
- 📈 **Analytics** - Track available vs. used keys
- 🔐 **Admin Authentication** - Secure admin panel access

## 🛠️ Setup Instructions

### 1. Install Dependencies

```bash
cd storefront
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

**Required Configuration:**

```env
# Stripe Setup (https://dashboard.stripe.com/apikeys)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Admin Key (create a strong password)
ADMIN_KEY=your-secure-password

# Email Setup (for Gmail)
EMAIL_USER=yourstore@gmail.com
EMAIL_PASS=your-app-specific-password
EMAIL_FROM=store@yourstore.com

# Bitcoin Address (optional)
BTC_ADDRESS=your-bitcoin-address
```

### 3. Configure Stripe Webhook

1. Go to https://dashboard.stripe.com/webhooks
2. Create a new webhook endpoint: `https://yourdomain.com/api/stripe-webhook`
3. Select event: `checkout.session.completed`
4. Copy the webhook secret to your `.env` file

### 4. Start the Server

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

The storefront will be available at: `http://localhost:3001`

## 📁 Project Structure

```
storefront/
├── index.html              # Main storefront page
├── admin/
│   └── index.html         # Admin panel for key management
├── assets/
│   ├── style.css          # Stylesheet
│   └── script.js          # Frontend JavaScript
├── api/
│   └── server.js          # Backend API server
├── data/
│   ├── keys.json          # Serial key database
│   └── orders.json        # Order history
├── package.json
└── .env                   # Configuration (create from .env.example)
```

## 🔑 Managing Serial Keys

### Access Admin Panel

1. Open: `http://localhost:3001/admin`
2. Enter your `ADMIN_KEY` from `.env`
3. Click "Refresh" to load statistics

### Add Keys Manually

1. Select the product
2. Enter keys (one per line) in format: `XXXX-XXXX-XXXX-XXXX`
3. Click "Add Keys"

### Generate Random Keys

1. Enter number of keys to generate
2. Click "Generate Keys"
3. Keys will appear in the textarea
4. Select product and click "Add Keys"

## 💰 Payment Flow

### Stripe Payment Flow

1. Customer adds products to cart
2. Proceeds to checkout
3. Selects "Credit/Debit Card"
4. Enters email and name
5. Redirects to Stripe checkout
6. After payment:
   - Webhook notifies server
   - Serial key assigned from database
   - Email sent to customer
   - Order marked as completed

### Bitcoin Payment Flow

1. Customer adds products to cart
2. Proceeds to checkout
3. Selects "Bitcoin"
4. Receives BTC address and amount
5. Sends payment from wallet
6. After confirmation:
   - Server detects payment
   - Serial key assigned
   - Email sent to customer

## 🎨 Customization

### Update Products

Edit `assets/script.js` and modify the `products` array:

```javascript
const products = [
    {
        id: 1,
        name: "Your Product Name",
        description: "Product description",
        price: 49.99,
        icon: "fa-star", // Font Awesome icon
        features: ["Feature 1", "Feature 2"],
        stock: 50
    }
];
```

### Customize Styling

Edit `assets/style.css` to change colors, fonts, layout, etc.

### Change Branding

1. Update site title in `index.html`
2. Replace "Digital Store" with your brand name
3. Add your logo in the navigation

## 🔒 Security Best Practices

1. **Never commit `.env` file** - Add to `.gitignore`
2. **Use strong ADMIN_KEY** - Generate random password
3. **Enable HTTPS** - Use SSL certificate in production
4. **Secure Stripe webhook** - Verify webhook signatures
5. **Rate limiting** - Add rate limiting to API endpoints
6. **Input validation** - Always validate user input

## 🚀 Deployment

### Deploy to Sell Hub

1. Upload all files to your Sell Hub hosting
2. Configure environment variables in hosting panel
3. Set up SSL certificate
4. Update Stripe webhook URL to production domain
5. Test complete purchase flow

### Deploy to VPS (DigitalOcean, etc.)

1. Clone repository to server
2. Install Node.js and npm
3. Copy and configure `.env` file
4. Install dependencies: `npm install`
5. Use PM2 for process management:
   ```bash
   npm install -g pm2
   pm2 start api/server.js --name storefront
   pm2 save
   ```
6. Set up Nginx as reverse proxy
7. Configure SSL with Let's Encrypt

## 📧 Email Setup (Gmail)

1. Enable 2-Factor Authentication on Gmail
2. Generate App Password:
   - Go to Google Account Settings
   - Security → App Passwords
   - Create new app password for "Mail"
3. Use app password in `EMAIL_PASS` (not your regular password)

## 🧪 Testing

### Test Stripe Payment

Use Stripe test cards:
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- Expires: Any future date
- CVC: Any 3 digits

### Test Bitcoin Payment

In development, Bitcoin payments show a mock address and QR code. In production, integrate with a real Bitcoin payment processor like:
- BTCPay Server
- Coinbase Commerce
- CoinPayments

## 📊 API Endpoints

### Customer Endpoints
- `POST /api/create-stripe-session` - Create Stripe checkout
- `POST /api/create-bitcoin-payment` - Create Bitcoin payment
- `GET /api/order-status` - Check order status
- `POST /api/stripe-webhook` - Stripe webhook handler

### Admin Endpoints
- `POST /api/admin/add-keys` - Add serial keys
- `GET /api/admin/key-stats` - Get key statistics

## 💡 Tips

1. **Start with test mode** - Test everything before going live
2. **Monitor webhook logs** - Check Stripe dashboard for issues
3. **Backup key database** - Regularly backup `data/keys.json`
4. **Track inventory** - Monitor available keys per product
5. **Test email delivery** - Ensure customers receive keys

## 🆘 Troubleshooting

### Keys not delivered after payment
- Check Stripe webhook is configured correctly
- Verify webhook secret matches `.env`
- Check server logs for errors
- Ensure keys exist for the product

### Email not sending
- Verify email credentials in `.env`
- Check spam folder
- Enable "Less secure apps" or use app password
- Test with a different email provider

### Payment declined
- Use correct test cards
- Check Stripe dashboard for details
- Verify API keys are correct

## 📝 License

This storefront template is provided as-is for commercial use.

## 🤝 Support

For issues or questions, contact your development team.

---

Built with ❤️ for modern digital commerce
