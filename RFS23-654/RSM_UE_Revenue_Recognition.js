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
  function afterSubmit(context) {
    if (
      context.type === context.UserEventType.CREATE ||
      context.type === context.UserEventType.EDIT
    ) {
      try {
        var newRecord = context.newRecord;

        var callRevenueRecognition = task.create({
          taskType: task.TaskType.MAP_REDUCE,
          scriptId: 'customscript_rsm_mr_if_revrec_process',
          params: {
            custscript_rsm_mr_transactionid: newRecord.id
          }
        });
        var mrTaskId= callRevenueRecognition.submit()
        taskStatus = task.checkStatus(mrTaskId);
        log.debug('MR Status ', taskStatus)

        return;
      } catch(e) {
        log.error('UE Scipt error', e);
      }
    }
  }

  return {
    afterSubmit: afterSubmit,
  };
});
