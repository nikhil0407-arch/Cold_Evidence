import { Router } from 'express';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { attachSupabaseUser } from '../middleware/attachSupabaseUser.js';

const router = Router();

router.use(attachSupabaseUser);

router.get('/', async (req, res) => {
	if (!req.user) {
		return res.render('index.ejs', { user: null });
	}
	const supabaseAdmin = req.app.locals.supabaseAdmin;
	const { data: profile } = await supabaseAdmin
		.from('profiles')
		.select('username, changenamelater')
		.eq('id', req.user.id)
		.maybeSingle();
	req.user.user_metadata.username = profile ? profile.username : null;
	req.user.changenamelater = profile ? profile.changenamelater : null;
	return res.render('index.ejs', { user: req.user });
});

router.get('/play', async (req, res) => {
	if (req.user) {
		return res.render('play.ejs', { user: req.user });
	}

	let guestId = req.cookies['guest-id'];
	if (!guestId) {
		guestId = crypto.randomUUID();
		res.cookie('guest-id', guestId, { maxAge: 1000 * 60 * 60 * 24, sameSite: 'lax' });
	}
	return res.render('play.ejs', { user: null, guestId });
});

router.post('/login', async (req, res) => {
	const supabaseAdmin = req.app.locals.supabaseAdmin;
	const { username, password } = req.body;
	if (!username || !password) {
		return res.status(400).json({ error: 'Invalid username or password.' });
	}
	try {
		const { data: profile, error: lookupError } = await supabaseAdmin
			.from('profiles')
			.select('email')
			.eq('username', username)
			.maybeSingle();
		if (lookupError) console.error('login lookup error:', lookupError);
		if (!profile) {
			return res.status(401).json({ error: 'Invalid username or password.' });
		}
		// Fresh, throwaway client for credential verification only — its session
		// never touches supabaseAdmin, so the shared client stays service_role.
		const supabaseAuth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
		const { data, error } = await supabaseAuth.auth.signInWithPassword({
			email: profile.email,
			password
		});
		if (error) {
			return res.status(401).json({ error: 'Invalid username or password.' });
		}
		return res.json({
			access_token: data.session.access_token,
			refresh_token: data.session.refresh_token
		});
	} catch (err) {
		console.error('login error:', err);
		return res.status(503).json({ error: 'Server error, try again.' });
	}
});

router.post('/delete-account', async (req, res) => {
	if (!req.user) {
		return res.status(401).json({ error: 'Not authenticated.' });
	}
	const supabaseAdmin = req.app.locals.supabaseAdmin;
	try {
		const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(req.user.id);
		if (deleteError) {
			console.error('delete account error:', deleteError);
			return res.status(500).json({ error: 'Failed to delete account.' });
		}
		res.clearCookie('sb-access-token');
		return res.json({ success: true });
	} catch (err) {
		console.error('delete account error:', err);
		return res.status(503).json({ error: 'Server error, try again.' });
	}
});

export default router;
