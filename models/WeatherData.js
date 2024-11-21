const mongoose = require('mongoose');

const weatherSchema = new mongoose.Schema({
    batch_id: { type: String, required: true },
    data: [{
        latitude: { type: Number, required: true },
        longitude: { type: Number, required: true },
        temperature: { type: Number, required: true },
        humidity: { type: Number, required: true },
        precipitation_rate: { type: Number, required: true }
    }]
});

module.exports = mongoose.models.WeatherData || mongoose.model('WeatherData', weatherSchema);
