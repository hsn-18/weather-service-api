const express = require('express');
const mongoose = require('./config/database');
const dotenv = require('dotenv');
const cors = require('cors');
const { router, ingestWeatherData } = require('./routes/weather');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use('/weather', router);

app.get('/', (req, res) => {
    res.json({
        message: 'Weather API is running',
        endpoints: {
            getAllWeather: '/weather',
            getSpecificLocation: '/weather/data?lat={latitude}&lon={longitude}'
        }
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    ingestWeatherData();
});
