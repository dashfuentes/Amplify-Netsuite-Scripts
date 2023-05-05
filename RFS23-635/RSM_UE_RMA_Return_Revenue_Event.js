/**
 * @NApiVersion 2.x
 * @NScriptType usereventscript
 * Check necessary fields for M/R functionality 
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
    ) {
      var newRecord = context.newRecord;
      newRecord.setValue({
        fieldId: "custbody_rsm_process_revenue_event",
        value: true,
      });

      return;
    }

    //Special when the customer get back to the transaction and checked the Re-Ship? field
    if(context.type === context.UserEventType.EDIT){
      log.debug(context)
      var newRecord = context.newRecord;
      var reship = newRecord.getValue('custbody_rsm_reship');
      var reshipProcess = newRecord.getValue('custbody_rsm_reship_process')
      log.debug(reshipProcess)
      if(reship && !reshipProcess){
        //Call Map/Reduce Script

        try {
          var t = task.create({
            taskType: task.TaskType.MAP_REDUCE,
            scriptId: 'customscript_rsm_mr_fram_bso',
            //deploymentId: '',
            params: {
              custscript_rsm_frm_transactionid	: newRecord.id
          }
           });
        t.submit();
        log.debug('M/R Status', t)
        } catch (error) {
          log.error("Something went wrong", error)
        }
       
      //To make sure it was completed by this process
        newRecord.setValue({
          fieldId: "custbody_rsm_reship_process",
          value: true,
        });
      }
     

      return;
    }
  }

  return {
    //  afterSubmit: afterSubmit,
    beforeSubmit: beforeSubmit,
  };
});
