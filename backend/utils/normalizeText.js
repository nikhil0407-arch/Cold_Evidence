export function normalizeText(value='') {
	return String(value).toLowerCase().normalize('NFKC').replace(/[^a-z0-9\s']/g,' ').replace(/\s+/g,' ').trim();
}
