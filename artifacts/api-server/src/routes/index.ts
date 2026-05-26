import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import accountsRouter from "./accounts";
import templatesRouter from "./templates";
import emailsRouter from "./emails";
import attachmentsRouter from "./attachments";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(accountsRouter);
router.use(templatesRouter);
router.use(emailsRouter);
router.use(attachmentsRouter);
router.use(dashboardRouter);

export default router;
