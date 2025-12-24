import express from "express";
// import auth from "../middlewares/auth";
import { addPaymentMethod, approveUser, assignCustomerToSalesPerson, forgotpassword, getAllUsers, getPaymentMethods, getSalesPersons, login, register, rejectUser, resetPassword, testMailchimpConnection, updatePassword, updateUserProfile, updateUserRole, userProfile } from "../controllers/userController.js";
import auth from "../middlewares/auth.js"
import { admin } from "../utils/helper.js";


const userRouter = express.Router();


userRouter.post("/register",register)
userRouter.post("/login",login)
userRouter.put("/forgotpassword",forgotpassword)
userRouter.put("/resetpassword",resetPassword)
userRouter.post("/updatepassword",auth,updatePassword)
userRouter.get("/all",auth,admin,getAllUsers)
userRouter.post("/updateprofile",auth, updateUserProfile)
userRouter.get("/profile",auth, userProfile)


userRouter.put("/approve",auth ,admin,approveUser)
userRouter.put("/reject",auth ,admin,rejectUser)
userRouter.put("/update/role",auth ,admin,updateUserRole)
userRouter.post("/payment-methods", auth, addPaymentMethod)
userRouter.get("/payment-methods", auth, getPaymentMethods)
userRouter.get("/test-mailchimp", auth, admin, testMailchimpConnection)
userRouter.post("/assign-customer", auth, admin, assignCustomerToSalesPerson)
userRouter.get("/sales-persons", auth, admin, getSalesPersons)



export default userRouter;