/**
 * @NApiVersion 2.x
 * @NScriptType usereventscript
 * duplicates all items associated to a category
 */
define(["N/search", "N/log", "N/runtime", "N/record", "../lodash", 'N/query', 'N/task'], function (
  search,
  log,
  runtime,
  record,
  _,
  query,
  task
) {
  function beforeSubmit(context) {
    if (
      context.type === context.UserEventType.CREATE ||
      context.type === context.UserEventType.EDIT
    ) {
      try {
        var newRecord = context.newRecord;
        newRecord.setValue({
          fieldId: 'custbody_rsm_process_revenue_event',
          value: true
        });

        return;
      } catch(e) {
        log.error('UE Scipt error', e);
      }
    }
  }

  return {
    beforeSubmit: beforeSubmit,
  };
});
