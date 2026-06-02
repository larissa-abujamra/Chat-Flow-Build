import { Router, type IRouter } from "express";
import healthRouter from "./health";
import flowRouter from "./flow";
import versionsRouter from "./versions";
import chatRouter from "./chat";

const router: IRouter = Router();

router.use(healthRouter);
router.use(flowRouter);
router.use(versionsRouter);
router.use(chatRouter);

export default router;
