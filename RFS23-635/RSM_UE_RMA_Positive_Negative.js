/**
 * @NApiVersion 2.x
 * @NScriptType usereventscript
 * Create positive/negative revenue events for Deal Return Authorization
 */
define([
  "N/search",
  "N/log",
  "N/runtime",
  "N/record",
  "../lodash",
  "N/query",
  "N/task",
], function (search, log, runtime, record, _, query, task) {
  function beforeSubmit(context) {
    if (
      context.type === context.UserEventType.CREATE
      //  ||
      //DELETE EDIT LATER
      //  context.type === context.UserEventType.EDIT  //Double check with amplify if this needs ti run on EDIT as well
    ) {
      var newRecord = context.newRecord;
      newRecord.setValue({
        fieldId: "custbody_rsm_process_revenue_event",
        value: true,
      });

      return;
    }
  }

  return {
    //  afterSubmit: afterSubmit,
    beforeSubmit: beforeSubmit,
  };
});
