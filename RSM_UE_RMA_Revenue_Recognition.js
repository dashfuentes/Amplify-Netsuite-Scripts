/**
 * @NApiVersion 2.x
 * @NScriptType usereventscript
 * This will set the field "Process Item Receipt Event" to true for Item Receipt Transactions
 * 
 */
define([
  "N/search",
  "N/log",
  "N/runtime",
  "N/record",
  "../lodash",
  "N/query",
], function (search, log, runtime, record, _, query) {
  function beforeSubmit(context) {
    if (
      context.type === context.UserEventType.CREATE
      // ||
      //context.type === context.UserEventType.EDIT
    ) {
      var newRecord = context.newRecord;

      newRecord.setValue({
        fieldId: "custbody_rsm_item_rec_process_event",
        value: true,
      });

      return;

    }
  }
 
  return {
    beforeSubmit: beforeSubmit,
  };
});
