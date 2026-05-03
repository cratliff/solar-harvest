require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const scheduler = require('./services/schedulerService');

const nonprofitRoutes = require('./routes/nonprofits');
const solarRoutes = require('./routes/solar');
const importRoutes = require('./routes/imports');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api/nonprofits', nonprofitRoutes);
app.use('/api/solar', solarRoutes);
app.use('/api/imports', importRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/solar_harvest')
  .then(() => {
    console.log('Connected to MongoDB');
    scheduler.start();
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
