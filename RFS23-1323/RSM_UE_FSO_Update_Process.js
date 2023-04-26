/**
 * @NApiVersion 2.x
 * @NScriptType usereventscript
 * This will set the field "Closed Order Process Event" to true for DSO Transactions
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

      context.type === context.UserEventType.EDIT
    ) {
      var newRecord = context.newRecord;
      var status = newRecord.getValue('status');
      log.debug('status', status)
      var transactionType = newRecord.getValue(
        "custbody_rsm_so_type"
      );
      log.debug('type', transactionType)
      var closedMRStatus = newRecord.getValue('custbody_rsm_fso_closed_process')
      log.debug('closed proc', closedMRStatus)

      
       //We need to set the field custbody_rsm_close_order_proc_event if either the custbody_rsm_fso_closed_process is false and we have at least one line with the closed status
      //In addition to that the transaction type should be a fullfillment sales order or id 2
      if(transactionType == 2){
        var linesCount = newRecord.getLineCount("item");
        var findItemClosed = []
        for (var index = 0; index < linesCount; index++) {
          
          var itemCloseStatus = newRecord.getSublistValue({
            sublistId: "item",
            fieldId: "isclosed",
            line: index,
          });
          log.debug('closed', itemCloseStatus)
          if(itemCloseStatus) findItemClosed.push(itemCloseStatus)

          
        }
        if( findItemClosed.length > 0 && !closedMRStatus){
          log.debug('**Has closed lines**')
          newRecord.setValue({
            fieldId: "custbody_rsm_close_order_proc_event",
            value: true,
          });
        }

      }
 


      return;

    }
  }
 
 
  return {
    beforeSubmit: beforeSubmit,
    //afterSubmit: afterSubmit
  };
});
