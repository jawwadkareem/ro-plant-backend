const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://karimjawwad09:cs21125@cluster0.ckfv5.mongodb.net/roplant?retryWrites=true&w=majority&appName=Cluster0';
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'admin' }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// Customer Schema
const customerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String},
  email: { type: String },
  address: { type: String},
  notes: { type: String },
  totalPurchases: { type: Number, default: 0 },
  lastPurchase: { type: Date }
}, { timestamps: true });

const Customer = mongoose.model('Customer', customerSchema);

// Sales Schema
const salesSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  units: { type: Number, required: true },
  unitRate: { type: Number, required: true },
  totalBill: { type: Number, required: true },
  counterCash: { type: Number, required: true },
  customerName: { type: String },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  notes: { type: String }
}, { timestamps: true });

const Sale = mongoose.model('Sale', salesSchema);

// Expense Schema
const expenseSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  type: { type: String, required: true },
  amount: { type: Number, required: true },
  description: { type: String, required: true },
  notes: { type: String }
}, { timestamps: true });

const Expense = mongoose.model('Expense', expenseSchema);

// Creditor Schema
const creditorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String },
  billAmount: { type: Number, required: true },
  description: { type: String, required: true },
  dueDate: { type: Date },
  isPaid: { type: Boolean, default: false },
  paidDate: { type: Date },
  notes: { type: String }
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
    const adminExists = await User.findOne({ username: 'admin' });
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await User.create({
        username: 'admin',
        password: hashedPassword,
        role: 'admin'
      });
      console.log('Default admin user created');
    }
  } catch (error) {
    console.error('Error initializing admin:', error);
  }
};

app.get('/', async (req, res) => {
  res.send('abc');
});

// Auth Routes
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user._id, username: user.username, role: user.role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/verify', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Customer Routes
app.get('/api/customers', authenticateToken, async (req, res) => {
  try {
    const customers = await Customer.find().sort({ createdAt: -1 });
    res.json(customers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/customers', authenticateToken, async (req, res) => {
  try {
    const customer = new Customer(req.body);
    await customer.save();
    res.status(201).json(customer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/customers/:id', authenticateToken, async (req, res) => {
  try {
    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json(customer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/customers/:id', authenticateToken, async (req, res) => {
  try {
    await Customer.findByIdAndDelete(req.params.id);
    res.json({ message: 'Customer deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Sales Routes
app.get('/api/sales', authenticateToken, async (req, res) => {
  try {
    const { date } = req.query;
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
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/sales', authenticateToken, async (req, res) => {
  try {
    const sale = new Sale(req.body);
    await sale.save();

    // Update customer's total purchases if customerId is specified
    if (sale.customerId) {
      await Customer.findByIdAndUpdate(sale.customerId, {
        $inc: { totalPurchases: sale.totalBill },
        lastPurchase: sale.date
      });
    }

    res.status(201).json(sale);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/sales/:id', authenticateToken, async (req, res) => {
  try {
    const sale = await Sale.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json(sale);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/sales/:id', authenticateToken, async (req, res) => {
  try {
    await Sale.findByIdAndDelete(req.params.id);
    res.json({ message: 'Sale deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Expense Routes
app.get('/api/expenses', authenticateToken, async (req, res) => {
  try {
    const { date } = req.query;
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
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/expenses', authenticateToken, async (req, res) => {
  try {
    const expense = new Expense(req.body);
    await expense.save();
    res.status(201).json(expense);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/expenses/:id', authenticateToken, async (req, res) => {
  try {
    const expense = await Expense.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json(expense);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/expenses/:id', authenticateToken, async (req, res) => {
  try {
    await Expense.findByIdAndDelete(req.params.id);
    res.json({ message: 'Expense deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Creditor Routes
app.get('/api/creditors', authenticateToken, async (req, res) => {
  try {
    const creditors = await Creditor.find().sort({ isPaid: 1, createdAt: -1 });
    res.json(creditors);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/creditors', authenticateToken, async (req, res) => {
  try {
    const creditor = new Creditor(req.body);
    await creditor.save();
    res.status(201).json(creditor);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/creditors/:id', authenticateToken, async (req, res) => {
  try {
    const creditor = await Creditor.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json(creditor);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/creditors/:id/pay', authenticateToken, async (req, res) => {
  try {
    const creditor = await Creditor.findByIdAndUpdate(
      req.params.id,
      { isPaid: true, paidDate: new Date() },
      { new: true }
    );
    res.json(creditor);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/creditors/:id', authenticateToken, async (req, res) => {
  try {
    await Creditor.findByIdAndDelete(req.params.id);
    res.json({ message: 'Creditor deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reports Routes
app.get('/api/reports/dashboard', authenticateToken, async (req, res) => {
  try {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    const [todaySales, todayExpenses, totalCustomers, pendingCreditors] = await Promise.all([
      Sale.aggregate([
        { $match: { date: { $gte: startOfDay, $lte: endOfDay } } },
        { $group: { _id: null, total: { $sum: '$totalBill' } } }
      ]),
      Expense.aggregate([
        { $match: { date: { $gte: startOfDay, $lte: endOfDay } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
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
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reports/sales', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const sales = await Sale.aggregate([
      {
        $match: {
          date: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
          }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          amount: { $sum: '$totalBill' },
          units: { $sum: '$units' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const total = await Sale.aggregate([
      {
        $match: {
          date: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
          }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$totalBill' }
        }
      }
    ]);

    res.json({
      daily: sales.map(s => ({ date: s._id, amount: s.amount, units: s.units })),
      total: total[0]?.total || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reports/expenses', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const expenses = await Expense.aggregate([
      {
        $match: {
          date: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
          }
        }
      },
      {
        $group: {
          _id: { 
            date: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
            type: '$type'
          },
          amount: { $sum: '$amount' }
        }
      },
      { $sort: { '_id.date': 1 } }
    ]);

    const total = await Expense.aggregate([
      {
        $match: {
          date: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
          }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);

    res.json({
      daily: expenses.map(e => ({ 
        date: e._id.date, 
        amount: e.amount, 
        type: e._id.type 
      })),
      total: total[0]?.total || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reports/profit', authenticateToken, async (req, res) => {
  try {
    const { period } = req.query;
    
    res.json({
      daily: [],
      avgDaily: 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// New History Route
app.get('/api/customers/:id/history', authenticateToken, async (req, res) => {
  try {
    const customerId = req.params.id;

    // Verify customer exists
    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    // Fetch sales history for the customer
    const history = await Sale.find({ customerId })
      .sort({ date: -1 })
      .limit(10)
      .lean();

    if (!history.length) {
      return res.status(200).json([]);
    }

    // Format the response to match frontend expectations, including counterCash
    const formattedHistory = history.map(sale => ({
      _id: sale._id,
      saleId: sale._id, // Using sale._id as saleId (adjust if you have a different field)
      date: sale.date,
      amount: sale.totalBill || 0,
      units: sale.units || 0,
      counterCash: sale.counterCash || 0, // Added counterCash, default to 0 if not present
      notes: sale.notes || '-'
    }));

    res.status(200).json(formattedHistory);
  } catch (error) {
    console.error('Error fetching customer history:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Initialize database and start server
const PORT = process.env.PORT || 3001;

mongoose.connection.once('open', async () => {
  console.log('Connected to MongoDB');
  await initializeAdmin();
  
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});

module.exports = app;