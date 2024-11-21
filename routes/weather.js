const express = require('express');
const Batch = require('../models/Batch');
const WeatherData = require('../models/WeatherData');
const axios = require('axios');
const router = express.Router();

const handleError = (res, error, message = 'An error occurred') => {
    console.error(message, error);
    res.status(500).json({ error: message });
};

router.get('/data', async (req, res) => {
    try {
        const { lat, lon } = req.query;
        
        if (!lat && !lon) {
            console.log('No coordinates provided, fetching all weather data');
            const allWeatherData = await WeatherData.find({});
            
            console.log(`Found ${allWeatherData.length} weather records`);
            
            if (!allWeatherData || allWeatherData.length === 0) {
                return res.status(404).json({ 
                    message: 'No weather data found in the database'
                });
            }

            return res.json({
                count: allWeatherData.length,
                data: allWeatherData
            });
        }

        if ((lat && !lon) || (!lat && lon)) {
            return res.status(400).json({ 
                error: 'Both latitude and longitude must be provided together'
            });
        }

        const latitude = parseFloat(lat);
        const longitude = parseFloat(lon);
        
        if (isNaN(latitude) || isNaN(longitude)) {
            return res.status(400).json({ 
                error: 'Invalid latitude or longitude values' 
            });
        }

        const weatherData = await WeatherData.find({
            'data.latitude': latitude,
            'data.longitude': longitude
        });

        const result = weatherData.flatMap(record =>
            record.data.filter(d =>
                d.latitude === latitude &&
                d.longitude === longitude
            )
        );

        if (result.length === 0) {
            return res.status(404).json({ 
                error: 'No weather data found for the specified location'
            });
        }
        
        return res.json(result);

    } catch (error) {
        console.error('Error in /data route:', error);
        return res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
});

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const ingestWeatherData = async () => {
    const MAX_RETRIES = 3;
    const BATCH_LIMIT = 3;
    const INITIAL_RETRY_DELAY = 5000;

    const fetchWithExponentialBackoff = async (url, batchId, attempt = 1) => {
        try {
            const response = await axios.get(url);
            return response;
        } catch (error) {
            if (attempt >= MAX_RETRIES) {
                throw error;
            }
            
            const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
            console.log(`Waiting ${delay/1000} seconds before retry ${attempt + 1} for batch ${batchId}`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return fetchWithExponentialBackoff(url, batchId, attempt + 1);
        }
    };

    try {
        console.log('Fetching batch list from the weather API...');
        const response = await fetchWithExponentialBackoff(
            'https://us-east1-climacell-platform-production.cloudfunctions.net/weather-data/batches'
        );

        const batches = response.data.slice(0, BATCH_LIMIT);

        for (const batch of batches) {
            try {
                console.log(`Fetching data for batch ID: ${batch.batch_id}`);
                const batchDataResponse = await fetchWithExponentialBackoff(
                    `https://us-east1-climacell-platform-production.cloudfunctions.net/weather-data/batches/${batch.batch_id}`,
                    batch.batch_id
                );

                const existingBatch = await Batch.findOne({ batch_id: batch.batch_id });
                if (existingBatch) {
                    console.log(`Batch ${batch.batch_id} already ingested`);
                    continue;
                }

                const batchData = batchDataResponse.data;

                const newBatch = new Batch({
                    batch_id: batch.batch_id,
                    forecast_time: new Date(batch.forecast_time),
                    number_of_rows: batchData.metadata.total_items,
                    start_ingest_time: new Date(),
                    status: 'ACTIVE',
                    data: batchData.data.map(item => ({
                        latitude: item.latitude,
                        longitude: item.longitude,
                        temperature: item.temperature,
                        humidity: item.humidity,
                        precipitation_rate: item.precipitation_rate,
                        forecast_time: new Date(batch.forecast_time)
                    }))
                });

                await newBatch.save();
                console.log(`Batch ${batch.batch_id} ingested successfully with ${newBatch.data.length} weather records`);
                await limitActiveBatches();
                await checkDataIngestion();

            } catch (batchError) {
                console.error(`Failed to process batch ${batch.batch_id}:`, {
                    message: batchError.message,
                    status: batchError.response?.status,
                    data: batchError.response?.data
                });
                continue;
            }
        }
    } catch (error) {
        console.error('Error in initial batch fetching:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data
        });
    }
};



const limitActiveBatches = async () => {
    const MAX_ACTIVE_BATCHES = 3;

    try {
        const activeBatches = await Batch.find({ status: 'ACTIVE' }).sort({ forecast_time: -1 });

        if (activeBatches.length > MAX_ACTIVE_BATCHES) {
            const batchesToDeactivate = activeBatches.slice(MAX_ACTIVE_BATCHES);

            for (const batch of batchesToDeactivate) {
                batch.status = 'INACTIVE';
                await batch.save();
                console.log(`Batch ${batch.batch_id} marked as INACTIVE`);
            }
        }
    } catch (error) {
        console.error('Error limiting active batches:', error);
    }
};

const checkDataIngestion = async () => {
    try {
        const count = await WeatherData.countDocuments();
        console.log(`Current weather records in database: ${count}`);
        const sample = await WeatherData.findOne();
        if (sample) {
            console.log('Sample data structure:', JSON.stringify(sample.data[0], null, 2));
        }
    } catch (error) {
        console.error('Error checking data ingestion:', error);
    }
};

router.get('/debug', async (req, res) => {
    try {
        const count = await WeatherData.countDocuments();
        const sample = await WeatherData.findOne();
        
        res.json({
            totalRecords: count,
            databaseConnection: 'success',
            sampleData: sample ? sample : null,
            collectionName: WeatherData.collection.name
        });
    } catch (error) {
        res.status(500).json({
            error: 'Database error',
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});
router.get('/batches', async (req, res) => {
    try {
        const batches = await Batch.find({})
            .sort({ forecast_time: -1 })
            .select({
                batch_id: 1,
                forecast_time: 1, 
                number_of_rows: 1,
                start_ingest_time: 1,
                end_ingest_time: 1,
                status: 1,
                _id: 0 
            });

        if (!batches || batches.length === 0) {
            return res.status(404).json({
                message: 'No batch data found in the database'
            });
        }

        return res.json({
            count: batches.length,
            batches: batches
        });

    } catch (error) {
        handleError(res, error, 'Error retrieving batch information');
    }
});
router.get('/summarize', async (req, res) => {
    try {
        const { lat, lon } = req.query;

        if (!lat || !lon) {
            return res.status(400).json({
                error: 'Both latitude and longitude are required'
            });
        }

        const latitude = parseFloat(lat);
        const longitude = parseFloat(lon);

        if (isNaN(latitude) || isNaN(longitude)) {
            return res.status(400).json({
                error: 'Invalid latitude or longitude values'
            });
        }

        const weatherData = await WeatherData.find({
            latitude: latitude,
            longitude: longitude
        });

        if (!weatherData || weatherData.length === 0) {
            return res.status(404).json({
                message: 'No weather data found for the specified location'
            });
        }

        const temperatures = weatherData.map(data => data.temperature);
        const windSpeeds = weatherData.map(data => data.wind_speed);
        const precipitations = weatherData.map(data => data.precipitation);

        const summary = {
            temperature: {
                max: Math.max(...temperatures),
                min: Math.min(...temperatures),
                average: temperatures.reduce((a, b) => a + b, 0) / temperatures.length
            },
            wind_speed: {
                max: Math.max(...windSpeeds),
                min: Math.min(...windSpeeds),
                average: windSpeeds.reduce((a, b) => a + b, 0) / windSpeeds.length
            },
            precipitation: {
                max: Math.max(...precipitations),
                min: Math.min(...precipitations),
                average: precipitations.reduce((a, b) => a + b, 0) / precipitations.length
            },
            total_records: weatherData.length
        };

        return res.json(summary);

    } catch (error) {
        handleError(res, error, 'Error generating weather summary');
    }
});



module.exports = { router, ingestWeatherData };
