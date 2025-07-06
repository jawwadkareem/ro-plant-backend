const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
require('dotenv').config();

const app = express();

// CORS Configuration
const allowedOrigins = ['https://ro-plant-frontend.vercel.app', 'http://localhost:5173'];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());

// Global Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('Global error handler:', err.stack);
  res.status(500).json({ message: 'Internal server error', error: err.message });
});

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://karimjawwad09:cs21125@cluster0.ckfv5.mongodb.net/roplant?retryWrites=true&w=majority&appName=Cluster0';
console.log('Attempting to connect to MongoDB with URI:', MONGODB_URI);
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).catch(err => {
  console.error('MongoDB connection failed:', err.message);
  process.exit(1);
});
const db = mongoose.connection;
db.on('error', err => console.error('MongoDB connection error:', err));
db.once('open', () => console.log('Connected to MongoDB'));

// Schemas
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'admin' }
}, { timestamps: true });
const User = mongoose.model('User', userSchema);

const customerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: String,
  email: String,
  address: String,
  notes: String,
  totalPurchases: { type: Number, default: 0 },
  lastPurchase: Date
}, { timestamps: true });
const Customer = mongoose.model('Customer', customerSchema);

const salesSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  units: { type: Number, required: true },
  unitRate: { type: Number, required: true },
  totalBill: { type: Number, required: true, default: 0 },
  counterCash: { type: Number, required: true },
  customerName: String,
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  notes: String,
  amountLeft: { type: Number, default: 0 },
  isCreditor: { type: Boolean, default: false }
}, { timestamps: true });
const Sale = mongoose.model('Sale', salesSchema);

const expenseSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  type: { type: String, required: true },
  amount: { type: Number, required: true },
  description: { type: String, required: true },
  notes: String
}, { timestamps: true });
const Expense = mongoose.model('Expense', expenseSchema);

const creditorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: String,
  billAmount: { type: Number, required: true },
  description: { type: String, required: true },
  dueDate: Date,
  isPaid: { type: Boolean, default: false },
  paidDate: Date,
  notes: String
}, { timestamps: true });
const Creditor = mongoose.model('Creditor', creditorSchema);

// Auth Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Initialize default admin user
const initializeAdmin = async () => {
  try {
    console.log('Checking for default admin user...');
    const adminExists = await User.findOne({ username: 'admin' });
    if (!adminExists) {
      console.log('Creating default admin user...');
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await User.create({ username: 'admin', password: hashedPassword, role: 'admin' });
      console.log('Default admin user created');
    } else {
      console.log('Admin user already exists');
    }
  } catch (error) {
    console.error('Error initializing admin:', error.message);
  }
};

app.get('/', (req, res) => {
  res.send('abc');
});

// Auth Routes
app.post('/api/auth/login', [
  body('username').notEmpty().trim(),
  body('password').notEmpty().trim(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: 'Validation errors', errors: errors.array() });

  const { username, password } = req.body;
  try {
    console.log('Attempting login for username:', username);
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user._id, username: user.username, role: user.role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );
    res.json({
      token,
      user: { id: user._id, username: user.username, role: user.role }
    });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.get('/api/auth/verify', authenticateToken, async (req, res) => {
  try {
    console.log('Verifying token for user:', req.user.username);
    const user = await User.findById(req.user.userId).select('-password');
    res.json(user);
  } catch (error) {
    console.error('Verify error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Customer Routes
// app.get('/api/customers', authenticateToken, async (req, res) => {
//   try {
//     console.log('Fetching customers...');
//     const customers = await Customer.find().sort({ createdAt: -1 });
//     res.json(customers);
//   } catch (error) {
//     console.error('Customers fetch error:', error.message);
//     res.status(500).json({ message: 'Server error', error: error.message });
//   }
// });

// app.post('/api/customers', authenticateToken, [
//   body('name').notEmpty().trim(),
// ], async (req, res) => {
//   const errors = validationResult(req);
//   if (!errors.isEmpty()) return res.status(400).json({ message: 'Validation errors', errors: errors.array() });

//   const { name, phone, email, address, notes } = req.body;
//   try {
//     console.log('Creating customer:', name);
//     const customer = new Customer({ name, phone, email, address, notes });
//     await customer.save();
//     res.status(201).json(customer);
//   } catch (error) {
//     console.error('Customer creation error:', error.message);
//     res.status(500).json({ message: 'Server error', error: error.message });
//   }
// });

// app.put('/api/customers/:id', authenticateToken, [
//   body('name').notEmpty().trim(),
// ], async (req, res) => {
//   const errors = validationResult(req);
//   if (!errors.isEmpty()) return res.status(400).json({ message: 'Validation errors', errors: errors.array() });

//   const { id } = req.params;
//   const { name, phone, email, address, notes } = req.body;
//   try {
//     console.log('Updating customer:', id);
//     const customer = await Customer.findByIdAndUpdate(id, { name, phone, email, address, notes }, { new: true });
//     if (!customer) return res.status(404).json({ message: 'Customer not found' });
//     res.json(customer);
//   } catch (error) {
//     console.error('Customer update error:', error.message);
//     res.status(500).json({ message: 'Server error', error: error.message });
//   }
// });

// app.delete('/api/customers/:id', authenticateToken, async (req, res) => {
//   const { id } = req.params;
//   try {
//     console.log('Deleting customer:', id);
//     const customer = await Customer.findByIdAndDelete(id);
//     if (!customer) return res.status(404).json({ message: 'Customer not found' });
//     res.json({ message: 'Customer deleted successfully' });
//   } catch (error) {
//     console.error('Customer delete error:', error.message);
//     res.status(500).json({ message: 'Server error', error: error.message });
//   }
// });
// Customer Routes
app.get('/api/customers', authenticateToken, async (req, res) => {
  try {
    console.log('Fetching customers...');
    const customers = await Customer.find().sort({ createdAt: -1 });
    res.json(customers);
  } catch (error) {
    console.error('Customers fetch error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.post('/api/customers', authenticateToken, [
  body('name').notEmpty().trim(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: 'Validation errors', errors: errors.array() });

  const { name, phone, email, address, notes, unitRate } = req.body;
  try {
    console.log('Creating customer:', name);
    const customer = new Customer({ name, phone, email, address, notes, unitRate: unitRate ? parseFloat(unitRate) : undefined });
    await customer.save();
    res.status(201).json(customer);
  } catch (error) {
    console.error('Customer creation error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.put('/api/customers/:id', authenticateToken, [
  body('name').notEmpty().trim(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: 'Validation errors', errors: errors.array() });

  const { id } = req.params;
  const { name, phone, email, address, notes, unitRate } = req.body;
  try {
    console.log('Updating customer:', id);
    const customer = await Customer.findByIdAndUpdate(id, { name, phone, email, address, notes, unitRate: unitRate ? parseFloat(unitRate) : undefined }, { new: true });
    if (!customer) return res.status(404).json({ message: 'Customer not found' });
    res.json(customer);
  } catch (error) {
    console.error('Customer update error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.delete('/api/customers/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    console.log('Deleting customer:', id);
    const customer = await Customer.findByIdAndDelete(id);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });
    res.json({ message: 'Customer deleted successfully' });
  } catch (error) {
    console.error('Customer delete error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.get('/api/customers/:id/history', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    console.log('Fetching history for customer:', id);
    const customer = await Customer.findById(id);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    const history = await Sale.find({ customerId: id })
      .sort({ date: -1 })
      .limit(10)
      .lean();
    const formattedHistory = history.map(sale => ({
      _id: sale._id,
      saleId: sale._id,
      date: sale.date,
      amount: sale.totalBill || 0,
      units: sale.units || 0,
      counterCash: sale.counterCash || 0,
      notes: sale.notes || '-'
    }));
    res.status(200).json(formattedHistory);
  } catch (error) {
    console.error('Customer history error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
app.get('/api/customers/:id/history', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    console.log('Fetching history for customer:', id);
    const customer = await Customer.findById(id);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    const history = await Sale.find({ customerId: id })
      .sort({ date: -1 })
      .limit(10)
      .lean();
    const formattedHistory = history.map(sale => ({
      _id: sale._id,
      saleId: sale._id,
      date: sale.date,
      amount: sale.totalBill || 0,
      units: sale.units || 0,
      counterCash: sale.counterCash || 0,
      notes: sale.notes || '-'
    }));
    res.status(200).json(formattedHistory);
  } catch (error) {
    console.error('Customer history error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Sales Routes
app.get('/api/sales', authenticateToken, async (req, res) => {
  const { date } = req.query;
  try {
    console.log('Fetching sales, date filter:', date);
    let query = {};
    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);
      query.date = { $gte: startDate, $lt: endDate };
    }
    const sales = await Sale.find(query).sort({ createdAt: -1 });
    res.json(sales);
  } catch (error) {
    console.error('Sales fetch error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.post('/api/sales', authenticateToken, [
  body('date').notEmpty().isISO8601(),
  body('units').notEmpty().isInt({ min: 0 }),
  body('unitRate').notEmpty().isFloat({ min: 0 }),
  body('totalBill').notEmpty().isFloat({ min: 0 }),
  body('counterCash').notEmpty().isFloat({ min: 0 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: 'Validation errors', errors: errors.array() });

  const { date, units, unitRate, totalBill, counterCash, customerName, customerId, notes, isCreditor } = req.body;
  try {
    console.log('Creating sale for customer:', customerName || customerId);
    let saleCustomerName = customerName;
    if (customerId) {
      const customer = await Customer.findById(customerId);
      saleCustomerName = customer ? customer.name : customerName;
    }
    const amountLeft = isCreditor ? Math.max(0, totalBill - counterCash) : 0;
    const sale = new Sale({ date, units, unitRate, totalBill, counterCash, customerName: saleCustomerName, customerId, notes, isCreditor, amountLeft });
    await sale.save();

    if (customerId) {
      await Customer.findByIdAndUpdate(customerId, {
        $inc: { totalPurchases: totalBill },
        lastPurchase: date
      });
    }
    res.status(201).json(sale);
  } catch (error) {
    console.error('Sales creation error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.put('/api/sales/:id', authenticateToken, [
  body('date').notEmpty().isISO8601(),
  body('units').notEmpty().isInt({ min: 0 }),
  body('unitRate').notEmpty().isFloat({ min: 0 }),
  body('totalBill').notEmpty().isFloat({ min: 0 }),
  body('counterCash').notEmpty().isFloat({ min: 0 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: 'Validation errors', errors: errors.array() });

  const { id } = req.params;
  const { date, units, unitRate, totalBill, counterCash, customerName, customerId, notes, isCreditor } = req.body;
  try {
    console.log('Updating sale:', id);
    let saleCustomerName = customerName;
    if (customerId) {
      const customer = await Customer.findById(customerId);
      saleCustomerName = customer ? customer.name : customerName;
    }
    const amountLeft = isCreditor ? Math.max(0, totalBill - counterCash) : 0;
    const sale = await Sale.findByIdAndUpdate(id, { date, units, unitRate, totalBill, counterCash, customerName: saleCustomerName, customerId, notes, isCreditor, amountLeft }, { new: true });
    if (!sale) return res.status(404).json({ message: 'Sale not found' });
    res.json(sale);
  } catch (error) {
    console.error('Sales update error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.delete('/api/sales/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    console.log('Deleting sale:', id);
    const sale = await Sale.findByIdAndDelete(id);
    if (!sale) return res.status(404).json({ message: 'Sale not found' });
    res.json({ message: 'Sale deleted successfully' });
  } catch (error) {
    console.error('Sales delete error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Expense Routes
app.get('/api/expenses', authenticateToken, async (req, res) => {
  const { date } = req.query;
  try {
    console.log('Fetching expenses, date filter:', date);
    let query = {};
    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);
      query.date = { $gte: startDate, $lt: endDate };
    }
    const expenses = await Expense.find(query).sort({ createdAt: -1 });
    res.json(expenses);
  } catch (error) {
    console.error('Expenses fetch error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.post('/api/expenses', authenticateToken, [
  body('date').notEmpty().isISO8601(),
  body('type').notEmpty().trim(),
  body('amount').notEmpty().isFloat({ min: 0 }),
  body('description').notEmpty().trim(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: 'Validation errors', errors: errors.array() });

  const { date, type, amount, description, notes } = req.body;
  try {
    console.log('Creating expense for type:', type);
    const expense = new Expense({ date, type, amount, description, notes });
    await expense.save();
    res.status(201).json(expense);
  } catch (error) {
    console.error('Expense creation error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.put('/api/expenses/:id', authenticateToken, [
  body('date').notEmpty().isISO8601(),
  body('type').notEmpty().trim(),
  body('amount').notEmpty().isFloat({ min: 0 }),
  body('description').notEmpty().trim(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: 'Validation errors', errors: errors.array() });

  const { id } = req.params;
  const { date, type, amount, description, notes } = req.body;
  try {
    console.log('Updating expense:', id);
    const expense = await Expense.findByIdAndUpdate(id, { date, type, amount, description, notes }, { new: true });
    if (!expense) return res.status(404).json({ message: 'Expense not found' });
    res.json(expense);
  } catch (error) {
    console.error('Expense update error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.delete('/api/expenses/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    console.log('Deleting expense:', id);
    const expense = await Expense.findByIdAndDelete(id);
    if (!expense) return res.status(404).json({ message: 'Expense not found' });
    res.json({ message: 'Expense deleted successfully' });
  } catch (error) {
    console.error('Expense delete error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Creditor Routes
app.get('/api/creditors', authenticateToken, async (req, res) => {
  try {
    console.log('Fetching creditors...');
    const creditors = await Creditor.find().sort({ isPaid: 1, createdAt: -1 });
    res.json(creditors);
  } catch (error) {
    console.error('Creditors fetch error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.post('/api/creditors', authenticateToken, [
  body('name').notEmpty().trim(),
  body('billAmount').notEmpty().isFloat({ min: 0 }),
  body('description').notEmpty().trim(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: 'Validation errors', errors: errors.array() });

  const { name, phone, billAmount, description, dueDate, notes } = req.body;
  try {
    console.log('Creating creditor:', name);
    const creditor = new Creditor({ name, phone, billAmount, description, dueDate, notes });
    await creditor.save();
    res.status(201).json(creditor);
  } catch (error) {
    console.error('Creditor creation error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.put('/api/creditors/:id', authenticateToken, [
  body('name').notEmpty().trim(),
  body('billAmount').notEmpty().isFloat({ min: 0 }),
  body('description').notEmpty().trim(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: 'Validation errors', errors: errors.array() });

  const { id } = req.params;
  const { name, phone, billAmount, description, dueDate, notes } = req.body;
  try {
    console.log('Updating creditor:', id);
    const creditor = await Creditor.findByIdAndUpdate(id, { name, phone, billAmount, description, dueDate, notes }, { new: true });
    if (!creditor) return res.status(404).json({ message: 'Creditor not found' });
    res.json(creditor);
  } catch (error) {
    console.error('Creditor update error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.patch('/api/creditors/:id/pay', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    console.log('Marking creditor as paid:', id);
    const creditor = await Creditor.findByIdAndUpdate(id, { isPaid: true, paidDate: new Date() }, { new: true });
    if (!creditor) return res.status(404).json({ message: 'Creditor not found' });
    res.json(creditor);
  } catch (error) {
    console.error('Creditor pay error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.delete('/api/creditors/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    console.log('Deleting creditor:', id);
    const creditor = await Creditor.findByIdAndDelete(id);
    if (!creditor) return res.status(404).json({ message: 'Creditor not found' });
    res.json({ message: 'Creditor deleted successfully' });
  } catch (error) {
    console.error('Creditor delete error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Reports Routes
app.get('/api/reports/dashboard', authenticateToken, async (req, res) => {
  try {
    console.log('Fetching dashboard data...');
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    const [todaySales, todayExpenses, totalCustomers, pendingCreditors] = await Promise.all([
      Sale.aggregate([{ $match: { date: { $gte: startOfDay, $lt: endOfDay } } }, { $group: { _id: null, total: { $sum: '$totalBill' } } }]),
      Expense.aggregate([{ $match: { date: { $gte: startOfDay, $lt: endOfDay } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Customer.countDocuments(),
      Creditor.countDocuments({ isPaid: false })
    ]);

    const totalSales = todaySales[0]?.total || 0;
    const totalExpenses = todayExpenses[0]?.total || 0;
    const dailyProfit = totalSales - totalExpenses;

    res.json({
      totalSales,
      totalExpenses,
      dailyProfit,
      totalCustomers,
      pendingCreditors,
      salesGrowth: 0,
      expensesGrowth: 0,
      profitGrowth: 0
    });
  } catch (error) {
    console.error('Dashboard fetch error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.get('/api/reports/sales', authenticateToken, async (req, res) => {
  const { startDate, endDate } = req.query;
  try {
    console.log('Fetching sales report, range:', startDate, 'to', endDate);
    const sales = await Sale.aggregate([
      { $match: { date: { $gte: new Date(startDate), $lte: new Date(endDate) } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, amount: { $sum: '$totalBill' }, units: { $sum: '$units' } } },
      { $sort: { _id: 1 } }
    ]);

    const total = await Sale.aggregate([
      { $match: { date: { $gte: new Date(startDate), $lte: new Date(endDate) } } },
      { $group: { _id: null, total: { $sum: '$totalBill' } } }
    ]);

    res.json({
      daily: sales.map(s => ({ date: s._id, amount: s.amount, units: s.units })),
      total: total[0]?.total || 0
    });
  } catch (error) {
    console.error('Sales report error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.get('/api/reports/expenses', authenticateToken, async (req, res) => {
  const { startDate, endDate } = req.query;
  try {
    console.log('Fetching expenses report, range:', startDate, 'to', endDate);
    const expenses = await Expense.aggregate([
      { $match: { date: { $gte: new Date(startDate), $lte: new Date(endDate) } } },
      { $group: { _id: { date: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, type: '$type' }, amount: { $sum: '$amount' } } },
      { $sort: { '_id.date': 1 } }
    ]);

    const total = await Expense.aggregate([
      { $match: { date: { $gte: new Date(startDate), $lte: new Date(endDate) } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    res.json({
      daily: expenses.map(e => ({ date: e._id.date, amount: e.amount, type: e._id.type })),
      total: total[0]?.total || 0
    });
  } catch (error) {
    console.error('Expenses report error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.get('/api/reports/profit', authenticateToken, async (req, res) => {
  const { period } = req.query;
  try {
    console.log('Fetching profit report for period:', period);
    const today = new Date();
    let startDate;
    if (period === 'weekly') startDate = new Date(today.setDate(today.getDate() - 7));
    else if (period === 'monthly') startDate = new Date(today.setMonth(today.getMonth() - 1));
    else startDate = new Date(today.setFullYear(today.getFullYear() - 1));

    const sales = await Sale.find({ date: { $gte: startDate } });
    const expenses = await Expense.find({ date: { $gte: startDate } });
    const totalSales = sales.reduce((sum, sale) => sum + sale.totalBill, 0);
    const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const profit = totalSales - totalExpenses;

    res.json({ profit, totalSales, totalExpenses });
  } catch (error) {
    console.error('Profit report error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Initialize database and start server
const PORT = process.env.PORT || 3001;

db.once('open', async () => {
  console.log('Connected to MongoDB, initializing admin...');
  await initializeAdmin();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});

module.exports = app;