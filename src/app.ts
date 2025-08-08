import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'vikareta-backend',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/v1/status', (req, res) => {
  res.json({ 
    message: 'Vikareta Backend API is running',
    version: '1.0.0'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Vikareta Backend running on port ${PORT}`);
});
