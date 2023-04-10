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
          scriptId: 6443,
          deploymentId: 'customdeployrsm_mr_if_revrec_deployment',
          params: {
            custscript_rsm_mr_transactionid: newRecord.id
          }
      });
       var mrTaskId= callRevenueRecognition.submit() 
       taskStatus = task.checkStatus(mrTaskId);
       log.debug('MR Status ', taskStatus)

        return
     

        




      } catch(e) {
        log.error('UE Scipt error', e);
      }
    }
  }

  function createRevRecognition(uniqueLine, fullfillmentItem, shippedDate) {
    try {
      var newRecogntionRecord = record.create({
        type: "billingrevenueevent",
        isDynamic: true,
      });

      //Unique transaction item line
      newRecogntionRecord.setValue({
        fieldId: "transactionline",
        value: parseInt(uniqueLine),
      });

      //Event Type
      newRecogntionRecord.setValue({
        fieldId: "eventtype",
        value: 3,
      });

      //Quantity
      newRecogntionRecord.setValue({
        fieldId: "quantity",
        value: fullfillmentItem.quantity,
      });

      //Event Purpose
      newRecogntionRecord.setValue({
        fieldId: "eventpurpose",
        value: "ACTUAL",
      });

      //Event Date
      newRecogntionRecord.setValue({
        fieldId: "eventdate",
        value: shippedDate,
      });

      newRecogntionRecord.setValue({
        fieldId: "amount",
        value: +fullfillmentItem.quantity * +fullfillmentItem.componentRate
      });

      var revRecord = newRecogntionRecord.save();
      return revRecord;
    } catch (error) {
     return log.debug('Something went wrong!', error);
    }
  }
  return {
    afterSubmit: afterSubmit,
  };
});
