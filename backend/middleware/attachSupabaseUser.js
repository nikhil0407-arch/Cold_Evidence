export async function attachSupabaseUser(req, res, next) {
	const token = req.cookies['sb-access-token'] || (req.headers.authorization || '').replace('Bearer ', '');
	req.token = token || null;
	req.user = null;

	if (!token) return next();

	const supabaseAdmin = req.app.locals.supabaseAdmin;
	const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
	if (!error && user) {
		req.user = user;
	}
	next();
}
