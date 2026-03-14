import { Router } from 'express';
import { body, param } from 'express-validator';
import multer from 'multer';
import { validate } from '../middleware/validation.middleware.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import * as skillController from '../controllers/skill.controller.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 } }); // 1 MB max for single files
const uploadZip = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10 MB max for zip

router.use(authMiddleware);

router.get('/', skillController.listSkills);

router.get(
  '/:id',
  validate([param('id').isMongoId().withMessage('Invalid skill ID')]),
  skillController.getSkill,
);

router.post(
  '/',
  validate([
    body('name').notEmpty().withMessage('Name is required').trim(),
    body('slug').notEmpty().withMessage('Slug is required').trim(),
    body('description').notEmpty().withMessage('Description is required'),
    body('triggerHints').optional().isArray(),
    body('storagePath').notEmpty().withMessage('Storage path is required'),
  ]),
  skillController.createSkill,
);

router.put(
  '/:id',
  validate([
    param('id').isMongoId().withMessage('Invalid skill ID'),
    body('name').optional().notEmpty().trim(),
    body('description').optional().notEmpty(),
    body('instructions').optional().isString(),
    body('triggerHints').optional().isArray(),
    body('status').optional().isIn(['active', 'inactive']),
  ]),
  skillController.updateSkill,
);

router.delete(
  '/:id',
  validate([param('id').isMongoId().withMessage('Invalid skill ID')]),
  skillController.deleteSkill,
);

router.post(
  '/install',
  upload.single('file'),
  skillController.installSkill,
);

router.post(
  '/install-zip',
  uploadZip.single('file'),
  skillController.installSkillZip,
);

router.post(
  '/bind',
  validate([
    body('skillId').isMongoId().withMessage('Invalid skill ID'),
    body('assistantId').isMongoId().withMessage('Invalid assistant ID'),
  ]),
  skillController.bindSkill,
);

router.post(
  '/unbind',
  validate([
    body('skillId').isMongoId().withMessage('Invalid skill ID'),
    body('assistantId').isMongoId().withMessage('Invalid assistant ID'),
  ]),
  skillController.unbindSkill,
);

export default router;
