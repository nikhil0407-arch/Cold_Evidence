export function errorHandler(err,req,res,next){console.error(err?.message||err);res.status(500).json({error:'The investigation system had a problem. Please try again.'});}
