import express from 'express';
import {
  createBrand,
  getBrands,
  getBrandsByCategory,
  updateBrand,
  deleteBrand,
  getBrandById,
  toggleBrandStatus
} from '../controllers/brandController.js';

import auth from '../middlewares/auth.js';  

const brandRouter = express.Router();

brandRouter.get('/', getBrands);
brandRouter.post('/', auth, createBrand);
brandRouter.put('/',auth, updateBrand);
brandRouter.get('/category/:categoryId', getBrandsByCategory);
brandRouter.get('/:id', getBrandById);

// Protected routes (require authentication)  
brandRouter.delete('/:id',auth, deleteBrand);
brandRouter.patch('/:id/toggle-status',auth, toggleBrandStatus);


export default brandRouter;