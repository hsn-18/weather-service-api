const mongoose = require('mongoose');

mongoose.connect('mongodb+srv://new_user1:hassanadil123@cluster0.ugt9h.mongodb.net/weatherDB', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
});

module.exports = mongoose;
