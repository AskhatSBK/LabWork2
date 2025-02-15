require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcrypt');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const User = require('./models/User');

const app = express();
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(
    session({
        secret: 'your-secret-key',
        resave: false,
        saveUninitialized: false,
    })
);

// Подключение к MongoDB Atlas
mongoose.connect('mongodb://127.0.0.1:27017/assigment3', { useNewUrlParser: true, useUnifiedTopology: true })
    try{
        console.log('Connected to MongoDB');
    } catch {
        console.error('MongoDB connection error:', err);
    }

// Главная страница
app.get('/', (req, res) => {
    res.redirect('/login');
});

// Регистрация пользователя
app.get('/register', (req, res) => {
    res.render('register');
});

app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, email, password: hashedPassword });
    await user.save();
    res.redirect('/login');
});

// Вход в систему
app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.render('error', { message: 'Invalid user or password' });
    }

    req.session.userId = user._id;

    if (user.is2FAEnabled) {
        req.session.tempUserId = user._id; // Временный ID для 2FA
        return res.redirect('/otp');
    }

    res.redirect('/dashboard');
});

// Настройка 2FA
app.get('/setup-2fa', async (req, res) => {
    if (!req.session.userId) return res.redirect('/login');

    const user = await User.findById(req.session.userId);

    if (!user) return res.redirect('/login');

    const secret = speakeasy.generateSecret({ name: 'MyApp' });

    user.twoFASecret = secret.base32;
    await user.save();

    QRCode.toDataURL(secret.otpauth_url, (err, qrCode) => {
        res.render('setup-2fa', { qrCode });
    });
});

app.post('/setup-2fa', async (req, res) => {
    if (!req.session.userId) return res.redirect('/login');

    const user = await User.findById(req.session.userId);
    user.is2FAEnabled = true;
    await user.save();

    res.redirect('/dashboard');
});

// Ввод OTP после входа
app.get('/otp', (req, res) => {
    if (!req.session.tempUserId) return res.redirect('/login');
    res.render('otp');
});

app.post('/otp', async (req, res) => {
    if (!req.session.tempUserId) return res.redirect('/login');

    const user = await User.findById(req.session.tempUserId);
    const verified = speakeasy.totp.verify({
        secret: user.twoFASecret,
        encoding: 'base32',
        token: req.body.otp,
    });

    if (!verified) return console.log('Invalid');

    req.session.userId = user._id;
    delete req.session.tempUserId;
    res.redirect('/dashboard');
});

// Панель управления
app.get('/dashboard', async (req, res) => {
    if (!req.session.userId) return res.redirect('/login');

    const user = await User.findById(req.session.userId);
    res.render('dashboard', { user });
});

// Выход из системы
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

// Запуск сервера
app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
