import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import * as googleController from '../controllers/google.controller.js';

const router = Router();

// GET /google/connect?token=JWT — redirects to Google OAuth consent screen
router.get('/connect', googleController.connect);

// GET /google/callback?code=xxx&state=userId — handles Google's redirect
router.get('/callback', googleController.callback);

// GET /google/status — returns connection status (requires auth)
router.get('/status', authMiddleware, googleController.status);

// DELETE /google/disconnect — removes stored tokens (requires auth)
router.delete('/disconnect', authMiddleware, googleController.disconnect);

export default router;
