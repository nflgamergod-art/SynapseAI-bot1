// Modern Storefront JavaScript

// Sample product data - Replace with your actual products
const products = [
    {
        id: 1,
        name: "Premium Software License",
        description: "Lifetime access to premium features with automatic updates and priority support.",
        price: 49.99,
        icon: "fa-star",
        features: ["Lifetime Updates", "24/7 Support", "All Features", "5 Devices"],
        stock: 50
    },
    {
        id: 2,
        name: "Professional Tools Pack",
        description: "Complete toolkit for professionals with advanced features and customization options.",
        price: 79.99,
        icon: "fa-tools",
        features: ["Advanced Tools", "Custom Settings", "API Access", "10 Devices"],
        stock: 30
    },
    {
        id: 3,
        name: "Enterprise Suite",
        description: "Full enterprise solution with unlimited devices, dedicated support, and custom integration.",
        price: 149.99,
        icon: "fa-building",
        features: ["Unlimited Devices", "Dedicated Support", "Custom Integration", "SLA Guarantee"],
        stock: 15
    }
];

let cart = [];
let selectedPaymentMethod = null;

// Initialize storefront
document.addEventListener('DOMContentLoaded', function() {
    loadProducts();
    loadCart();
});

// Load products into grid
function loadProducts() {
    const grid = document.getElementById('productsGrid');
    grid.innerHTML = '';
    
    products.forEach(product => {
        const card = createProductCard(product);
        grid.appendChild(card);
    });
}

// Create product card element
function createProductCard(product) {
    const card = document.createElement('div');
    card.className = 'product-card';
    
    const featuresHTML = product.features.map(f => 
        `<li><i class="fas fa-check"></i> ${f}</li>`
    ).join('');
    
    card.innerHTML = `
        <div class="product-image">
            <i class="fas ${product.icon}"></i>
        </div>
        <div class="product-info">
            <div class="stock-badge">
                <i class="fas fa-box"></i> ${product.stock} Available
            </div>
            <h3 class="product-name">${product.name}</h3>
            <p class="product-description">${product.description}</p>
            <ul class="product-features">${featuresHTML}</ul>
            <div class="product-footer">
                <span class="product-price">$${product.price}</span>
                <button class="add-to-cart-btn" onclick="addToCart(${product.id})">
                    <i class="fas fa-cart-plus"></i> Add to Cart
                </button>
            </div>
        </div>
    `;
    
    return card;
}

// Add product to cart
function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    // Check if already in cart
    const existingItem = cart.find(item => item.id === productId);
    if (existingItem) {
        alert('This item is already in your cart!');
        return;
    }
    
    cart.push({...product, quantity: 1});
    saveCart();
    updateCartUI();
    
    // Show feedback
    const btn = event.target.closest('.add-to-cart-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-check"></i> Added!';
    btn.style.background = '#10b981';
    
    setTimeout(() => {
        btn.innerHTML = originalText;
        btn.style.background = '';
    }, 1500);
}

// Remove from cart
function removeFromCart(productId) {
    cart = cart.filter(item => item.id !== productId);
    saveCart();
    updateCartUI();
}

// Update cart UI
function updateCartUI() {
    const cartItems = document.getElementById('cartItems');
    const cartCount = document.querySelector('.cart-count');
    const totalAmount = document.querySelector('.total-amount');
    const checkoutBtn = document.querySelector('.checkout-btn');
    
    cartCount.textContent = cart.length;
    
    if (cart.length === 0) {
        cartItems.innerHTML = `
            <div class="empty-cart">
                <i class="fas fa-shopping-bag"></i>
                <p>Your cart is empty</p>
            </div>
        `;
        totalAmount.textContent = '$0.00';
        checkoutBtn.disabled = true;
    } else {
        cartItems.innerHTML = cart.map(item => `
            <div class="cart-item">
                <div class="cart-item-info">
                    <div class="cart-item-name">${item.name}</div>
                    <div class="cart-item-price">$${item.price}</div>
                </div>
                <button class="remove-item-btn" onclick="removeFromCart(${item.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join('');
        
        const total = cart.reduce((sum, item) => sum + item.price, 0);
        totalAmount.textContent = `$${total.toFixed(2)}`;
        checkoutBtn.disabled = false;
    }
}

// Toggle cart sidebar
function toggleCart() {
    const sidebar = document.getElementById('cartSidebar');
    sidebar.classList.toggle('active');
}

// Proceed to checkout
function proceedToCheckout() {
    if (cart.length === 0) return;
    
    const modal = document.getElementById('checkoutModal');
    const checkoutItems = document.getElementById('checkoutItems');
    const checkoutAmount = document.querySelector('.checkout-amount');
    
    // Populate checkout summary
    checkoutItems.innerHTML = cart.map(item => `
        <div class="checkout-item">
            <span>${item.name}</span>
            <span>$${item.price}</span>
        </div>
    `).join('');
    
    const total = cart.reduce((sum, item) => sum + item.price, 0);
    checkoutAmount.textContent = `$${total.toFixed(2)}`;
    
    modal.classList.add('active');
    toggleCart();
}

// Close checkout
function closeCheckout() {
    const modal = document.getElementById('checkoutModal');
    modal.classList.remove('active');
    selectedPaymentMethod = null;
    document.querySelectorAll('.payment-option').forEach(opt => opt.classList.remove('selected'));
}

// Select payment method
function selectPayment(method) {
    selectedPaymentMethod = method;
    document.querySelectorAll('.payment-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    event.target.closest('.payment-option').classList.add('selected');
}

// Handle form submission
document.getElementById('customerForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    if (!selectedPaymentMethod) {
        alert('Please select a payment method');
        return;
    }
    
    const email = document.getElementById('customerEmail').value;
    const name = document.getElementById('customerName').value;
    
    // Show loading
    showLoading();
    
    try {
        // Process payment based on selected method
        if (selectedPaymentMethod === 'stripe') {
            await processStripePayment(email, name);
        } else if (selectedPaymentMethod === 'bitcoin') {
            await processBitcoinPayment(email, name);
        }
    } catch (error) {
        hideLoading();
        alert('Payment processing failed. Please try again.');
        console.error(error);
    }
});

// Process Stripe payment
async function processStripePayment(email, name) {
    const total = cart.reduce((sum, item) => sum + item.price, 0);
    
    try {
        const response = await fetch('/api/create-stripe-session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                items: cart,
                email: email,
                name: name,
                total: total
            })
        });
        
        const data = await response.json();
        
        if (data.url) {
            // Redirect to Stripe checkout
            window.location.href = data.url;
        } else if (data.sessionId) {
            // Alternative: use Stripe.js
            const stripe = Stripe(data.publishableKey);
            await stripe.redirectToCheckout({ sessionId: data.sessionId });
        }
    } catch (error) {
        console.error('Stripe payment error:', error);
        throw error;
    }
}

// Process Bitcoin payment
async function processBitcoinPayment(email, name) {
    const total = cart.reduce((sum, item) => sum + item.price, 0);
    
    try {
        const response = await fetch('/api/create-bitcoin-payment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                items: cart,
                email: email,
                name: name,
                total: total
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Show Bitcoin payment details
            hideLoading();
            closeCheckout();
            showBitcoinPayment(data);
        } else {
            throw new Error(data.error || 'Bitcoin payment creation failed');
        }
    } catch (error) {
        console.error('Bitcoin payment error:', error);
        throw error;
    }
}

// Show Bitcoin payment modal
function showBitcoinPayment(data) {
    const modal = document.getElementById('checkoutModal');
    const modalBody = modal.querySelector('.modal-body');
    
    modalBody.innerHTML = `
        <div style="text-align: center;">
            <div style="font-size: 3rem; color: #f7931a; margin-bottom: 1rem;">
                <i class="fab fa-bitcoin"></i>
            </div>
            <h3>Bitcoin Payment</h3>
            <p>Send <strong>${data.btcAmount} BTC</strong> to the address below:</p>
            <div style="background: #f9fafb; padding: 1.5rem; border-radius: 8px; margin: 1rem 0; word-break: break-all;">
                <code style="font-size: 1.1rem;">${data.address}</code>
            </div>
            <div style="margin: 1rem 0;">
                <img src="${data.qrCode}" alt="QR Code" style="max-width: 200px;" />
            </div>
            <p style="color: #6b7280; font-size: 0.875rem;">
                Your order will be processed automatically once the transaction is confirmed.<br>
                Order ID: <strong>${data.orderId}</strong>
            </p>
            <button class="btn-primary" onclick="closeCheckout()">Close</button>
        </div>
    `;
}

// Show success modal with serial key
function showSuccess(serialKey) {
    hideLoading();
    closeCheckout();
    
    const modal = document.getElementById('successModal');
    const keyDisplay = document.getElementById('serialKeyDisplay');
    
    keyDisplay.textContent = serialKey;
    modal.classList.add('active');
    
    // Clear cart
    cart = [];
    saveCart();
    updateCartUI();
}

// Close success modal
function closeSuccess() {
    const modal = document.getElementById('successModal');
    modal.classList.remove('active');
}

// Show loading overlay
function showLoading() {
    document.getElementById('loadingOverlay').classList.add('active');
}

// Hide loading overlay
function hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('active');
}

// Save cart to localStorage
function saveCart() {
    localStorage.setItem('cart', JSON.stringify(cart));
}

// Load cart from localStorage
function loadCart() {
    const saved = localStorage.getItem('cart');
    if (saved) {
        cart = JSON.parse(saved);
        updateCartUI();
    }
}

// Listen for successful payment from Stripe redirect
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('success') === 'true') {
    const sessionId = urlParams.get('session_id');
    if (sessionId) {
        // Fetch order details and show success
        fetch(`/api/order-status?session_id=${sessionId}`)
            .then(res => res.json())
            .then(data => {
                if (data.serialKey) {
                    showSuccess(data.serialKey);
                }
            })
            .catch(console.error);
    }
}
