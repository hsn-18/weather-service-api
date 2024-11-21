const mongoose = require('mongoose');

const batchSchema = new mongoose.Schema({
    batch_id: { type: String, required: true, unique: true },
    forecast_time: { type: Date, required: true },
    number_of_rows: { type: Number, default: 0 },
    start_ingest_time: { type: Date, default: Date.now },
    end_ingest_time: { type: Date, default: null },
    status: { type: String, enum: ['RUNNING', 'ACTIVE', 'INACTIVE'], default: 'RUNNING' },
    data: [{
        latitude: { type: Number, required: true },
        longitude: { type: Number, required: true },
        temperature: { type: Number, required: true },
        precipitation_rate: { type: Number, required: true },
        humidity: { type: Number, required: true },
        forecast_time: { type: Date }
    }]
}, {
    timestamps: true
});

module.exports = mongoose.models.Batch || mongoose.model('Batch', batchSchema);
