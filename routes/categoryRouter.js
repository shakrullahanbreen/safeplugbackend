import express from 'express';

// import { protect, admin } from '../middleware/authMiddleware.js';
import auth from '../middlewares/auth.js';
import { categoryProductCount, createCategory, deleteCategory, getCategories, getCategoriesForAdmin, getCategoriesAdmin, getCategoriesListAdmin, getCategoryById, getCategoryPath, getChildCategories, reorderCategory, updateCategory, fixDisplayOrders } from '../controllers/categoryController.js';
import { admin } from '../utils/helper.js';

const categoryRouter = express.Router();

categoryRouter.get('/', getCategories);    //done
categoryRouter.post('/', auth,admin, createCategory);  //done
categoryRouter.delete('/', auth,admin, deleteCategory); //done
categoryRouter.put('/', auth, admin, updateCategory); //done

categoryRouter.get('/all',auth,getCategoriesAdmin);  //done
categoryRouter.get('/admin', auth, admin, getCategoriesForAdmin); // New route for admin with deleted categories
categoryRouter.post('/reorder', auth, reorderCategory);

// Add endpoint to fix display orders
// categoryRouter.post('/fix-display-orders', auth, admin, fixDisplayOrders);

categoryRouter.get('/product/count',categoryProductCount)
categoryRouter.get('/list', getCategoriesListAdmin); //done

categoryRouter.get('/:parentId/children', getChildCategories); //done

categoryRouter.get('/:id/path', getCategoryPath);
// categoryRouter.get('/:id', getCategoryById);

export default categoryRouter;
