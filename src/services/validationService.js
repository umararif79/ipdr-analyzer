import { body, param, validationResult } from 'express-validator';

export const validate = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    const extractedErrors = [];
    errors.array().forEach(err => extractedErrors.push({
      path: err.path,
      message: err.msg
    }));

    return res.status(422).json({
      errors: extractedErrors,
      error: 'Validation failed'
    });
  };
};

export const schemas = {
  connection: {
    create: [
      body('label').trim().notEmpty().withMessage('Label is required'),
      body('host').trim().notEmpty().withMessage('Host is required'),
      body('username').trim().notEmpty().withMessage('Username is required'),
      body('password').trim().notEmpty().withMessage('Password is required'),
      body('database').trim().notEmpty().withMessage('Database is required'),
    ],
    update: [
      body('label').optional().trim(),
      body('host').optional().trim(),
      body('username').optional().trim(),
      body('password').optional().trim(),
      body('database').optional().trim(),
    ]
  },
  user: {
    create: [
      body('username').trim().notEmpty().withMessage('Username is required'),
      body('password').trim().notEmpty().withMessage('Password is required'),
      body('role').optional().isIn(['admin', 'manager', 'auditor', 'user']).withMessage('Invalid role'),
      body('connectionIds').optional().isArray(),
    ],
    update: [
      body('username').optional().trim(),
      body('password').optional().trim(),
      body('role').optional().isIn(['admin', 'manager', 'auditor', 'user']).withMessage('Invalid role'),
      body('connectionIds').optional().isArray(),
    ]
  },
  warrant: {
    create: [
      body('name').trim().notEmpty().withMessage('Name is required'),
      body('conditions').isArray().notEmpty().withMessage('Conditions array is required'),
    ],
    update: [
      body('name').optional().trim(),
      body('conditions').optional().isArray(),
      body('active').optional().isBoolean().withMessage('Active must be a boolean'),
    ]
  },
  query: {
    body: [
      body('page').optional().isInt({ min: 1 }).toInt(),
      body('pageSize').optional().isInt({ min: 1, max: 10000 }).toInt(),
      body('sortOrder').optional().isIn(['ASC', 'DESC']),
    ]
  },
  settings: {
    update: [
      body('key').trim().notEmpty().withMessage('Key is required'),
      body('value').notEmpty().withMessage('Value is required'),
    ]
  },
  notifications: {
    update: [
      body('provider').trim().notEmpty().isIn(['telegram', 'slack']).withMessage('Valid provider is required'),
      body('token').optional().trim(),
      body('chatId').optional().trim(),
      body('webhookUrl').optional().trim(),
    ]
  }
};
