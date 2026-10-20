const preferences = require("../services/preferenceService");
const { PlanningError } = require("../services/planService");

const handle = (action, status = 200) => async (req, res) => {
  try {
    const data = await action(req, res.locals.authenticatedStudentId);
    return res.status(status).json({ success: true, data });
  } catch (error) {
    if (error instanceof PlanningError) return res.status(error.status).json({ success: false, message: error.message });
    console.error("Preference operation failed:", error);
    return res.status(500).json({ success: false, message: "Preference operation failed" });
  }
};

module.exports = {
  getPreferences: handle((req, student) => preferences.getPreferences(req.params.requestId, student)),
  replacePreferences: handle((req, student) => preferences.replacePreferences(req.params.requestId, student, req.body)),
  getBlocks: handle((req, student) => preferences.getBlocks(req.params.requestId, student)),
  addBlock: handle((req, student) => preferences.addBlock(req.params.requestId, student, req.body), 201),
  removeBlock: handle((req, student) => preferences.removeBlock(req.params.requestId, student, req.params.blockId)),
  clearBlocks: handle((req, student) => preferences.clearBlocks(req.params.requestId, student)),
};
