import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dns from 'node:dns';
import { Agent, setGlobalDispatcher } from 'undici';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { createClient } from '@supabase/supabase-js';

import authRoutes from './routes/authRoutes.js';
import interrogationRoutes from './routes/interrogationRoutes.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';
import { validApiKey } from './services/quotaService.js';

// >>> Network fix <<<
// IPv6 to Supabase is broken on this network (confirmed via curl -4/-6).
// undici doesn't implement Happy Eyeballs and ignores dns.setDefaultResultOrder,
// so it tries IPv6 first and hangs for the full timeout instead of falling
// back — this forces every outbound fetch (including supabase-js's internal
// calls) to resolve IPv4 only, skipping IPv6 entirely instead of racing it.
// Must run before any module makes a network call, so it stays first.
setGlobalDispatcher(new Agent({
	connect: {
		lookup: (hostname, options, callback) => {
			dns.lookup(hostname, { ...options, family: 4 }, callback);
		}
	}
}));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const supabaseAdmin = createClient(
	process.env.SUPABASE_URL,
	process.env.SUPABASE_SERVICE_KEY
);
// Shared with route modules via req.app.locals — avoids a second client
// instance and keeps the service-role key in one place.
app.locals.supabaseAdmin = supabaseAdmin;

app.set('views', path.join(__dirname, '../views'));
app.set('view engine', 'ejs');

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || true }));
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '64kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../public')));

// ╭─────────────╮
// │ ROOT ROUTES │
// ╰─────────────╯
app.use('/', authRoutes);

// ╭────────────────╮
// │ LLM API ROUTES │
// ╰────────────────╯
app.get('/api/health', (req, res) => res.json({
	status: 'ok',
	apiKeyConfigured: validApiKey(),
	model: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
	environment: process.env.NODE_ENV || 'development',
	geminiEnabled: String(process.env.GEMINI_ENABLED || 'true') !== 'false'
}));
app.use('/api', apiLimiter, interrogationRoutes);

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`Cold Evidence running at http://localhost:${port}`));
